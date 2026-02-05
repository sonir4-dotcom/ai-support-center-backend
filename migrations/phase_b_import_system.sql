-- Phase B: Multi-Source Import System Database Migrations

-- Add import-related columns to user_uploads table
ALTER TABLE user_uploads ADD COLUMN IF NOT EXISTS import_method VARCHAR(20) DEFAULT 'zip';
ALTER TABLE user_uploads ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE user_uploads ADD COLUMN IF NOT EXISTS icon_path TEXT;
ALTER TABLE user_uploads ADD COLUMN IF NOT EXISTS thumbnail_path TEXT;
ALTER TABLE user_uploads ADD COLUMN IF NOT EXISTS visible BOOLEAN DEFAULT true;
ALTER TABLE user_uploads ADD COLUMN IF NOT EXISTS auto_category VARCHAR(100);

-- Create app_sources table for AI discovery (Phase 3)
CREATE TABLE IF NOT EXISTS app_sources (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    keywords TEXT[],
    source_type VARCHAR(20) NOT NULL, -- 'github' or 'url'
    source_url TEXT NOT NULL,
    category VARCHAR(100),
    preview_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(source_url)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_uploads_import_method ON user_uploads(import_method);
CREATE INDEX IF NOT EXISTS idx_user_uploads_visible ON user_uploads(visible);
CREATE INDEX IF NOT EXISTS idx_app_sources_keywords ON app_sources USING GIN(keywords);

-- Add comments
COMMENT ON COLUMN user_uploads.import_method IS 'Import source: zip, github, or url';
COMMENT ON COLUMN user_uploads.source_url IS 'Original source URL for GitHub/URL imports';
COMMENT ON COLUMN user_uploads.icon_path IS 'Path to extracted app icon';
COMMENT ON COLUMN user_uploads.thumbnail_path IS 'Path to generated thumbnail';
COMMENT ON COLUMN user_uploads.visible IS 'Whether app is visible in listings (hide without delete)';
COMMENT ON COLUMN user_uploads.auto_category IS 'AI-detected category for validation';
