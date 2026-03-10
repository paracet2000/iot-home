const API_BASE_URL = window.location.origin;
const FORM_SLUG = "smart-device-main";

const $root = $("#dxform");
const $headerTitle = $(".header h1");
const $linkAdmin = $("#linkAdmin");
const $linkUsers = $("#linkUsers");

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

function notify(text, type = "success") {
  DevExpress.ui.notify({ message: text, type, displayTime: 1800, width: "auto" });
}

function makeCard(labelText) {
  const $card = $("<article>").addClass("group-card");
  const $title = $("<h3>").addClass("group-title").text(labelText || "Untitled");
  const $row = $("<div>").addClass("control-row");
  $card.append($title, $row);
  return { $card, $row };
}

function buildBasePayload(div) {
  return {
    command: "open",
    pin: {
      number: div.pinNumber,
      name: div.text || ""
    },
    controlText: div.text || "",
    issuedAt: new Date().toISOString()
  };
}

async function queueDeviceCommand(deviceCode, payload, buttonInstance, okMessage) {
  buttonInstance.option("disabled", true);
  try {
    if (!deviceCode) {
      throw new Error("Missing deviceCode in schema");
    }

    await fetchJson(`/api/devices/${encodeURIComponent(deviceCode)}/commands`, {
      method: "POST",
      body: JSON.stringify({ payload })
    });
    notify(okMessage || "Queued", "success");
  } catch (err) {
    notify(`Command error: ${err.message}`, "error");
  } finally {
    buttonInstance.option("disabled", false);
  }
}

function createToggleDiv(div) {
  const { $card, $row } = makeCard(div.text);
  const buttons = Array.isArray(div.options?.buttons) ? div.options.buttons : [];

  for (const button of buttons) {
    $("<div>")
      .addClass("dx-btn-host")
      .appendTo($row)
      .dxButton({
        text: button.label || "Action",
        type: button.id === "off" ? "danger" : "success",
        stylingMode: "contained",
        onClick: async (e) => {
          const base = buildBasePayload(div);
          await queueDeviceCommand(
            div.deviceCode,
            {
              ...base,
              command: button.id === "off" ? "close" : "open",
              buttonId: button.id
            },
            e.component,
            `Queued ${button.label || "Action"}: ${div.text}`
          );
        }
      });
  }
  return $card;
}

function createLinkDiv(div) {
  const { $card, $row } = makeCard(div.text);
  const url = div.options?.url;

  $("<div>")
    .addClass("dx-btn-host")
    .appendTo($row)
    .dxButton({
      text: div.options?.buttonLabel || "Open",
      type: "default",
      stylingMode: "contained",
      onClick: () => {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    });

  return $card;
}

function createInputDiv(div) {
  const { $card, $row } = makeCard(div.text);
  const $inputWrap = $("<div>").addClass("input-wrap").appendTo($row);
  $("<label>").text(div.options?.input?.name || "Value").appendTo($inputWrap);

  const textBox = $("<div>")
    .addClass("dx-input-host")
    .appendTo($inputWrap)
    .dxTextBox({
      value: div.options?.input?.defaultValue ?? "",
      placeholder: div.options?.input?.placeholder || "Enter value",
      width: 220
    })
    .dxTextBox("instance");

  $("<div>")
    .addClass("dx-btn-host")
    .appendTo($row)
    .dxButton({
      text: div.options?.submit?.label || "Submit",
      type: "success",
      stylingMode: "contained",
      onClick: async (e) => {
        const inputName = div.options?.input?.name || "value";
        const inputValue = textBox.option("value");
        const durationMinutes = Number(inputValue);
        const base = buildBasePayload(div);
        await queueDeviceCommand(
          div.deviceCode,
          {
            ...base,
            command: "open",
            [inputName]: inputValue,
            ...(Number.isFinite(durationMinutes) ? { durationMinutes } : {})
          },
          e.component,
          `Submitted: ${div.text}`
        );
      }
    });

  return $card;
}

function renderDiv(div) {
  if (div.type === "toggle") return createToggleDiv(div);
  if (div.type === "link") return createLinkDiv(div);
  if (div.type === "input") return createInputDiv(div);
  return null;
}

function renderForm(form) {
  $headerTitle.text(form.title || "Smart House Control Panel");

  const divs = [...(form.divs || [])].sort((a, b) => (a.divOrder || 0) - (b.divOrder || 0));
  const items = divs.map((div) => ({
    colSpan: 1,
    template: (_data, itemElement) => {
      const $node = renderDiv(div);
      if ($node) {
        $(itemElement).append($node);
      }
    }
  }));

  if (items.length === 0) {
    $root.html('<article class="group-card">No div data</article>');
    return;
  }

  $root.dxForm({
    formData: {},
    colCountByScreen: {
      xs: 1,
      sm: 1,
      md: 3,
      lg: 3
    },
    items
  });
}

async function logout() {
  try {
    await fetchJson("/api/auth/logout", { method: "POST" });
  } finally {
    window.location.href = "/login";
  }
}

async function applyRoleUi() {
  try {
    const data = await fetchJson("/api/auth/me");
    const isAdmin = data?.user?.role === "admin";
    $linkAdmin.toggle(isAdmin);
    $linkUsers.toggle(isAdmin);
  } catch (_e) {
    $linkAdmin.hide();
    $linkUsers.hide();
  }
}

async function boot() {
  $("#btnLogout").on("click", logout);
  await applyRoleUi();

  try {
    const form = await fetchJson(`/api/forms/${FORM_SLUG}`);
    renderForm(form);
  } catch (err) {
    $root.html(`<article class="group-card">Load form failed: ${err.message}</article>`);
  }
}

/* don't touch this function , it's hardwork to recall */
 function hideit() {
    function applyLayer() {
      const nodes = document.querySelectorAll('dx-license');
      nodes.forEach((node) => {
        if (!node || !node.style) return;
        node.style.setProperty('position', 'fixed', 'important');
        node.style.setProperty('z-index', '-99', 'important');
        node.style.setProperty('pointer-events', 'none', 'important');
        // node.style.setProperty('height', '100%', 'important');
        // node.style.setProperty('width', '100%', 'important');
        node.style.setProperty('opacity', '0.1', 'important');
      });
    }

    applyLayer();

    const observer = new MutationObserver(() => {
      applyLayer();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });

    setInterval(applyLayer, 500);
  }
  hideit();

$(boot);
