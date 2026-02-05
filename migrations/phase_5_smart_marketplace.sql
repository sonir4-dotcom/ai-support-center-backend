-- Phase 5: Smart Marketplace Layer
-- Add trending metrics, creator XP, and enhanced admin features

-- Add trending and engagement metrics to user_uploads
ALTER TABLE user_uploads
ADD COLUMN IF NOT EXISTS play_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS trending_score DECIMAL(10,2) DEFAULT 0;

-- Add creator XP system (no UI yet, just DB structure)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS creator_xp INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS creator_level INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS total_uploads INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_plays INTEGER DEFAULT 0;

-- Create activity tracking table for trending calculation
CREATE TABLE IF NOT EXISTS app_activity (
    id SERIAL PRIMARY KEY,
    upload_id INTEGER REFERENCES user_uploads(id) ON DELETE CASCADE,
    activity_type VARCHAR(20) NOT NULL, -- 'play', 'like', 'share'
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_uploads_trending ON user_uploads(trending_score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_uploads_play_count ON user_uploads(play_count DESC);
CREATE INDEX IF NOT EXISTS idx_app_activity_upload ON app_activity(upload_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_creator_xp ON users(creator_xp DESC);

-- Function to calculate trending score
-- Formula: (play_count * 2 + likes * 5) / days_since_upload
CREATE OR REPLACE FUNCTION calculate_trending_score(upload_id INTEGER)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    plays INTEGER;
    likes_count INTEGER;
    days_old DECIMAL;
    score DECIMAL(10,2);
BEGIN
    SELECT 
        COALESCE(play_count, 0),
        COALESCE(likes, 0),
        GREATEST(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400, 1)
    INTO plays, likes_count, days_old
    FROM user_uploads
    WHERE id = upload_id;
    
    score := ((plays * 2.0) + (likes_count * 5.0)) / days_old;
    
    RETURN score;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update trending score on activity
CREATE OR REPLACE FUNCTION update_trending_score()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE user_uploads
    SET trending_score = calculate_trending_score(NEW.upload_id),
        last_activity = NOW()
    WHERE id = NEW.upload_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_trending ON app_activity;
CREATE TRIGGER trigger_update_trending
AFTER INSERT ON app_activity
FOR EACH ROW
EXECUTE FUNCTION update_trending_score();

-- Comments
COMMENT ON COLUMN user_uploads.play_count IS 'Total number of times app was played/viewed';
COMMENT ON COLUMN user_uploads.likes IS 'Total likes received';
COMMENT ON COLUMN user_uploads.trending_score IS 'Calculated trending score for ranking';
COMMENT ON COLUMN users.creator_xp IS 'Experience points for content creation';
COMMENT ON COLUMN users.creator_level IS 'Creator level based on XP';
COMMENT ON TABLE app_activity IS 'Tracks user interactions with apps for trending calculation';
