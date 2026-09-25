from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TALLY_", env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./tally.db"
    # Override in production: TALLY_SECRET_KEY=$(python -c "import secrets; print(secrets.token_hex(32))")
    secret_key: str = "dev-only-insecure-key-change-me-in-production"
    session_days: int = 14
    cookie_secure: bool = False
    # Directory with the built frontend (frontend/dist). Served by FastAPI when present.
    static_dir: str = "../frontend/dist"
    # Create demo@tally.dev on startup and offer it on the sign-in page (for public demos).
    demo: bool = False
    # Turn off after creating your own account to keep a personal deployment private.
    allow_signup: bool = True
    # Budget alerts, daily reminder and monthly summary (Web Push). The VAPID keys are generated
    # and stored in the database on first use; set these only to reuse keys from another install.
    notifications: bool = True
    vapid_private_key: str = ""  # PEM
    vapid_subject: str = "mailto:admin@tally.app"


@lru_cache
def get_settings() -> Settings:
    return Settings()
