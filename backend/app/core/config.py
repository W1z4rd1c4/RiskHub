from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Application
    app_name: str = "RiskHub"
    app_version: str = "1.0.0"
    debug: bool = True
    
    # Database
    database_url: str = "postgresql+asyncpg://localhost:5432/riskhub"
    
    # Authentication
    secret_key: str = "your-secret-key-change-in-production-use-env-var"
    mock_auth_enabled: bool = True  # Enabled by default in dev (protected by debug check in deps.py)
    access_token_expire_minutes: int = 60
    
    # CORS
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    
    model_config = {
        "env_file": ".env",
        "extra": "ignore"
    }


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
