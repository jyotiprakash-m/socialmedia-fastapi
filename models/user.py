from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime, timezone

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    clerk_user_id: str = Field(unique=True)
    name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
