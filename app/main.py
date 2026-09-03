from pathlib import Path

from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware
from starlette.staticfiles import StaticFiles

from app.config import get_settings
from app.database import init_db
from app.routes import dashboard, entries, machines, qbo_auth, settings, sync_routes

settings_obj = get_settings()

app = FastAPI(title="Vending Books")
app.add_middleware(SessionMiddleware, secret_key=settings_obj.secret_key)
app.mount("/static", StaticFiles(directory=str(Path(__file__).parent / "static")), name="static")

app.include_router(dashboard.router)
app.include_router(machines.router)
app.include_router(entries.router)
app.include_router(qbo_auth.router)
app.include_router(settings.router)
app.include_router(sync_routes.router)


@app.on_event("startup")
def on_startup() -> None:
    init_db()
