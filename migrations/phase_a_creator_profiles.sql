-- Phase A: Creator Profile & Mini Play Store Database Migrations

-- Add creator profile columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS creator_avatar TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_xp INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS badge_level VARCHAR(50) DEFAULT 'beginner';
ALTER TABLE users ADD COLUMN IF NOT EXISTS upload_score INTEGER DEFAULT 0;

-- Add engagement columns to user_uploads table
ALTER TABLE user_uploads ADD COLUMN IF NOT EXISTS play_count INTEGER DEFAULT 0;
ALTER TABLE user_uploads ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0;
ALTER TABLE user_uploads ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false;
ALTER TABLE user_uploads ADD COLUMN IF NOT EXISTS slug VARCHAR(255) UNIQUE;
ALTER TABLE user_uploads ADD COLUMN IF NOT EXISTS rank_order INTEGER DEFAULT 0;

-- Create index on slug for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_uploads_slug ON user_uploads(slug);
CREATE INDEX IF NOT EXISTS idx_user_uploads_featured ON user_uploads(featured);
CREATE INDEX IF NOT EXISTS idx_user_uploads_status ON user_uploads(status);

-- Add trending score calculation (can be used in queries)
-- Trending score = (play_count * 2 + likes * 5) * recency_boost
COMMENT ON COLUMN user_uploads.play_count IS 'Number of times this content has been played/viewed';
COMMENT ON COLUMN user_uploads.likes IS 'Number of likes received';
COMMENT ON COLUMN user_uploads.featured IS 'Whether this content is featured by admins';
COMMENT ON COLUMN user_uploads.slug IS 'URL-friendly slug for routing (e.g., memory-match-9fd3)';
COMMENT ON COLUMN user_uploads.rank_order IS 'Manual ranking order set by admins (higher = more prominent)';
