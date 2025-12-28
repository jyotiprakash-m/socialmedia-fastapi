from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session
from typing import List, Optional
from pydantic import BaseModel
from models import Post, Comment
from core.database import get_session
from services import post_service

router = APIRouter(prefix="/posts", tags=["Posts"])

# Response models
class ActionResponse(BaseModel):
    ok: bool
    message: Optional[str] = None

class PostCreate(BaseModel):
    content: str
    user_id: int
    media_url: Optional[str] = None
    media_type: Optional[str] = None 

class PostResponse(BaseModel):
    id: int
    content: str
    user_id: int
    created_at: str

class CommentCreate(BaseModel):
    content: str
    user_id: int
    post_id: int
    parent_comment_id: Optional[int] = None

class CommentResponse(BaseModel):
    id: int
    content: str
    user_id: int
    post_id: int
    parent_comment_id: Optional[int] = None
    created_at: str

# Post CRUD Operations
@router.post("/", response_model=PostResponse, status_code=status.HTTP_201_CREATED)
def create_post(
    post: PostCreate, 
    session: Session = Depends(get_session)
):
    """Create a new post."""
    try:
        post_model = Post(**post.model_dump())
        created_post = post_service.create_post(session, post_model)
        return PostResponse(
            id=created_post.id or 0,
            content=created_post.content,
            user_id=created_post.user_id,
            created_at=created_post.created_at.isoformat()
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error creating post: {str(e)}"
        )

@router.get("/user/{user_id}", response_model=List[PostResponse])
def get_posts_for_user(
    user_id: int, 
    session: Session = Depends(get_session)
):
    """Get all posts for a specific user."""
    posts = post_service.get_posts_for_user(session, user_id)
    return [
        PostResponse(
            id=post.id,
            content=post.content,
            user_id=post.user_id,
            created_at=post.created_at.isoformat()
        )
        for post in posts
        if post.id is not None
    ]

@router.get("/timeline/{user_id}", response_model=List[PostResponse])
def get_timeline_posts(
    user_id: int, 
    friend_ids: List[int], 
    session: Session = Depends(get_session)
):
    """Get timeline posts for a user (their posts and friends' posts)."""
    posts = post_service.get_timeline_posts(session, user_id, friend_ids)
    return [
        PostResponse(
            id=post.id,
            content=post.content,
            user_id=post.user_id,
            created_at=post.created_at.isoformat()
        )
        for post in posts
        if post.id is not None
    ]

@router.delete("/{post_id}", response_model=ActionResponse)
def delete_post(
    post_id: int, 
    session: Session = Depends(get_session)
):
    """Delete a post."""
    ok = post_service.delete_post(session, post_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Post not found"
        )
    return ActionResponse(ok=True, message="Post deleted successfully")

# Comment Operations
@router.post("/{post_id}/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
def add_comment(
    post_id: int, 
    comment: CommentCreate, 
    session: Session = Depends(get_session)
):
    """Add a comment to a post."""
    try:
        comment_model = Comment(**comment.model_dump())
        created_comment = post_service.add_comment(session, comment_model)
        return CommentResponse(
            id=created_comment.id or 0,
            content=created_comment.content,
            user_id=created_comment.user_id,
            post_id=created_comment.post_id,
            parent_comment_id=created_comment.parent_comment_id,
            created_at=created_comment.created_at.isoformat()
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error adding comment: {str(e)}"
        )

@router.get("/{post_id}/comments", response_model=List[CommentResponse])
def get_comments_for_post(
    post_id: int, 
    session: Session = Depends(get_session)
):
    """Get all comments for a post."""
    comments = post_service.get_comments_for_post(session, post_id)
    return [
        CommentResponse(
            id=comment.id or 0,
            content=comment.content,
            user_id=comment.user_id,
            post_id=comment.post_id,
            parent_comment_id=comment.parent_comment_id,
            created_at=comment.created_at.isoformat()
        )
        for comment in comments
    ]

@router.post("/comments/{comment_id}/replies", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
def add_reply(
    reply: CommentCreate, 
    session: Session = Depends(get_session)
):
    """Add a reply to a comment."""
    try:
        reply_model = Comment(**reply.model_dump())
        created_reply = post_service.add_reply(session, reply_model)
        return CommentResponse(
            id=created_reply.id or 0,
            content=created_reply.content,
            user_id=created_reply.user_id,
            post_id=created_reply.post_id,
            parent_comment_id=created_reply.parent_comment_id,
            created_at=created_reply.created_at.isoformat()
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error adding reply: {str(e)}"
        )

@router.get("/comments/{comment_id}/replies", response_model=List[CommentResponse])
def get_replies_for_comment(
    comment_id: int, 
    session: Session = Depends(get_session)
):
    """Get all replies for a comment."""
    replies = post_service.get_replies_for_comment(session, comment_id)
    return [
        CommentResponse(
            id=reply.id,
            content=reply.content,
            user_id=reply.user_id,
            post_id=reply.post_id,
            parent_comment_id=reply.parent_comment_id,
            created_at=reply.created_at.isoformat()
        )
        for reply in replies
        if reply.id is not None
    ]

@router.delete("/comments/{comment_id}", response_model=ActionResponse)
def delete_comment(
    comment_id: int, 
    session: Session = Depends(get_session)
):
    """Delete a comment."""
    ok = post_service.delete_comment(session, comment_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Comment not found"
        )
    return ActionResponse(ok=True, message="Comment deleted successfully")