from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Application
    app_name: str = "RiskHub"
    app_version: str = "1.0.0"
    debug: bool = False  # Set to True in .env for development
    
    # Database
    database_url: str = "postgresql+asyncpg://localhost:5432/riskhub"
    
    # Authentication
    secret_key: str = "your-secret-key-change-in-production-use-env-var"
    # SECURITY: Never enable in production - allows X-Mock-User-Id header bypass
    mock_auth_enabled: bool = False  # Set to True in .env for development/demo
    access_token_expire_minutes: int = 60
    
    # CORS
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"]
    
    # AD Emulator Integration
    ad_emulator_url: str = "http://localhost:8001/api/v1"
    webhook_secret: str = ""  # Required in production for webhook signature verification
    
    model_config = {
        "env_file": ".env",
        "extra": "ignore"
    }


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
