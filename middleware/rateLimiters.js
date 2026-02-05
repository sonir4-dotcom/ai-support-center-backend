const rateLimit = require('express-rate-limit');

// Rate limiter for chatbot search endpoints
const chatbotSearchLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    message: { success: false, message: 'Too many search requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    // Use IP address for rate limiting
    keyGenerator: (req) => {
        return req.ip || req.headers['x-forwarded-for'] || 'unknown';
    }
});

// Rate limiter for chatbot intent detection
const chatbotIntentLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute (higher for chat)
    message: { success: false, message: 'Too many requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.ip || req.headers['x-forwarded-for'] || 'unknown';
    }
});

// Rate limiter for play tracking (prevent spam)
const playTrackingLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50, // 50 plays per 5 minutes
    message: { success: false, message: 'Too many play requests.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.ip || req.headers['x-forwarded-for'] || 'unknown';
    }
});

// Rate limiter for like actions (prevent spam)
const likeActionLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // 10 likes per minute
    message: { success: false, message: 'Too many like requests.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.user?.id || req.ip || 'unknown';
    }
});

// General API rate limiter
const generalApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes
    message: { success: false, message: 'Too many requests from this IP.' },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = {
    chatbotSearchLimiter,
    chatbotIntentLimiter,
    playTrackingLimiter,
    likeActionLimiter,
    generalApiLimiter
};
