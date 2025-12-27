from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime, timezone

class Post(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int
    content: str
    media_url: Optional[str] = None
    media_type: Optional[str] = None  # image | video | None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
