document.addEventListener("DOMContentLoaded", () => {
    fetch("/api/check-auth")
        .then(r => r.json())
        .then(data => {
            if (!data.authenticated) {
                location.href = "/";
                return;
            }
            updateBackLink(data.user?.role);
            loadEvent();
        });
});

function updateBackLink(role) {
    const link = document.getElementById("backToEventsLink");
    if (!link) return;

    if (role === "admin") {
        link.href = "/admin.html";
    } else if (role === "manager") {
        link.href = "/manager.html";
    } else {
        link.href = "/employee.html";
    }
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

function isRegistrationClosed(event) {
    return Boolean(event.is_finished) ||
        (event.registration_end && Date.parse(event.registration_end) < Date.now()) ||
        (event.event_date && Date.parse(event.event_date) < Date.now());
}

function renderEventPhotos(photos = []) {
    if (!photos.length) return "<p>Галерея не загружена</p>";
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
    if (!files.length) return "<p>Прикрепленных файлов нет</p>";
    return `
        <div class="event-files">
            ${files.map(file => `
                <a href="${escapeHtml(file.url)}" target="_blank" download="${escapeHtml(file.name || "")}">
                    ${escapeHtml(file.name || "Файл")}
                </a>
            `).join("")}
        </div>
    `;
}

function renderEventOptions(options = []) {
    if (!options.length) return "<p>Опции не привязаны</p>";
    return `
        <div class="event-option-list">
            ${options.map(option => `
                <span>
                    ${escapeHtml(option.name)} (${escapeHtml(option.type_name)}${option.is_required ? ", обязательная" : ""})
                    ${option.values && option.values.length ? `: ${escapeHtml(option.values.join(", "))}` : ""}
                </span>
            `).join("")}
        </div>
    `;
}

function optionInputName(option) {
    return `option_${option.id}`;
}

function getOptionAnswerValues(option) {
    const answers = window.currentEventDetails?.my_option_answers || {};
    return answers[String(option.id)] || answers[option.id] || [];
}

function renderOptionInput(option) {
    const required = option.is_required ? "required" : "";
    const label = `${escapeHtml(option.name)}${option.is_required ? " *" : ""}`;
    const inputName = optionInputName(option);
    const values = option.values || [];
    const answerValues = getOptionAnswerValues(option);
    const firstAnswer = answerValues[0] || "";

    if (option.type_code === "textarea") {
        return `
            <label class="registration-option">
                <span>${label}</span>
                <textarea name="${inputName}" rows="3" ${required}>${escapeHtml(firstAnswer)}</textarea>
            </label>
        `;
    }
    if (option.type_code === "number") {
        return `
            <label class="registration-option">
                <span>${label}</span>
                <input type="number" name="${inputName}" value="${escapeHtml(firstAnswer)}" ${required}>
            </label>
        `;
    }
    if (option.type_code === "radio") {
        return `
            <div class="registration-option">
                <span>${label}</span>
                <div class="option-choice-list">
                    ${values.map((value, index) => `
                        <label class="option-choice">
                            <input type="radio" name="${inputName}" value="${escapeHtml(value)}" ${answerValues.includes(value) ? "checked" : ""} ${required && index === 0 ? "required" : ""}>
                            <span>${escapeHtml(value)}</span>
                        </label>
                    `).join("")}
                </div>
            </div>
        `;
    }
    if (option.type_code === "checkbox_group") {
        return `
            <div class="registration-option" data-required="${option.is_required ? "1" : "0"}" data-option-name="${escapeHtml(option.name)}">
                <span>${label}</span>
                <div class="option-choice-list">
                    ${values.map(value => `
                        <label class="option-choice">
                            <input type="checkbox" name="${inputName}" value="${escapeHtml(value)}" ${answerValues.includes(value) ? "checked" : ""}>
                            <span>${escapeHtml(value)}</span>
                        </label>
                    `).join("")}
                </div>
            </div>
        `;
    }
    if (option.type_code === "checkbox") {
        return `
            <label class="registration-option option-choice">
                <input type="checkbox" name="${inputName}" ${answerValues.includes("Да") ? "checked" : ""} ${required}>
                <span>${label}</span>
            </label>
        `;
    }

    return `
        <label class="registration-option">
            <span>${label}</span>
            <input type="text" name="${inputName}" value="${escapeHtml(firstAnswer)}" ${required}>
        </label>
    `;
}

function renderRegistrationOptions(options = []) {
    if (!options.length) return "";
    return `
        <div class="registration-options">
            <h4>Заполните опции</h4>
            ${options.map(renderOptionInput).join("")}
        </div>
    `;
}

function collectOptionAnswers(form, options = []) {
    const optionAnswers = {};

    for (const option of options) {
        const inputName = optionInputName(option);
        if (option.type_code === "checkbox_group") {
            const selectedValues = Array.from(form.querySelectorAll(`[name="${inputName}"]:checked`))
                .map(input => input.value);
            if (option.is_required && selectedValues.length === 0) {
                return { error: `Заполните обязательную опцию: ${option.name}` };
            }
            optionAnswers[option.id] = selectedValues;
            continue;
        }
        if (option.type_code === "checkbox") {
            const input = form.querySelector(`[name="${inputName}"]`);
            optionAnswers[option.id] = Boolean(input && input.checked);
            continue;
        }
        if (option.type_code === "radio") {
            const input = form.querySelector(`[name="${inputName}"]:checked`);
            optionAnswers[option.id] = input ? input.value : "";
            continue;
        }

        const input = form.querySelector(`[name="${inputName}"]`);
        optionAnswers[option.id] = input ? input.value.trim() : "";
    }

    return { value: optionAnswers };
}

function renderRegistrationForm(event) {
    if (event.is_registered && isRegistrationClosed(event)) {
        return '<button class="btn-full" disabled>Запись закрыта</button>';
    }
    if (isRegistrationClosed(event)) {
        return '<button class="btn-full" disabled>Регистрация закрыта</button>';
    }
    if (!event.is_registered && event.max_participants && event.participants_count >= event.max_participants) {
        return '<button class="btn-full" disabled>Мест нет</button>';
    }
    if (event.is_registered && (!event.options || event.options.length === 0)) {
        return `<button class="btn-leave" onclick="leaveEvent(${event.id})">Отменить запись</button>`;
    }

    return `
        <form class="event-form" onsubmit="joinEvent(event, ${event.id})" onchange="markRegistrationChanged(this)" oninput="markRegistrationChanged(this)">
            ${renderRegistrationOptions(event.options)}
            ${event.is_registered
                ? `<button type="button" class="btn-leave" data-action="leave" onclick="leaveEvent(${event.id})">Отменить запись</button>`
                : '<button type="submit" data-action="save">Записаться</button>'}
        </form>
    `;
}

function markRegistrationChanged(form) {
    const currentEvent = window.currentEventDetails;
    if (!currentEvent?.is_registered) return;
    const button = form.querySelector("button[data-action]");
    if (!button || button.dataset.action === "save") return;
    button.dataset.action = "save";
    button.type = "submit";
    button.className = "";
    button.textContent = "Записаться";
    button.removeAttribute("onclick");
}

function loadEvent() {
    const id = new URLSearchParams(location.search).get("id");
    const container = document.getElementById("eventDetails");
    if (!id) {
        container.innerHTML = "<p>Мероприятие не выбрано</p>";
        return;
    }

    fetch(`/api/events/${id}`)
        .then(r => r.json())
        .then(event => {
            if (event.error) {
                container.innerHTML = `<p>${escapeHtml(event.error)}</p>`;
                return;
            }
            window.currentEventDetails = event;

            const places = event.max_participants
                ? `${event.participants_count ?? 0} / ${event.max_participants}`
                : `${event.participants_count ?? 0}`;

            container.innerHTML = `
                <article class="event event-detail ${event.is_finished ? "event-finished" : ""}">
                    <h2>${escapeHtml(event.name)}${event.is_finished ? " — завершено" : ""}</h2>
                    <p><strong>Полное описание:</strong> ${displayValue(event.description)}</p>
                    <p><strong>Дата проведения:</strong> ${displayValue(event.event_date)}</p>
                    <p><strong>Дата окончания регистрации:</strong> ${displayValue(event.registration_end)}</p>
                    <p><strong>Доступные места:</strong> ${escapeHtml(places)}</p>
                    <p><strong>Город:</strong> ${displayValue(event.city)}</p>
                    <p><strong>Адрес:</strong> ${displayValue(event.address)}</p>
                    <h3>Галерея</h3>
                    ${renderEventPhotos(event.photos)}
                    <h3>Прикрепленные файлы</h3>
                    ${renderEventFiles(event.files)}
                    <h3>Регистрация</h3>
                    ${renderRegistrationForm(event)}
                </article>
            `;
        })
        .catch(() => {
            container.innerHTML = "<p>Ошибка загрузки мероприятия</p>";
        });
}

function joinEvent(event, id) {
    event.preventDefault();
    const form = event.target;
    const currentEvent = window.currentEventDetails;
    const parsedAnswers = collectOptionAnswers(form, currentEvent?.options || []);
    if (parsedAnswers.error) {
        alert(parsedAnswers.error);
        return;
    }

    fetch(`/api/events/${id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option_answers: parsedAnswers.value })
    })
        .then(r => r.json())
        .then(result => {
            if (result.error) {
                alert(result.error);
                return;
            }
            loadEvent();
        })
        .catch(() => alert("Ошибка записи"));
}

function leaveEvent(id) {
    if (!confirm("Отменить запись?")) return;

    fetch(`/api/events/${id}/leave`, { method: "DELETE" })
        .then(r => r.json())
        .then(result => {
            if (result.error) {
                alert(result.error);
                return;
            }
            loadEvent();
        })
        .catch(() => alert("Ошибка отмены"));
}
