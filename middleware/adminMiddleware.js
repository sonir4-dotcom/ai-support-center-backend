const adminMiddleware = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        console.warn(`[SECURITY] Unauthorized admin access attempt by User ID: ${req.user?.id || 'Unknown'}`);
        return res.status(403).json({
            success: false,
            message: 'Access denied. Administrator privileges required.'
        });
    }
    next();
};

module.exports = adminMiddleware;
