// Проверка авторизации
function checkAuth(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ error: "Unauthorized" });
    }
}

// Сравнение ролей
function checkRole(roles) {
    const normalized = roles.map(r => r.toLowerCase());
    return (req, res, next) => {
        if (!req.session.user) {
            res.status(401).json({ error: "Unauthorized" });
        } else if (normalized.includes(req.session.user.role.toLowerCase())) {
            next();
        } else {
            res.status(403).json({ error: "Forbidden" });
        }
    };
}

module.exports = { checkAuth, checkRole };
