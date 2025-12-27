from sqlmodel import Session, select, col
from models import Post,Comment
from typing import List

# Create a new post
def create_post(session: Session, post: Post) -> Post:
    session.add(post)
    session.commit()
    session.refresh(post)
    return post

# Get all posts for a user
def get_posts_for_user(session: Session, user_id: int) -> List[Post]:
    statement = (
        select(Post)
        .where(
            col(Post.user_id) == user_id
        )
        .order_by(col(Post.created_at).desc())
    )
    results = session.exec(statement).all()
    return list(results)

# Get timeline posts for a user (their posts and friends' posts)
def get_timeline_posts(session: Session, user_id: int, friend_ids: List[int]) -> List[Post]:
    allowed_user_ids = [user_id] + friend_ids
    statement = (
        select(Post)
        .where(
            col(Post.user_id).in_(allowed_user_ids)
        )
        .order_by(col(Post.created_at).desc())
    )
    results = session.exec(statement).all()
    return list(results)

# Add a comment to a post
def add_comment(session: Session, comment: Comment) -> Comment:
    session.add(comment)
    session.commit()
    session.refresh(comment)
    return comment

# Get comments for a post
def get_comments_for_post(session: Session, post_id: int) -> List[Comment]:
    statement = (
        select(Comment)
        .where(
            col(Comment.post_id) == post_id
        )
        .order_by(col(Comment.created_at).asc())
    )
    results = session.exec(statement).all()
    return list(results)

# Add reply to a comment
def add_reply(session: Session, reply: Comment) -> Comment:
    session.add(reply)
    session.commit()
    session.refresh(reply)
    return reply

# Get replies for a comment
def get_replies_for_comment(session: Session, comment_id: int) -> List[Comment]:
    statement = (
        select(Comment)
        .where(
            col(Comment.parent_comment_id) == comment_id
        )
        .order_by(col(Comment.created_at).asc())
    )
    results = session.exec(statement).all()
    return list(results)

# Delete a post
def delete_post(session: Session, post_id: int) -> bool:
    existing_post = session.get(Post, post_id)
    if not existing_post:
        return False
    session.delete(existing_post)
    session.commit()
    return True

# Delete a comment
def delete_comment(session: Session, comment_id: int) -> bool:
    existing_comment = session.get(Comment, comment_id)
    if not existing_comment:
        return False
    session.delete(existing_comment)
    session.commit()
    return True