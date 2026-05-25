from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    CORS_ORIGINS: str = "http://localhost:5173"
    MAX_UPLOAD_ROWS: int = 100_000
    LOG_LEVEL: str = "info"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"


settings = Settings()
