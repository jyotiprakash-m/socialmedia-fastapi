import httpx
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from core.config import settings

def create_one_off_scheduled_event(
    webhook_url: str,
    schedule_at: datetime,
    payload: Dict[str, Any],
    comment: Optional[str] = None
) -> str:
    """
    Schedules a one-off event in Hasura to invoke `webhook_url` at `schedule_at`.
    Returns the generated event_id from Hasura.
    """
    hasura_url = (settings.HASURA_GRAPHQL_URL or "https://genuine-eft-93.hasura.app/v1/graphql").replace("/v1/graphql", "/v1/metadata")
    headers = {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": settings.HASURA_ADMIN_SECRET or ""
    }

    schedule_at_iso = schedule_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    body = {
        "type": "create_scheduled_event",
        "args": {
            "webhook": webhook_url,
            "schedule_at": schedule_at_iso,
            "payload": payload,
            "headers": [
                {
                    "name": "x-webhook-secret",
                    "value": settings.WEBHOOK_SECRET
                }
            ],
            "retry_conf": {
                "num_retries": 3,
                "retry_interval_seconds": 10,
                "timeout_seconds": 60
            },
            "comment": comment or "One-off scheduled event"
        }
    }

    resp = httpx.post(hasura_url, json=body, headers=headers, timeout=10)
    data = resp.json()
    if resp.status_code != 200 or "event_id" not in data:
        raise RuntimeError(f"Failed to create scheduled event in Hasura: {data}")

    return data["event_id"]
