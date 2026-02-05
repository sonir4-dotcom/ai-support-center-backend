-- Phase 8: Creator System Foundation Schema

-- Add creator profile columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp_points INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_uploads INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_likes INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path TEXT DEFAULT NULL;

-- Create index for leaderboards
CREATE INDEX IF NOT EXISTS idx_users_xp_points ON users(xp_points DESC);
CREATE INDEX IF NOT EXISTS idx_users_total_uploads ON users(total_uploads DESC);

-- Ensure community_images has necessary fields (likely already exists from previous phases, but verifying)
-- ALTER TABLE community_images ADD COLUMN IF NOT EXISTS creator_name VARCHAR(255); -- already exists
-- ALTER TABLE community_images ADD COLUMN IF NOT EXISTS uploader_id INTEGER; -- already exists

-- Create table to track user likes and prevent duplicates/XP spam
CREATE TABLE IF NOT EXISTS user_image_likes (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    image_id INTEGER REFERENCES community_images(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, image_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_image_likes_user_id ON user_image_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_image_likes_image_id ON user_image_likes(image_id);
