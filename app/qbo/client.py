"""Thin QuickBooks Online Accounting API client.

Wraps httpx with automatic access-token refresh and persists the rotated
tokens back to the database on every use, so callers never think about
OAuth -- they just call query()/create()/update().
"""

from datetime import datetime, timedelta

import httpx
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import QboConnection
from app.qbo.oauth import refresh_access_token

# Refresh a bit before actual expiry so a slow request never straddles it.
REFRESH_MARGIN = timedelta(minutes=5)


class QboNotConnectedError(RuntimeError):
    """No QuickBooks company is connected yet."""


class QboApiError(RuntimeError):
    def __init__(self, status_code: int, message: str, payload: dict | None = None):
        super().__init__(f"QuickBooks API error {status_code}: {message}")
        self.status_code = status_code
        self.message = message
        self.payload = payload or {}


class QboClient:
    def __init__(self, db: Session, settings: Settings):
        self.db = db
        self.settings = settings
        self.connection = db.get(QboConnection, 1)
        if self.connection is None or not self.connection.is_connected:
            raise QboNotConnectedError("No QuickBooks company is connected. Go to Settings to connect.")
        self._ensure_fresh_token()

    def _ensure_fresh_token(self) -> None:
        conn = self.connection
        expires_at = conn.access_token_expires_at
        if expires_at and datetime.utcnow() < (expires_at - REFRESH_MARGIN):
            return  # still valid
        result = refresh_access_token(
            self.settings.qbo_client_id, self.settings.qbo_client_secret, conn.refresh_token
        )
        conn.access_token = result.access_token
        conn.refresh_token = result.refresh_token
        conn.access_token_expires_at = result.access_token_expires_at
        conn.refresh_token_expires_at = result.refresh_token_expires_at
        self.db.add(conn)
        self.db.commit()

    @property
    def _base_url(self) -> str:
        return f"{self.settings.qbo_api_base}/v3/company/{self.connection.realm_id}"

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.connection.access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def _request(self, method: str, path: str, **kwargs) -> dict:
        url = f"{self._base_url}/{path}"
        response = httpx.request(method, url, headers=self._headers(), timeout=30.0, **kwargs)
        if response.status_code >= 400:
            try:
                payload = response.json()
                message = payload.get("Fault", {}).get("Error", [{}])[0].get("Message", response.text)
            except Exception:
                payload = {}
                message = response.text
            raise QboApiError(response.status_code, message, payload)
        return response.json()

    def query(self, sql: str) -> list[dict]:
        """Run a QuickBooks SQL-like query, e.g.
        "select * from Account where AccountType = 'Bank'".
        """
        result = self._request("GET", "query", params={"query": sql, "minorversion": "70"})
        query_response = result.get("QueryResponse", {})
        # The entity key varies by query (Account, Class, Vendor, ...); the
        # response has exactly one list-valued key besides paging metadata.
        for key, value in query_response.items():
            if isinstance(value, list):
                return value
        return []

    def create(self, entity: str, payload: dict) -> dict:
        result = self._request("POST", entity.lower(), json=payload, params={"minorversion": "70"})
        return result[entity]

    def update(self, entity: str, payload: dict) -> dict:
        """`payload` must include the existing Id and SyncToken."""
        body = {**payload, "sparse": False}
        result = self._request("POST", entity.lower(), json=body, params={"minorversion": "70"})
        return result[entity]

    def get(self, entity: str, entity_id: str) -> dict:
        result = self._request("GET", f"{entity.lower()}/{entity_id}", params={"minorversion": "70"})
        return result[entity]

    def company_info(self) -> dict:
        result = self._request(
            "GET", f"companyinfo/{self.connection.realm_id}", params={"minorversion": "70"}
        )
        return result["CompanyInfo"]
