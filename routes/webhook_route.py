from fastapi import APIRouter, HTTPException, Header, status
from pydantic import BaseModel
from typing import Any, Optional, Dict
from core.config import settings
from services.user_service import get_user_by_id

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

    return {
        "ok": True,
        "event_id": body.id,
        "message": f"Processed friend request from user {user_id} to user {friend_id}"
    }

@router.post("/events/friend-status-updated")
def handle_friend_status_updated(
    body: HasuraEventTriggerBody,
    x_webhook_secret: Optional[str] = Header(None, alias="x-webhook-secret")
):
    """
    Advanced Webhook Handler:
    1. Security: Verifies x-webhook-secret header
    2. Column Tracking: Triggered when 'status' column in 'friend' table is updated
    3. State Machine: Compares event.data.old vs event.data.new
    4. Data Enrichment: Fetches names of requester and accepter via GraphQL
    5. Action Dispatch: Simulates sending celebration notification
    """
    # 1. Webhook Security Verification
    expected_secret = settings.WEBHOOK_SECRET
    if expected_secret and x_webhook_secret != expected_secret:
        print(f"⚠️ [Unauthorized Webhook] Invalid secret: {x_webhook_secret}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Invalid x-webhook-secret header"
        )

    # 2. Extract Old and New States
    old_data = body.event.data.old or {}
    new_data = body.event.data.new or {}

    user_id = new_data.get("user_id")
    friend_id = new_data.get("friend_id")
    old_status = old_data.get("status")
    new_status = new_data.get("status")

    print(f"⚡ [Advanced Event Trigger] {body.trigger.get('name')} (Event ID: {body.id})")
    print(f"   Status Transition: '{old_status}' ➔ '{new_status}'")

    notification = None

    # 3. Handle 'pending' -> 'accepted' Transition
    if old_status == "pending" and new_status == "accepted":
        # Enrich data by fetching user profiles
        requester = get_user_by_id(user_id=user_id) if user_id else None
        accepter = get_user_by_id(user_id=friend_id) if friend_id else None

        requester_name = requester.name if requester else f"User #{user_id}"
        accepter_name = accepter.name if accepter else f"User #{friend_id}"

        notification = {
            "type": "FRIEND_REQUEST_ACCEPTED",
            "recipient_user_id": user_id,
            "title": "Friend Request Accepted! 🎉",
            "body": f"{accepter_name} accepted your friend request. You can now see each other's posts and stories!",
            "requester": requester_name,
            "accepter": accepter_name
        }
        print(f"   📣 Dispatched Notification to {requester_name}: {notification['body']}")

    elif new_status == "blocked":
        notification = {
            "type": "USER_BLOCKED",
            "action": f"User connection between #{user_id} and #{friend_id} has been blocked."
        }
        print(f"   ⛔ Connection blocked between #{user_id} and #{friend_id}")

    return {
        "ok": True,
        "event_id": body.id,
        "state_transition": {
            "from": old_status,
            "to": new_status
        },
        "notification": notification
    }
