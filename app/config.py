from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    secret_key: str = "dev-only-not-secure"
    database_url: str = "sqlite:///./data/vending.db"
    app_base_url: str = "http://localhost:8000"

    qbo_client_id: str = ""
    qbo_client_secret: str = ""
    qbo_environment: str = "sandbox"  # "sandbox" or "production"

    @property
    def qbo_redirect_uri(self) -> str:
        return f"{self.app_base_url.rstrip('/')}/qbo/callback"

    @property
    def qbo_api_base(self) -> str:
        if self.qbo_environment == "production":
            return "https://quickbooks.api.intuit.com"
        return "https://sandbox-quickbooks.api.intuit.com"


@lru_cache
def get_settings() -> Settings:
    return Settings()
