const rateLimit = require('express-rate-limit');

// Minimal working configuration as requested by "Safe Reset"
// Reusing the same safe config for all exports to satisfy dependencies without complexity

const safeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false }
});

module.exports = {
    chatbotSearchLimiter: safeLimiter,
    chatbotIntentLimiter: safeLimiter,
    playTrackingLimiter: safeLimiter,
    likeActionLimiter: safeLimiter,
    generalApiLimiter: safeLimiter
};
