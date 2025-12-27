from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session
from typing import List, Optional
from pydantic import BaseModel
from models import Story
from services.story_service import create_story, get_stories_for_user
from core.database import get_session

router = APIRouter(prefix="/stories", tags=["Stories"])

# Pydantic models for request/response
class StoryCreate(BaseModel):
    user_id: int
    media_url: str
    media_type: str

class StoryResponse(BaseModel):
    id: int
    user_id: int
    media_url: str
    media_type: str
    created_at: str
    expires_at: str

# Create a new story
@router.post("/", response_model=StoryResponse, status_code=status.HTTP_201_CREATED)
def create_new_story(
    story_data: StoryCreate,
    session: Session = Depends(get_session)
):
    """Create a new story."""
    try:
        # Create Story instance
        story = Story(
            user_id=story_data.user_id,
            media_url=story_data.media_url,
            media_type=story_data.media_type
        )
        
        # Create story using service
        created_story = create_story(session, story)
        
        if created_story.id is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create story: ID not generated"
            )
        
        return StoryResponse(
            id=created_story.id,
            user_id=created_story.user_id,
            media_url=created_story.media_url,
            media_type=created_story.media_type,
            created_at=created_story.created_at.isoformat(),
            expires_at=created_story.expires_at.isoformat()
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error creating story: {str(e)}"
        )

# Get stories for a user (their own stories + friends' stories)
@router.get("/user/{user_id}", response_model=List[StoryResponse])
def get_user_stories(
    user_id: int,
    session: Session = Depends(get_session)
):
    """Get all active stories for a user (including friends' stories)."""
    try:
        stories = get_stories_for_user(session, user_id)
        
        return [
            StoryResponse(
                id=story.id,
                user_id=story.user_id,
                media_url=story.media_url,
                media_type=story.media_type,
                created_at=story.created_at.isoformat(),
                expires_at=story.expires_at.isoformat()
            )
            for story in stories if story.id is not None
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching stories: {str(e)}"
        )