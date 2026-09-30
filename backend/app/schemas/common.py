from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

T = TypeVar("T")


class ApiModel(BaseModel):
    """camelCase on the wire, snake_case in Python; accepts either on input."""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class Page(ApiModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


class Ok(ApiModel):
    ok: bool = True


def page_of(items: list, total: int, page: int, page_size: int) -> dict:
    return {"items": items, "total": total, "page": page, "pageSize": page_size, "pages": max(1, -(-total // page_size))}
