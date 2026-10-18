"""Test helpers for the Gemini provider: REAL google-genai request/response types around a FAKE client, so nothing touches the network.

Only `genai.Client` is replaced (by `install`). Chunks are genuine `types.GenerateContentResponse` objects, so `.text`, `finish_reason`
and `usage_metadata` behave exactly as in production, and errors are genuine `errors.ClientError` / `ServerError` instances."""
from __future__ import annotations

from types import SimpleNamespace

from google import genai
from google.genai import errors, types

PROVIDER_TEXT = "SECRET-PROVIDER-TEXT: quota exceeded for key AIzaSyFAKE-FAKE-FAKE-FAKE-FAKE-FAKE-123"


def chunk(text: str | None = None, finish: str | None = None, usage: tuple[int, int, int] | None = None, blocked: bool = False) -> types.GenerateContentResponse:
    """One streamed chunk. `usage` = (prompt tokens, answer tokens, thinking tokens)."""
    parts = [types.Part(text=text)] if text is not None else []
    kw: dict = {}
    if not blocked:
        kw["candidates"] = [types.Candidate(content=types.Content(role="model", parts=parts), finish_reason=types.FinishReason[finish] if finish else None)]
    else:
        kw["prompt_feedback"] = types.GenerateContentResponsePromptFeedback(block_reason=types.BlockedReason.SAFETY)
    if usage:
        kw["usage_metadata"] = types.GenerateContentResponseUsageMetadata(prompt_token_count=usage[0], candidates_token_count=usage[1], thoughts_token_count=usage[2])
    return types.GenerateContentResponse(**kw)


def api_error(code: int, status: str = "RESOURCE_EXHAUSTED") -> errors.APIError:
    cls = errors.ServerError if code >= 500 else errors.ClientError
    return cls(code, {"error": {"code": code, "message": PROVIDER_TEXT, "status": status}})


class FakeModels:
    def __init__(self, script, fail_on_call: BaseException | None = None):
        self.script, self.fail_on_call = list(script), fail_on_call
        self.calls: list[dict] = []
        self.closed = False

    async def generate_content_stream(self, *, model, contents, config):       # a coroutine returning an async iterator, like the SDK's
        self.calls.append({"model": model, "contents": contents, "config": config})
        if self.fail_on_call is not None:
            raise self.fail_on_call
        return self._iterate()

    async def _iterate(self):
        try:
            for item in self.script:
                if isinstance(item, BaseException):
                    raise item                                                    # an error part-way through the stream
                yield item
        finally:
            self.closed = True


class Installed:
    """What `install` returns: the models stub plus the keyword arguments `genai.Client(...)` was created with."""
    def __init__(self, models: FakeModels):
        self.models, self.client_kwargs = models, {}

    @property
    def last(self) -> dict:
        return self.models.calls[-1]


def install(monkeypatch, script=(), fail_on_call: BaseException | None = None) -> Installed:
    models = FakeModels(script, fail_on_call)
    inst = Installed(models)

    def fake_client(**kwargs):
        inst.client_kwargs = kwargs
        return SimpleNamespace(aio=SimpleNamespace(models=models))
    monkeypatch.setattr(genai, "Client", fake_client)
    return inst
