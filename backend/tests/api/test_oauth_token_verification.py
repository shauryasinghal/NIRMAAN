"""Regression: Google sign-in reached the app but every API call answered "Invalid or expired token".

Root cause: PyJWKClient downloads Supabase's signing keys with urllib, which trusts only the OS certificate store. On a Python build with
none (python.org's macOS installer) the download died with CERTIFICATE_VERIFY_FAILED, so every real ES256 token was rejected before its
signature was even looked at. The existing ES256 test replaced `_jwks()` with a fake, so the real fetch was never exercised.

These tests keep the REAL PyJWKClient, the REAL TLS handshake and the REAL verify_token; only the trust anchor and the host are local.
"""
import datetime as dt
import http.server
import ipaddress
import json
import ssl
import threading

import jwt
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

from tests.api.test_security_platform import me

KID = "test-key-1"


def _cert(subject, issuer, pub, signer, ca=False, san=None):
    now = dt.datetime.now(dt.timezone.utc)
    b = (x509.CertificateBuilder().subject_name(subject).issuer_name(issuer).public_key(pub).serial_number(x509.random_serial_number())
         .not_valid_before(now - dt.timedelta(minutes=5)).not_valid_after(now + dt.timedelta(days=1))
         .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True)
         .add_extension(x509.SubjectKeyIdentifier.from_public_key(pub), critical=False)        # Python 3.13 verifies in strict X.509 mode
         .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(signer.public_key()), critical=False)
         .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False, key_encipherment=False, data_encipherment=False, key_agreement=False,
                                      key_cert_sign=ca, crl_sign=ca, encipher_only=False, decipher_only=False), critical=True))
    if san: b = b.add_extension(x509.SubjectAlternativeName(san), critical=False)
    return b.sign(signer, hashes.SHA256())


@pytest.fixture()
def hosted_like(tmp_path, monkeypatch):
    """A local HTTPS 'Supabase' serving a JWKS, signed by a private CA. Yields (base_url, signing_key, ca_pem_path)."""
    ca_key, leaf_key, token_key = (ec.generate_private_key(ec.SECP256R1()) for _ in range(3))
    ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "nirmaan test CA")])
    ca = _cert(ca_name, ca_name, ca_key.public_key(), ca_key, ca=True)
    leaf = _cert(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")]), ca_name, leaf_key.public_key(), ca_key,
                 san=[x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))])
    ca_pem, cert_pem, key_pem = tmp_path / "ca.pem", tmp_path / "leaf.pem", tmp_path / "leaf.key"
    ca_pem.write_bytes(ca.public_bytes(serialization.Encoding.PEM))
    cert_pem.write_bytes(leaf.public_bytes(serialization.Encoding.PEM))
    key_pem.write_bytes(leaf_key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))

    jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(token_key.public_key())); jwk.update(kid=KID, alg="ES256", use="sig")
    body = json.dumps({"keys": [jwk]}).encode()

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            ok = self.path == "/auth/v1/.well-known/jwks.json"
            self.send_response(200 if ok else 404); self.send_header("Content-Type", "application/json"); self.end_headers()
            self.wfile.write(body if ok else b"{}")
        def log_message(self, *a): pass

    srv = http.server.HTTPServer(("127.0.0.1", 0), H)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain(cert_pem, key_pem)
    srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    from app.core import security
    from app.core.config import reset_settings_cache
    base = f"https://localhost:{srv.server_address[1]}"
    monkeypatch.setenv("SUPABASE_URL", base); reset_settings_cache(); security._jwks_clients.clear()
    yield base, token_key, ca_pem
    srv.shutdown(); srv.server_close(); security._jwks_clients.clear(); reset_settings_cache()


def _token(base, key, student, **over):
    claims = {"sub": student.id, "aud": "authenticated", "role": "authenticated", "email": student.email, "session_id": student.session_id,
              "iss": f"{base}/auth/v1", "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=1), **over}
    return jwt.encode(claims, key, algorithm="ES256", headers={"kid": KID})


def test_real_es256_token_is_verified_through_a_real_tls_jwks_fetch(client, student, hosted_like, monkeypatch):
    base, key, ca_pem = hosted_like
    from app.core import security
    monkeypatch.setattr(security.certifi, "where", lambda: str(ca_pem))           # the trust anchor the fix loads (certifi's bundle in production)
    r = me(client, _token(base, key, student))
    assert r.status_code == 200 and r.json()["email"] == student.email
    ctx = security._jwks(f"{base}/auth/v1/.well-known/jwks.json").ssl_context
    assert isinstance(ctx, ssl.SSLContext) and ctx.verify_mode == ssl.CERT_REQUIRED and ctx.check_hostname   # certificate checking stays ON


def test_unverifiable_key_store_is_503_not_a_bad_token(client, student, hosted_like):
    """The exact failure: the TLS certificate cannot be verified. We fail CLOSED (no access) but report an outage, not 'Invalid or expired token'."""
    base, key, _ = hosted_like                                                      # our private CA is NOT in certifi, exactly like a missing system store
    r = me(client, _token(base, key, student))
    assert r.status_code == 503 and r.json()["error"]["code"] == "service_unavailable"
    assert "Invalid or expired" not in r.text


def test_real_fetch_still_rejects_forged_expired_wrong_issuer_and_unknown_kid(client, student, hosted_like, monkeypatch):
    base, key, ca_pem = hosted_like
    from app.core import security
    monkeypatch.setattr(security.certifi, "where", lambda: str(ca_pem))
    other = ec.generate_private_key(ec.SECP256R1())
    assert me(client, _token(base, other, student)).status_code == 401                                   # same kid, wrong private key
    assert me(client, _token(base, key, student, iss="https://evil.example/auth/v1")).status_code == 401
    assert me(client, _token(base, key, student, aud="anon")).status_code == 401
    assert me(client, _token(base, key, student, exp=dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=1))).status_code == 401
    assert me(client, jwt.encode({"sub": student.id, "aud": "authenticated", "role": "authenticated", "iss": f"{base}/auth/v1",
                                  "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=1)}, key, algorithm="ES256", headers={"kid": "unknown"})).status_code == 401
    assert me(client, _token(base, key, student)).status_code == 200                                      # and the genuine one still works


def test_rejection_log_names_the_failure_class_but_never_the_token(client, student, hosted_like, monkeypatch, caplog):
    base, key, ca_pem = hosted_like
    from app.core import security
    monkeypatch.setattr(security.certifi, "where", lambda: str(ca_pem))
    bad = _token(base, key, student, aud="anon")
    with caplog.at_level("WARNING", logger="nirmaan"):
        assert me(client, bad).status_code == 401
    rec = [r for r in caplog.records if getattr(r, "event", "") == "auth_token_rejected"]
    assert rec and getattr(rec[0], "code", "") == "InvalidAudienceError"
    assert bad not in caplog.text and bad.split(".")[1] not in caplog.text
