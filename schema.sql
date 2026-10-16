-- ==============================================================================
-- Social Media FastAPI - Database Schema DDL
-- ==============================================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS "user" (
    id SERIAL PRIMARY KEY,
    clerk_user_id VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 2. Posts Table
CREATE TABLE IF NOT EXISTS post (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    media_url VARCHAR(1024),
    media_type VARCHAR(50), -- e.g. 'image', 'video'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3. Comments Table (Supports nested / threaded comments)
CREATE TABLE IF NOT EXISTS comment (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES post(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    parent_comment_id INTEGER REFERENCES comment(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 4. Friends Table (Friend requests and connections)
CREATE TABLE IF NOT EXISTS friend (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    friend_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'blocked'
    CONSTRAINT unique_friendship UNIQUE (user_id, friend_id)
);

-- 5. Stories Table (Ephemeral content with 24h expiration)
CREATE TABLE IF NOT EXISTS story (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    media_url VARCHAR(1024) NOT NULL,
    media_type VARCHAR(50) NOT NULL, -- 'image' | 'video'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours') NOT NULL
);

-- ==============================================================================
-- Recommended Indexes for Performance
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON post(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comment(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comment(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comment(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_friends_user_friend ON friend(user_id, friend_id);
CREATE INDEX IF NOT EXISTS idx_stories_user_id ON story(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON story(expires_at);
