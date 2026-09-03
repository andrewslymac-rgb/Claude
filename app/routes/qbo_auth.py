from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from starlette.requests import Request
from starlette.responses import RedirectResponse

from app.config import get_settings
from app.database import get_db
from app.flash import flash
from app.models import QboConnection
from app.qbo.client import QboClient
from app.qbo.oauth import QboOAuthError, build_authorize_url, exchange_code_for_tokens, generate_state

router = APIRouter(prefix="/qbo", tags=["qbo-auth"])


@router.get("/connect")
def connect(request: Request):
    settings = get_settings()
    if not settings.qbo_client_id or not settings.qbo_client_secret:
        flash(
            request,
            "Set QBO_CLIENT_ID and QBO_CLIENT_SECRET in your .env before connecting. "
            "See README.md for how to get them.",
            "error",
        )
        return RedirectResponse(url="/settings", status_code=303)

    state = generate_state()
    request.session["qbo_oauth_state"] = state
    url = build_authorize_url(settings.qbo_client_id, settings.qbo_redirect_uri, state)
    return RedirectResponse(url=url, status_code=303)


@router.get("/callback")
def callback(request: Request, code: str = "", state: str = "", realmId: str = "", db: Session = Depends(get_db)):
    settings = get_settings()
    expected_state = request.session.pop("qbo_oauth_state", None)

    if not code or not realmId:
        flash(request, "QuickBooks didn't return an authorization code. Try connecting again.", "error")
        return RedirectResponse(url="/settings", status_code=303)
    if not expected_state or expected_state != state:
        flash(request, "QuickBooks connection request could not be verified (state mismatch). Try again.", "error")
        return RedirectResponse(url="/settings", status_code=303)

    try:
        tokens = exchange_code_for_tokens(
            settings.qbo_client_id, settings.qbo_client_secret, code, settings.qbo_redirect_uri
        )
    except QboOAuthError as exc:
        flash(request, f"Connecting to QuickBooks failed: {exc}", "error")
        return RedirectResponse(url="/settings", status_code=303)

    connection = db.get(QboConnection, 1) or QboConnection(id=1)
    connection.realm_id = realmId
    connection.access_token = tokens.access_token
    connection.refresh_token = tokens.refresh_token
    connection.access_token_expires_at = tokens.access_token_expires_at
    connection.refresh_token_expires_at = tokens.refresh_token_expires_at
    connection.environment = settings.qbo_environment
    connection.connected_at = datetime.utcnow()
    db.add(connection)
    db.commit()

    try:
        client = QboClient(db, settings)
        info = client.company_info()
        connection.company_name = info.get("CompanyName", "")
        db.add(connection)
        db.commit()
    except Exception:
        pass  # connection still succeeded; company name is cosmetic

    flash(request, f"Connected to QuickBooks ({connection.company_name or connection.realm_id}).", "success")
    return RedirectResponse(url="/settings", status_code=303)


@router.post("/disconnect")
def disconnect(request: Request, db: Session = Depends(get_db)):
    connection = db.get(QboConnection, 1)
    if connection:
        db.delete(connection)
        db.commit()
    flash(request, "Disconnected from QuickBooks.", "success")
    return RedirectResponse(url="/settings", status_code=303)
