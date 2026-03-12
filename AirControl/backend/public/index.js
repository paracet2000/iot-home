const API_BASE = window.location.origin;
const DEFAULT_DEVICE_CODE = "air-light-main";
const params = new URLSearchParams(window.location.search);
const deviceCode = params.get("device") || DEFAULT_DEVICE_CODE;

const $toast = document.getElementById("toast");
const $airTotal = document.getElementById("airTotal");
const $airTotalDisplay = document.getElementById("airTotalDisplay");
const $airTotalHint = document.getElementById("airTotalHint");
const $airOnRange = document.getElementById("airOnRange");
const $airOnDisplay = document.getElementById("airOnDisplay");
const $statusUpdated = document.getElementById("statusUpdated");
const $statusBy = document.getElementById("statusBy");

let currentConfig = { airCycleMinutes: 10 };

function showToast(text, isError = false) {
  $toast.textContent = text;
  $toast.style.background = isError ? "#b53f3f" : "#1b1b1b";
  $toast.classList.add("show");
  setTimeout(() => $toast.classList.remove("show"), 1800);
}

async function fetchJson(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "include"
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function setRangeMax(total) {
  $airOnRange.max = String(total);
  $airTotalDisplay.textContent = String(total);
}

function renderState(state, config) {
  currentConfig = config || currentConfig;
  $airTotal.value = currentConfig.airCycleMinutes;
  setRangeMax(currentConfig.airCycleMinutes);

  const airOn = Number(state.airOnMinutes || 0);
  $airOnRange.value = String(airOn);
  $airOnDisplay.textContent = String(airOn);

  const rows = document.querySelectorAll(".light-row");
  rows.forEach((row) => {
    const channel = Number(row.dataset.channel);
    const value = Boolean(state[`light${channel}`]);
    const pill = row.querySelector("[data-state]");
    if (pill) {
      pill.textContent = value ? "On" : "Off";
      pill.classList.toggle("on", value);
    }
  });

  if (state.updatedAt) {
    const date = new Date(state.updatedAt);
    $statusUpdated.textContent = date.toLocaleString();
  }
  if (state.updatedBy) {
    $statusBy.textContent = state.updatedBy.username || state.updatedBy.source || "-";
  }
}

async function loadState() {
  const data = await fetchJson(`/api/devices/${encodeURIComponent(deviceCode)}/state`);
  renderState(data.state, data.config);
}

async function sendLight(channel, isOn) {
  await fetchJson(`/api/devices/${encodeURIComponent(deviceCode)}/commands`, {
    method: "POST",
    body: JSON.stringify({ type: "light", channel, state: isOn })
  });
  showToast(`Light ${channel} ${isOn ? "On" : "Off"}`);
  await loadState();
}

async function sendAir(onMinutes) {
  await fetchJson(`/api/devices/${encodeURIComponent(deviceCode)}/commands`, {
    method: "POST",
    body: JSON.stringify({ type: "air", onMinutes })
  });
  showToast(`Air on ${onMinutes} นาที`);
  await loadState();
}

async function saveTotal() {
  const value = Number($airTotal.value);
  if (!Number.isFinite(value) || value < 1) {
    showToast("Total duration ไม่ถูกต้อง", true);
    return;
  }
  await fetchJson(`/api/devices/${encodeURIComponent(deviceCode)}/config`, {
    method: "PATCH",
    body: JSON.stringify({ airCycleMinutes: value })
  });
  showToast("บันทึก Total duration แล้ว");
  await loadState();
}

function bindLightButtons() {
  const rows = document.querySelectorAll(".light-row");
  rows.forEach((row) => {
    row.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const channel = Number(row.dataset.channel);
        const isOn = btn.dataset.action === "on";
        try {
          await sendLight(channel, isOn);
        } catch (err) {
          showToast(err.message, true);
        }
      });
    });
  });
}

function bindAirControls() {
  $airOnRange.addEventListener("input", () => {
    $airOnDisplay.textContent = $airOnRange.value;
  });

  $airOnRange.addEventListener("change", async () => {
    try {
      await sendAir(Number($airOnRange.value));
    } catch (err) {
      showToast(err.message, true);
    }
  });

  document.getElementById("btnAirOff").addEventListener("click", async () => {
    $airOnRange.value = "0";
    $airOnDisplay.textContent = "0";
    await sendAir(0).catch((err) => showToast(err.message, true));
  });

  document.getElementById("btnAirFull").addEventListener("click", async () => {
    const max = Number($airOnRange.max || currentConfig.airCycleMinutes || 10);
    $airOnRange.value = String(max);
    $airOnDisplay.textContent = String(max);
    await sendAir(max).catch((err) => showToast(err.message, true));
  });

  document.getElementById("btnSaveTotal").addEventListener("click", async () => {
    await saveTotal().catch((err) => showToast(err.message, true));
  });
}

async function logout() {
  await fetchJson("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

async function init() {
  document.getElementById("btnLogout").addEventListener("click", () => {
    logout().catch((err) => showToast(err.message, true));
  });

  document.getElementById("btnRefresh").addEventListener("click", () => {
    loadState().catch((err) => showToast(err.message, true));
  });

  bindLightButtons();
  bindAirControls();

  try {
    await loadState();
  } catch (err) {
    showToast(err.message, true);
  }
}

init();
