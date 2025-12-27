from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    '''
    This class defines the settings for your application using Pydantic's BaseSettings. \n
    You provide the URL here so your code works even if the .env file is missing, but in production or development, the .env value will be used. This makes your configuration flexible and environment-specific.
    '''
    DATABASE_URL: str = "sqlite:///database.db"  # or use Postgres
    class Config:
        env_file = ".env"

settings = Settings()