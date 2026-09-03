"""QuickBooks Online OAuth 2.0 (Authorization Code flow).

Hand-rolled against Intuit's documented OAuth endpoints rather than a
wrapper library, so the whole flow is a few testable functions with no
hidden state:
https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0
"""

import base64
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta

import httpx

AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2"
TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
SCOPE = "com.intuit.quickbooks.accounting"


class QboOAuthError(RuntimeError):
    """Raised when Intuit's token endpoint rejects a request."""


@dataclass
class TokenResult:
    access_token: str
    refresh_token: str
    access_token_expires_at: datetime
    refresh_token_expires_at: datetime


def generate_state() -> str:
    """A random, unguessable value to protect the callback against CSRF."""
    return secrets.token_urlsafe(24)


def build_authorize_url(client_id: str, redirect_uri: str, state: str) -> str:
    params = {
        "client_id": client_id,
        "response_type": "code",
        "scope": SCOPE,
        "redirect_uri": redirect_uri,
        "state": state,
    }
    query = "&".join(f"{k}={httpx.QueryParams({k: v})[k]}" for k, v in params.items())
    return f"{AUTHORIZE_URL}?{query}"


def _basic_auth_header(client_id: str, client_secret: str) -> str:
    raw = f"{client_id}:{client_secret}".encode()
    return "Basic " + base64.b64encode(raw).decode()


def _parse_token_response(payload: dict) -> TokenResult:
    now = datetime.utcnow()
    return TokenResult(
        access_token=payload["access_token"],
        refresh_token=payload["refresh_token"],
        access_token_expires_at=now + timedelta(seconds=int(payload["expires_in"])),
        refresh_token_expires_at=now + timedelta(seconds=int(payload["x_refresh_token_expires_in"])),
    )


def exchange_code_for_tokens(
    client_id: str, client_secret: str, code: str, redirect_uri: str
) -> TokenResult:
    """Trade the one-time authorization code from the callback for tokens."""
    response = httpx.post(
        TOKEN_URL,
        headers={
            "Authorization": _basic_auth_header(client_id, client_secret),
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
        },
    )
    if response.status_code != 200:
        raise QboOAuthError(f"Token exchange failed ({response.status_code}): {response.text}")
    return _parse_token_response(response.json())


def refresh_access_token(client_id: str, client_secret: str, refresh_token: str) -> TokenResult:
    """Exchange a refresh token for a new access token (and rotated refresh
    token -- QuickBooks issues a new refresh token on every refresh)."""
    response = httpx.post(
        TOKEN_URL,
        headers={
            "Authorization": _basic_auth_header(client_id, client_secret),
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        },
    )
    if response.status_code != 200:
        raise QboOAuthError(f"Token refresh failed ({response.status_code}): {response.text}")
    return _parse_token_response(response.json())
