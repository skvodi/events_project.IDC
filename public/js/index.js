document.addEventListener("DOMContentLoaded", () => {
    // Если уже залогинен - редирект
    fetch("/api/check-auth")
        .then(r => r.json())
        .then(data => {
            if (data.authenticated) {
                redirectByRole(data.user.role);
            }
        });

    document.getElementById("loginForm").addEventListener("submit", e => {
        e.preventDefault();

        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);

        fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        })
        .then(r => r.json())
        .then(result => {
            if (result.success) {
                redirectByRole(result.role);
            } else {
                alert("Неверный email или пароль");
            }
        })
        .catch(() => {
            alert("Ошибка входа");
        });
    });
});

function redirectByRole(role) {
    if (role === "admin") {
        location.href = "/admin.html";
    } else if (role === "manager") {
        location.href = "/manager.html";
    } else {
        location.href = "/employee.html";
    }
}
