from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Any, Optional, Dict
import logging

logger = logging.getLogger("uvicorn")

router = APIRouter(prefix="/webhooks", tags=["Hasura Webhooks"])

class EventData(BaseModel):
    old: Optional[Dict[str, Any]] = None
    new: Optional[Dict[str, Any]] = None

class EventPayload(BaseModel):
    session_variables: Optional[Dict[str, Any]] = None
    op: str
    data: EventData

class HasuraEventTriggerBody(BaseModel):
    id: str
    created_at: str
    trigger: Dict[str, Any]
    table: Dict[str, Any]
    event: EventPayload

@router.post("/events/friend-request")
def handle_friend_request_event(body: HasuraEventTriggerBody):
    """
    Webhook handler for Hasura Event Trigger on 'friend' table INSERT.
    Triggered in real-time by Hasura whenever a new friend request is created.
    """
    event_op = body.event.op
    new_data = body.event.data.new or {}

    user_id = new_data.get("user_id")
    friend_id = new_data.get("friend_id")
    status_val = new_data.get("status")

    print(f"🔔 [Hasura Event Trigger] {body.trigger.get('name')} (Event ID: {body.id})")
    print(f"   -> User {user_id} sent a friend request to User {friend_id} [Status: {status_val}]")

    # Example: Send notification, email, or background task here
    return {
        "ok": True,
        "event_id": body.id,
        "message": f"Processed friend request from user {user_id} to user {friend_id}"
    }
