from sqlalchemy_utils import database_exists, create_database
from sqlmodel import create_engine, SQLModel, Session
from .config import settings


engine = create_engine(settings.sqlalchemy_database_url, echo=True)

def get_session():
    with Session(engine) as session:
        yield session

def init_db():
    try:
        if not database_exists(engine.url):
            create_database(engine.url)
    except Exception as e:
        print(f"Skipping create_database check: {e}")
    SQLModel.metadata.create_all(engine)