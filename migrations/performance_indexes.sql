-- Performance Optimization: Add indexes for trending queries
CREATE INDEX IF NOT EXISTS idx_user_uploads_trending_optimized 
ON user_uploads(status, visible, trending_score DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_uploads_play_count 
ON user_uploads(play_count DESC) WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_user_uploads_likes 
ON user_uploads(likes DESC) WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_user_uploads_created_at 
ON user_uploads(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_activity_user_recent 
ON app_activity(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_activity_upload_type 
ON app_activity(upload_id, activity_type, created_at DESC);

-- Optimize trending query
CREATE INDEX IF NOT EXISTS idx_trending_composite 
ON user_uploads(status, visible, trending_score DESC, play_count DESC, likes DESC);

-- Optimize category filtering
CREATE INDEX IF NOT EXISTS idx_user_uploads_category 
ON user_uploads(category, status, visible);

-- Optimize slug lookups
CREATE INDEX IF NOT EXISTS idx_user_uploads_slug 
ON user_uploads(slug) WHERE status = 'approved';

-- Optimize source_url duplicate checks
CREATE INDEX IF NOT EXISTS idx_user_uploads_source_url 
ON user_uploads(source_url) WHERE source_url IS NOT NULL;

COMMENT ON INDEX idx_user_uploads_trending_optimized IS 'Optimizes trending and community listing queries';
COMMENT ON INDEX idx_trending_composite IS 'Composite index for trending score calculations';
COMMENT ON INDEX idx_user_uploads_slug IS 'Fast slug lookups for chatbot and navigation';
