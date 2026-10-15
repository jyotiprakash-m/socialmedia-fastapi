from core.config import settings
from .hasura_client import HasuraClient

def get_hasura_client() -> HasuraClient:
    url = settings.HASURA_GRAPHQL_URL or "https://genuine-eft-93.hasura.app/v1/graphql"
    headers = {}
    if settings.HASURA_ADMIN_SECRET:
        headers["x-hasura-admin-secret"] = settings.HASURA_ADMIN_SECRET
    return HasuraClient(url=url, headers=headers)

hasura_client = get_hasura_client()

__all__ = ["HasuraClient", "get_hasura_client", "hasura_client"]
