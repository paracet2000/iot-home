#include <ArduinoOTA.h>
#include <EEPROM.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WebServer.h>
#include <ESP8266WiFi.h>
#include <WiFiClientSecureBearSSL.h>
#include <arduino-timer.h>

const char* DEFAULT_WIFI_SSID = "NOGLAK_2.4";
const char* DEFAULT_WIFI_PASS = "0826165992";
const char* DEFAULT_OTA_HOSTNAME = "HOME_LIGHT_CONTROL";
const char* DEFAULT_OTA_PASSWORD = "";
const char* DEFAULT_AP_PASSWORD = "12345678";
const char* DEFAULT_DEVICE_ID = "esp8266-001";
const char* DEFAULT_API_BASE_URL = "https://your-app.onrender.com";

const bool RELAY_ACTIVE_LOW = true;
const unsigned long API_POLL_INTERVAL_MS = 2000;
const bool USE_STATIC_IP = true;
IPAddress STATIC_IP(192, 168, 1, 200);
IPAddress STATIC_GATEWAY(192, 168, 1, 1);
IPAddress STATIC_SUBNET(255, 255, 255, 0);
IPAddress STATIC_DNS1(8, 8, 8, 8);
IPAddress STATIC_DNS2(1, 1, 1, 1);

// D1,D2,D5,D6,D7 => GPIO 5,4,14,12,13
const uint8_t RELAY_PINS[5] = {5, 4, 14, 12, 13};
const char* RELAY_NAMES[5] = {
  "D1 (GPIO5) - Unused",
  "D2 (GPIO4) - Kettle",
  "D5 (GPIO14) - Kitchen Light",
  "D6 (GPIO12) - Dining Light",
  "D7 (GPIO13) - Bathroom Light"
};

ESP8266WebServer server(80);
using TimerType = decltype(timer_create_default());
TimerType timers[6] = {
  timer_create_default(), timer_create_default(), timer_create_default(),
  timer_create_default(), timer_create_default(), timer_create_default()
};
TimerType localTimer = timer_create_default();

uint8_t durationMinutes[5] = {0, 0, 0, 0, 0};   // duration byte1..byte5
bool timerState[5] = {false, false, false, false, false};  // per-pin timer running
uint8_t lastRawState[6] = {255, 255, 255, 255, 255, 255};
bool pinOn[5] = {false, false, false, false, false};

struct DeviceConfig {
  uint32_t magic;
  char wifiSsid[33];
  char wifiPass[33];
  char otaHostname[33];
  char otaPassword[33];
  char apPassword[33];
  char deviceId[33];
  char apiBaseUrl[121];
};

const uint32_t CONFIG_MAGIC = 0x53484D32; // SHM2
const int EEPROM_SIZE = 1024;
DeviceConfig config;

struct PinCtx {
  uint8_t index;
};

PinCtx pinCtx[5] = {{0}, {1}, {2}, {3}, {4}};

void setDefaultConfig() {
  memset(&config, 0, sizeof(config));
  config.magic = CONFIG_MAGIC;
  strncpy(config.wifiSsid, DEFAULT_WIFI_SSID, sizeof(config.wifiSsid) - 1);
  strncpy(config.wifiPass, DEFAULT_WIFI_PASS, sizeof(config.wifiPass) - 1);
  strncpy(config.otaHostname, DEFAULT_OTA_HOSTNAME, sizeof(config.otaHostname) - 1);
  strncpy(config.otaPassword, DEFAULT_OTA_PASSWORD, sizeof(config.otaPassword) - 1);
  strncpy(config.apPassword, DEFAULT_AP_PASSWORD, sizeof(config.apPassword) - 1);
  strncpy(config.deviceId, DEFAULT_DEVICE_ID, sizeof(config.deviceId) - 1);
  strncpy(config.apiBaseUrl, DEFAULT_API_BASE_URL, sizeof(config.apiBaseUrl) - 1);
}

void loadConfig() {
  EEPROM.begin(EEPROM_SIZE);
  EEPROM.get(0, config);
  if (config.magic != CONFIG_MAGIC) {
    setDefaultConfig();
    EEPROM.put(0, config);
    EEPROM.commit();
  }
}

void saveConfig() {
  config.magic = CONFIG_MAGIC;
  EEPROM.put(0, config);
  EEPROM.commit();
}

String htmlEscape(const String& input) {
  String out;
  out.reserve(input.length() + 16);
  for (size_t i = 0; i < input.length(); i++) {
    char c = input[i];
    if (c == '&') out += "&amp;";
    else if (c == '<') out += "&lt;";
    else if (c == '>') out += "&gt;";
    else if (c == '"') out += "&quot;";
    else out += c;
  }
  return out;
}

const char CONFIG_PAGE_TEMPLATE[] PROGMEM =
  "<!doctype html><html><head><meta charset='utf-8'>"
  "<meta name='viewport' content='width=device-width,initial-scale=1'>"
  "<title>Config</title>"
  "<style>"
  "body{font-family:Arial,sans-serif;background:#eef4f4;margin:0;padding:18px;}"
  ".card{max-width:720px;margin:0 auto;background:#fff;border-radius:14px;padding:18px;"
  "box-shadow:0 8px 24px rgba(0,0,0,.08);} h1{margin:0 0 10px;color:#0d5f57;}"
  "label{display:block;margin:10px 0 6px;color:#2a2a2a;}"
  "input{width:100%;padding:10px;border:1px solid #bbb;border-radius:8px;box-sizing:border-box;}"
  ".btn{margin-top:12px;border:none;border-radius:8px;padding:10px 14px;cursor:pointer;"
  "font-weight:700;color:#fff;background:#0a9f6f;} .meta{color:#666;font-size:13px;}"
  ".msg{color:#0d5f57;font-weight:700;}"
  "</style></head><body><div class='card'>"
  "<h1>Device Config</h1>"
  "{{MSG_BLOCK}}"
  "<form method='post' action='/config'>"
  "<label>WiFi SSID</label><input name='wifiSsid' value='{{WIFI_SSID}}'>"
  "<label>WiFi Password</label><input name='wifiPass' value='{{WIFI_PASS}}'>"
  "<label>OTA Hostname</label><input name='otaHostname' value='{{OTA_HOST}}'>"
  "<label>OTA Password</label><input name='otaPassword' value='{{OTA_PASS}}'>"
  "<label>AP Password</label><input name='apPassword' value='{{AP_PASS}}'>"
  "<label>Device ID</label><input name='deviceId' value='{{DEVICE_ID}}'>"
  "<label>API Base URL</label><input name='apiBaseUrl' value='{{API_BASE}}'>"
  "<button class='btn' type='submit'>Save</button>"
  "</form>"
  "<p class='meta'>Reboot after save to apply WiFi/OTA changes.</p>"
  "</div></body></html>";

String renderConfigPageTemplate(const String& message) {
  String html = FPSTR(CONFIG_PAGE_TEMPLATE);
  String msgBlock = "";
  if (message.length() > 0) {
    msgBlock = "<p class='msg'>" + htmlEscape(message) + "</p>";
  }
  html.replace("{{MSG_BLOCK}}", msgBlock);
  html.replace("{{WIFI_SSID}}", htmlEscape(config.wifiSsid));
  html.replace("{{WIFI_PASS}}", htmlEscape(config.wifiPass));
  html.replace("{{OTA_HOST}}", htmlEscape(config.otaHostname));
  html.replace("{{OTA_PASS}}", htmlEscape(config.otaPassword));
  html.replace("{{AP_PASS}}", htmlEscape(config.apPassword));
  html.replace("{{DEVICE_ID}}", htmlEscape(config.deviceId));
  html.replace("{{API_BASE}}", htmlEscape(config.apiBaseUrl));
  return html;
}

void writePin(uint8_t index, bool on) {
  pinOn[index] = on;
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(RELAY_PINS[index], on ? LOW : HIGH);
  } else {
    digitalWrite(RELAY_PINS[index], on ? HIGH : LOW);
  }
}

int pinIndexFromNumber(int pinNumber) {
  for (int i = 0; i < 5; i++) {
    if (RELAY_PINS[i] == pinNumber) return i;
  }
  return -1;
}

uint8_t buildByte0() {
  uint8_t state = 0;
  for (uint8_t i = 0; i < 5; i++) {
    if (pinOn[i]) state |= (1 << i);
  }
  return state;
}

bool postLocalState() {
  String url = buildApiUrl(String("/api/devices/") + config.deviceId + "/state");
  HTTPClient http;

  String payload = "{";
  payload += "\"byte0\":" + String(buildByte0());
  payload += ",\"durationBytes\":{";
  payload += "\"byte1\":" + String(durationMinutes[0]) + ",";
  payload += "\"byte2\":" + String(durationMinutes[1]) + ",";
  payload += "\"byte3\":" + String(durationMinutes[2]) + ",";
  payload += "\"byte4\":" + String(durationMinutes[3]) + ",";
  payload += "\"byte5\":" + String(durationMinutes[4]);
  payload += "}}";

  if (url.startsWith("https://")) {
    std::unique_ptr<BearSSL::WiFiClientSecure> client(new BearSSL::WiFiClientSecure);
    client->setInsecure();
    if (!http.begin(*client, url)) return false;
    http.addHeader("Content-Type", "application/json");
    int code = http.POST(payload);
    http.end();
    return code >= 200 && code < 300;
  }

  WiFiClient client;
  if (!http.begin(client, url)) return false;
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(payload);
  http.end();
  return code >= 200 && code < 300;
}

String buildApiUrl(const String& path) {
  String base = String(config.apiBaseUrl);
  while (base.endsWith("/")) base.remove(base.length() - 1);
  return base + path;
}

bool fetchRawState(uint8_t outBytes[6]) {
  String url = buildApiUrl(String("/api/devices/") + config.deviceId + "/state/raw");
  HTTPClient http;

  if (url.startsWith("https://")) {
    std::unique_ptr<BearSSL::WiFiClientSecure> client(new BearSSL::WiFiClientSecure);
    client->setInsecure();
    if (!http.begin(*client, url)) return false;
    int code = http.GET();
    if (code != HTTP_CODE_OK) {
      http.end();
      return false;
    }
    WiFiClient* stream = http.getStreamPtr();
    int got = stream->readBytes(outBytes, 6);
    http.end();
    return got == 6;
  }

  WiFiClient client;
  if (!http.begin(client, url)) return false;
  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    http.end();
    return false;
  }
  WiFiClient* stream = http.getStreamPtr();
  int got = stream->readBytes(outBytes, 6);
  http.end();
  return got == 6;
}

void postPinExpired(uint8_t pinIndex) {
  String url = buildApiUrl(
    String("/api/devices/") + config.deviceId + "/pins/" + String(RELAY_PINS[pinIndex]) + "/expire"
  );
  HTTPClient http;

  if (url.startsWith("https://")) {
    std::unique_ptr<BearSSL::WiFiClientSecure> client(new BearSSL::WiFiClientSecure);
    client->setInsecure();
    if (!http.begin(*client, url)) return;
    http.addHeader("Content-Type", "application/json");
    int code = http.POST("{}");
    http.end();
    Serial.printf("Expire pin %u -> HTTP %d\n", RELAY_PINS[pinIndex], code);
    return;
  }

  WiFiClient client;
  if (!http.begin(client, url)) return;
  http.addHeader("Content-Type", "application/json");
  int code = http.POST("{}");
  http.end();
  Serial.printf("Expire pin %u -> HTTP %d\n", RELAY_PINS[pinIndex], code);
}

bool handlePinExpired(uint8_t pinIndex) {
  timerState[pinIndex] = false;
  durationMinutes[pinIndex] = 0;
  writePin(pinIndex, false);
  timers[pinIndex + 1].cancel();
  postPinExpired(pinIndex);
  return false;
}

bool handleLocalKettleExpired(void*) {
  const uint8_t idx = 1; // D2
  writePin(idx, false);
  durationMinutes[idx] = 0;
  timerState[idx] = false;
  timers[idx + 1].cancel();
  postPinExpired(idx);
  return false;
}

void applyRawState(const uint8_t raw[6]) {
  if (memcmp(lastRawState, raw, 6) == 0) return;
  for (uint8_t i = 0; i < 6; i++) lastRawState[i] = raw[i];

  uint8_t byte0 = raw[0];
  for (uint8_t i = 0; i < 5; i++) {
    bool targetOn = (byte0 & (1 << i)) != 0;
    uint8_t incomingDuration = raw[i + 1];

    if (!targetOn) {
      durationMinutes[i] = 0;
      timerState[i] = false;
      writePin(i, false);
      timers[i + 1].cancel();
      continue;
    }

    durationMinutes[i] = incomingDuration;
    writePin(i, true);

    if (incomingDuration == 0) {
      timerState[i] = false;
      timers[i + 1].cancel();
      continue;
    }

    if (!timerState[i]) {
      timerState[i] = true;
      timers[i + 1].in(durationMinutes[i] * 60UL * 1000UL, [](void* ctx) {
        PinCtx* c = (PinCtx*)ctx;
        return handlePinExpired(c->index);
      }, &pinCtx[i]);
    }
  }
}

bool pollTimerCallback(void*) {
  timers[0].in(API_POLL_INTERVAL_MS, pollTimerCallback);
  if (WiFi.status() != WL_CONNECTED) return false;

  uint8_t raw[6] = {0, 0, 0, 0, 0, 0};
  if (fetchRawState(raw)) {
    applyRawState(raw);
  }
  return false;
}

const char ROOT_PAGE_TEMPLATE[] PROGMEM =
  "<!doctype html><html><head><meta charset='utf-8'>"
  "<meta name='viewport' content='width=device-width,initial-scale=1'>"
  "<title>CLASSIC HOUSE CONTROL</title>"
  "<style>"
  "body{font-family:Arial,sans-serif;background:#eef4f4;margin:0;padding:18px;}"
  ".card{max-width:720px;margin:0 auto;background:#fff;border-radius:14px;padding:18px;"
  "box-shadow:0 8px 24px rgba(0,0,0,.08);}"
  ".rows{display:flex;flex-direction:column;gap:10px;}"
  ".topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;}"
  ".gear-link{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;"
  "border-radius:10px;background:#f0f3f5;border:1px solid #d6dde2;text-decoration:none;}"
  ".gear-link svg{width:18px;height:18px;fill:#0d5f57;}"
  ".row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}"
  ".row-label{font-weight:700;color:#1b1b1b;}"
  ".row-actions{display:flex;gap:8px;flex-wrap:wrap;}"
  "button{border:none;border-radius:7px;padding:7px 10px;font-weight:700;cursor:pointer;width:110px;}"
  ".btn-on{background:#0a9f6f;color:#fff;}"
  ".btn-off{background:#e0e0e0;color:#222;}"
  ".btn-warn{background:#ffb74d;color:#1b1b1b;}"
  "button:disabled{opacity:.55;cursor:not-allowed;}"
  ".meta{color:#666;font-size:13px;}"
  "@media(max-width:720px){button{width:100%;}.row{align-items:stretch;}}"
  "</style></head><body><div class='card'>"
  "<div class='topbar'>"
  "<h2>CLASSIC HOUSE CONTROL</h2>"
  "<a class='gear-link' href='/config' aria-label='Config'>"
  "<svg viewBox='0 0 24 24' role='img' aria-hidden='true'>"
  "<path d='M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.38 7.38 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.4.31.6.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.23 1.12-.54 1.63-.94l2.39.96c.23.09.48 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z'/>"
  "</svg></a></div>"
  "<h3>Local Control (WiFi)</h3>"
  "<div class='rows'>"
  "<div class='row'><div class='row-label'>Dining Light (D6)</div><div class='row-actions'>"
  "<form method='post' action='/local/toggle'><input type='hidden' name='pin' value='12'><input type='hidden' name='state' value='1'>"
  "<button class='btn-on' type='submit' {{D6_ON_DISABLED}}>ON</button></form>"
  "<form method='post' action='/local/toggle'><input type='hidden' name='pin' value='12'><input type='hidden' name='state' value='0'>"
  "<button class='btn-off' type='submit' {{D6_OFF_DISABLED}}>OFF</button></form>"
  "</div></div>"
  "<div class='row'><div class='row-label'>Kitchen Light (D5)</div><div class='row-actions'>"
  "<form method='post' action='/local/toggle'><input type='hidden' name='pin' value='14'><input type='hidden' name='state' value='1'>"
  "<button class='btn-on' type='submit' {{D5_ON_DISABLED}}>ON</button></form>"
  "<form method='post' action='/local/toggle'><input type='hidden' name='pin' value='14'><input type='hidden' name='state' value='0'>"
  "<button class='btn-off' type='submit' {{D5_OFF_DISABLED}}>OFF</button></form>"
  "</div></div>"
  "<div class='row'><div class='row-label'>Bathroom Light (D7)</div><div class='row-actions'>"
  "<form method='post' action='/local/toggle'><input type='hidden' name='pin' value='13'><input type='hidden' name='state' value='1'>"
  "<button class='btn-on' type='submit' {{D7_ON_DISABLED}}>ON</button></form>"
  "<form method='post' action='/local/toggle'><input type='hidden' name='pin' value='13'><input type='hidden' name='state' value='0'>"
  "<button class='btn-off' type='submit' {{D7_OFF_DISABLED}}>OFF</button></form>"
  "</div></div>"
  "<div class='row'><div class='row-label'>Kettle (D2) 2.30 min</div><div class='row-actions'>"
  "<form method='post' action='/local/kettle'>"
  "<button class='btn-warn' type='submit' {{D2_ON_DISABLED}}>ON</button></form>"
  "<form method='post' action='/local/toggle'><input type='hidden' name='pin' value='4'><input type='hidden' name='state' value='0'>"
  "<button class='btn-off' type='submit' {{D2_OFF_DISABLED}}>OFF</button></form>"
  "</div></div>"
  "</div><h3>Runtime</h3>"
  "<p><strong>Device ID:</strong> {{DEVICE_ID}}</p>"
  "<p><strong>API Base URL:</strong> {{API_BASE}}</p>"
  "<p><strong>Polling URL:</strong> {{POLLING_URL}}</p>"
  "<p><strong>Expire URL (example):</strong> {{EXPIRE_URL}}</p>"
  "</div></body></html>";

String renderRootPageTemplate() {
  String html = FPSTR(ROOT_PAGE_TEMPLATE);
  String d6On = pinOn[3] ? "disabled" : "";
  String d6Off = pinOn[3] ? "" : "disabled";
  String d5On = pinOn[2] ? "disabled" : "";
  String d5Off = pinOn[2] ? "" : "disabled";
  String d7On = pinOn[4] ? "disabled" : "";
  String d7Off = pinOn[4] ? "" : "disabled";
  String d2On = pinOn[1] ? "disabled" : "";
  String d2Off = pinOn[1] ? "" : "disabled";
  html.replace("{{D6_ON_DISABLED}}", d6On);
  html.replace("{{D6_OFF_DISABLED}}", d6Off);
  html.replace("{{D5_ON_DISABLED}}", d5On);
  html.replace("{{D5_OFF_DISABLED}}", d5Off);
  html.replace("{{D7_ON_DISABLED}}", d7On);
  html.replace("{{D7_OFF_DISABLED}}", d7Off);
  html.replace("{{D2_ON_DISABLED}}", d2On);
  html.replace("{{D2_OFF_DISABLED}}", d2Off);
  html.replace("{{DEVICE_ID}}", htmlEscape(config.deviceId));
  html.replace("{{API_BASE}}", htmlEscape(config.apiBaseUrl));
  html.replace("{{POLLING_URL}}", htmlEscape(buildApiUrl(String("/api/devices/") + config.deviceId + "/state/raw")));
  html.replace("{{EXPIRE_URL}}", htmlEscape(buildApiUrl(String("/api/devices/") + config.deviceId + "/pins/4/expire")));
  return html;
}

void handleRoot() {
  server.send(200, "text/html", renderRootPageTemplate());
}

void handleLocalToggle() {
  if (!server.hasArg("pin")) {
    server.send(400, "text/plain", "Missing pin");
    return;
  }

  int pinNumber = server.arg("pin").toInt();
  int idx = pinIndexFromNumber(pinNumber);
  if (idx < 0) {
    server.send(400, "text/plain", "Invalid pin");
    return;
  }

  bool nextOn = !pinOn[idx];
  if (server.hasArg("state")) {
    nextOn = server.arg("state").toInt() != 0;
  }
  durationMinutes[idx] = 0;
  timerState[idx] = false;
  timers[idx + 1].cancel();
  writePin((uint8_t)idx, nextOn);
  postLocalState();
  server.sendHeader("Location", "/");
  server.send(303);
}

void handleLocalKettle() {
  const uint8_t idx = 1; // D2
  durationMinutes[idx] = 0;
  timerState[idx] = false;
  timers[idx + 1].cancel();
  writePin(idx, true);
  postLocalState();
  localTimer.cancel();
  localTimer.in(150000, handleLocalKettleExpired);
  server.sendHeader("Location", "/");
  server.send(303);
}

void handleConfigGet() {
  server.send(200, "text/html", renderConfigPageTemplate(""));
}

void handleConfigPost() {
  if (server.hasArg("wifiSsid")) strncpy(config.wifiSsid, server.arg("wifiSsid").c_str(), sizeof(config.wifiSsid) - 1);
  if (server.hasArg("wifiPass")) strncpy(config.wifiPass, server.arg("wifiPass").c_str(), sizeof(config.wifiPass) - 1);
  if (server.hasArg("otaHostname")) strncpy(config.otaHostname, server.arg("otaHostname").c_str(), sizeof(config.otaHostname) - 1);
  if (server.hasArg("otaPassword")) strncpy(config.otaPassword, server.arg("otaPassword").c_str(), sizeof(config.otaPassword) - 1);
  if (server.hasArg("apPassword")) strncpy(config.apPassword, server.arg("apPassword").c_str(), sizeof(config.apPassword) - 1);
  if (server.hasArg("deviceId")) strncpy(config.deviceId, server.arg("deviceId").c_str(), sizeof(config.deviceId) - 1);
  if (server.hasArg("apiBaseUrl")) strncpy(config.apiBaseUrl, server.arg("apiBaseUrl").c_str(), sizeof(config.apiBaseUrl) - 1);
  saveConfig();
  server.send(200, "text/html", renderConfigPageTemplate("Saved"));
}

void handleNotFound() {
  server.send(404, "text/plain", "Not Found");
}

void connectWifi() {
  WiFi.mode(WIFI_AP_STA);
  String apSsid = String(config.otaHostname) + "_AP";
  bool apOk = WiFi.softAP(apSsid.c_str(), config.apPassword);
  Serial.print("AP ready ");
  Serial.print(apSsid);
  Serial.print(": ");
  Serial.println(apOk ? "YES" : "NO");
  Serial.print("AP IP: ");
  Serial.println(WiFi.softAPIP());

  if (USE_STATIC_IP) {
    bool cfgOk = WiFi.config(STATIC_IP, STATIC_GATEWAY, STATIC_SUBNET, STATIC_DNS1, STATIC_DNS2);
    Serial.print("Static IP config: ");
    Serial.println(cfgOk ? "OK" : "FAILED");
  }

  WiFi.begin(config.wifiSsid, config.wifiPass);
  Serial.print("WiFi connecting");
  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 15000) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi connected: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("STA timeout, keep AP mode.");
  }
}

void setupOta() {
  ArduinoOTA.setHostname(config.otaHostname);
  if (String(config.otaPassword).length() > 0) {
    ArduinoOTA.setPassword(config.otaPassword);
  }
  ArduinoOTA.onStart([]() { Serial.println("OTA start"); });
  ArduinoOTA.onEnd([]() { Serial.println("\nOTA end"); });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("OTA progress: %u%%\r", (progress * 100U) / total);
  });
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("\nOTA error[%u]\n", error);
  });
  ArduinoOTA.begin();
}

void setupWebServer() {
  server.on("/", HTTP_GET, handleRoot);
  server.on("/local/toggle", HTTP_POST, handleLocalToggle);
  server.on("/local/kettle", HTTP_POST, handleLocalKettle);
  server.on("/config", HTTP_GET, handleConfigGet);
  server.on("/config", HTTP_POST, handleConfigPost);
  server.onNotFound(handleNotFound);
  server.begin();
}

void setupPins() {
  for (uint8_t i = 0; i < 5; i++) {
    pinMode(RELAY_PINS[i], OUTPUT);
    writePin(i, false);
  }
}

void setupTimers() {
  timers[0].in(API_POLL_INTERVAL_MS, pollTimerCallback);
}

void setup() {
  Serial.begin(115200);
  delay(300);
  loadConfig();
  setupPins();
  connectWifi();
  setupOta();
  setupWebServer();
  setupTimers();
  Serial.println("Ready: open http://<device-ip>/");
}

void loop() {
  ArduinoOTA.handle();
  server.handleClient();
  for (auto& t : timers) t.tick();
  localTimer.tick();
}



