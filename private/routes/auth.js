const express = require("express");
const bcrypt  = require("bcrypt");

module.exports = (db) => {
    const router = express.Router();

    // Логин
    router.post("/login", (req, res) => {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email и пароль обязательны" });
        }

        // Ищем пользователя только по email (без сравнения пароля в SQL)
        db.get(
            `SELECT e.*, r.name as role
             FROM Employees e
             JOIN Roles r ON e.role_id = r.id
             WHERE LOWER(e.email) = LOWER(?)`,
            [email],
            async (err, user) => {
                if (err) {
                    return res.status(500).json({ error: "Ошибка сервера" });
                }

                if (!user) {
                    return res.json({ success: false });
                }

                // Сравниваем пароль через bcrypt
                let passwordMatch;
                try {
                    passwordMatch = await bcrypt.compare(password, user.password);
                } catch (e) {
                    console.error("Ошибка bcrypt.compare:", e);
                    return res.status(500).json({ error: "Ошибка сервера" });
                }

                if (!passwordMatch) {
                    return res.json({ success: false });
                }

                // Роль приводим к нижнему регистру
                const role = user.role.toLowerCase();

                req.session.user = {
                    id:        user.id,
                    email:     user.email,
                    full_name: user.full_name,
                    phone:     user.phone,
                    role
                };

                return res.json({ success: true, role });
            }
        );
    });

    // Проверка статуса авторизации
    router.get("/check-auth", (req, res) => {
        if (req.session.user) {
            res.json({ authenticated: true, user: req.session.user });
        } else {
            res.json({ authenticated: false });
        }
    });

    // Выход
    router.get("/logout", (req, res) => {
        req.session.destroy(() => {
            res.redirect("/");
        });
    });

    return router;
};
