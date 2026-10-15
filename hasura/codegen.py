import os
import sys
from dotenv import load_dotenv
from ariadne_codegen.main import client

def run():
    load_dotenv()
    url = os.getenv("HASURA_GRAPHQL_URL")
    admin_secret = os.getenv("HASURA_ADMIN_SECRET")

    if not url:
        print("Error: HASURA_GRAPHQL_URL is not set in .env or environment", file=sys.stderr)
        sys.exit(1)

    headers = {}
    if admin_secret:
        headers["x-hasura-admin-secret"] = admin_secret

    config = {
        "tool": {
            "ariadne-codegen": {
                "remote_schema_url": url,
                "remote_schema_headers": headers,
                "queries_path": "hasura",
                "target_package_name": "hasura_client",
                "target_package_path": "hasura",
                "client_name": "HasuraClient",
                "async_client": False,
            }
        }
    }
    client(config)
    print("Hasura GraphQL codegen completed successfully using .env!")

if __name__ == "__main__":
    run()
