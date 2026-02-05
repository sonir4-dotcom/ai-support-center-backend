-- Update creator XP fields
UPDATE users SET 
    creator_xp = COALESCE((
        SELECT COUNT(*) * 10 FROM user_uploads WHERE user_id = users.id AND status = 'approved'
    ), 0),
    total_uploads = COALESCE((
        SELECT COUNT(*) FROM user_uploads WHERE user_id = users.id
    ), 0),
    total_plays = COALESCE((
        SELECT SUM(play_count) FROM user_uploads WHERE user_id = users.id
    ), 0);

-- Update creator levels based on XP
UPDATE users SET creator_level = CASE
    WHEN creator_xp >= 100 THEN 5
    WHEN creator_xp >= 50 THEN 4
    WHEN creator_xp >= 25 THEN 3
    WHEN creator_xp >= 10 THEN 2
    ELSE 1
END;

-- Recalculate all trending scores
UPDATE user_uploads SET trending_score = (
    (COALESCE(play_count, 0) * 2.0 + COALESCE(likes, 0) * 5.0) / 
    GREATEST(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400, 1)
) WHERE status = 'approved';

COMMENT ON COLUMN users.creator_xp IS 'XP earned from approved uploads (10 XP per app)';
COMMENT ON COLUMN users.creator_level IS 'Level 1-5 based on XP thresholds';
