
from sqlmodel import Session, select
from models import User, Friend
from typing import List, Optional, cast, Any
from sqlalchemy.sql import ColumnElement

# Get user by ID
def get_user_by_id(session: Session, user_id: int) -> User | None:
    statement = select(User).where(User.id == user_id)
    result = session.exec(statement).first()
    return result

# List users with pagination
def list_users(session: Session, skip: int = 0, limit: int = 100) -> List[User]:
    statement = select(User).offset(skip).limit(limit)
    results = session.exec(statement).all()
    return list(results)

# Create a new user
def create_user(session: Session, user: User) -> User:
    session.add(user)
    session.commit()
    session.refresh(user)
    return user

# Update an existing user
def update_user(session: Session, user_id: int, updated_user: User) -> Optional[User]:
    existing_user = get_user_by_id(session, user_id)
    if not existing_user:
        return None
    for key, value in updated_user.dict(exclude_unset=True).items():
        setattr(existing_user, key, value)
    session.add(existing_user)
    session.commit()
    session.refresh(existing_user)
    return existing_user

# Delete a user
def delete_user(session: Session, user_id: int) -> bool:
    existing_user = get_user_by_id(session, user_id)
    if not existing_user:
        return False
    session.delete(existing_user)
    session.commit()
    return True

# Get friends of a user
def get_friends(session: Session, user_id: int) -> List[User]:
    # Select User rows where a Friend row links the given user_id to the user's id
    statement = (
        select(User)
        .distinct()
        .join(Friend) 
        .where(Friend.user_id == user_id,Friend.friend_id == User.id, Friend.status == "accepted")
    )
    results = session.exec(statement).all()
    return list(results)

# get all pending friend requests for a user
def get_pending_friend_requests(session: Session, user_id: int) -> List[User]:
    statement = (
        select(User)
        .distinct()
        .join(Friend) 
        .where(Friend.friend_id == user_id, Friend.status == "pending", Friend.user_id == User.id)
    )
    results = session.exec(statement).all()
    return list(results)

# Accept a friend request
def accept_friend_request(session: Session, user_id: int, friend_id: int) -> bool:
    statement = select(Friend).where(
        Friend.user_id == friend_id,
        Friend.friend_id == user_id,
        Friend.status == "pending"
    )
    friend_request = session.exec(statement).first()
    if not friend_request:
        return False
    friend_request.status = "accepted"
    session.add(friend_request)
    session.commit()
    return True

# Reject a friend request
def reject_friend_request(session: Session, user_id: int, friend_id: int) -> bool:
    statement = select(Friend).where(
        Friend.user_id == friend_id,
        Friend.friend_id == user_id,
        Friend.status == "pending"
    )
    friend_request = session.exec(statement).first()
    if not friend_request:
        return False
    session.delete(friend_request)
    session.commit()
    return True

# Send a friend request
def send_friend_request(session: Session, user_id: int, friend_id: int) -> bool:
    # Check if a friend request already exists
    statement = select(Friend).where(
        Friend.user_id == user_id,
        Friend.friend_id == friend_id
    )
    existing_request = session.exec(statement).first()
    if existing_request:
        return False  # Friend request already exists
    new_request = Friend(user_id=user_id, friend_id=friend_id, status="pending")
    session.add(new_request)
    session.commit()
    return True

# Remove a friend
def remove_friend(session: Session, user_id: int, friend_id: int) -> bool:
    statement = select(Friend).where(
        ((Friend.user_id == user_id) & (Friend.friend_id == friend_id)) |
        ((Friend.user_id == friend_id) & (Friend.friend_id == user_id)),
        Friend.status == "accepted"
    )
    friendship = session.exec(statement).first()
    if not friendship:
        return False
    session.delete(friendship)
    session.commit()
    return True

# Find out all the users who are not friends with a given user 
def get_non_friends(session: Session, name: Optional[str] = None) -> List[User]:
    """Return users optionally filtered by `name` (case-insensitive).

    This function no longer excludes a specific user's friends — it simply
    searches users by name when provided.
    """
    statement = select(User)

    if name:
        name_col = cast(ColumnElement[Any], User.name)
        statement = statement.where(name_col.ilike(f"%{name}%"))

    results = session.exec(statement).all()
    return list(results)
