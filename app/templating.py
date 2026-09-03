from pathlib import Path

from fastapi.templating import Jinja2Templates
from starlette.requests import Request
from starlette.responses import HTMLResponse

from app.flash import get_flashes

templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))


def render(request: Request, template_name: str, status_code: int = 200, **context) -> HTMLResponse:
    context.setdefault("request", request)
    context.setdefault("flashes", get_flashes(request))
    return templates.TemplateResponse(template_name, context, status_code=status_code)
