const express = require("express");
const fs = require("fs");
const path = require("path");
const { checkAuth, checkRole } = require("../middleware/mauth");

const photoUploadDir = path.join(__dirname, "..", "..", "public", "uploads", "event-photos");
const fileUploadDir = path.join(__dirname, "..", "..", "public", "uploads", "event-files");
const publicPhotoUploadPath = "/uploads/event-photos";
const publicFileUploadPath = "/uploads/event-files";
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function ensureUploadDir(uploadDir) {
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
}

function dbGet(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
    });
}

function dbAll(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
    });
}

function dbRun(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            err ? reject(err) : resolve(this);
        });
    });
}

function getFileExtension(file) {
    const byType = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif"
    };
    return byType[file.type] || path.extname(file.name || "").toLowerCase();
}

function getSafeFileExtension(fileName) {
    const ext = path.extname(fileName || "").toLowerCase();
    return /^[a-z0-9.]{1,12}$/.test(ext) ? ext : ".bin";
}

function normalizePhotos(rawPhotos) {
    if (rawPhotos === undefined || rawPhotos === null || rawPhotos === "") return { value: [] };
    if (!Array.isArray(rawPhotos)) return { error: "Photos must be an array" };
    if (rawPhotos.length > 10) return { error: "Можно прикрепить не больше 10 фото" };

    const photos = [];
    for (const photo of rawPhotos) {
        if (!photo || typeof photo.data !== "string" || typeof photo.type !== "string") {
            return { error: "Некорректный формат фото" };
        }
        if (!allowedImageTypes.has(photo.type)) {
            return { error: "Можно загружать только JPG, PNG, WEBP или GIF" };
        }

        const commaIndex = photo.data.indexOf(",");
        const base64 = commaIndex >= 0 ? photo.data.slice(commaIndex + 1) : photo.data;
        const sizeBytes = Buffer.byteLength(base64, "base64");
        if (sizeBytes > 5 * 1024 * 1024) {
            return { error: "Размер одного фото не должен превышать 5 МБ" };
        }

        photos.push({
            name: typeof photo.name === "string" ? photo.name : "",
            type: photo.type,
            base64
        });
    }

    return { value: photos };
}

function normalizeFiles(rawFiles) {
    if (rawFiles === undefined || rawFiles === null || rawFiles === "") return { value: [] };
    if (!Array.isArray(rawFiles)) return { error: "Files must be an array" };
    if (rawFiles.length > 10) return { error: "Можно прикрепить не больше 10 файлов" };

    const files = [];
    for (const file of rawFiles) {
        if (!file || typeof file.data !== "string") {
            return { error: "Некорректный формат файла" };
        }

        const commaIndex = file.data.indexOf(",");
        const base64 = commaIndex >= 0 ? file.data.slice(commaIndex + 1) : file.data;
        const sizeBytes = Buffer.byteLength(base64, "base64");
        if (sizeBytes > 10 * 1024 * 1024) {
            return { error: "Размер одного файла не должен превышать 10 МБ" };
        }

        files.push({
            name: typeof file.name === "string" ? file.name : "file",
            type: typeof file.type === "string" ? file.type : "",
            base64
        });
    }

    return { value: files };
}

async function saveEventPhotos(db, eventId, photos) {
    if (!photos.length) return;
    ensureUploadDir(photoUploadDir);

    for (const photo of photos) {
        const ext = getFileExtension(photo) || ".jpg";
        const fileName = `${eventId}-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
        const filePath = path.join(photoUploadDir, fileName);
        const publicPath = `${publicPhotoUploadPath}/${fileName}`;

        fs.writeFileSync(filePath, Buffer.from(photo.base64, "base64"));
        await dbRun(
            db,
            "INSERT INTO EventPhotos (event_id, file_path, original_name) VALUES (?, ?, ?)",
            [eventId, publicPath, photo.name || ""]
        );
    }
}

async function saveEventFiles(db, eventId, files) {
    if (!files.length) return;
    ensureUploadDir(fileUploadDir);

    for (const file of files) {
        const ext = getSafeFileExtension(file.name);
        const fileName = `${eventId}-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
        const filePath = path.join(fileUploadDir, fileName);
        const publicPath = `${publicFileUploadPath}/${fileName}`;

        fs.writeFileSync(filePath, Buffer.from(file.base64, "base64"));
        await dbRun(
            db,
            "INSERT INTO EventFiles (event_id, file_path, original_name, mime_type) VALUES (?, ?, ?, ?)",
            [eventId, publicPath, file.name || "", file.type || ""]
        );
    }
}

async function attachEventPhotos(db, events) {
    if (!events.length) return events;

    const ids = events.map(event => event.id);
    const placeholders = ids.map(() => "?").join(",");
    const photos = await dbAll(
        db,
        `SELECT id, event_id, file_path, original_name
         FROM EventPhotos
         WHERE event_id IN (${placeholders})
         ORDER BY id`,
        ids
    );

    const byEvent = new Map();
    photos.forEach(photo => {
        if (!byEvent.has(photo.event_id)) byEvent.set(photo.event_id, []);
        byEvent.get(photo.event_id).push({
            id: photo.id,
            url: photo.file_path,
            name: photo.original_name
        });
    });

    return events.map(event => ({
        ...event,
        photos: byEvent.get(event.id) || []
    }));
}

async function attachEventFiles(db, events) {
    if (!events.length) return events;

    const ids = events.map(event => event.id);
    const placeholders = ids.map(() => "?").join(",");
    const files = await dbAll(
        db,
        `SELECT id, event_id, file_path, original_name, mime_type
         FROM EventFiles
         WHERE event_id IN (${placeholders})
         ORDER BY id`,
        ids
    );

    const byEvent = new Map();
    files.forEach(file => {
        if (!byEvent.has(file.event_id)) byEvent.set(file.event_id, []);
        byEvent.get(file.event_id).push({
            id: file.id,
            url: file.file_path,
            name: file.original_name,
            type: file.mime_type
        });
    });

    return events.map(event => ({
        ...event,
        files: byEvent.get(event.id) || []
    }));
}

async function attachEventOptions(db, events) {
    if (!events.length) return events;

    const ids = events.map(event => event.id);
    const placeholders = ids.map(() => "?").join(",");
    const rows = await dbAll(
        db,
        `SELECT
            eo.event_id,
            o.id,
            o.name,
            o.is_required,
            o.display_params,
            t.id AS type_id,
            t.code AS type_code,
            t.name AS type_name
         FROM EventOptionEvents eo
         JOIN EventOptions o ON eo.option_id = o.id
         JOIN EventOptionTypes t ON o.type_id = t.id
         WHERE eo.event_id IN (${placeholders})
         ORDER BY o.name`,
        ids
    );

    const optionIds = rows.map(row => row.id);
    let valuesByOption = new Map();
    if (optionIds.length) {
        const valuePlaceholders = optionIds.map(() => "?").join(",");
        const values = await dbAll(
            db,
            `SELECT option_id, value
             FROM EventOptionValues
             WHERE option_id IN (${valuePlaceholders})
             ORDER BY sort_order, id`,
            optionIds
        );
        values.forEach(value => {
            if (!valuesByOption.has(value.option_id)) valuesByOption.set(value.option_id, []);
            valuesByOption.get(value.option_id).push(value.value);
        });
    }

    const byEvent = new Map();
    rows.forEach(row => {
        if (!byEvent.has(row.event_id)) byEvent.set(row.event_id, []);
        byEvent.get(row.event_id).push({
            id: row.id,
            name: row.name,
            type_id: row.type_id,
            type_code: row.type_code,
            type_name: row.type_name,
            is_required: Boolean(row.is_required),
            display_params: row.display_params,
            values: valuesByOption.get(row.id) || []
        });
    });

    return events.map(event => ({
        ...event,
        options: byEvent.get(event.id) || []
    }));
}

async function attachEventRelations(db, events) {
    return attachEventOptions(db, await attachEventFiles(db, await attachEventPhotos(db, events)));
}

function parsePositiveInt(value, fieldName, required = false, max = null) {
    if (value === undefined || value === null || value === "") {
        return required ? { error: `${fieldName} обязателен` } : { value: null };
    }

    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) {
        return { error: `${fieldName} должен быть положительным числом` };
    }
    if (max !== null && number > max) {
        return { error: `${fieldName} не должен превышать ${max}` };
    }

    return { value: number };
}

function parseParticipantLimit(value) {
    if (value === undefined || value === null || value === "") {
        return { value: 0 };
    }

    const number = Number(value);
    if (!Number.isInteger(number) || number < 0) {
        return { error: "Максимум участников должен быть целым числом от 0 до 100000" };
    }
    if (number > 100000) {
        return { error: "Максимум участников не должен превышать 100000" };
    }

    return { value: number };
}

function parseDateTimeInput(value, fieldName, required = false) {
    if (value === undefined || value === null || value === "") {
        return required ? { error: `${fieldName} обязательна` } : { value: null, timestamp: null };
    }

    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
        return { error: `${fieldName} имеет некорректный формат` };
    }

    return { value: value.trim(), timestamp: Date.parse(value) };
}

function validateTextLength(value, fieldName, min, max) {
    const length = value ? value.length : 0;
    if (min && length < min) return `${fieldName} должен содержать минимум ${min} символа`;
    if (max && length > max) return `${fieldName} не должен превышать ${max} символов`;
    return null;
}

function normalizeEvent(body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const eventDate = typeof body.event_date === "string" ? body.event_date.trim() : "";
    const registrationEnd = typeof body.registration_end === "string" && body.registration_end.trim() ? body.registration_end.trim() : null;

    if (!name) return { error: "Название обязательно" };
    const nameError = validateTextLength(name, "Название", 3, 150);
    if (nameError) return { error: nameError };
    const addressError = validateTextLength(address, "Адрес", 0, 255);
    if (addressError) return { error: addressError };
    const descriptionError = validateTextLength(description, "Описание", 0, 5000);
    if (descriptionError) return { error: descriptionError };

    const parsedEventDate = parseDateTimeInput(eventDate, "Дата мероприятия", true);
    if (parsedEventDate.error) return { error: parsedEventDate.error };
    const parsedRegistrationEnd = parseDateTimeInput(registrationEnd, "Дата окончания регистрации");
    if (parsedRegistrationEnd.error) return { error: parsedRegistrationEnd.error };
    if (parsedRegistrationEnd.timestamp && parsedRegistrationEnd.timestamp > parsedEventDate.timestamp) {
        return { error: "Дата окончания регистрации не может быть позже даты мероприятия" };
    }

    const city = parsePositiveInt(body.city_id, "Город", true);
    if (city.error) return { error: city.error };

    const category = parsePositiveInt(body.category_id, "Категория", true);
    if (category.error) return { error: category.error };

    const maxParticipants = parseParticipantLimit(body.max_participants);
    if (maxParticipants.error) return { error: maxParticipants.error };

    return {
        value: {
            name,
            address,
            description,
            event_date: parsedEventDate.value,
            registration_end: parsedRegistrationEnd.value,
            city_id: city.value,
            category_id: category.value,
            max_participants: maxParticipants.value
        }
    };
}

function normalizeOptionIds(rawOptionIds) {
    if (rawOptionIds === undefined || rawOptionIds === null || rawOptionIds === "") return { value: [] };
    const source = Array.isArray(rawOptionIds) ? rawOptionIds : [rawOptionIds];
    const ids = [];
    for (const rawId of source) {
        const parsed = parsePositiveInt(rawId, "Опция", true);
        if (parsed.error) return { error: parsed.error };
        if (!ids.includes(parsed.value)) ids.push(parsed.value);
    }
    return { value: ids };
}

function normalizeOptionPayload(body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const typeId = parsePositiveInt(body.type_id, "Тип опции", true);
    const isRequired = body.is_required === true || body.is_required === 1 ||
        body.is_required === "1" || body.is_required === "true" ? 1 : 0;
    const displayParams = typeof body.display_params === "string" && body.display_params.trim()
        ? body.display_params.trim()
        : "";
    const values = Array.isArray(body.values)
        ? body.values.map(value => String(value).trim()).filter(Boolean)
        : [];

    if (!name) return { error: "Название опции обязательно" };
    const nameError = validateTextLength(name, "Название опции", 2, 150);
    if (nameError) return { error: nameError };
    if (typeId.error) return { error: typeId.error };

    const displayError = validateTextLength(displayParams, "Параметры отображения", 0, 1000);
    if (displayError) return { error: displayError };
    if (values.length > 100) return { error: "Список значений не должен превышать 100 элементов" };

    const seenValues = new Set();
    for (const value of values) {
        const valueError = validateTextLength(value, "Значение опции", 1, 255);
        if (valueError) return { error: valueError };
        const key = value.toLowerCase();
        if (seenValues.has(key)) return { error: "Значения опции не должны повторяться" };
        seenValues.add(key);
    }

    return {
        value: {
            name,
            type_id: typeId.value,
            is_required: isRequired,
            display_params: displayParams,
            values
        }
    };
}

function validateOptionValuesForType(typeCode, values) {
    if (["radio", "checkbox_group"].includes(typeCode) && values.length === 0) {
        return "Для одиночного и множественного выбора нужен список значений";
    }
    if (!["radio", "checkbox_group"].includes(typeCode) && values.length > 0) {
        return "Список значений допускается только для одиночного или множественного выбора";
    }
    return null;
}

async function validateOptionIds(db, optionIds) {
    if (!optionIds.length) return null;
    const placeholders = optionIds.map(() => "?").join(",");
    const rows = await dbAll(db, `SELECT id FROM EventOptions WHERE id IN (${placeholders})`, optionIds);
    return rows.length === optionIds.length ? null : "Одна или несколько опций не найдены";
}

async function setEventOptions(db, eventId, optionIds) {
    await dbRun(db, "DELETE FROM EventOptionEvents WHERE event_id = ?", [eventId]);
    for (const optionId of optionIds) {
        await dbRun(
            db,
            "INSERT INTO EventOptionEvents (event_id, option_id) VALUES (?, ?)",
            [eventId, optionId]
        );
    }
}

async function getEventOptionsForAnswers(db, eventId) {
    const options = await dbAll(
        db,
        `SELECT o.id, o.name, o.is_required, t.code AS type_code
         FROM EventOptionEvents eo
         JOIN EventOptions o ON eo.option_id = o.id
         JOIN EventOptionTypes t ON o.type_id = t.id
         WHERE eo.event_id = ?
         ORDER BY o.name`,
        [eventId]
    );
    if (!options.length) return [];

    const optionIds = options.map(option => option.id);
    const placeholders = optionIds.map(() => "?").join(",");
    const values = await dbAll(
        db,
        `SELECT option_id, value
         FROM EventOptionValues
         WHERE option_id IN (${placeholders})
         ORDER BY sort_order, id`,
        optionIds
    );

    const valuesByOption = new Map();
    values.forEach(value => {
        if (!valuesByOption.has(value.option_id)) valuesByOption.set(value.option_id, []);
        valuesByOption.get(value.option_id).push(value.value);
    });

    return options.map(option => ({
        ...option,
        values: valuesByOption.get(option.id) || []
    }));
}

function normalizeParticipantOptionAnswers(eventOptions, rawAnswers) {
    const source = rawAnswers && typeof rawAnswers === "object" ? rawAnswers : {};
    const answers = [];

    for (const option of eventOptions) {
        const rawValue = source[String(option.id)] ?? source[option.id];
        const allowedValues = option.values || [];
        const requireAnswer = Boolean(option.is_required);

        if (option.type_code === "checkbox_group") {
            const selectedValues = Array.isArray(rawValue)
                ? rawValue.map(value => String(value).trim()).filter(Boolean)
                : [];
            const uniqueValues = [...new Set(selectedValues)];

            if (requireAnswer && uniqueValues.length === 0) {
                return { error: `Заполните обязательную опцию: ${option.name}` };
            }
            for (const value of uniqueValues) {
                if (!allowedValues.includes(value)) return { error: `Некорректное значение опции: ${option.name}` };
                answers.push({ option_id: option.id, value });
            }
            continue;
        }

        if (option.type_code === "checkbox") {
            const checked = rawValue === true || rawValue === 1 || rawValue === "1" || rawValue === "true" || rawValue === "on";
            if (requireAnswer && !checked) return { error: `Подтвердите обязательную опцию: ${option.name}` };
            if (checked) answers.push({ option_id: option.id, value: "Да" });
            continue;
        }

        const value = rawValue === undefined || rawValue === null ? "" : String(rawValue).trim();
        if (requireAnswer && !value) return { error: `Заполните обязательную опцию: ${option.name}` };
        if (!value) continue;
        if (value.length > 1000) return { error: `Ответ на опцию "${option.name}" слишком длинный` };

        if (option.type_code === "number" && Number.isNaN(Number(value))) {
            return { error: `Опция "${option.name}" должна быть числом` };
        }
        if (option.type_code === "radio" && !allowedValues.includes(value)) {
            return { error: `Некорректное значение опции: ${option.name}` };
        }

        answers.push({ option_id: option.id, value });
    }

    return { value: answers };
}

async function saveParticipantOptionAnswers(db, eventId, employeeId, answers) {
    await dbRun(
        db,
        "DELETE FROM EventParticipantOptionAnswers WHERE event_id = ? AND employee_id = ?",
        [eventId, employeeId]
    );
    for (const answer of answers) {
        await dbRun(
            db,
            "INSERT INTO EventParticipantOptionAnswers (event_id, employee_id, option_id, value) VALUES (?, ?, ?, ?)",
            [eventId, employeeId, answer.option_id, answer.value]
        );
    }
}

async function getParticipantOptionAnswers(db, eventId, employeeId) {
    const rows = await dbAll(
        db,
        `SELECT option_id, value
         FROM EventParticipantOptionAnswers
         WHERE event_id = ? AND employee_id = ?
         ORDER BY id`,
        [eventId, employeeId]
    );
    const answers = new Map();
    rows.forEach(row => {
        if (!answers.has(row.option_id)) answers.set(row.option_id, []);
        answers.get(row.option_id).push(row.value);
    });
    return Object.fromEntries(Array.from(answers.entries()).map(([optionId, values]) => [optionId, values]));
}

function isRegistrationClosed(event) {
    const now = Date.now();
    if (event.is_finished) return true;
    if (event.registration_end && Date.parse(event.registration_end) < now) return true;
    if (event.event_date && Date.parse(event.event_date) < now) return true;
    return false;
}

async function validateEventRefs(db, cityId, categoryId) {
    const city = await dbGet(db, "SELECT id FROM Cities WHERE id = ?", [cityId]);
    if (!city) return "Город не найден";

    const category = await dbGet(db, "SELECT id FROM Categories WHERE id = ?", [categoryId]);
    if (!category) return "Категория не найдена";

    return null;
}

async function rollbackQuietly(db) {
    try {
        await dbRun(db, "ROLLBACK");
    } catch (_) {
        
    }
}

module.exports = (db) => {
    const router = express.Router();

    router.get("/event-option-types", checkRole(["admin", "manager"]), async (req, res) => {
        try {
            const rows = await dbAll(db, "SELECT * FROM EventOptionTypes ORDER BY id");
            res.json(rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post("/event-option-types", checkRole(["admin", "manager"]), async (req, res) => {
        const code = typeof req.body.code === "string" ? req.body.code.trim().toLowerCase() : "";
        const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
        if (!code || !name || !/^[a-z0-9_]{2,40}$/.test(code) || name.length < 2 || name.length > 100) {
            return res.status(400).json({ error: "Код и название типа опции обязательны" });
        }

        try {
            const result = await dbRun(db, "INSERT INTO EventOptionTypes (code, name) VALUES (?, ?)", [code, name]);
            res.json({ success: true, id: result.lastID });
        } catch (err) {
            if (err.message.includes("UNIQUE")) return res.status(400).json({ error: "Такой тип опции уже существует" });
            res.status(500).json({ error: err.message });
        }
    });

    router.get("/event-options", checkRole(["admin", "manager"]), async (req, res) => {
        try {
            const options = await dbAll(
                db,
                `SELECT o.id, o.name, o.type_id, o.is_required, o.display_params,
                        t.code AS type_code, t.name AS type_name
                 FROM EventOptions o
                 JOIN EventOptionTypes t ON o.type_id = t.id
                 ORDER BY o.name`
            );
            if (!options.length) return res.json([]);

            const ids = options.map(option => option.id);
            const placeholders = ids.map(() => "?").join(",");
            const values = await dbAll(
                db,
                `SELECT option_id, value
                 FROM EventOptionValues
                 WHERE option_id IN (${placeholders})
                 ORDER BY sort_order, id`,
                ids
            );
            const valuesByOption = new Map();
            values.forEach(value => {
                if (!valuesByOption.has(value.option_id)) valuesByOption.set(value.option_id, []);
                valuesByOption.get(value.option_id).push(value.value);
            });

            res.json(options.map(option => ({
                ...option,
                is_required: Boolean(option.is_required),
                values: valuesByOption.get(option.id) || []
            })));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post("/event-options", checkRole(["admin", "manager"]), async (req, res) => {
        const parsedOption = normalizeOptionPayload(req.body);
        if (parsedOption.error) return res.status(400).json({ error: parsedOption.error });
        const option = parsedOption.value;

        try {
            const type = await dbGet(db, "SELECT id, code FROM EventOptionTypes WHERE id = ?", [option.type_id]);
            if (!type) return res.status(400).json({ error: "Тип опции не найден" });
            const valuesError = validateOptionValuesForType(type.code, option.values);
            if (valuesError) return res.status(400).json({ error: valuesError });

            await dbRun(db, "BEGIN IMMEDIATE");
            const result = await dbRun(
                db,
                "INSERT INTO EventOptions (name, type_id, is_required, display_params) VALUES (?, ?, ?, ?)",
                [option.name, option.type_id, option.is_required, option.display_params]
            );
            for (let i = 0; i < option.values.length; i++) {
                await dbRun(
                    db,
                    "INSERT INTO EventOptionValues (option_id, value, sort_order) VALUES (?, ?, ?)",
                    [result.lastID, option.values[i], i]
                );
            }
            await dbRun(db, "COMMIT");
            res.json({ success: true, id: result.lastID });
        } catch (err) {
            await rollbackQuietly(db);
            res.status(500).json({ error: err.message });
        }
    });

    router.put("/event-options/:id", checkRole(["admin", "manager"]), async (req, res) => {
        const optionId = parsePositiveInt(req.params.id, "Опция", true);
        if (optionId.error) return res.status(400).json({ error: optionId.error });

        const parsedOption = normalizeOptionPayload(req.body);
        if (parsedOption.error) return res.status(400).json({ error: parsedOption.error });
        const option = parsedOption.value;

        try {
            const type = await dbGet(db, "SELECT id, code FROM EventOptionTypes WHERE id = ?", [option.type_id]);
            if (!type) return res.status(400).json({ error: "Тип опции не найден" });
            const valuesError = validateOptionValuesForType(type.code, option.values);
            if (valuesError) return res.status(400).json({ error: valuesError });

            await dbRun(db, "BEGIN IMMEDIATE");
            const result = await dbRun(
                db,
                "UPDATE EventOptions SET name = ?, type_id = ?, is_required = ?, display_params = ? WHERE id = ?",
                [option.name, option.type_id, option.is_required, option.display_params, optionId.value]
            );
            if (result.changes === 0) {
                await rollbackQuietly(db);
                return res.status(404).json({ error: "Опция не найдена" });
            }

            await dbRun(db, "DELETE FROM EventOptionValues WHERE option_id = ?", [optionId.value]);
            for (let i = 0; i < option.values.length; i++) {
                await dbRun(
                    db,
                    "INSERT INTO EventOptionValues (option_id, value, sort_order) VALUES (?, ?, ?)",
                    [optionId.value, option.values[i], i]
                );
            }
            await dbRun(db, "COMMIT");
            res.json({ success: true });
        } catch (err) {
            await rollbackQuietly(db);
            res.status(500).json({ error: err.message });
        }
    });

    router.delete("/event-options/:id", checkRole(["admin", "manager"]), async (req, res) => {
        const optionId = parsePositiveInt(req.params.id, "Опция", true);
        if (optionId.error) return res.status(400).json({ error: optionId.error });

        try {
            const result = await dbRun(db, "DELETE FROM EventOptions WHERE id = ?", [optionId.value]);
            if (result.changes === 0) return res.status(404).json({ error: "Опция не найдена" });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get("/events", checkAuth, async (req, res) => {
        try {
            const rows = await dbAll(
                db,
                `SELECT
                    e.*,
                    c.name AS city,
                    cat.name AS category,
                    COUNT(ep.employee_id) AS participants_count,
                    MAX(CASE WHEN ep.employee_id = ? THEN 1 ELSE 0 END) AS is_registered
                 FROM Events e
                 LEFT JOIN Cities c ON e.city_id = c.id
                 LEFT JOIN Categories cat ON e.category_id = cat.id
                 LEFT JOIN EventParticipants ep ON e.id = ep.event_id
                 GROUP BY e.id
                 ORDER BY e.event_date DESC`,
                [req.session.user.id]
            );
            res.json(await attachEventRelations(db, rows));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get("/events/:id", checkAuth, async (req, res) => {
        const eventId = parsePositiveInt(req.params.id, "Мероприятие", true);
        if (eventId.error) return res.status(400).json({ error: eventId.error });

        try {
            const row = await dbGet(
                db,
                `SELECT
                    e.*,
                    c.name AS city,
                    cat.name AS category,
                    COUNT(ep.employee_id) AS participants_count,
                    MAX(CASE WHEN ep.employee_id = ? THEN 1 ELSE 0 END) AS is_registered
                 FROM Events e
                 LEFT JOIN Cities c ON e.city_id = c.id
                 LEFT JOIN Categories cat ON e.category_id = cat.id
                 LEFT JOIN EventParticipants ep ON e.id = ep.event_id
                 WHERE e.id = ?
                 GROUP BY e.id`,
                [req.session.user.id, eventId.value]
            );

            if (!row) return res.status(404).json({ error: "Мероприятие не найдено" });
            const [eventWithFiles] = await attachEventRelations(db, [row]);
            eventWithFiles.my_option_answers = row.is_registered
                ? await getParticipantOptionAnswers(db, eventId.value, req.session.user.id)
                : {};
            res.json(eventWithFiles);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post("/events", checkRole(["admin", "manager"]), async (req, res) => {
        const parsed = normalizeEvent(req.body);
        if (parsed.error) return res.status(400).json({ error: parsed.error });
        const parsedPhotos = normalizePhotos(req.body.photos);
        if (parsedPhotos.error) return res.status(400).json({ error: parsedPhotos.error });
        const parsedFiles = normalizeFiles(req.body.files);
        if (parsedFiles.error) return res.status(400).json({ error: parsedFiles.error });
        const parsedOptionIds = normalizeOptionIds(req.body.option_ids);
        if (parsedOptionIds.error) return res.status(400).json({ error: parsedOptionIds.error });

        const event = parsed.value;

        try {
            const refError = await validateEventRefs(db, event.city_id, event.category_id);
            if (refError) return res.status(400).json({ error: refError });
            const optionError = await validateOptionIds(db, parsedOptionIds.value);
            if (optionError) return res.status(400).json({ error: optionError });

            const result = await dbRun(
                db,
                `INSERT INTO Events (name, address, description, event_date, registration_end, city_id, category_id, max_participants)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    event.name,
                    event.address,
                    event.description,
                    event.event_date,
                    event.registration_end,
                    event.city_id,
                    event.category_id,
                    event.max_participants
                ]
            );

            await saveEventPhotos(db, result.lastID, parsedPhotos.value);
            await saveEventFiles(db, result.lastID, parsedFiles.value);
            await setEventOptions(db, result.lastID, parsedOptionIds.value);
            res.json({ success: true, id: result.lastID });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.put("/events/:id", checkRole(["admin", "manager"]), async (req, res) => {
        const eventId = parsePositiveInt(req.params.id, "Мероприятие", true);
        if (eventId.error) return res.status(400).json({ error: eventId.error });

        const parsed = normalizeEvent(req.body);
        if (parsed.error) return res.status(400).json({ error: parsed.error });
        const parsedPhotos = normalizePhotos(req.body.photos);
        if (parsedPhotos.error) return res.status(400).json({ error: parsedPhotos.error });
        const parsedFiles = normalizeFiles(req.body.files);
        if (parsedFiles.error) return res.status(400).json({ error: parsedFiles.error });
        const parsedOptionIds = normalizeOptionIds(req.body.option_ids);
        if (parsedOptionIds.error) return res.status(400).json({ error: parsedOptionIds.error });

        const event = parsed.value;

        try {
            const refError = await validateEventRefs(db, event.city_id, event.category_id);
            if (refError) return res.status(400).json({ error: refError });
            const optionError = await validateOptionIds(db, parsedOptionIds.value);
            if (optionError) return res.status(400).json({ error: optionError });

            const participantCount = await dbGet(
                db,
                "SELECT COUNT(*) AS count FROM EventParticipants WHERE event_id = ?",
                [eventId.value]
            );

            if (event.max_participants && participantCount.count > event.max_participants) {
                return res.status(400).json({
                    error: `Нельзя установить лимит меньше текущего числа участников (${participantCount.count})`
                });
            }

            const result = await dbRun(
                db,
                `UPDATE Events
                 SET name = ?, address = ?, description = ?, event_date = ?, registration_end = ?,
                     city_id = ?, category_id = ?, max_participants = ?
                 WHERE id = ?`,
                [
                    event.name,
                    event.address,
                    event.description,
                    event.event_date,
                    event.registration_end,
                    event.city_id,
                    event.category_id,
                    event.max_participants,
                    eventId.value
                ]
            );

            if (result.changes === 0) return res.status(404).json({ error: "Мероприятие не найдено" });
            await saveEventPhotos(db, eventId.value, parsedPhotos.value);
            await saveEventFiles(db, eventId.value, parsedFiles.value);
            await setEventOptions(db, eventId.value, parsedOptionIds.value);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.delete("/events/:id", checkRole(["admin"]), async (req, res) => {
        const eventId = parsePositiveInt(req.params.id, "Мероприятие", true);
        if (eventId.error) return res.status(400).json({ error: eventId.error });

        try {
            const result = await dbRun(db, "DELETE FROM Events WHERE id = ?", [eventId.value]);
            if (result.changes === 0) return res.status(404).json({ error: "Мероприятие не найдено" });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.patch("/events/:id/finish", checkRole(["admin", "manager"]), async (req, res) => {
        const eventId = parsePositiveInt(req.params.id, "Мероприятие", true);
        if (eventId.error) return res.status(400).json({ error: eventId.error });

        try {
            const result = await dbRun(db, "UPDATE Events SET is_finished = 1 WHERE id = ?", [eventId.value]);
            if (result.changes === 0) return res.status(404).json({ error: "Мероприятие не найдено" });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post("/events/:id/join", checkAuth, async (req, res) => {
        const eventId = parsePositiveInt(req.params.id, "Мероприятие", true);
        if (eventId.error) return res.status(400).json({ error: eventId.error });

        try {
            await dbRun(db, "BEGIN IMMEDIATE");

            const event = await dbGet(
                db,
                `SELECT e.max_participants, e.event_date, e.registration_end, e.is_finished, COUNT(ep.employee_id) AS participants_count
                 FROM Events e
                 LEFT JOIN EventParticipants ep ON e.id = ep.event_id
                 WHERE e.id = ?
                 GROUP BY e.id`,
                [eventId.value]
            );

            if (!event) {
                await rollbackQuietly(db);
                return res.status(404).json({ error: "Мероприятие не найдено" });
            }

            if (isRegistrationClosed(event)) {
                await rollbackQuietly(db);
                return res.status(400).json({ error: "Регистрация на мероприятие закрыта" });
            }

            const existingParticipant = await dbGet(
                db,
                "SELECT employee_id FROM EventParticipants WHERE event_id = ? AND employee_id = ?",
                [eventId.value, req.session.user.id]
            );

            if (!existingParticipant && event.max_participants && event.participants_count >= event.max_participants) {
                await rollbackQuietly(db);
                return res.status(400).json({ error: "Достигнут лимит участников" });
            }

            const eventOptions = await getEventOptionsForAnswers(db, eventId.value);
            const parsedAnswers = normalizeParticipantOptionAnswers(eventOptions, req.body.option_answers);
            if (parsedAnswers.error) {
                await rollbackQuietly(db);
                return res.status(400).json({ error: parsedAnswers.error });
            }

            if (!existingParticipant) {
                await dbRun(
                    db,
                    "INSERT INTO EventParticipants (event_id, employee_id, status_id) VALUES (?, ?, 1)",
                    [eventId.value, req.session.user.id]
                );
            }
            await saveParticipantOptionAnswers(db, eventId.value, req.session.user.id, parsedAnswers.value);

            await dbRun(db, "COMMIT");
            res.json({ success: true, updated: Boolean(existingParticipant) });
        } catch (err) {
            await rollbackQuietly(db);
            if (err.message.includes("UNIQUE")) {
                return res.status(400).json({ error: "Вы уже записаны на это мероприятие" });
            }
            res.status(500).json({ error: err.message });
        }
    });

    router.delete("/events/:id/leave", checkAuth, async (req, res) => {
        const eventId = parsePositiveInt(req.params.id, "Мероприятие", true);
        if (eventId.error) return res.status(400).json({ error: eventId.error });

        try {
            const event = await dbGet(
                db,
                "SELECT event_date, registration_end, is_finished FROM Events WHERE id = ?",
                [eventId.value]
            );
            if (!event) return res.status(404).json({ error: "Мероприятие не найдено" });
            if (isRegistrationClosed(event)) {
                return res.status(400).json({ error: "Отмена записи недоступна: регистрация закрыта" });
            }

            const result = await dbRun(
                db,
                "DELETE FROM EventParticipants WHERE event_id = ? AND employee_id = ?",
                [eventId.value, req.session.user.id]
            );

            if (result.changes === 0) {
                return res.status(400).json({ error: "Вы не записаны на это мероприятие" });
            }

            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get("/events/:id/participants", checkRole(["admin", "manager"]), async (req, res) => {
        const eventId = parsePositiveInt(req.params.id, "Мероприятие", true);
        if (eventId.error) return res.status(400).json({ error: eventId.error });

        try {
            const rows = await dbAll(
                db,
                `SELECT ep.employee_id, ep.status_id, e.full_name, e.email, e.phone, r.name AS role
                 FROM EventParticipants ep
                 JOIN Employees e ON ep.employee_id = e.id
                 JOIN Roles r ON e.role_id = r.id
                 WHERE ep.event_id = ?
                 ORDER BY e.full_name`,
                [eventId.value]
            );

            if (!rows.length) return res.json([]);

            const employeeIds = rows.map(row => row.employee_id);
            const placeholders = employeeIds.map(() => "?").join(",");
            const answerRows = await dbAll(
                db,
                `SELECT a.employee_id, a.option_id, a.value, o.name AS option_name
                 FROM EventParticipantOptionAnswers a
                 JOIN EventOptions o ON a.option_id = o.id
                 WHERE a.event_id = ? AND a.employee_id IN (${placeholders})
                 ORDER BY o.name, a.id`,
                [eventId.value, ...employeeIds]
            );
            const answersByEmployee = new Map();
            answerRows.forEach(answer => {
                if (!answersByEmployee.has(answer.employee_id)) answersByEmployee.set(answer.employee_id, new Map());
                const byOption = answersByEmployee.get(answer.employee_id);
                if (!byOption.has(answer.option_id)) {
                    byOption.set(answer.option_id, {
                        option_id: answer.option_id,
                        option_name: answer.option_name,
                        values: []
                    });
                }
                byOption.get(answer.option_id).values.push(answer.value);
            });

            res.json(rows.map(row => ({
                ...row,
                option_answers: Array.from((answersByEmployee.get(row.employee_id) || new Map()).values())
            })));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post("/events/:id/participants", checkRole(["admin", "manager"]), async (req, res) => {
        const eventId = parsePositiveInt(req.params.id, "Мероприятие", true);
        if (eventId.error) return res.status(400).json({ error: eventId.error });

        const employeeId = parsePositiveInt(req.body.employee_id, "Сотрудник", true);
        if (employeeId.error) return res.status(400).json({ error: employeeId.error });

        const rawStatusId = req.body.status_id === undefined || req.body.status_id === null || req.body.status_id === ""
            ? 1
            : req.body.status_id;
        const statusId = parsePositiveInt(rawStatusId, "Статус", true);
        if (statusId.error) return res.status(400).json({ error: statusId.error });

        try {
            await dbRun(db, "BEGIN IMMEDIATE");

            const employee = await dbGet(db, "SELECT id FROM Employees WHERE id = ?", [employeeId.value]);
            if (!employee) {
                await rollbackQuietly(db);
                return res.status(400).json({ error: "Сотрудник не найден" });
            }

            const status = await dbGet(db, "SELECT id FROM Status WHERE id = ?", [statusId.value]);
            if (!status) {
                await rollbackQuietly(db);
                return res.status(400).json({ error: "Статус не найден" });
            }

            const event = await dbGet(
                db,
                `SELECT e.max_participants, e.event_date, e.registration_end, e.is_finished, COUNT(ep.employee_id) AS participants_count
                 FROM Events e
                 LEFT JOIN EventParticipants ep ON e.id = ep.event_id
                 WHERE e.id = ?
                 GROUP BY e.id`,
                [eventId.value]
            );

            if (!event) {
                await rollbackQuietly(db);
                return res.status(404).json({ error: "Мероприятие не найдено" });
            }

            if (isRegistrationClosed(event)) {
                await rollbackQuietly(db);
                return res.status(400).json({ error: "Регистрация на мероприятие закрыта" });
            }

            if (event.max_participants && event.participants_count >= event.max_participants) {
                await rollbackQuietly(db);
                return res.status(400).json({ error: "Достигнут лимит участников" });
            }

            await dbRun(
                db,
                "INSERT INTO EventParticipants (event_id, employee_id, status_id) VALUES (?, ?, ?)",
                [eventId.value, employeeId.value, statusId.value]
            );

            await dbRun(db, "COMMIT");
            res.json({ success: true });
        } catch (err) {
            await rollbackQuietly(db);
            if (err.message.includes("UNIQUE")) {
                return res.status(400).json({ error: "Работник уже записан на это мероприятие" });
            }
            res.status(500).json({ error: err.message });
        }
    });

    router.put("/events/:id/participants/:employeeId", checkRole(["admin", "manager"]), async (req, res) => {
        const eventId = parsePositiveInt(req.params.id, "Мероприятие", true);
        if (eventId.error) return res.status(400).json({ error: eventId.error });

        const employeeId = parsePositiveInt(req.params.employeeId, "Сотрудник", true);
        if (employeeId.error) return res.status(400).json({ error: employeeId.error });

        const statusId = parsePositiveInt(req.body.status_id, "Статус", true);
        if (statusId.error) return res.status(400).json({ error: statusId.error });

        try {
            const status = await dbGet(db, "SELECT id FROM Status WHERE id = ?", [statusId.value]);
            if (!status) return res.status(400).json({ error: "Статус не найден" });

            const result = await dbRun(
                db,
                "UPDATE EventParticipants SET status_id = ? WHERE event_id = ? AND employee_id = ?",
                [statusId.value, eventId.value, employeeId.value]
            );

            if (result.changes === 0) return res.status(404).json({ error: "Участник не найден" });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.delete("/events/:id/participants/:employeeId", checkRole(["admin", "manager"]), async (req, res) => {
        const eventId = parsePositiveInt(req.params.id, "Мероприятие", true);
        if (eventId.error) return res.status(400).json({ error: eventId.error });

        const employeeId = parsePositiveInt(req.params.employeeId, "Сотрудник", true);
        if (employeeId.error) return res.status(400).json({ error: employeeId.error });

        try {
            const result = await dbRun(
                db,
                "DELETE FROM EventParticipants WHERE event_id = ? AND employee_id = ?",
                [eventId.value, employeeId.value]
            );

            if (result.changes === 0) {
                return res.status(400).json({ error: "Работник не записан на это мероприятие" });
            }

            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
