const API_BASE = window.location.origin;
const $hint = document.getElementById("hint");

async function fetchJson(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "include"
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

async function login(isRegister = false) {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  if (!username || !password) {
    $hint.textContent = "กรอก username และ password";
    return;
  }

  const path = isRegister ? "/api/auth/register-first" : "/api/auth/login";
  await fetchJson(path, {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  window.location.href = "/";
}

function bind() {
  document.getElementById("btnLogin").addEventListener("click", () => {
    $hint.textContent = "";
    login(false).catch((err) => {
      $hint.textContent = err.message;
    });
  });

  document.getElementById("btnRegister").addEventListener("click", () => {
    $hint.textContent = "";
    login(true).catch((err) => {
      $hint.textContent = err.message;
    });
  });
}

bind();
