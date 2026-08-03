from typing import Optional
from pydantic import ConfigDict
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = ConfigDict(
        extra='ignore',
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    APP_NAME: str = "AI Interview Platform"

    # MongoDB
    MONGO_URI: str = "mongodb://localhost:27017"
    MONGO_DB_NAME: str = "agri_interview"

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
    LLM_BASE_URL: str = "https://api.minimax.io/v1/"
    LLM_API_KEY: str = ""

    # Storage
    STORAGE_BACKEND: str = "local"  # local | gcs
    STORAGE_LOCAL_PATH: str = "./uploads"
    GCS_BUCKET_NAME: str = ""
    GCS_BASE_PREFIX: str = ""  # e.g. "agri-interview-platform/staging"

    # ViBe integration (Foundation Course)
    VIBE_API_URL: str = "https://vibe.vicharanashala.ai"
    VIBE_COURSE_ID: str = "6a2be954ca990e71be4e3751"

    # SMTP / Email settings
    EMAIL_SMTP_HOST: str = "smtp.zoho.in"
    EMAIL_SMTP_PORT: int = 465
    EMAIL_SMTP_USER: str = ""
    EMAIL_SMTP_PASSWORD: str = ""
    EMAIL_FROM_ADDRESS: str = "noreply@annam.com"
    EMAIL_FROM_NAME: str = "Annam AgriTech"
    EMAIL_PROVIDER: str = "zoho"  # console | zoho | sendgrid | ses

    # OTP settings
    OTP_EXPIRY_MINUTES: int = 5
    OTP_RATE_LIMIT_SECONDS: int = 60


settings = Settings()
