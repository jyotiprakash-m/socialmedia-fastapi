from sqlmodel import SQLModel, Field
from typing import Optional

class Friend(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int
    friend_id: int
    status: str = Field(default="pending")  # pending | accepted | blocked