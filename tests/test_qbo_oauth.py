from datetime import datetime

import httpx
import pytest

from app.qbo.oauth import (
    QboOAuthError,
    build_authorize_url,
    exchange_code_for_tokens,
    generate_state,
    refresh_access_token,
)


def test_generate_state_is_random_and_url_safe():
    a, b = generate_state(), generate_state()
    assert a != b
    assert len(a) > 20


def test_build_authorize_url_includes_required_params():
    url = build_authorize_url("client-123", "https://example.com/qbo/callback", "state-abc")
    assert url.startswith("https://appcenter.intuit.com/connect/oauth2?")
    assert "client_id=client-123" in url
    assert "state=state-abc" in url
    assert "com.intuit.quickbooks.accounting" in url
    assert "redirect_uri=" in url


def test_exchange_code_for_tokens_parses_response(monkeypatch):
    def fake_post(url, headers=None, data=None, **kwargs):
        assert data["grant_type"] == "authorization_code"
        assert data["code"] == "the-code"
        return httpx.Response(
            200,
            json={
                "access_token": "AT",
                "refresh_token": "RT",
                "expires_in": 3600,
                "x_refresh_token_expires_in": 8726400,
                "token_type": "bearer",
            },
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    result = exchange_code_for_tokens("cid", "csecret", "the-code", "https://example.com/qbo/callback")
    assert result.access_token == "AT"
    assert result.refresh_token == "RT"
    assert result.access_token_expires_at > datetime.utcnow()
    assert result.refresh_token_expires_at > result.access_token_expires_at


def test_exchange_code_for_tokens_raises_on_error_response(monkeypatch):
    def fake_post(url, headers=None, data=None, **kwargs):
        return httpx.Response(400, text="invalid_grant")

    monkeypatch.setattr(httpx, "post", fake_post)
    with pytest.raises(QboOAuthError):
        exchange_code_for_tokens("cid", "csecret", "bad-code", "https://example.com/qbo/callback")


def test_refresh_access_token_rotates_refresh_token(monkeypatch):
    def fake_post(url, headers=None, data=None, **kwargs):
        assert data["grant_type"] == "refresh_token"
        assert data["refresh_token"] == "old-refresh"
        return httpx.Response(
            200,
            json={
                "access_token": "NEW-AT",
                "refresh_token": "NEW-RT",
                "expires_in": 3600,
                "x_refresh_token_expires_in": 8726400,
            },
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    result = refresh_access_token("cid", "csecret", "old-refresh")
    assert result.access_token == "NEW-AT"
    assert result.refresh_token == "NEW-RT"
