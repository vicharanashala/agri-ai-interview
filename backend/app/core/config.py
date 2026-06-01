from typing import Optional
from pydantic import ConfigDict
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = ConfigDict(
        extra='ignore',  # Allow extra environment variables
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )
    
    APP_NAME: str = "AI Interview Platform"

    DATABASE_URL: str
    REDIS_URL: str

    LLM_PROVIDER: str = "openai"
    LLM_MODEL: str = "gpt-4.1"

    OPENAI_API_KEY: Optional[str] = None

    # API Server settings
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    API_DEBUG: bool = True

    # CORS settings
    CORS_ORIGINS: str = "http://localhost:3005"

    # JWT settings
    JWT_SECRET: str = "your-secret-key-here"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 60

    # LLM settings
    LLM_BASE_URL: str = "http://100.100.108.41:8001/v1/"
    LLM_API_KEY: str = ""


settings = Settings()
