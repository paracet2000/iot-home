function notify(message, type = "success") {
  DevExpress.ui.notify({ message, type, displayTime: 2200, width: "auto" });
}

async function api(path, options = {}) {
  const method = options.method || "GET";
  return $.ajax({
    url: `${window.location.origin}${path}`,
    method,
    contentType: "application/json",
    dataType: "json",
    data: options.body ? JSON.stringify(options.body) : undefined
  }).catch((xhr) => {
    if (xhr?.status === 401) {
      window.location.href = "/login";
      throw new Error("Unauthorized");
    }
    const msg = xhr?.responseJSON?.error || `HTTP ${xhr?.status || 0}`;
    throw new Error(msg);
  });
}

async function loadUsers() {
  const data = await api("/api/users");
  const $tbody = $("#userRows");
  $tbody.empty();

  for (const user of data.users || []) {
    const created = user.createdAt ? new Date(user.createdAt).toLocaleString() : "-";
    const $tr = $(`
      <tr>
        <td>${user.username}</td>
        <td>${created}</td>
        <td><button class="delete-btn" data-id="${user.id}" type="button">Delete</button></td>
      </tr>
    `);
    $tbody.append($tr);
  }
}

async function createUser() {
  const username = ($("#username").val() || "").toString().trim();
  const password = ($("#password").val() || "").toString();
  if (!username || !password) {
    notify("username and password are required", "warning");
    return;
  }

  try {
    await api("/api/users", { method: "POST", body: { username, password } });
    $("#password").val("");
    notify("User created", "success");
    await loadUsers();
  } catch (err) {
    notify(err.message, "error");
  }
}

async function deleteUser(userId) {
  try {
    await api(`/api/users/${userId}`, { method: "DELETE" });
    notify("User deleted", "success");
    await loadUsers();
  } catch (err) {
    notify(err.message, "error");
  }
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } finally {
    window.location.href = "/login";
  }
}

function boot() {
  $("#btnCreate").on("click", createUser);
  $("#btnLogout").on("click", logout);
  $("#userRows").on("click", ".delete-btn", (e) => {
    const id = $(e.currentTarget).data("id");
    deleteUser(id);
  });

  loadUsers().catch((err) => notify(err.message, "error"));
}

$(boot);
