from typing import List, Optional, Any
from datetime import datetime, timezone
from models import Post, Comment
from hasura import hasura_client

def _parse_dt(val: Any) -> datetime:
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        return datetime.fromisoformat(val)
    return datetime.now(timezone.utc)

def _to_post(p: Any) -> Post:
    return Post(
        id=p.id,
        user_id=p.user_id,
        content=p.content,
        media_url=p.media_url,
        media_type=p.media_type,
        created_at=_parse_dt(p.created_at),
        updated_at=_parse_dt(p.updated_at)
    )

def _to_comment(c: Any) -> Comment:
    return Comment(
        id=c.id,
        post_id=c.post_id,
        user_id=c.user_id,
        parent_comment_id=c.parent_comment_id,
        content=c.content,
        created_at=_parse_dt(c.created_at)
    )

# Create a new post
def create_post(session: Any = None, post: Post = None) -> Post:
    res = hasura_client.create_post(
        user_id=post.user_id,
        content=post.content,
        media_url=post.media_url,
        media_type=post.media_type
    )
    if not res.insert_post_one:
        raise RuntimeError("Failed to create post in Hasura")
    return _to_post(res.insert_post_one)

# Get all posts for a user
def get_posts_for_user(session: Any = None, user_id: int = 0) -> List[Post]:
    res = hasura_client.get_posts_for_user(user_id=user_id)
    return [_to_post(p) for p in res.post]

# Get timeline posts for a user (their posts and friends' posts)
def get_timeline_posts(session: Any = None, user_id: int = 0, friend_ids: List[int] = None) -> List[Post]:
    allowed_user_ids = [user_id] + (friend_ids or [])
    res = hasura_client.get_timeline_posts(user_ids=allowed_user_ids)
    return [_to_post(p) for p in res.post]

# Add a comment to a post
def add_comment(session: Any = None, comment: Comment = None) -> Comment:
    res = hasura_client.add_comment(
        post_id=comment.post_id,
        user_id=comment.user_id,
        content=comment.content,
        parent_comment_id=comment.parent_comment_id
    )
    if not res.insert_comment_one:
        raise RuntimeError("Failed to add comment in Hasura")
    return _to_comment(res.insert_comment_one)

# Get comments for a post
def get_comments_for_post(session: Any = None, post_id: int = 0) -> List[Comment]:
    res = hasura_client.get_comments_for_post(post_id=post_id)
    return [_to_comment(c) for c in res.comment]

# Add reply to a comment
def add_reply(session: Any = None, reply: Comment = None) -> Comment:
    res = hasura_client.add_comment(
        post_id=reply.post_id,
        user_id=reply.user_id,
        content=reply.content,
        parent_comment_id=reply.parent_comment_id
    )
    if not res.insert_comment_one:
        raise RuntimeError("Failed to add reply in Hasura")
    return _to_comment(res.insert_comment_one)

# Get replies for a comment
def get_replies_for_comment(session: Any = None, comment_id: int = 0) -> List[Comment]:
    res = hasura_client.get_replies_for_comment(comment_id=comment_id)
    return [_to_comment(c) for c in res.comment]

# Delete a post
def delete_post(session: Any = None, post_id: int = 0) -> bool:
    res = hasura_client.delete_post(id=post_id)
    return res.delete_post_by_pk is not None

# Delete a comment
def delete_comment(session: Any = None, comment_id: int = 0) -> bool:
    res = hasura_client.delete_comment(id=comment_id)
    return res.delete_comment_by_pk is not None