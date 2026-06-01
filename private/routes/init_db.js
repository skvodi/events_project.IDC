const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const SESSIONS_DB_SQL = `
CREATE TABLE Sessions (
    sid PRIMARY KEY,
    expired,
    sess
);
`;

const MAIN_DB_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE Categories (
    id   INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name TEXT    NOT NULL UNIQUE
);

CREATE TABLE Cities (
    id   INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name TEXT    NOT NULL UNIQUE
);

CREATE TABLE Roles (
    id       INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name     TEXT    NOT NULL UNIQUE,
    priority INTEGER NOT NULL UNIQUE
);

CREATE TABLE Status (
    id   INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name TEXT    NOT NULL UNIQUE
);

CREATE TABLE Employees (
    id        INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    full_name TEXT    NOT NULL,
    phone     TEXT    NOT NULL,
    email     TEXT    UNIQUE NOT NULL COLLATE NOCASE,
    password  TEXT    NOT NULL,
    role_id   INTEGER NOT NULL,
    FOREIGN KEY (role_id) REFERENCES Roles (id)
);

CREATE TABLE Events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name        TEXT    NOT NULL,
    address     TEXT    NOT NULL,
    description TEXT    NOT NULL,
    event_date  TEXT    NOT NULL,
    registration_end TEXT,
    is_finished INTEGER NOT NULL DEFAULT 0,
    city_id     INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    max_participants INTEGER NOT NULL,
    FOREIGN KEY (city_id)     REFERENCES Cities (id),
    FOREIGN KEY (category_id) REFERENCES Categories (id)
);

CREATE TABLE EventOptionTypes (
    id    INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    code  TEXT NOT NULL UNIQUE,
    name  TEXT NOT NULL UNIQUE
);

CREATE TABLE EventOptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name        TEXT    NOT NULL,
    type_id     INTEGER NOT NULL,
    is_required INTEGER NOT NULL DEFAULT 0,
    display_params TEXT NOT NULL,
    FOREIGN KEY (type_id) REFERENCES EventOptionTypes (id)
);

CREATE TABLE EventOptionValues (
    id        INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    option_id INTEGER NOT NULL,
    value     TEXT    NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (option_id) REFERENCES EventOptions (id) ON DELETE CASCADE
);

CREATE TABLE EventOptionEvents (
    event_id  INTEGER NOT NULL,
    option_id INTEGER NOT NULL,
    PRIMARY KEY (event_id, option_id),
    FOREIGN KEY (event_id) REFERENCES Events (id) ON DELETE CASCADE,
    FOREIGN KEY (option_id) REFERENCES EventOptions (id) ON DELETE CASCADE
);

CREATE TABLE EventPhotos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    event_id      INTEGER NOT NULL,
    file_path     TEXT    NOT NULL,
    original_name TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES Events (id) ON DELETE CASCADE
);

CREATE TABLE EventFiles (
    id            INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    event_id      INTEGER NOT NULL,
    file_path     TEXT    NOT NULL,
    original_name TEXT    NOT NULL,
    mime_type     TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES Events (id) ON DELETE CASCADE
);

CREATE TABLE EventParticipants (
    event_id    INTEGER NOT NULL,
    employee_id INTEGER NOT NULL,
    status_id   INTEGER NOT NULL,
    PRIMARY KEY (event_id, employee_id),
    FOREIGN KEY (event_id)    REFERENCES Events (id)    ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES Employees (id) ON DELETE CASCADE,
    FOREIGN KEY (status_id)   REFERENCES Status (id)
);

CREATE TABLE EventParticipantOptionAnswers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    event_id    INTEGER NOT NULL,
    employee_id INTEGER NOT NULL,
    option_id   INTEGER NOT NULL,
    value       TEXT    NOT NULL,
    FOREIGN KEY (event_id, employee_id) REFERENCES EventParticipants (event_id, employee_id) ON DELETE CASCADE,
    FOREIGN KEY (option_id) REFERENCES EventOptions (id) ON DELETE CASCADE
);

INSERT INTO Categories (name) VALUES
    ('IT'),
    ('Корпоратив'),
    ('Встреча'),
    ('Маркетинг'),
    ('Обучение');

INSERT INTO Cities (name) VALUES
    ('Тирасполь'),
    ('Бендеры'),
    ('Рыбница'),
    ('Слободзея'),
    ('Дубоссары'),
    ('Григориополь'),
    ('Каменка');

INSERT INTO Roles (name, priority) VALUES
    ('Admin', 1),
    ('Manager', 2),
    ('Employee', 3);

INSERT INTO Status (name) VALUES
    ('Registered'),
    ('Attended'),
    ('Absent');

INSERT INTO EventOptionTypes (code, name) VALUES
    ('text', 'Текстовое поле'),
    ('textarea', 'Многострочный текст'),
    ('number', 'Числовое поле'),
    ('radio', 'Одиночный выбор'),
    ('checkbox_group', 'Множественный выбор'),
    ('checkbox', 'Чекбокс');

INSERT INTO Employees (full_name, phone, email, password, role_id) VALUES
    ('Иван Петров', '+373 777 111 001', 'ivan.petrov@idc.md', '$2b$10$r552tc2FpdFVz/0pBV3wlOh/fjjz2SqkZRzeIZPb8j2D36MnHLJkW', 1),
    ('Ольга Сидорова', '+373 777 111 002', 'olga.sidorova@idc.md', '$2b$10$tRh06.qnJ4WIaksRddZVBuJpusFEUSKIVbvx.S35BZ4v7/r1m1zwq', 2),
    ('Андрей Ковалёв', '+373 777 111 003', 'andrey.kovalev@idc.md', '$2b$10$8iOCFTW/nC.Lf36kWu/qGuzTpoA/A.ioDN4yx8FCRd2SsYldawPzm', 3),
    ('Мария Иванова', '+373 777 111 004', 'maria.ivanova@idc.md', '$2b$10$9rrvhB0.rpwiYR6dN6X2F.fkjmgYHFrsJh34bLmmEW2Vxp1JYXuh2', 3),
    ('Сергей Дьяков', '+373 777 111 005', 'sergey.dyakov@idc.md', '$2b$10$nV3bhhxO0KYhaTGIoIzG9O8JJ5fIAD8kbHSjsaDGMkXgHeYGU1kQy', 2),
    ('Маша Терентьева', '+373 777 111 006', 'maria.teren@idc.md', '$2b$10$x1QujNwmjIB.XfIK/BT5QeLd17.UfcNMI1mzJonXGCgE85pQ7CJ6u', 3);

INSERT INTO Events (name, address, description, event_date, registration_end, is_finished, city_id, category_id, max_participants) VALUES
    ('IT-воркшоп IDC', 'ул. Советская, 5', 'Технический воркшоп для IT-отдела', '2026-06-01T23:46', NULL, 0, 2, 1, 0),
    ('Корпоратив IDC 2026', 'Главный офис IDC', 'Общее корпоративное мероприятие компании', '2026-07-15T23:46', NULL, 0, 1, 2, 0),
    ('Встреча отдела поддержки', 'ул. Карла Маркса 3', 'Обсуждение работы техподдержки', '2026-05-25T23:46', NULL, 0, 1, 3, 0),
    ('Презентация новых тарифов', 'IDC конференц-зал', 'Презентация новых тарифных планов для клиентов', '2026-06-10T23:46', NULL, 0, 2, 4, 0),
    ('Тренинг продаж IDC', 'ул. Ленина, 10', 'Обучение сотрудников техникам продаж', '2026-05-20T23:46', NULL, 0, 1, 5, 0);

INSERT INTO EventParticipants (event_id, employee_id, status_id) VALUES
    (1, 2, 1),
    (4, 4, 3),
    (5, 1, 2),
    (4, 6, 1),
    (2, 5, 2);
`;

function executeSql(dbPath, sql) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (openErr) => {
            if (openErr) return reject(openErr);

            db.exec(sql, (execErr) => {
                db.close((closeErr) => {
                    if (execErr) return reject(execErr);
                    if (closeErr) return reject(closeErr);
                    resolve();
                });
            });
        });
    });
}

async function createDatabase(dbPath, sql) {
    if (fs.existsSync(dbPath)) return;

    try {
        await executeSql(dbPath, sql);
        console.log(`Database created: ${dbPath}`);
    } catch (err) {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        throw err;
    }
}

async function migrateMainDatabase(dbPath) {
    if (!fs.existsSync(dbPath)) return;

    const sql = `
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS EventParticipantOptionAnswers (
            id          INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            event_id    INTEGER NOT NULL,
            employee_id INTEGER NOT NULL,
            option_id   INTEGER NOT NULL,
            value       TEXT    NOT NULL,
            FOREIGN KEY (event_id, employee_id) REFERENCES EventParticipants (event_id, employee_id) ON DELETE CASCADE,
            FOREIGN KEY (option_id) REFERENCES EventOptions (id) ON DELETE CASCADE
        );
    `;

    await executeSql(dbPath, sql);
}

async function ensureDatabases(dbDir) {
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    const mainDbPath = path.join(dbDir, "sql.idc.db");
    await createDatabase(mainDbPath, MAIN_DB_SQL);
    await migrateMainDatabase(mainDbPath);
    await createDatabase(path.join(dbDir, "sessions.db"), SESSIONS_DB_SQL);
}

module.exports = {
    ensureDatabases
};
