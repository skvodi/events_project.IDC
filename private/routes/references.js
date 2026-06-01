const express = require("express");
const bcrypt  = require("bcrypt");
const { checkAuth, checkRole } = require("../middleware/mauth");

const SALT_ROUNDS = 10;

function dbGet(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
    });
}

function dbRun(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            err ? reject(err) : resolve(this);
        });
    });
}

function parsePositiveInt(value, fieldName) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) {
        return { error: `${fieldName} должен быть положительным числом` };
    }
    return { value: number };
}

async function roleConflict(db, name, priority, excludeId = null) {
    const params = [name.toLowerCase(), priority];
    let sql = "SELECT id FROM Roles WHERE (LOWER(name) = ? OR priority = ?)";

    if (excludeId !== null) {
        sql += " AND id <> ?";
        params.push(excludeId);
    }

    return dbGet(db, sql, params);
}

module.exports = (db) => {
    const router    = express.Router();
    const adminOnly = checkRole(["admin"]);
    const adminOrManager = checkRole(["admin", "manager"]);
    const authOnly  = checkAuth;

    // ===== ГОРОДА =====

    router.get("/cities", authOnly, (req, res) => {
        db.all("SELECT * FROM Cities ORDER BY name", (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    router.post("/cities", adminOnly, (req, res) => {
        const { name } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: "Название обязательно" });

        db.run("INSERT INTO Cities (name) VALUES (?)", [name.trim()], function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({ error: "Такой город уже существует" });
                }
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, id: this.lastID });
        });
    });

    router.put("/cities/:id", adminOnly, (req, res) => {
        const { name } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: "Название обязательно" });

        db.run("UPDATE Cities SET name = ? WHERE id = ?", [name.trim(), req.params.id], function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({ error: "Такой город уже существует" });
                }
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) return res.status(404).json({ error: "Город не найден" });
            res.json({ success: true });
        });
    });

    router.delete("/cities/:id", adminOnly, (req, res) => {
        db.get("SELECT COUNT(*) AS count FROM Events WHERE city_id = ?", [req.params.id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (row.count > 0) {
                return res.status(400).json({ error: "Нельзя удалить город, который используется в мероприятиях" });
            }
            db.run("DELETE FROM Cities WHERE id = ?", [req.params.id], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                if (this.changes === 0) return res.status(404).json({ error: "Город не найден" });
                res.json({ success: true });
            });
        });
    });

    // ===== КАТЕГОРИИ =====

    router.get("/categories", authOnly, (req, res) => {
        db.all("SELECT * FROM Categories ORDER BY name", (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    router.post("/categories", adminOnly, (req, res) => {
        const { name } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: "Название обязательно" });

        db.run("INSERT INTO Categories (name) VALUES (?)", [name.trim()], function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({ error: "Такая категория уже существует" });
                }
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, id: this.lastID });
        });
    });

    router.put("/categories/:id", adminOnly, (req, res) => {
        const { name } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: "Название обязательно" });

        db.run("UPDATE Categories SET name = ? WHERE id = ?", [name.trim(), req.params.id], function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({ error: "Такая категория уже существует" });
                }
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) return res.status(404).json({ error: "Категория не найдена" });
            res.json({ success: true });
        });
    });

    router.delete("/categories/:id", adminOnly, (req, res) => {
        db.get("SELECT COUNT(*) AS count FROM Events WHERE category_id = ?", [req.params.id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (row.count > 0) {
                return res.status(400).json({ error: "Нельзя удалить категорию, которая используется в мероприятиях" });
            }
            db.run("DELETE FROM Categories WHERE id = ?", [req.params.id], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                if (this.changes === 0) return res.status(404).json({ error: "Категория не найдена" });
                res.json({ success: true });
            });
        });
    });

    // ===== РОЛИ =====

    router.get("/roles", adminOnly, (req, res) => {
        db.all("SELECT * FROM Roles ORDER BY priority", (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    router.post("/roles", adminOnly, async (req, res) => {
        const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
        const priority = parsePositiveInt(req.body.priority, "Приоритет");

        if (!name || priority.error) {
            return res.status(400).json({ error: "Название и корректный приоритет обязательны" });
        }

        try {
            const conflict = await roleConflict(db, name, priority.value);
            if (conflict) {
                return res.status(400).json({ error: "Роль с таким названием или приоритетом уже существует" });
            }

            const result = await dbRun(db, "INSERT INTO Roles (name, priority) VALUES (?, ?)", [name, priority.value]);
            res.json({ success: true, id: result.lastID });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.put("/roles/:id", adminOnly, async (req, res) => {
        const id = parsePositiveInt(req.params.id, "Роль");
        if (id.error) return res.status(400).json({ error: id.error });

        const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
        const priority = parsePositiveInt(req.body.priority, "Приоритет");

        if (!name || priority.error) {
            return res.status(400).json({ error: "Название и корректный приоритет обязательны" });
        }

        try {
            const conflict = await roleConflict(db, name, priority.value, id.value);
            if (conflict) {
                return res.status(400).json({ error: "Роль с таким названием или приоритетом уже существует" });
            }

            const result = await dbRun(
                db,
                "UPDATE Roles SET name = ?, priority = ? WHERE id = ?",
                [name, priority.value, id.value]
            );

            if (result.changes === 0) return res.status(404).json({ error: "Роль не найдена" });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.delete("/roles/:id", adminOnly, (req, res) => {
        db.get("SELECT COUNT(*) AS count FROM Employees WHERE role_id = ?", [req.params.id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (row.count > 0) {
                return res.status(400).json({ error: "Нельзя удалить роль, которая используется у работников" });
            }
            db.run("DELETE FROM Roles WHERE id = ?", [req.params.id], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                if (this.changes === 0) return res.status(404).json({ error: "Роль не найдена" });
                res.json({ success: true });
            });
        });
    });

    // ===== СТАТУСЫ =====

    // Статусы читают все авторизованные (нужно менеджеру при работе с участниками)
    router.get("/statuses", authOnly, (req, res) => {
        db.all("SELECT * FROM Status ORDER BY id", (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    router.post("/statuses", adminOnly, (req, res) => {
        const { name } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: "Название обязательно" });

        db.run("INSERT INTO Status (name) VALUES (?)", [name.trim()], function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({ error: "Такой статус уже существует" });
                }
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, id: this.lastID });
        });
    });

    router.put("/statuses/:id", adminOnly, (req, res) => {
        const { name } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: "Название обязательно" });

        db.run("UPDATE Status SET name = ? WHERE id = ?", [name.trim(), req.params.id], function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({ error: "Такой статус уже существует" });
                }
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) return res.status(404).json({ error: "Статус не найден" });
            res.json({ success: true });
        });
    });

    router.delete("/statuses/:id", adminOnly, (req, res) => {
        db.get("SELECT COUNT(*) AS count FROM EventParticipants WHERE status_id = ?", [req.params.id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (row.count > 0) {
                return res.status(400).json({ error: "Нельзя удалить статус, который используется у участников" });
            }
            db.run("DELETE FROM Status WHERE id = ?", [req.params.id], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                if (this.changes === 0) return res.status(404).json({ error: "Статус не найден" });
                res.json({ success: true });
            });
        });
    });

    // ===== РАБОТНИКИ =====

    // Список доступен admin и manager (manager нужен для выбора участников)
    router.get("/employees", adminOrManager, (req, res) => {
        db.all(
            `SELECT e.id, e.full_name, e.email, e.phone, r.name AS role
             FROM Employees e
             JOIN Roles r ON e.role_id = r.id
             ORDER BY e.full_name`,
            (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json(rows);
            }
        );
    });

    // Создание сотрудника — пароль хешируется через bcrypt
    router.post("/employees", adminOnly, async (req, res) => {
        const full_name = typeof req.body.full_name === "string" ? req.body.full_name.trim() : "";
        const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
        const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";
        const password = typeof req.body.password === "string" ? req.body.password : "";
        const role = parsePositiveInt(req.body.role_id, "Роль");

        if (!full_name || !email || !password || role.error) {
            return res.status(400).json({ error: "ФИО, email, пароль и роль обязательны" });
        }

        try {
            const roleExists = await dbGet(db, "SELECT id FROM Roles WHERE id = ?", [role.value]);
            if (!roleExists) return res.status(400).json({ error: "Роль не найдена" });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }

        let hashed;
        try {
            hashed = await bcrypt.hash(password, SALT_ROUNDS);
        } catch (e) {
            console.error("Ошибка bcrypt.hash:", e);
            return res.status(500).json({ error: "Ошибка сервера" });
        }

        db.run(
            "INSERT INTO Employees (full_name, email, phone, password, role_id) VALUES (?, ?, ?, ?, ?)",
            [full_name, email, phone, hashed, role.value],
            function (err) {
                if (err) {
                    if (err.message.includes("UNIQUE")) {
                        return res.status(400).json({ error: "Работник с таким email уже существует" });
                    }
                    return res.status(500).json({ error: err.message });
                }
                res.json({ success: true, id: this.lastID });
            }
        );
    });

    // Редактирование сотрудника — если пароль передан, хешируем; если нет — не трогаем
    router.put("/employees/:id", adminOnly, async (req, res) => {
        const id = parsePositiveInt(req.params.id, "Работник");
        if (id.error) return res.status(400).json({ error: id.error });

        const full_name = typeof req.body.full_name === "string" ? req.body.full_name.trim() : "";
        const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
        const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";
        const password = typeof req.body.password === "string" ? req.body.password : "";
        const role = parsePositiveInt(req.body.role_id, "Роль");

        if (!full_name || !email || role.error) {
            return res.status(400).json({ error: "ФИО, email и роль обязательны" });
        }

        try {
            const roleExists = await dbGet(db, "SELECT id FROM Roles WHERE id = ?", [role.value]);
            if (!roleExists) return res.status(400).json({ error: "Роль не найдена" });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }

        // Динамически формируем запрос — избегаем дублирования двух почти одинаковых блоков
        let sql, params;

        if (password) {
            let hashed;
            try {
                hashed = await bcrypt.hash(password, SALT_ROUNDS);
            } catch (e) {
                console.error("Ошибка bcrypt.hash:", e);
                return res.status(500).json({ error: "Ошибка сервера" });
            }
            sql    = "UPDATE Employees SET full_name = ?, email = ?, phone = ?, password = ?, role_id = ? WHERE id = ?";
            params = [full_name, email, phone, hashed, role.value, id.value];
        } else {
            sql    = "UPDATE Employees SET full_name = ?, email = ?, phone = ?, role_id = ? WHERE id = ?";
            params = [full_name, email, phone, role.value, id.value];
        }

        db.run(sql, params, function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({ error: "Работник с таким email уже существует" });
                }
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) return res.status(404).json({ error: "Работник не найден" });
            res.json({ success: true });
        });
    });

    // Удаление сотрудника
    // EventParticipants удаляются автоматически через ON DELETE CASCADE в схеме
    router.delete("/employees/:id", adminOnly, (req, res) => {
        db.run("DELETE FROM Employees WHERE id = ?", [req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: "Работник не найден" });
            res.json({ success: true });
        });
    });

    return router;
};
