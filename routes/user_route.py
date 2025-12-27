from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session
from typing import List, Optional
from pydantic import BaseModel

from models import User
from core.database import get_session
from services import user_service

router = APIRouter(prefix="/users", tags=["Users"])

# Response models
class ActionResponse(BaseModel):
    ok: bool
    message: Optional[str] = None

class UserCreate(BaseModel):
    clerk_user_id: str
    name: str

class UserResponse(BaseModel):
    id: int
    clerk_user_id: str
    name: str
    created_at: str

# User CRUD Operations
@router.get("/", response_model=List[UserResponse])
def list_users(
    skip: int = 0, 
    limit: int = 100, 
    session: Session = Depends(get_session)
):
    """Get a list of all users with pagination."""
    users = user_service.list_users(session, skip=skip, limit=limit)
    return [
        UserResponse(
            id=user.id,
            clerk_user_id=user.clerk_user_id,
            name=user.name,
            created_at=user.created_at.isoformat()
        )
        for user in users
		if user.id is not None
    ]

@router.get("/search", response_model=List[UserResponse])
def search_users(
    name: Optional[str] = None, 
    session: Session = Depends(get_session)
):
    """Search for users who are not friends with the current user."""
    users = user_service.get_non_friends(session, name=name)
    return [
        UserResponse(
            id=user.id,
            clerk_user_id=user.clerk_user_id,
            name=user.name,
            created_at=user.created_at.isoformat()
        )
        for user in users
        if user.id is not None
    ]

@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user: UserCreate, 
    session: Session = Depends(get_session)
):
    """Create a new user."""
    try:
        user_model = User(**user.model_dump())
        created_user = user_service.create_user(session, user_model)
        return UserResponse(
            id=created_user.id or 0,
            clerk_user_id=created_user.clerk_user_id,
            name=created_user.name,
            created_at=created_user.created_at.isoformat()
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error creating user: {str(e)}"
        )

@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int, 
    session: Session = Depends(get_session)
):
    """Get a specific user by ID."""
    user = user_service.get_user_by_id(session, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="User not found"
        )
    return UserResponse(
        id=user.id or 0,
        clerk_user_id=user.clerk_user_id,
        name=user.name,
        created_at=user.created_at.isoformat()
    )

@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int, 
    updated_user: User, 
    session: Session = Depends(get_session)
):
    """Update a user's information."""
    user = user_service.update_user(session, user_id, updated_user)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="User not found"
        )
    return UserResponse(
        id=user.id or 0,
        clerk_user_id=user.clerk_user_id,
        name=user.name,
        created_at=user.created_at.isoformat()
    )

@router.delete("/{user_id}", response_model=ActionResponse)
def delete_user(
    user_id: int, 
    session: Session = Depends(get_session)
):
    """Delete a user."""
    ok = user_service.delete_user(session, user_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="User not found"
        )
    return ActionResponse(ok=True, message="User deleted successfully")

# Friend Management Operations
@router.get("/{user_id}/friends", response_model=List[UserResponse])
def get_friends(
    user_id: int, 
    session: Session = Depends(get_session)
):
    """Get all friends of a user."""
    friends = user_service.get_friends(session, user_id)
    return [
        UserResponse(
            id=friend.id,
            clerk_user_id=friend.clerk_user_id,
            name=friend.name,
            created_at=friend.created_at.isoformat()
        )
        for friend in friends
        if friend.id is not None
    ]

@router.get("/{user_id}/friends/pending", response_model=List[UserResponse])
def get_pending_friend_requests(
    user_id: int, 
    session: Session = Depends(get_session)
):
    """Get all pending friend requests for a user."""
    pending_requests = user_service.get_pending_friend_requests(session, user_id)
    return [
        UserResponse(
            id=user.id,
            clerk_user_id=user.clerk_user_id,
            name=user.name,
            created_at=user.created_at.isoformat()
        )
        for user in pending_requests
        if user.id is not None
    ]

@router.post("/{user_id}/friends/{friend_id}", response_model=ActionResponse, status_code=status.HTTP_201_CREATED)
def send_friend_request(
    user_id: int, 
    friend_id: int, 
    session: Session = Depends(get_session)
):
    """Send a friend request to another user."""
    if user_id == friend_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot send friend request to yourself"
        )
    
    ok = user_service.send_friend_request(session, user_id, friend_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Friend request already exists or users not found"
        )
    return ActionResponse(ok=True, message="Friend request sent successfully")

@router.post("/{user_id}/friends/{friend_id}/accept", response_model=ActionResponse)
def accept_friend_request(
    user_id: int, 
    friend_id: int, 
    session: Session = Depends(get_session)
):
    """Accept a pending friend request."""
    ok = user_service.accept_friend_request(session, user_id, friend_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Friend request not found"
        )
    return ActionResponse(ok=True, message="Friend request accepted successfully")

@router.post("/{user_id}/friends/{friend_id}/reject", response_model=ActionResponse)
def reject_friend_request(
    user_id: int, 
    friend_id: int, 
    session: Session = Depends(get_session)
):
    """Reject a pending friend request."""
    ok = user_service.reject_friend_request(session, user_id, friend_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Friend request not found"
        )
    return ActionResponse(ok=True, message="Friend request rejected successfully")

@router.delete("/{user_id}/friends/{friend_id}", response_model=ActionResponse)
def remove_friend(
    user_id: int, 
    friend_id: int, 
    session: Session = Depends(get_session)
):
    """Remove a friend from user's friend list."""
    ok = user_service.remove_friend(session, user_id, friend_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Friendship not found"
        )
    return ActionResponse(ok=True, message="Friend removed successfully")
