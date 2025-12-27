from sqlmodel import Session, select, col
from models import Story, Friend
from typing import List
from datetime import datetime

# Create a new story
def create_story(session: Session, story: Story) -> Story:
    session.add(story)
    session.commit()
    session.refresh(story)
    return story

# Get all stories for a user of their friends that are not expired
def get_stories_for_user(session: Session, user_id: int) -> List[Story]:
    # Get current time
    now = datetime.utcnow()

    # First get friend IDs
    friend_ids_stmt = select(Friend.friend_id).where(
        Friend.user_id == user_id, 
        Friend.status == "accepted"
    )
    friend_ids = session.exec(friend_ids_stmt).all()
    
    # Create list of user IDs (current user + friends)
    allowed_user_ids = [user_id] + list(friend_ids)

    # Select stories where the user is either the owner or a friend, and the story is not expired
    statement = (
        select(Story)
        .where(
            col(Story.user_id).in_(allowed_user_ids),
            col(Story.expires_at) > now
        )
    )
    results = session.exec(statement).all()
    return list(results)