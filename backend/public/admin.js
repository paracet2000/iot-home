const $apiBaseUrl = $("#apiBaseUrl");
const $formSlug = $("#formSlug");
const $formTitle = $("#formTitle");
const $formDescription = $("#formDescription");
const $rows = $("#rows");
const ORDER_START = 10001;
let DEVICE_OPTIONS = [];

function notify(message, type = "success") {
  DevExpress.ui.notify({ message, type, displayTime: 2200, width: "auto" });
}

function handleHttpError(xhr, fallback) {
  if (xhr?.status === 401) {
    window.location.href = "/login";
    return "Unauthorized";
  }
  return xhr?.responseJSON?.error || fallback;
}

function getApiBaseUrl() {
  const value = ($apiBaseUrl.val() || "").toString().trim();
  return value || window.location.origin;
}

function getSlug() {
  return ($formSlug.val() || "").toString().trim();
}

function createField(label, cls, element = "input", attrs = "") {
  return `
    <div class="admin-field">
      <label>${label}</label>
      <${element} class="${cls}" ${attrs}></${element}>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function buildDeviceOptionsHtml(selectedValue = "") {
  const selected = String(selectedValue || "");
  const baseOption = `<option value="">Select device</option>`;
  const options = DEVICE_OPTIONS.map((d) => {
    const code = String(d.deviceCode || "");
    const name = String(d.deviceName || "");
    const isSelected = code === selected ? "selected" : "";
    return `<option value="${escapeHtml(code)}" ${isSelected}>${escapeHtml(code)} - ${escapeHtml(name)}</option>`;
  }).join("");
  return baseOption + options;
}

function createDeviceCodeField(selectedValue = "") {
  return `
    <div class="admin-field">
      <label>deviceCode</label>
      <select class="device-code">
        ${buildDeviceOptionsHtml(selectedValue)}
      </select>
    </div>
  `;
}

function refreshDeviceCodeSelects() {
  $rows.find(".device-code").each((_idx, el) => {
    const $el = $(el);
    const current = ($el.val() || "").toString();
    $el.html(buildDeviceOptionsHtml(current));
    if (current) $el.val(current);
  });
}

async function loadDeviceOptions() {
  try {
    const data = await $.ajax({
      url: `${getApiBaseUrl()}/api/device-registry`,
      method: "GET",
      dataType: "json"
    });
    DEVICE_OPTIONS = Array.isArray(data?.devices) ? data.devices.filter((d) => d.enabled !== false) : [];
    refreshDeviceCodeSelects();
  } catch (xhr) {
    const msg = handleHttpError(xhr, "Load devices failed");
    notify(msg, "warning");
  }
}

function renumberOrders(start = ORDER_START) {
  $rows.children(".schema-row").each((idx, el) => {
    $(el)
      .find(".div-order")
      .val(start + idx);
  });
}

function applyTypeVisibility($row) {
  const type = $row.find(".div-type").val();
  $row.find(".options-toggle").toggleClass("hidden", type !== "toggle");
  $row.find(".options-input").toggleClass("hidden", type !== "input");
  $row.find(".options-link").toggleClass("hidden", type !== "link");
}

function readRowData($row, rowNo, errors) {
  const type = ($row.find(".div-type").val() || "").toString();
  const divOrder = Number($row.find(".div-order").val());
  const deviceCode = ($row.find(".device-code").val() || "").toString().trim();
  const text = ($row.find(".div-text").val() || "").toString().trim();
  const pinText = ($row.find(".div-pin").val() || "").toString().trim();
  const pinNumber = pinText ? Number(pinText) : undefined;

  if (!Number.isFinite(divOrder)) errors.push(`Row ${rowNo}: divOrder is required`);
  if ((type === "toggle" || type === "input") && !deviceCode) {
    errors.push(`Row ${rowNo}: deviceCode is required for ${type}`);
  }
  if (!type) errors.push(`Row ${rowNo}: type is required`);

  let options = {};
  if (type === "toggle") {
    const onLabel = ($row.find(".toggle-on-label").val() || "On").toString().trim();
    const offLabel = ($row.find(".toggle-off-label").val() || "Off").toString().trim();
    options = {
      buttons: [
        { id: "on", label: onLabel },
        { id: "off", label: offLabel }
      ]
    };
  } else if (type === "input") {
    const name = ($row.find(".input-name").val() || "").toString().trim();
    const defaultValue = ($row.find(".input-default").val() || "").toString();
    const placeholder = ($row.find(".input-placeholder").val() || "").toString();
    const submitLabel = ($row.find(".input-submit-label").val() || "Submit").toString().trim();
    options = {
      input: { name: name || "value", defaultValue, placeholder },
      submit: { label: submitLabel }
    };
  } else if (type === "link") {
    const url = ($row.find(".link-url").val() || "").toString().trim();
    const buttonLabel = ($row.find(".link-label").val() || "Open").toString().trim();
    if (!url) errors.push(`Row ${rowNo}: URL is required for link`);
    options = { url, buttonLabel };
  }

  return {
    divOrder,
    deviceCode,
    text,
    type,
    ...(Number.isFinite(pinNumber) ? { pinNumber } : {}),
    options
  };
}

function makeRow(data = {}) {
  const order = data.divOrder ?? "";
  const deviceCode = data.deviceCode ?? "";
  const text = data.text ?? "";
  const pinNumber = data.pinNumber ?? "";
  const type = data.type || "toggle";
  const options = data.options || {};

  const onBtn = options.buttons?.find((x) => x.id === "on");
  const offBtn = options.buttons?.find((x) => x.id === "off");

  const $row = $(`
    <article class="admin-card schema-row">
      <div class="row-head">
        ${createField("divOrder", "div-order", "input", `type="number" value="${order}"`)}
        ${createDeviceCodeField(deviceCode)}
        ${createField("text", "div-text", "input", `value="${text}"`)}
        ${createField("pinNumber", "div-pin", "input", `type="number" value="${pinNumber}"`)}
        <div class="admin-field">
          <label>type</label>
          <select class="div-type">
            <option value="toggle" ${type === "toggle" ? "selected" : ""}>toggle</option>
            <option value="input" ${type === "input" ? "selected" : ""}>input</option>
            <option value="link" ${type === "link" ? "selected" : ""}>link</option>
          </select>
        </div>
        <div class="admin-field">
          <label>Actions</label>
          <div class="row-actions">
            <button class="move-up" type="button">Up</button>
            <button class="move-down" type="button">Down</button>
            <button class="duplicate-row" type="button">Duplicate</button>
            <button class="remove-row" type="button">Delete</button>
          </div>
        </div>
      </div>

      <div class="row-options options-toggle">
        ${createField("On Label", "toggle-on-label", "input", `value="${onBtn?.label || "On"}"`)}
        ${createField("Off Label", "toggle-off-label", "input", `value="${offBtn?.label || "Off"}"`)}
      </div>

      <div class="row-options options-input">
        ${createField("Input Name", "input-name", "input", `value="${options.input?.name || "value"}"`)}
        ${createField("Default Value", "input-default", "input", `value="${options.input?.defaultValue || ""}"`)}
        ${createField("Placeholder", "input-placeholder", "input", `value="${options.input?.placeholder || ""}"`)}
        ${createField("Submit Label", "input-submit-label", "input", `value="${options.submit?.label || "Submit"}"`)}
      </div>

      <div class="row-options options-link">
        ${createField("URL", "link-url", "input", `value="${options.url || ""}"`)}
        ${createField("Button Label", "link-label", "input", `value="${options.buttonLabel || "Open"}"`)}
      </div>
    </article>
  `);

  $row.on("change", ".div-type", () => applyTypeVisibility($row));
  $row.on("click", ".remove-row", () => {
    $row.remove();
    renumberOrders();
  });

  $row.on("click", ".duplicate-row", () => {
    const copyErrors = [];
    const rowData = readRowData($row, 1, copyErrors);
    if (copyErrors.length > 0) {
      notify(copyErrors[0], "error");
      return;
    }

    const $copy = makeRow({ ...rowData, divOrder: "" });
    $row.after($copy);
    renumberOrders();
  });

  $row.on("click", ".move-up", () => {
    const $prev = $row.prev(".schema-row");
    if ($prev.length > 0) {
      $row.insertBefore($prev);
      renumberOrders();
    }
  });

  $row.on("click", ".move-down", () => {
    const $next = $row.next(".schema-row");
    if ($next.length > 0) {
      $row.insertAfter($next);
      renumberOrders();
    }
  });

  applyTypeVisibility($row);
  return $row;
}

function collectRows() {
  const divs = [];
  const errors = [];

  $rows.children(".schema-row").each((idx, el) => {
    const rowNo = idx + 1;
    const $row = $(el);
    divs.push(readRowData($row, rowNo, errors));
  });

  return { divs, errors };
}

function fillForm(form) {
  $formTitle.val(form.title || "");
  $formDescription.val(form.description || "");
  $rows.empty();

  const divs = [...(form.divs || [])].sort((a, b) => (a.divOrder || 0) - (b.divOrder || 0));
  for (const div of divs) {
    $rows.append(makeRow(div));
  }

  if (divs.length === 0) {
    $rows.append(makeRow({ divOrder: ORDER_START }));
  }

  renumberOrders();
}

async function loadForm() {
  const slug = getSlug();
  if (!slug) {
    notify("Form slug is required", "warning");
    return;
  }

  try {
    const form = await $.ajax({
      url: `${getApiBaseUrl()}/api/forms/${slug}`,
      method: "GET",
      dataType: "json"
    });
    fillForm(form);
    notify("Loaded schema", "success");
  } catch (xhr) {
    const msg = handleHttpError(xhr, "Load failed");
    notify(msg, "error");
  }
}

async function upsertForm() {
  const slug = getSlug();
  const title = ($formTitle.val() || "").toString().trim();
  const description = ($formDescription.val() || "").toString().trim();

  if (!slug || !title) {
    notify("slug and title are required", "warning");
    return;
  }

  const { divs, errors } = collectRows();
  if (errors.length > 0) {
    notify(errors[0], "error");
    return;
  }

  try {
    await $.ajax({
      url: `${getApiBaseUrl()}/api/forms/${slug}`,
      method: "PUT",
      contentType: "application/json",
      dataType: "json",
      data: JSON.stringify({ title, description, divs })
    });
    notify("Upsert success", "success");
  } catch (xhr) {
    const msg = handleHttpError(xhr, "Upsert failed");
    notify(msg, "error");
  }
}

async function logout() {
  try {
    await $.ajax({
      url: `${window.location.origin}/api/auth/logout`,
      method: "POST"
    });
  } finally {
    window.location.href = "/login";
  }
}

async function boot() {
  await loadDeviceOptions();

  $("#btnLoad").dxButton({
    text: "Load by Slug",
    type: "normal",
    stylingMode: "contained",
    onClick: loadForm
  });

  $("#btnAddRow").dxButton({
    text: "Add Row",
    type: "default",
    stylingMode: "contained",
    onClick: () => {
      $rows.append(makeRow());
      renumberOrders();
    }
  });

  $("#btnUpsert").dxButton({
    text: "Upsert Schema",
    type: "success",
    stylingMode: "contained",
    onClick: upsertForm
  });

  $("#btnLogout").on("click", logout);
  $rows.append(makeRow({ divOrder: ORDER_START }));
}

$(boot);
