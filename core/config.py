from typing import Optional
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    '''
    This class defines the settings for your application using Pydantic's BaseSettings.
    '''
    DATABASE_URL: str = "sqlite:///database.db"
    HASURA_GRAPHQL_URL: Optional[str] = None
    HASURA_ADMIN_SECRET: Optional[str] = None
    WEBHOOK_SECRET: str = "super-secret-hasura-key-2026"


    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def sqlalchemy_database_url(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql://", 1)
        return url

settings = Settings()