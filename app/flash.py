"""Tiny flash-message helper backed by the signed session cookie."""

from starlette.requests import Request


def flash(request: Request, message: str, category: str = "info") -> None:
    request.session.setdefault("flashes", []).append({"message": message, "category": category})


def get_flashes(request: Request) -> list[dict]:
    return request.session.pop("flashes", [])
