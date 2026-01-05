from fastapi import FastAPI, Depends
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from core.database import init_db, engine
from core.config import settings
import secrets
from fastapi.staticfiles import StaticFiles
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
import base64
from sqladmin import Admin, ModelView
# All Model imports
from models import User,Comment,Post,Friend,Story
from routes import user_route,post_route,story_route

security = HTTPBasic()
def basic_auth(credentials: HTTPBasicCredentials = Depends(security)):
    correct_username = secrets.compare_digest(credentials.username, "admin")
    correct_password = secrets.compare_digest(credentials.password, "password")
    if not (correct_username and correct_password):
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Invalid credentials", headers={"WWW-Authenticate": "Basic"})

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield 

app = FastAPI(title="Social Media App", lifespan=lifespan, docs_url=None, redoc_url=None)
# app.mount("/static", StaticFiles(directory="static"), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

admin = Admin(app=app, engine=engine)

# Register SQLModel views with sqladmin. sqladmin expects a view *class*,
class UserAdmin(ModelView, model=User):
    # explicitly show these columns in the list view
    column_list = ["id", "clerk_user_id", "name", "created_at"]

class PostAdmin(ModelView, model=Post):
    column_list = ["id", "user_id", "content", "media_url" , "media_type" , "created_at"]
    
class CommentAdmin(ModelView, model=Comment):
    column_list = ["id", "post_id", "user_id", "parent_comment_id" ,"content", "created_at"]
    
class StoryAdmin(ModelView, model=Story):
    column_list = ["id", "user_id", "media_url", "media_type" , "created_at", "expires_at"]

class FriendAdmin(ModelView, model=Friend):
    column_list = ["id", "user_id", "friend_user_id", "created_at"]
    
admin.add_view(UserAdmin)
admin.add_view(PostAdmin)
admin.add_view(CommentAdmin)
admin.add_view(StoryAdmin)
admin.add_view(FriendAdmin)



# Middleware to protect /admin with HTTP Basic auth (SQLite )
class AdminBasicAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path.startswith("/admin"):
            auth = request.headers.get("authorization")
            if not auth or not auth.startswith("Basic "):
                return Response(status_code=401, headers={"WWW-Authenticate": "Basic"})
            try:
                token = auth.split(" ", 1)[1]
                decoded = base64.b64decode(token).decode("utf-8")
                username, password = decoded.split(":", 1)
            except Exception:
                return Response(status_code=401, headers={"WWW-Authenticate": "Basic"})

            if not (secrets.compare_digest(username, "admin") and secrets.compare_digest(password, "password")):
                return Response(status_code=401, headers={"WWW-Authenticate": "Basic"})

        return await call_next(request)

app.add_middleware(AdminBasicAuthMiddleware)

# Include user routes
app.include_router(user_route.router, dependencies=[Depends(basic_auth)])
app.include_router(post_route.router, dependencies=[Depends(basic_auth)])
app.include_router(story_route.router, dependencies=[Depends(basic_auth)])

# Root endpoint
@app.get("/")
def read_root(credentials: HTTPBasicCredentials = Depends(security)):
    basic_auth(credentials)
    return {"message": "Welcome to the Social Media App API"}

@app.get("/docs", include_in_schema=False)
def custom_swagger_ui(credentials: HTTPBasicCredentials = Depends(security)):
    basic_auth(credentials)
    return get_swagger_ui_html(openapi_url="/openapi.json", title=app.title)

@app.get("/redoc", include_in_schema=False)
def custom_redoc(credentials: HTTPBasicCredentials = Depends(security)):
    basic_auth(credentials)
    return get_redoc_html(openapi_url="/openapi.json", title=app.title)



def main():
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

if __name__ == "__main__":
    main()