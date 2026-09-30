import io
import zipfile

import pytest
from docx import Document
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

PDF, DOCX = "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

RESUME_LINES = ["Priya Nair", "priya.nair@example.com | github.com/priyanair | linkedin.com/in/priya-nair", "", "Education", "B.Tech CSE (AI/ML), GLA University, 2023-2027",
                "", "Skills", "Python, React, SQL, Docker, TensorFlow, Figma", "", "Projects", "Smart Attendance System - face recognition with Python and OpenCV",
                "Campus Marketplace - React frontend with a FastAPI backend", "", "Experience", "Software Intern, Acme Labs - built REST API endpoints (Summer 2025)",
                "", "Certifications", "Google Cloud Digital Leader", "Deep Learning Specialization - Coursera", "", "Achievements", "Finalist, Smart India Hackathon 2025"]


def make_pdf(lines=RESUME_LINES, encrypt=None) -> bytes:
    buf = io.BytesIO()
    kw = {}
    if encrypt:
        from reportlab.lib import pdfencrypt
        kw["encrypt"] = pdfencrypt.StandardEncryption(encrypt, canPrint=0)
    c = canvas.Canvas(buf, pagesize=A4, **kw)
    y = 800
    for l in lines:
        c.drawString(50, y, l); y -= 16
    c.save()
    return buf.getvalue()


def make_docx(lines=RESUME_LINES) -> bytes:
    d = Document()
    for l in lines:
        d.add_paragraph(l)
    buf = io.BytesIO(); d.save(buf)
    return buf.getvalue()


def up(client, u, data, name="resume.pdf", ctype=PDF):
    return client.post("/api/profile/resume/extract", headers=u.h, files={"file": (name, data, ctype)})


def test_pdf_and_docx_extraction_returns_structured_fields_and_writes_nothing(client, student):
    for data, name, ctype in ((make_pdf(), "cv.pdf", PDF), (make_docx(), "cv.docx", DOCX)):
        r = up(client, student, data, name, ctype)
        assert r.status_code == 200, r.text
        ex = r.json()["extracted"]
        assert ex["name"] == "Priya Nair" and ex["email"] == "priya.nair@example.com"
        assert {"python", "react", "sql", "docker", "figma"} <= {s["name"] for s in ex["skills"]}
        assert "deep learning" in {s["name"] for s in ex["skills"]}                # TensorFlow → deep learning alias, with evidence
        assert all(s["evidence"] for s in ex["skills"])
        assert any("GLA University" in e for e in ex["education"]) and any("Smart Attendance" in p for p in ex["projects"])
        assert any("Google Cloud" in c for c in ex["certifications"]) and any("Acme Labs" in e for e in ex["experience"]) and any("Finalist" in a for a in ex["achievements"])
        assert "https://github.com/priyanair" in ex["links"] and "not an AI model" in r.json()["method"]
    p = client.get("/api/profile", headers=student.h).json()
    assert p["skills"] == [] and p["items"] == [] and p["inferredSkills"] == []           # extraction alone changed nothing


def test_confirmation_applies_only_what_was_approved(client, make_user):
    u = make_user("student", "Resume User")
    client.put("/api/profile", headers=u.h, json={"skills": ["sql"], "fullName": "Old Name"})
    ex = up(client, u, make_pdf()).json()
    assert {s["name"] for s in ex["diff"]["newSkills"]} >= {"python", "react"} and "sql" in ex["diff"]["alreadyConfirmed"] and ex["diff"]["nameDiffers"] is True
    r = client.post("/api/profile/resume/confirm", headers=u.h, json={
        "confirmSkills": ["python"], "suggestSkills": [{"name": "docker", "evidence": ex["extracted"]["skills"][0]["evidence"]}],
        "items": {"projects": ex["extracted"]["projects"][:1], "certifications": ex["extracted"]["certifications"][:1]}, "links": {"github": "https://github.com/priyanair"}})
    assert r.status_code == 200, r.text
    p = r.json()["profile"]
    assert set(p["skills"]) == {"python", "sql"}                                       # react/figma weren't approved → absent
    assert [s["name"] for s in p["inferredSkills"]] == ["docker"] and p["fullName"] == "Old Name"      # name NOT silently overwritten
    assert {i["kind"] for i in p["items"]} == {"project", "certification"} and p["links"]["github"].startswith("https://github.com/")
    assert r.json()["changed"]["skills"] == 1 and r.json()["changed"]["inferred"] == 1
    # existing skills are never removed by a resume confirm
    assert "sql" in p["skills"]
    item = p["items"][0]["id"]
    assert client.delete(f"/api/profile/items/{item}", headers=u.h).status_code == 204
    assert client.delete(f"/api/profile/items/{item}", headers=u.h).status_code == 404


def test_confirm_validation(client, student):
    assert client.post("/api/profile/resume/confirm", headers=student.h, json={"confirmSkills": ["hacking"]}).status_code == 400
    assert client.post("/api/profile/resume/confirm", headers=student.h, json={"items": {"secrets": ["x"]}}).status_code == 400
    assert client.post("/api/profile/resume/confirm", headers=student.h, json={"role": "admin"}).status_code == 422
    r = client.post("/api/profile/resume/confirm", headers=student.h, json={"links": {"github": "javascript:alert(1)", "x": "https://a.b"}})
    assert r.status_code == 200 and r.json()["changed"]["links"] == 0


def test_rejects_disguised_executable_and_type_mismatch(client, student):
    exe = b"MZ\x90\x00" + b"\x00" * 200
    for data, name, ctype in ((exe, "cv.pdf", PDF), (exe, "cv.docx", DOCX), (make_pdf(), "cv.docx", DOCX), (make_docx(), "cv.pdf", PDF),
                              (make_pdf(), "cv.pdf", "text/html"), (make_pdf(), "cv.exe", PDF), (make_pdf(), "cv", PDF), (b"", "cv.pdf", PDF), (b"%PDF-1.4 garbage", "cv.pdf", PDF)):
        r = up(client, student, data, name, ctype)
        assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error", (name, ctype, r.text)
        assert "Traceback" not in r.text


def test_rejects_oversize_zip_bomb_macros_and_traversal(client, student):
    assert up(client, student, b"%PDF-" + b"0" * (5 * 1024 * 1024 + 10)).status_code == 422
    bomb = io.BytesIO()
    with zipfile.ZipFile(bomb, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", "<Types/>"); z.writestr("word/document.xml", "<w/>")
        z.writestr("word/media/big.bin", b"\x00" * (30 * 1024 * 1024))
    assert up(client, student, bomb.getvalue(), "cv.docx", DOCX).status_code == 422
    macro = io.BytesIO(make_docx())
    with zipfile.ZipFile(macro, "a") as z:
        z.writestr("word/vbaProject.bin", b"evil")
    assert "macros" in up(client, student, macro.getvalue(), "cv.docx", DOCX).json()["error"]["message"]
    trav = io.BytesIO()
    with zipfile.ZipFile(trav, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>"); z.writestr("word/document.xml", "<w/>"); z.writestr("../../evil.txt", "x")
    assert up(client, student, trav.getvalue(), "cv.docx", DOCX).status_code == 422


def test_password_protected_and_empty_documents_are_rejected_cleanly(client, student):
    assert up(client, student, make_pdf(encrypt="secret")).status_code == 422
    assert up(client, student, make_pdf(lines=[" "])).status_code == 422
    assert up(client, student, make_docx(lines=[""]), "cv.docx", DOCX).status_code == 422


def test_resume_upload_requires_auth_and_is_rate_limited_per_user(client, student, make_user):
    assert client.post("/api/profile/resume/extract", files={"file": ("cv.pdf", make_pdf(), PDF)}).status_code == 401
    other = make_user("student", "Other Uploader")
    codes = [up(client, student, make_pdf()).status_code for _ in range(12)]
    assert codes.count(200) == 10 and codes[-1] == 429
    assert up(client, other, make_pdf()).status_code == 200            # another user is not throttled by this one
