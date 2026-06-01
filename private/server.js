const path = require("path");
const express = require("express");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();
const SqliteStore = require("connect-sqlite3")(session);
const { ensureDatabases } = require(path.join(__dirname, "routes", "init_db"));

const app = express();
const dbDir = path.join(__dirname, "db");
const mainDbPath = path.join(dbDir, "sql.idc.db");

function openMainDatabase() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(mainDbPath, (err) => {
            if (err) return reject(err);

            console.log("Подключено к БД");
            db.run("PRAGMA foreign_keys = ON", (pragmaErr) => {
                if (pragmaErr) return reject(pragmaErr);
                resolve(db);
            });
        });
    });
}

async function startServer() {
    await ensureDatabases(dbDir);

    const db = await openMainDatabase();

    app.use(express.json({ limit: "50mb" }));
    app.use(express.urlencoded({ extended: true, limit: "50mb" }));
    app.use(session({
        store: new SqliteStore({
            db: "sessions.db",
            dir: dbDir,
            table: "Sessions"
        }),
        secret: process.env.SESSION_SECRET || "secret-key",
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 24 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: "strict"
        }
    }));

    app.use(express.static(path.join(__dirname, "..", "public")));

    const authRoutes       = require(path.join(__dirname, "routes", "auth"));
    const eventsRoutes     = require(path.join(__dirname, "routes", "events"));
    const referencesRoutes = require(path.join(__dirname, "routes", "references"));

    app.use("/api", authRoutes(db));
    app.use("/api", eventsRoutes(db));
    app.use("/api", referencesRoutes(db));

    app.use((err, req, res, next) => {
        console.error(err.stack);
        res.status(500).json({ error: "Внутренняя ошибка сервера" });
    });

    app.listen(3000, () => {
        console.log("Сервер запущен, порт: 3000");
    });
}

startServer().catch((err) => {
    console.error("Ошибка запуска сервера:", err.message);
    process.exit(1);
});
