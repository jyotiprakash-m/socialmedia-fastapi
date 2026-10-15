from typing import List, Optional, Any
from datetime import datetime, timezone
from models import User
from hasura import hasura_client
from hasura.hasura_client.input_types import user_set_input

def _parse_dt(val: Any) -> datetime:
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        return datetime.fromisoformat(val)
    return datetime.now(timezone.utc)

def _to_user(u: Any) -> User:
    return User(
        id=u.id,
        clerk_user_id=u.clerk_user_id,
        name=u.name,
        created_at=_parse_dt(u.created_at)
    )

# Get user by ID
def get_user_by_id(session: Any = None, user_id: int = 0) -> Optional[User]:
    res = hasura_client.get_user_by_id(id=user_id)
    if not res.user_by_pk:
        return None
    return _to_user(res.user_by_pk)

# List users with pagination
def list_users(session: Any = None, skip: int = 0, limit: int = 100) -> List[User]:
    res = hasura_client.list_users(offset=skip, limit=limit)
    return [_to_user(u) for u in res.user]

# Create a new user
def create_user(session: Any = None, user: User = None) -> User:
    res = hasura_client.create_user(
        clerk_user_id=user.clerk_user_id,
        name=user.name
    )
    if not res.insert_user_one:
        raise RuntimeError("Failed to create user in Hasura")
    return _to_user(res.insert_user_one)

# Update an existing user
def update_user(session: Any = None, user_id: int = 0, updated_user: User = None) -> Optional[User]:
    user_dict = updated_user.dict(exclude_unset=True) if hasattr(updated_user, "dict") else updated_user.model_dump(exclude_unset=True)
    update_data = {}
    if "name" in user_dict and user_dict["name"] is not None:
        update_data["name"] = user_dict["name"]
    if "clerk_user_id" in user_dict and user_dict["clerk_user_id"] is not None:
        update_data["clerk_user_id"] = user_dict["clerk_user_id"]

    res = hasura_client.update_user(
        id=user_id,
        set=user_set_input(**update_data)
    )
    if not res.update_user_by_pk:
        return None
    return _to_user(res.update_user_by_pk)

# Delete a user
def delete_user(session: Any = None, user_id: int = 0) -> bool:
    res = hasura_client.delete_user(id=user_id)
    return res.delete_user_by_pk is not None

# Get friends of a user
def get_friends(session: Any = None, user_id: int = 0) -> List[User]:
    res = hasura_client.get_friends(user_id=user_id)
    friends: List[User] = []
    for f in res.friend:
        if f.friend_user:
            friends.append(_to_user(f.friend_user))
    return friends

# Get all pending friend requests for a user
def get_pending_friend_requests(session: Any = None, user_id: int = 0) -> List[User]:
    res = hasura_client.get_pending_friend_requests(user_id=user_id)
    pending_users: List[User] = []
    for f in res.friend:
        if f.user:
            pending_users.append(_to_user(f.user))
    return pending_users

# Accept a friend request
def accept_friend_request(session: Any = None, user_id: int = 0, friend_id: int = 0) -> bool:
    res = hasura_client.accept_friend_request(user_id=user_id, friend_id=friend_id)
    return res.update_friend is not None and res.update_friend.affected_rows > 0

# Reject a friend request
def reject_friend_request(session: Any = None, user_id: int = 0, friend_id: int = 0) -> bool:
    res = hasura_client.reject_friend_request(user_id=user_id, friend_id=friend_id)
    return res.delete_friend is not None and res.delete_friend.affected_rows > 0

# Send a friend request
def send_friend_request(session: Any = None, user_id: int = 0, friend_id: int = 0) -> bool:
    check_res = hasura_client.find_friend_request(user_id=user_id, friend_id=friend_id)
    if check_res.friend:
        return False
    res = hasura_client.send_friend_request(user_id=user_id, friend_id=friend_id)
    return res.insert_friend_one is not None

# Remove a friend
def remove_friend(session: Any = None, user_id: int = 0, friend_id: int = 0) -> bool:
    res = hasura_client.remove_friend(user_id=user_id, friend_id=friend_id)
    return res.delete_friend is not None and res.delete_friend.affected_rows > 0

# Find out all the users who are not friends with a given user
def get_non_friends(session: Any = None, name: Optional[str] = None) -> List[User]:
    if name:
        res = hasura_client.search_users(query=f"%{name}%")
    else:
        res = hasura_client.list_users(offset=0, limit=100)
    return [_to_user(u) for u in res.user]
