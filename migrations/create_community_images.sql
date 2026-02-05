-- Image Marketplace System Database Schema
-- Future-ready with orientation, dominant_color, and performance fields

CREATE TABLE IF NOT EXISTS community_images (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    image_path TEXT NOT NULL,
    thumbnail_path TEXT NOT NULL,
    category VARCHAR(100) DEFAULT 'general',
    slug VARCHAR(255) UNIQUE NOT NULL,
    uploader_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    creator_name VARCHAR(255),
    
    -- Engagement metrics
    likes INTEGER DEFAULT 0,
    downloads INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    
    -- Status and visibility
    status VARCHAR(20) DEFAULT 'pending',
    featured BOOLEAN DEFAULT false,
    visible BOOLEAN DEFAULT true,
    
    -- Future-ready fields for advanced features
    orientation VARCHAR(20), -- 'portrait', 'landscape', 'square'
    dominant_color VARCHAR(7), -- Hex color code (e.g., '#FF5733')
    width INTEGER,
    height INTEGER,
    file_size INTEGER, -- in bytes
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_community_images_status_visible 
ON community_images(status, visible);

CREATE INDEX IF NOT EXISTS idx_community_images_category 
ON community_images(category, status, visible);

CREATE INDEX IF NOT EXISTS idx_community_images_slug 
ON community_images(slug) WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_community_images_trending 
ON community_images(downloads DESC, likes DESC, view_count DESC) 
WHERE status = 'approved' AND visible = true;

CREATE INDEX IF NOT EXISTS idx_community_images_uploader 
ON community_images(uploader_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_images_featured 
ON community_images(featured, status) WHERE featured = true;

-- Future: Color-based filtering
CREATE INDEX IF NOT EXISTS idx_community_images_color 
ON community_images(dominant_color) WHERE dominant_color IS NOT NULL;

-- Future: Orientation filtering
CREATE INDEX IF NOT EXISTS idx_community_images_orientation 
ON community_images(orientation, status) WHERE orientation IS NOT NULL;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_community_images_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_community_images_timestamp
BEFORE UPDATE ON community_images
FOR EACH ROW
EXECUTE FUNCTION update_community_images_timestamp();

-- Comments for documentation
COMMENT ON TABLE community_images IS 'Pinterest-style image marketplace with future-ready fields';
COMMENT ON COLUMN community_images.orientation IS 'Image orientation: portrait, landscape, or square';
COMMENT ON COLUMN community_images.dominant_color IS 'Hex color code for color-based filtering';
COMMENT ON COLUMN community_images.view_count IS 'Number of times image detail page was viewed';
COMMENT ON COLUMN community_images.downloads IS 'Number of times image was downloaded';
