const API_BASE_URL = window.location.origin;

const $list = $("#scheduleList");
const $form = $("#scheduleForm");
const $btnSave = $("#btnSave");
const $btnReset = $("#btnReset");

const fields = {
  id: $("#scheduleId"),
  deviceId: $("#deviceId"),
  pinNumber: $("#pinNumber"),
  action: $("#action"),
  time: $("#time"),
  durationMinutes: $("#durationMinutes")
};

let isAdmin = false;
let deviceOptions = [];

const PIN_LABEL = {
  5: "D1 (GPIO5)",
  4: "D2 (GPIO4)",
  14: "D5 (GPIO14)",
  12: "D6 (GPIO12)",
  13: "D7 (GPIO13)"
};

function fetchJson(path, options = {}) {
  const method = options.method || "GET";
  const data = options.body ? JSON.parse(options.body) : undefined;
  return $.ajax({
    url: `${API_BASE_URL}${path}`,
    method,
    contentType: "application/json",
    dataType: "json",
    data: data ? JSON.stringify(data) : undefined
  }).catch((xhr) => {
    if (xhr?.status === 401) {
      window.location.href = "/login";
      throw new Error("Unauthorized");
    }
    const msg = xhr?.responseJSON?.error || `HTTP ${xhr?.status || 0}`;
    throw new Error(msg);
  });
}

function setReadonly(readonly) {
  $form.find("input,select,button").prop("disabled", readonly);
  if (readonly) {
    $btnReset.prop("disabled", true);
  }
}

function resetForm() {
  fields.id.val("");
  fields.deviceId.val(deviceOptions[0]?.deviceCode || "");
  fields.pinNumber.val("14");
  fields.action.val("open");
  fields.time.val("");
  fields.durationMinutes.val("0");
}

function toCron(timeValue) {
  if (!timeValue) return "";
  const [hh, mm] = timeValue.split(":").map((v) => Number(v));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return "";
  return `${mm} ${hh} * * *`;
}

function cronToTime(cron) {
  const parts = String(cron || "").trim().split(/\s+/);
  if (parts.length !== 5) return "";
  const [min, hour] = parts;
  if (min === "*" || hour === "*") return "";
  const hh = String(hour).padStart(2, "0");
  const mm = String(min).padStart(2, "0");
  return `${hh}:${mm}`;
}

function getPayload() {
  const cron = toCron(fields.time.val());
  return {
    name: `${fields.deviceId.val()}-${fields.pinNumber.val()}-${fields.action.val()}`,
    deviceId: fields.deviceId.val(),
    pinNumber: Number(fields.pinNumber.val()),
    action: fields.action.val(),
    durationMinutes: Number(fields.durationMinutes.val() || 0),
    cron,
    timezone: "Asia/Bangkok",
    enabled: true
  };
}

function fillForm(item) {
  fields.id.val(item._id || "");
  fields.deviceId.val(item.deviceId || "");
  fields.pinNumber.val(String(item.pinNumber || ""));
  fields.action.val(item.action || "open");
  fields.time.val(cronToTime(item.cron));
  fields.durationMinutes.val(item.durationMinutes ?? 0);
}

function renderScheduleCard(item) {
  const timeText = cronToTime(item.cron) || item.cron || "--:--";
  const pinLabel = PIN_LABEL[item.pinNumber] || item.pinNumber;
  const actionLabel = item.action === "close" ? "ปิดไฟ" : "เปิดไฟ";
  const durationText = Number(item.durationMinutes || 0) > 0 ? `${item.durationMinutes} นาที` : "-";
  const deviceBadge = item.deviceId || "-";
  const nameLabel = `${actionLabel} : ${pinLabel}`;
  const lastRun = item.lastRunAt ? new Date(item.lastRunAt).toLocaleString() : "-";

  const $card = $(`
    <article class="schedule-item">
      <div class="time-pill">${timeText} น.</div>
      <div class="schedule-main">
        <div class="device-badge">${deviceBadge}</div>
        <div class="schedule-title ${item.action === "close" ? "off" : "on"}">${nameLabel}</div>
        <div class="schedule-meta">Duration: ${durationText} | บันทึก: ${lastRun}</div>
      </div>
      <div class="schedule-actions"></div>
    </article>
  `);

  if (isAdmin) {
    const $btnEdit = $("<button type='button' class='btn-edit'>แก้</button>").on("click", () => {
      fillForm(item);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    const $btnDelete = $("<button type='button' class='btn-delete'>ลบ</button>").on("click", async () => {
      if (!confirm(`ลบรายการ ${deviceBadge} เวลา ${timeText}?`)) return;
      await fetchJson(`/api/schedules/${item._id}`, { method: "DELETE" });
      await loadSchedules();
    });
    $card.find(".schedule-actions").append($btnEdit, $btnDelete);
  } else {
    $card.find(".schedule-actions").text("-");
  }

  return $card;
}

function renderList(items) {
  $list.empty();
  if (!items || items.length === 0) {
    $list.append("<div class='muted'>ยังไม่มีตารางเวลา</div>");
    return;
  }
  for (const item of items) {
    $list.append(renderScheduleCard(item));
  }
}

async function loadDeviceOptions() {
  if (!isAdmin) return;
  try {
    const data = await fetchJson("/api/device-registry");
    deviceOptions = Array.isArray(data?.devices) ? data.devices.filter((d) => d.enabled !== false) : [];
    const optionsHtml = deviceOptions
      .map((d) => `<option value="${d.deviceCode}">${d.deviceCode} - ${d.deviceName || ""}</option>`)
      .join("");
    fields.deviceId.html(optionsHtml || `<option value="">No devices</option>`);
  } catch (_err) {
    fields.deviceId.html(`<option value="">(no access)</option>`);
  }
}

async function loadSchedules() {
  try {
    const data = await fetchJson("/api/schedules");
    renderList(data.items || []);
  } catch (err) {
    $list.html(`<div class="muted">Load failed: ${err.message}</div>`);
  }
}

async function onSave(e) {
  e.preventDefault();
  if (!isAdmin) return;

  const payload = getPayload();
  if (!payload.deviceId || !payload.cron) {
    alert("ต้องระบุ device และ เวลา");
    return;
  }

  const id = fields.id.val();
  if (id) {
    await fetchJson(`/api/schedules/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  } else {
    await fetchJson("/api/schedules", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
  resetForm();
  await loadSchedules();
}

async function applyRoleUi() {
  const data = await fetchJson("/api/auth/me");
  isAdmin = data?.user?.role === "admin";
  setReadonly(!isAdmin);
}

async function logout() {
  try {
    await fetchJson("/api/auth/logout", { method: "POST" });
  } finally {
    window.location.href = "/login";
  }
}

async function boot() {
  $("#btnLogout").on("click", logout);
  $btnReset.on("click", resetForm);
  $form.on("submit", onSave);
  await applyRoleUi();
  await loadDeviceOptions();
  resetForm();
  await loadSchedules();
}

$(boot);
