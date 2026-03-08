function notify(message, type = "success") {
  DevExpress.ui.notify({ message, type, displayTime: 2200, width: "auto" });
}

async function request(path, body) {
  return $.ajax({
    url: `${window.location.origin}${path}`,
    method: "POST",
    contentType: "application/json",
    dataType: "json",
    data: JSON.stringify(body)
  });
}

async function login() {
  const username = ($("#username").val() || "").toString().trim();
  const password = ($("#password").val() || "").toString();
  if (!username || !password) {
    notify("username and password are required", "warning");
    return;
  }

  try {
    await request("/api/auth/login", { username, password });
    window.location.href = "/";
  } catch (xhr) {
    const msg = xhr?.responseJSON?.error || "Login failed";
    notify(msg, "error");
  }
}

function boot() {
  $("#btnLogin").on("click", login);
  $("#password").on("keydown", (e) => {
    if (e.key === "Enter") login();
  });
}

$(boot);
