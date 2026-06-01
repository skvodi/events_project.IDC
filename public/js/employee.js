document.addEventListener("DOMContentLoaded", () => {
    fetch("/api/check-auth")
        .then(r => r.json())
        .then(data => {
            if (!data.authenticated) location.href = "/";
        });

    loadEvents();
});

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function isRegistrationClosed(event) {
    return Boolean(event.is_finished) ||
        (event.registration_end && Date.parse(event.registration_end) < Date.now()) ||
        (event.event_date && Date.parse(event.event_date) < Date.now());
}

function loadEvents() {
    fetch("/api/events")
        .then(r => r.json())
        .then(events => {
            const container = document.getElementById("events");
            if (events.length === 0) {
                container.innerHTML = "<p>Нет мероприятий</p>";
                return;
            }
            container.innerHTML = events.map(event => {
                const isFull = event.max_participants && event.participants_count >= event.max_participants;
                const isRegistered = event.is_registered;
                const isClosed = isRegistrationClosed(event);

                let button = "";
                if (isRegistered && isClosed) {
                    button = `<button class="btn-full" disabled>Запись закрыта</button>`;
                } else if (isRegistered) {
                    button = `<button class="btn-leave" onclick="leaveEvent(${event.id})">Отменить запись</button>`;
                } else if (isClosed) {
                    button = `<button class="btn-full" disabled>Регистрация закрыта</button>`;
                } else if (isFull) {
                    button = `<button class="btn-full" disabled>Мест нет</button>`;
                } else if (event.options && event.options.length) {
                    button = `<a class="button-link" href="/event.html?id=${event.id}">Записаться</a>`;
                } else {
                    button = `<button class="btn-join" onclick="joinEvent(${event.id})">Записаться</button>`;
                }

                const participantLimit = event.max_participants ? escapeHtml(event.max_participants) : "без ограничения";
                return `
                    <div class="event ${isRegistered ? "registered" : ""} ${isClosed ? "event-finished" : ""}">
                        <h3>${escapeHtml(event.name)}${event.is_finished ? " — завершено" : ""}</h3>
                        <p><strong>Возможных участников:</strong> ${participantLimit}</p>
                        <div class="btn-row">
                            <a class="button-link" href="/event.html?id=${event.id}">Подробнее</a>
                            ${button}
                        </div>
                    </div>
                `;
            }).join("");
        });
}

function joinEvent(id) {
    fetch(`/api/events/${id}/join`, { method: "POST" })
        .then(r => r.json())
        .then(result => {
            if (result.error) {
                alert(result.error);
                return;
            }
            loadEvents();
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
            loadEvents();
        })
        .catch(() => alert("Ошибка отмены"));
}
