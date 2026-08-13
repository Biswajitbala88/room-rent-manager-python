from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    ELECTRIC_RATE: float = 10.0 # Default electric rate
    CORS_ORIGINS: str = "http://localhost:3000"

    # Source database for the local "Sync Data" feature only. The app itself always
    # reads/writes DATABASE_URL; REMOTE_DATABASE_URL is never used for normal requests.
    REMOTE_DATABASE_URL: str | None = None
    # Defaults to "production" so the sync feature stays off unless a local .env
    # explicitly opts in with ENVIRONMENT=development.
    ENVIRONMENT: str = "production"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

settings = Settings()
