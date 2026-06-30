"""Application configuration loaded from environment / .env file."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed application settings.

    Values are read from environment variables and an optional ``.env`` file.
    See ``.env.example`` for the full list of supported keys.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Server ---
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- NEXRAD Level II (public NOAA S3 bucket) ---
    nexrad_bucket: str = "noaa-nexrad-level2"
    nexrad_region: str = "us-east-1"

    # --- NWS alerts API ---
    nws_api_base: str = "https://api.weather.gov"
    nws_user_agent: str = "DynamicRadar (contact@example.com)"

    # --- Runtime cache ---
    cache_dir: str = "app/data/cache"

    @property
    def cors_origin_list(self) -> list[str]:
        """CORS origins as a clean list."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
