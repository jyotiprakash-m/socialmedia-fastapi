from typing import List, Optional, Any
from datetime import datetime, timezone
from models import Story
from hasura import hasura_client

def _parse_dt(val: Any) -> datetime:
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        return datetime.fromisoformat(val)
    return datetime.now(timezone.utc)

def _to_story(s: Any) -> Story:
    return Story(
        id=s.id,
        user_id=s.user_id,
        media_url=s.media_url,
        media_type=s.media_type,
        created_at=_parse_dt(s.created_at),
        expires_at=_parse_dt(s.expires_at)
    )

# Create a new story
def create_story(session: Any = None, story: Story = None) -> Story:
    res = hasura_client.create_story(
        user_id=story.user_id,
        media_url=story.media_url,
        media_type=story.media_type
    )
    if not res.insert_story_one:
        raise RuntimeError("Failed to create story in Hasura")
    return _to_story(res.insert_story_one)

# Get all stories for a user and their friends that are not expired
def get_stories_for_user(session: Any = None, user_id: int = 0) -> List[Story]:
    friend_res = hasura_client.get_friend_ids_for_user(user_id=user_id)
    friend_ids = [f.friend_id for f in friend_res.friend]
    allowed_user_ids = [user_id] + friend_ids

    now = datetime.now(timezone.utc).isoformat()
    story_res = hasura_client.get_stories_for_users(user_ids=allowed_user_ids, now=now)
    return [_to_story(s) for s in story_res.story]