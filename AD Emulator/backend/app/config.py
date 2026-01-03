"""AD Emulator configuration settings."""
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Database (use same credentials as RiskHub's docker container)
    DATABASE_URL: str = "postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/ad_emulator_db"
    
    # RiskHub API (for future callbacks if needed)
    RISKHUB_API_URL: str = "http://localhost:8000/api/v1"
    
    # Security
    SECRET_KEY: str = "ad-emulator-secret-key-change-in-production"
    
    # Server
    AD_EMULATOR_PORT: int = 8001
    AD_EMULATOR_HOST: str = "0.0.0.0"
    
    # Webhook target for push notifications (RiskHub endpoint)
    # Set to RiskHub webhook endpoint, e.g., "http://localhost:8000/api/v1/directory/webhook"
    WEBHOOK_TARGET_URL: str | None = None
    
    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "http://localhost:5178",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5176",
        "http://127.0.0.1:5177",
        "http://127.0.0.1:5178",
    ]
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
