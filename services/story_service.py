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
    try:
        friends_res = hasura_client.get_all_accepted_friends(user_id=user_id)
        requester_friends = [f.friend_id for f in friends_res.as_requester]
        recipient_friends = [f.user_id for f in friends_res.as_recipient]
        resolved_friends = list(set(requester_friends + recipient_friends))
        allowed_user_ids = list(set([user_id] + resolved_friends))
    except Exception as e:
        print(f"Error fetching friend IDs for stories: {e}")
        allowed_user_ids = [user_id]

    now = datetime.now(timezone.utc).isoformat()
    story_res = hasura_client.get_stories_for_users(user_ids=allowed_user_ids, now=now)
    return [_to_story(s) for s in story_res.story]

# Get story by ID
def get_story_by_id(session: Any = None, story_id: int = 0) -> Optional[Story]:
    res = hasura_client.get_story_by_id(id=story_id)
    if not res.story_by_pk:
        return None
    return _to_story(res.story_by_pk)

# Delete a story
def delete_story(session: Any = None, story_id: int = 0) -> bool:
    res = hasura_client.delete_story(id=story_id)
    return res.delete_story_by_pk is not None