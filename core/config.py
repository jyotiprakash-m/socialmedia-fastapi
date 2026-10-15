from typing import Optional
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    '''
    This class defines the settings for your application using Pydantic's BaseSettings.
    '''
    DATABASE_URL: str = "sqlite:///database.db"
    PG_DATABASE_URL: Optional[str] = None
    HASURA_GRAPHQL_URL: Optional[str] = None
    HASURA_ADMIN_SECRET: Optional[str] = None

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def sqlalchemy_database_url(self) -> str:
        url = self.DATABASE_URL or self.PG_DATABASE_URL or "sqlite:///database.db"
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql://", 1)
        return url

settings = Settings()