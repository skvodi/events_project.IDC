let cities = [];
let categories = [];
let eventOptions = [];
let optionTypes = [];
let currentUserRole = "";

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const data = await fetchJson("/api/check-auth");
        const allowedRoles = window.dashboardAllowedRoles || ["admin"];
        if (!data.authenticated || !data.user || !allowedRoles.includes(data.user.role)) {
            location.href = "/";
            return;
        }
        currentUserRole = data.user.role;

        await Promise.all([loadCities(), loadCategories(), loadOptionTypes(), loadOptions()]);
        bindEventForm();
        bindEventEditForm();
        bindOptionForm();
        updateCreatePageLinks();
        loadEvents();
    } catch (error) {
        alert(error.message || "Ошибка загрузки данных");
    }
});

function fetchJson(url, options = {}) {
    return fetch(url, options)
        .then(async r => {
            const data = await r.json().catch(() => ({}));
            if (!r.ok || data.error) throw new Error(data.error || "Ошибка запроса");
            return data;
        });
}

function dashboardUrl() {
    return currentUserRole === "manager" ? "/manager.html" : "/admin.html";
}

function updateCreatePageLinks() {
    const backLink = document.getElementById("backToDashboardLink");
    if (backLink) backLink.href = dashboardUrl();
}

function currentEventIdFromUrl() {
    return new URLSearchParams(location.search).get("id");
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function displayValue(value) {
    return value ? escapeHtml(value) : "-";
}

function fileToPayload(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, type: file.type, data: reader.result });
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

function filesToPayload(files) {
    return Promise.all(files.filter(file => file && file.size > 0).map(fileToPayload));
}

function selectedOptionIds(select) {
    return Array.from(select.selectedOptions).map(option => option.value);
}

function optionValuesFromTextarea(value) {
    return value.split("\n").map(item => item.trim()).filter(Boolean);
}

function isValidDateTime(value) {
    return value && !Number.isNaN(Date.parse(value));
}

function validateEventData(data) {
    const name = (data.name || "").trim();
    const address = (data.address || "").trim();
    const description = (data.description || "").trim();
    const maxParticipants = data.max_participants ? Number(data.max_participants) : null;

    if (name.length < 3 || name.length > 150) return "Название мероприятия должно содержать от 3 до 150 символов";
    if (description.length > 5000) return "Описание не должно превышать 5000 символов";
    if (address.length > 255) return "Адрес не должен превышать 255 символов";
    if (!data.city_id) return "Выберите город";
    if (!data.category_id) return "Выберите категорию";
    if (!isValidDateTime(data.event_date)) return "Укажите корректную дату мероприятия";
    if (data.registration_end && !isValidDateTime(data.registration_end)) return "Укажите корректную дату окончания регистрации";
    if (data.registration_end && Date.parse(data.registration_end) > Date.parse(data.event_date)) {
        return "Дата окончания регистрации не может быть позже даты мероприятия";
    }
    if (maxParticipants !== null && (!Number.isInteger(maxParticipants) || maxParticipants < 0 || maxParticipants > 100000)) {
        return "Максимум участников должен быть целым числом от 0 до 100000";
    }
    return null;
}

function validateOptionData(data) {
    const name = (data.name || "").trim();
    const displayParams = (data.display_params || "").trim();
    const values = data.values || [];
    const type = optionTypes.find(item => String(item.id) === String(data.type_id));
    const valueKeys = values.map(value => value.toLowerCase());

    if (name.length < 2 || name.length > 150) return "Название опции должно содержать от 2 до 150 символов";
    if (!type) return "Выберите тип опции";
    if (displayParams.length > 1000) return "Параметры отображения не должны превышать 1000 символов";
    if (values.length > 100) return "Список значений не должен превышать 100 элементов";
    if (values.some(value => value.length > 255)) return "Значение опции не должно превышать 255 символов";
    if (new Set(valueKeys).size !== valueKeys.length) return "Значения опции не должны повторяться";
    if (["radio", "checkbox_group"].includes(type.code) && values.length === 0) {
        return "Для одиночного и множественного выбора нужен список значений";
    }
    if (!["radio", "checkbox_group"].includes(type.code) && values.length > 0) {
        return "Список значений допускается только для одиночного или множественного выбора";
    }
    return null;
}

function renderOptionSelect(select, selectedIds = []) {
    select.innerHTML = eventOptions.map(option => `
        <option value="${option.id}" ${selectedIds.includes(String(option.id)) ? "selected" : ""}>
            ${escapeHtml(option.name)} (${escapeHtml(option.type_name)})
        </option>
    `).join("");
}

function renderEventPhotos(photos = []) {
    if (!photos.length) return "";
    return `
        <div class="event-photos">
            ${photos.map(photo => `
                <a href="${escapeHtml(photo.url)}" target="_blank">
                    <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.name || "Фото мероприятия")}">
                </a>
            `).join("")}
        </div>
    `;
}

function renderEventFiles(files = []) {
    if (!files.length) return "";
    return `
        <div class="event-files">
            <strong>Файлы:</strong>
            ${files.map(file => `
                <a href="${escapeHtml(file.url)}" target="_blank" download="${escapeHtml(file.name || "")}">
                    ${escapeHtml(file.name || "Файл")}
                </a>
            `).join("")}
        </div>
    `;
}

function renderEventOptions(options = []) {
    if (!options.length) return '<p><strong>Опции:</strong> -</p>';
    return `
        <div class="event-option-list">
            <strong>Опции:</strong>
            ${options.map(option => `
                <span>${escapeHtml(option.name)} (${escapeHtml(option.type_name)}${option.is_required ? ", обязательная" : ""})</span>
            `).join("")}
        </div>
    `;
}

function loadCities() {
    return fetchJson("/api/cities").then(data => {
        cities = data;
        const select = document.querySelector('#eventForm select[name="city_id"]');
        if (!select) return;
        select.innerHTML = '<option value="">Выберите город</option>' +
            cities.map(city => `<option value="${city.id}">${escapeHtml(city.name)}</option>`).join("");
    });
}

function loadCategories() {
    return fetchJson("/api/categories").then(data => {
        categories = data;
        const select = document.querySelector('#eventForm select[name="category_id"]');
        if (!select) return;
        select.innerHTML = '<option value="">Выберите категорию</option>' +
            categories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join("");
    });
}

function fillEventSelect(select, items, selectedId, placeholder) {
    if (!select) return;
    select.innerHTML = `<option value="">${placeholder}</option>` +
        items.map(item => `<option value="${item.id}" ${String(item.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
}

function loadOptionTypes() {
    return fetchJson("/api/event-option-types").then(data => {
        optionTypes = data;
        document.querySelectorAll('select[name="type_id"]').forEach(select => {
            select.innerHTML = '<option value="">Выберите тип опции</option>' +
                optionTypes.map(type => `<option value="${type.id}">${escapeHtml(type.name)}</option>`).join("");
        });
    });
}

function loadOptions() {
    return fetchJson("/api/event-options").then(data => {
        eventOptions = data;
        const createSelect = document.querySelector('#eventForm select[name="option_ids"]');
        if (createSelect) renderOptionSelect(createSelect);
        renderOptionsList();
    });
}

function bindEventForm() {
    const form = document.getElementById("eventForm");
    if (!form) return;

    form.addEventListener("submit", async e => {
        e.preventDefault();
        const formData = new FormData(form);
        const data = Object.fromEntries(formData);
        data.option_ids = selectedOptionIds(form.querySelector('[name="option_ids"]'));
        const validationError = validateEventData(data);
        if (validationError) {
            alert(validationError);
            return;
        }
        data.photos = await filesToPayload(formData.getAll("photos"));
        data.files = await filesToPayload(formData.getAll("files"));

        fetchJson("/api/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        })
        .then(() => {
            alert("Мероприятие создано");
            form.reset();
            renderOptionSelect(form.querySelector('[name="option_ids"]'));
            location.href = dashboardUrl();
        })
        .catch(error => alert(error.message || "Ошибка создания"));
    });
}

function bindEventEditForm() {
    const form = document.getElementById("eventEditForm");
    if (!form) return;

    const eventId = currentEventIdFromUrl();
    if (!eventId) {
        alert("Мероприятие не выбрано");
        location.href = dashboardUrl();
        return;
    }

    loadEventForEdit(eventId);

    form.addEventListener("submit", async e => {
        e.preventDefault();
        const data = {
            name: form.querySelector('[name="name"]').value,
            description: form.querySelector('[name="description"]').value,
            city_id: form.querySelector('[name="city_id"]').value,
            address: form.querySelector('[name="address"]').value,
            category_id: form.querySelector('[name="category_id"]').value,
            event_date: form.querySelector('[name="event_date"]').value,
            registration_end: form.querySelector('[name="registration_end"]').value,
            option_ids: selectedOptionIds(form.querySelector('[name="option_ids"]')),
            max_participants: form.querySelector('[name="max_participants"]').value,
            photos: await filesToPayload(Array.from(form.querySelector('[name="photos"]').files)),
            files: await filesToPayload(Array.from(form.querySelector('[name="files"]').files))
        };

        const validationError = validateEventData(data);
        if (validationError) {
            alert(validationError);
            return;
        }

        fetchJson(`/api/events/${eventId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        })
        .then(() => {
            alert("Мероприятие сохранено");
            location.href = dashboardUrl();
        })
        .catch(error => alert(error.message || "Ошибка сохранения"));
    });
}

function loadEventForEdit(eventId) {
    fetchJson(`/api/events/${eventId}`)
        .then(event => {
            const form = document.getElementById("eventEditForm");
            const selectedIds = (event.options || []).map(option => String(option.id));

            form.querySelector('[name="name"]').value = event.name || "";
            form.querySelector('[name="description"]').value = event.description || "";
            fillEventSelect(form.querySelector('[name="city_id"]'), cities, event.city_id, "Выберите город");
            form.querySelector('[name="address"]').value = event.address || "";
            fillEventSelect(form.querySelector('[name="category_id"]'), categories, event.category_id, "Выберите категорию");
            form.querySelector('[name="event_date"]').value = event.event_date || "";
            form.querySelector('[name="registration_end"]').value = event.registration_end || "";
            renderOptionSelect(form.querySelector('[name="option_ids"]'), selectedIds);
            const participantsCount = Number(event.participants_count || 0);
            const maxParticipantsInput = form.querySelector('[name="max_participants"]');
            maxParticipantsInput.value = event.max_participants || "";
            maxParticipantsInput.min = String(participantsCount);

        })
        .catch(error => {
            alert(error.message || "Ошибка загрузки мероприятия");
            location.href = dashboardUrl();
        });
}

function bindOptionForm() {
    const form = document.getElementById("optionForm");
    if (!form) return;

    form.addEventListener("submit", e => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        data.is_required = form.querySelector('[name="is_required"]').checked;
        data.values = optionValuesFromTextarea(form.querySelector('[name="values"]').value);
        const validationError = validateOptionData(data);
        if (validationError) {
            alert(validationError);
            return;
        }

        const id = data.id;
        delete data.id;

        fetchJson(id ? `/api/event-options/${id}` : "/api/event-options", {
            method: id ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        })
        .then(async () => {
            resetOptionForm();
            await loadOptions();
            loadEvents();
        })
        .catch(error => alert(error.message || "Ошибка сохранения опции"));
    });
}

function renderOptionsList() {
    const container = document.getElementById("options");
    if (!container) return;

    if (!eventOptions.length) {
        container.innerHTML = "<p>Опции пока не созданы</p>";
        return;
    }

    container.innerHTML = eventOptions.map(option => `
        <div class="option-card">
            <div>
                <strong>${escapeHtml(option.name)}</strong>
                <p>${escapeHtml(option.type_name)}${option.is_required ? " · обязательная" : ""}</p>
                ${option.values.length ? `<p>Значения: ${escapeHtml(option.values.join(", "))}</p>` : ""}
                ${option.display_params ? `<p>Параметры: ${escapeHtml(option.display_params)}</p>` : ""}
            </div>
            <div class="btn-row">
                <button class="btn-warning" onclick="editOption(${option.id})">Редактировать</button>
                <button class="btn-danger" onclick="deleteOption(${option.id})">Удалить</button>
            </div>
        </div>
    `).join("");
}

function resetOptionForm() {
    const form = document.getElementById("optionForm");
    if (!form) return;
    form.reset();
    form.querySelector('[name="id"]').value = "";
}

function editOption(id) {
    const option = eventOptions.find(item => item.id === id);
    const form = document.getElementById("optionForm");
    if (!option || !form) return;

    form.querySelector('[name="id"]').value = option.id;
    form.querySelector('[name="name"]').value = option.name;
    form.querySelector('[name="type_id"]').value = option.type_id;
    form.querySelector('[name="is_required"]').checked = Boolean(option.is_required);
    form.querySelector('[name="display_params"]').value = option.display_params || "";
    form.querySelector('[name="values"]').value = option.values.join("\n");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteOption(id) {
    if (!confirm("Удалить опцию?")) return;
    fetchJson(`/api/event-options/${id}`, { method: "DELETE" })
        .then(async () => {
            await loadOptions();
            loadEvents();
        })
        .catch(error => alert(error.message || "Ошибка удаления опции"));
}

function loadEvents() {
    const container = document.getElementById("events");
    if (!container) return;

    fetchJson("/api/events")
        .then(events => {
            if (events.length === 0) {
                container.innerHTML = "<p>Нет мероприятий</p>";
                return;
            }
            container.innerHTML = events.map(renderEventCard).join("");
        })
        .catch(error => alert(error.message || "Ошибка загрузки мероприятий"));
}

function renderEventCard(event) {
    const isFinished = Boolean(event.is_finished);
    const participantLimit = event.max_participants ? escapeHtml(event.max_participants) : "без ограничения";
    return `
        <div class="event ${isFinished ? "event-finished" : ""}">
            <h3>${escapeHtml(event.name)}${isFinished ? " — завершено" : ""}</h3>
            <p><strong>Возможных участников:</strong> ${participantLimit}</p>
            <div class="btn-row">
                <a class="button-link" href="/event.html?id=${event.id}">Подробнее</a>
                <a class="button-link btn-warning" href="/event-edit.html?id=${event.id}">Редактировать</a>
                <button class="btn-success" onclick="toggleParticipants(${event.id})">Участники</button>
                <button class="btn-warning" onclick="finishEvent(${event.id})" ${isFinished ? "disabled" : ""}>Завершить</button>
                ${currentUserRole === "admin" ? `<button class="btn-danger" onclick="deleteEvent(${event.id})">Удалить</button>` : ""}
            </div>

            <div class="participants-panel" id="participants-${event.id}">
                <h4>Участники мероприятия</h4>
                <div id="participants-list-${event.id}"></div>
                <h4>Добавить работника</h4>
                <div class="add-participant-row">
                    <select id="employee-select-${event.id}">
                        <option value="">Выберите работника</option>
                    </select>
                    <button class="btn-success" onclick="addParticipant(${event.id})">Добавить</button>
                </div>
            </div>
        </div>
    `;
}

function toggleParticipants(id) {
    const panel = document.getElementById(`participants-${id}`);
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) {
        loadParticipants(id);
        loadEmployeeSelect(id);
    }
}

function loadParticipants(eventId) {
    fetchJson(`/api/events/${eventId}/participants`)
        .then(participants => {
            const list = document.getElementById(`participants-list-${eventId}`);
            if (participants.length === 0) {
                list.innerHTML = "<p>Нет участников</p>";
                return;
            }
            list.innerHTML = participants.map(p => `
                <div class="participant-row">
                    <span>
                        ${escapeHtml(p.full_name)} (${escapeHtml(p.email)})
                        ${renderParticipantAnswers(p.option_answers)}
                    </span>
                    <button class="btn-danger btn-sm" onclick="removeParticipant(${eventId}, ${p.employee_id})">Удалить</button>
                </div>
            `).join("");
        })
        .catch(error => alert(error.message || "Ошибка загрузки участников"));
}

function renderParticipantAnswers(answers = []) {
    if (!answers.length) return "";
    return `
        <span class="participant-answers">
            ${answers.map(answer => `
                <small>${escapeHtml(answer.option_name)}: ${escapeHtml((answer.values || []).join(", "))}</small>
            `).join("")}
        </span>
    `;
}

function loadEmployeeSelect(eventId) {
    fetchJson("/api/employees")
        .then(employees => {
            const select = document.getElementById(`employee-select-${eventId}`);
            select.innerHTML = '<option value="">Выберите работника</option>';
            employees.forEach(emp => {
                const option = document.createElement("option");
                option.value = emp.id;
                option.textContent = `${emp.full_name} (${emp.email})`;
                select.appendChild(option);
            });
        })
        .catch(error => alert(error.message || "Ошибка загрузки работников"));
}

function addParticipant(eventId) {
    const employeeId = document.getElementById(`employee-select-${eventId}`).value;
    if (!employeeId) {
        alert("Выберите работника");
        return;
    }

    fetchJson(`/api/events/${eventId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: employeeId })
    })
    .then(() => {
        loadParticipants(eventId);
        loadEvents();
    })
    .catch(error => alert(error.message || "Ошибка добавления"));
}

function removeParticipant(eventId, employeeId) {
    if (!confirm("Удалить участника?")) return;

    fetchJson(`/api/events/${eventId}/participants/${employeeId}`, { method: "DELETE" })
        .then(() => {
            loadParticipants(eventId);
            loadEvents();
        })
        .catch(error => alert(error.message || "Ошибка удаления"));
}

function finishEvent(id) {
    if (!confirm("Завершить мероприятие? Регистрация будет закрыта.")) return;
    fetchJson(`/api/events/${id}/finish`, { method: "PATCH" })
        .then(loadEvents)
        .catch(error => alert(error.message || "Ошибка завершения"));
}

function deleteEvent(id) {
    if (!confirm("Удалить мероприятие?")) return;

    fetchJson(`/api/events/${id}`, { method: "DELETE" })
        .then(() => {
            alert("Удалено");
            loadEvents();
        })
        .catch(error => alert(error.message || "Ошибка удаления"));
}
