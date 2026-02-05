-- Seed data for AI Discovery Engine
-- Curated static apps for keyword-based discovery

INSERT INTO app_sources (title, description, keywords, source_type, source_url, category, preview_url) VALUES
-- Games
('Memory Match Game', 'Classic memory card matching game with multiple difficulty levels', ARRAY['game', 'memory', 'cards', 'puzzle', 'match'], 'github', 'https://github.com/taniarascia/memory', 'game', 'https://raw.githubusercontent.com/taniarascia/memory/master/screenshot.png'),

('2048 Game', 'Popular 2048 puzzle game - combine tiles to reach 2048', ARRAY['game', 'puzzle', '2048', 'numbers', 'strategy'], 'github', 'https://github.com/gabrielecirulli/2048', 'game', 'https://raw.githubusercontent.com/gabrielecirulli/2048/master/meta/apple-touch-icon.png'),

('Snake Game', 'Classic snake game built with vanilla JavaScript', ARRAY['game', 'snake', 'arcade', 'classic', 'retro'], 'github', 'https://github.com/patorjk/JavaScript-Snake', 'game', null),

('Tic Tac Toe', 'Simple tic-tac-toe game with AI opponent', ARRAY['game', 'tictactoe', 'strategy', 'ai', 'board'], 'github', 'https://github.com/vasanthk/tic-tac-toe', 'game', null),

('Flappy Bird Clone', 'HTML5 Flappy Bird game clone', ARRAY['game', 'flappy', 'bird', 'arcade', 'flying'], 'github', 'https://github.com/ellisonleao/clumsy-bird', 'game', null),

-- Tools & Calculators
('Simple Calculator', 'Clean and functional calculator built with HTML/CSS/JS', ARRAY['calculator', 'tool', 'math', 'numbers'], 'github', 'https://github.com/ahfarmer/calculator', 'tool', null),

('Unit Converter', 'Convert between different units (length, weight, temperature)', ARRAY['converter', 'tool', 'units', 'measurement'], 'github', 'https://github.com/bradtraversy/vanillawebprojects', 'tool', null),

('Color Picker Tool', 'Interactive color picker with hex, rgb, and hsl values', ARRAY['color', 'picker', 'tool', 'design', 'palette'], 'github', 'https://github.com/bgrins/spectrum', 'tool', null),

('Markdown Editor', 'Live markdown editor and previewer', ARRAY['markdown', 'editor', 'tool', 'writing', 'preview'], 'github', 'https://github.com/jbt/markdown-editor', 'tool', null),

('QR Code Generator', 'Generate QR codes from text or URLs', ARRAY['qr', 'code', 'generator', 'tool', 'barcode'], 'github', 'https://github.com/davidshimjs/qrcodejs', 'tool', null),

('Password Generator', 'Secure random password generator', ARRAY['password', 'generator', 'security', 'tool', 'random'], 'github', 'https://github.com/bradtraversy/vanillawebprojects', 'tool', null),

-- Productivity
('Todo List App', 'Simple and clean todo list application', ARRAY['todo', 'list', 'tasks', 'productivity', 'organizer'], 'github', 'https://github.com/tastejs/todomvc', 'productivity', null),

('Pomodoro Timer', 'Productivity timer using the Pomodoro technique', ARRAY['timer', 'pomodoro', 'productivity', 'focus', 'work'], 'github', 'https://github.com/bradtraversy/vanillawebprojects', 'productivity', null),

('Note Taking App', 'Simple note-taking application with local storage', ARRAY['notes', 'notepad', 'productivity', 'writing', 'memo'], 'github', 'https://github.com/bradtraversy/vanillawebprojects', 'productivity', null),

-- Tutorials & Demos
('CSS Grid Examples', 'Interactive CSS Grid layout examples', ARRAY['css', 'grid', 'layout', 'tutorial', 'demo'], 'github', 'https://github.com/wesbos/css-grid', 'tutorial', null),

('JavaScript30 Projects', 'Collection of 30 vanilla JavaScript projects', ARRAY['javascript', 'tutorial', 'demo', 'learning', 'projects'], 'github', 'https://github.com/wesbos/JavaScript30', 'tutorial', null),

('Animation Demos', 'CSS and JavaScript animation examples', ARRAY['animation', 'css', 'demo', 'effects', 'transitions'], 'github', 'https://github.com/daneden/animate.css', 'tutorial', null)

ON CONFLICT (source_url) DO NOTHING;

-- Add more curated sources as needed
COMMENT ON TABLE app_sources IS 'Curated static apps for AI-powered discovery system';
