from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime, timedelta,timezone

class Story(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int
    media_url: str
    media_type: str  # image | video
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc) + timedelta(hours=24)
    )
