from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime,timezone

class Comment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    post_id: int
    user_id: int
    parent_comment_id: Optional[int] = None
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
