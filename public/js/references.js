let currentUserRole = "";
let optionTypes = [];
let eventOptions = [];

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const data = await fetchJson("/api/check-auth");
        if (!data.authenticated || !data.user || !["admin", "manager"].includes(data.user.role)) {
            location.href = "/";
            return;
        }

        currentUserRole = data.user.role;
        const backLink = document.getElementById("backToDashboardLink");
        if (backLink) backLink.href = currentUserRole === "manager" ? "/manager.html" : "/admin.html";

        await Promise.all([loadOptionTypes(), loadEventOptions()]);

        if (currentUserRole === "admin") {
            loadList('cities');
            loadList('categories');
            loadList('roles');
            loadList('statuses');
            loadEmployees();
            loadRolesForSelect();
        } else {
            document.querySelectorAll(".tab-btn").forEach(button => {
                if (!button.getAttribute("onclick")?.includes("'options'")) button.style.display = "none";
                button.classList.remove("active");
            });
            document.querySelectorAll(".tab-content").forEach(tab => tab.classList.remove("active"));
            document.getElementById("tab-options").classList.add("active");
            document.querySelector(".tab-btn[onclick*=\"'options'\"]").classList.add("active");
        }
    } catch (error) {
        alert(error.message || "Ошибка загрузки справочников");
    }
});

// ===== ВКЛАДКИ =====
function switchTab(e, name) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${name}`).classList.add('active');
    e.target.classList.add('active');
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function fetchJson(url, options = {}) {
    return fetch(url, options)
        .then(async r => {
            const data = await r.json().catch(() => ({}));
            if (!r.ok || data.error) throw new Error(data.error || "Ошибка запроса");
            return data;
        });
}

// ===== УНИВЕРСАЛЬНЫЕ ФУНКЦИИ ДЛЯ ПРОСТЫХ СПРАВОЧНИКОВ =====

// Загрузка списка
function loadList(type) {
    fetch(`/api/${type}`)
        .then(r => r.json())
        .then(items => {
            const container = document.getElementById(`list-${type}`);
            if (items.length === 0) {
                container.innerHTML = '<p>Список пуст</p>';
                return;
            }
            container.innerHTML = items.map(item => `
                <div class="ref-item" id="${type}-${item.id}">
                    <div class="ref-item-view">
                        <span>${escapeHtml(item.name)}${item.priority !== undefined ? ' (приоритет: ' + escapeHtml(item.priority) + ')' : ''}</span>
                        <div class="btn-row">
                            <button class="btn-warning btn-sm" onclick="startEdit('${type}', ${item.id})">Изм.</button>
                            <button class="btn-danger btn-sm" onclick="deleteItem('${type}', ${item.id})">Удалить</button>
                        </div>
                    </div>
                    <div class="ref-item-edit" id="edit-${type}-${item.id}" style="display:none;">
                        <input type="text" id="edit-name-${type}-${item.id}" value="${escapeHtml(item.name)}">
                        ${item.priority !== undefined ? `<input type="number" id="edit-priority-${type}-${item.id}" value="${escapeHtml(item.priority)}" min="1">` : ''}
                        <div class="btn-row">
                            <button onclick="saveItem('${type}', ${item.id})">Сохранить</button>
                            <button class="btn-danger btn-sm" onclick="cancelEdit('${type}', ${item.id})">Отмена</button>
                        </div>
                    </div>
                </div>
            `).join("");
        });
}

// Добавление записи
function addItem(e, type) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));

    fetch(`/api/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    })
    .then(r => r.json())
    .then(result => {
        if (result.error) {
            alert(result.error);
            return;
        }
        form.reset();
        loadList(type);
    })
    .catch(() => alert("Ошибка добавления"));
}

// Начать редактирование
function startEdit(type, id) {
    document.getElementById(`edit-${type}-${id}`).style.display = 'flex';
    document.querySelector(`#${type}-${id} .ref-item-view`).style.display = 'none';
}

// Отмена редактирования
function cancelEdit(type, id) {
    document.getElementById(`edit-${type}-${id}`).style.display = 'none';
    document.querySelector(`#${type}-${id} .ref-item-view`).style.display = 'flex';
}

// Сохранить изменения
function saveItem(type, id) {
    const name = document.getElementById(`edit-name-${type}-${id}`).value;
    const priorityEl = document.getElementById(`edit-priority-${type}-${id}`);
    const data = { name };
    if (priorityEl) data.priority = priorityEl.value;

    fetch(`/api/${type}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    })
    .then(r => r.json())
    .then(result => {
        if (result.error) {
            alert(result.error);
            return;
        }
        loadList(type);
    })
    .catch(() => alert("Ошибка сохранения"));
}

// Удалить запись
function deleteItem(type, id) {
    if (!confirm("Удалить запись?")) return;

    fetch(`/api/${type}/${id}`, { method: "DELETE" })
        .then(r => r.json())
        .then(result => {
            if (result.error) {
                alert(result.error);
                return;
            }
            loadList(type);
        })
        .catch(() => alert("Ошибка удаления"));
}

// ===== РАБОТНИКИ =====

function loadRolesForSelect() {
    fetch("/api/roles")
        .then(r => r.json())
        .then(roles => {
            const select = document.getElementById("employee-role-select");
            select.innerHTML = '<option value="">Выберите роль</option>';
            roles.forEach(role => {
                const option = document.createElement("option");
                option.value = role.id;
                option.textContent = role.name;
                select.appendChild(option);
            });
        });
}

function loadEmployees() {
    fetch("/api/employees")
        .then(r => r.json())
        .then(employees => {
            const container = document.getElementById("list-employees");
            if (employees.length === 0) {
                container.innerHTML = '<p>Список пуст</p>';
                return;
            }
            container.innerHTML = employees.map(emp => `
                <div class="ref-item" id="employees-${emp.id}">
                    <div class="ref-item-view">
                        <span>${escapeHtml(emp.full_name)} — ${escapeHtml(emp.email)} ${emp.phone ? '— ' + escapeHtml(emp.phone) : ''} (${escapeHtml(emp.role)})</span>
                        <div class="btn-row">
                            <button class="btn-warning btn-sm" onclick="startEditEmployee(${emp.id})">Изм.</button>
                            <button class="btn-danger btn-sm" onclick="deleteEmployee(${emp.id})">Удалить</button>
                        </div>
                    </div>
                    <div class="ref-item-edit" id="edit-employees-${emp.id}" style="display:none;">
                        <input type="text" id="edit-emp-name-${emp.id}" value="${escapeHtml(emp.full_name)}" placeholder="ФИО">
                        <input type="email" id="edit-emp-email-${emp.id}" value="${escapeHtml(emp.email)}" placeholder="Email">
                        <input type="text" id="edit-emp-phone-${emp.id}" value="${escapeHtml(emp.phone || '')}" placeholder="Телефон">
                        <input type="password" id="edit-emp-password-${emp.id}" placeholder="Новый пароль (оставьте пустым, чтобы не менять)">
                        <select id="edit-emp-role-${emp.id}"></select>
                        <div class="btn-row">
                            <button onclick="saveEmployee(${emp.id})">Сохранить</button>
                            <button class="btn-danger btn-sm" onclick="cancelEditEmployee(${emp.id})">Отмена</button>
                        </div>
                    </div>
                </div>
            `).join("");

            // Загружаем роли в селекты редактирования
            employees.forEach(emp => loadRolesForEmployeeEdit(emp.id, emp.role));
        });
}

function loadRolesForEmployeeEdit(empId, currentRole) {
    fetch("/api/roles")
        .then(r => r.json())
        .then(roles => {
            const select = document.getElementById(`edit-emp-role-${empId}`);
            if (!select) return;
            select.innerHTML = roles.map(role => `
                <option value="${role.id}" ${role.name === currentRole ? 'selected' : ''}>${escapeHtml(role.name)}</option>
            `).join("");
        });
}

function addEmployee(e) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));

    fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    })
    .then(r => r.json())
    .then(result => {
        if (result.error) {
            alert(result.error);
            return;
        }
        form.reset();
        loadEmployees();
    })
    .catch(() => alert("Ошибка добавления"));
}

function startEditEmployee(id) {
    document.getElementById(`edit-employees-${id}`).style.display = 'flex';
    document.querySelector(`#employees-${id} .ref-item-view`).style.display = 'none';
}

function cancelEditEmployee(id) {
    document.getElementById(`edit-employees-${id}`).style.display = 'none';
    document.querySelector(`#employees-${id} .ref-item-view`).style.display = 'flex';
}

function saveEmployee(id) {
    const data = {
        full_name: document.getElementById(`edit-emp-name-${id}`).value,
        email: document.getElementById(`edit-emp-email-${id}`).value,
        phone: document.getElementById(`edit-emp-phone-${id}`).value,
        password: document.getElementById(`edit-emp-password-${id}`).value,
        role_id: document.getElementById(`edit-emp-role-${id}`).value
    };

    fetch(`/api/employees/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    })
    .then(r => r.json())
    .then(result => {
        if (result.error) {
            alert(result.error);
            return;
        }
        loadEmployees();
    })
    .catch(() => alert("Ошибка сохранения"));
}

function deleteEmployee(id) {
    if (!confirm("Удалить работника? Он будет удалён из всех мероприятий.")) return;

    fetch(`/api/employees/${id}`, { method: "DELETE" })
        .then(r => r.json())
        .then(result => {
            if (result.error) {
                alert(result.error);
                return;
            }
            loadEmployees();
        })
        .catch(() => alert("Ошибка удаления"));
}

// ===== ОПЦИИ МЕРОПРИЯТИЙ =====

function optionValuesFromTextarea(value) {
    return value.split("\n").map(item => item.trim()).filter(Boolean);
}

function validateOptionData(data) {
    const name = (data.name || "").trim();
    const values = data.values || [];
    const type = optionTypes.find(item => String(item.id) === String(data.type_id));
    const valueKeys = values.map(value => value.toLowerCase());

    if (name.length < 2 || name.length > 150) return "Название опции должно содержать от 2 до 150 символов";
    if (!type) return "Выберите тип опции";
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

function loadOptionTypes() {
    return fetchJson("/api/event-option-types").then(types => {
        optionTypes = types;
        document.querySelectorAll('select[name="type_id"]').forEach(select => {
            select.innerHTML = '<option value="">Выберите тип опции</option>' +
                optionTypes.map(type => `<option value="${type.id}">${escapeHtml(type.name)}</option>`).join("");
        });
    });
}

function loadEventOptions() {
    return fetchJson("/api/event-options").then(options => {
        eventOptions = options;
        renderEventOptionsList();
    });
}

function renderEventOptionsList() {
    const container = document.getElementById("list-options");
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
            </div>
            <div class="btn-row">
                <button class="btn-warning" onclick="editEventOption(${option.id})">Редактировать</button>
                <button class="btn-danger" onclick="deleteEventOption(${option.id})">Удалить</button>
            </div>
        </div>
    `).join("");
}

function saveEventOption(e) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    data.is_required = form.querySelector('[name="is_required"]').checked;
    data.values = optionValuesFromTextarea(form.querySelector('[name="values"]').value);
    data.display_params = "";

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
        await loadEventOptions();
    })
    .catch(error => alert(error.message || "Ошибка сохранения опции"));
}

function resetOptionForm() {
    const form = document.getElementById("optionForm");
    if (!form) return;
    form.reset();
    form.querySelector('[name="id"]').value = "";
}

function editEventOption(id) {
    const option = eventOptions.find(item => item.id === id);
    const form = document.getElementById("optionForm");
    if (!option || !form) return;

    form.querySelector('[name="id"]').value = option.id;
    form.querySelector('[name="name"]').value = option.name;
    form.querySelector('[name="type_id"]').value = option.type_id;
    form.querySelector('[name="is_required"]').checked = Boolean(option.is_required);
    form.querySelector('[name="values"]').value = option.values.join("\n");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteEventOption(id) {
    if (!confirm("Удалить опцию?")) return;

    fetchJson(`/api/event-options/${id}`, { method: "DELETE" })
        .then(loadEventOptions)
        .catch(error => alert(error.message || "Ошибка удаления опции"));
}
