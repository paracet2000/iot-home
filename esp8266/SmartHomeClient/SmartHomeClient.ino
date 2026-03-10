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

uint8_t durationMinutes[5] = {0, 0, 0, 0, 0};   // duration byte1..byte5
bool timerState[5] = {false, false, false, false, false};  // per-pin timer running
uint8_t lastRawState[6] = {255, 255, 255, 255, 255, 255};

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

String renderConfigPage(const String& message) {
  String html;
  html.reserve(4200);
  html += "<!doctype html><html><head><meta charset='utf-8'>";
  html += "<meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<title>Config</title>";
  html += "<style>";
  html += "body{font-family:Arial,sans-serif;background:#eef4f4;margin:0;padding:18px;}";
  html += ".card{max-width:720px;margin:0 auto;background:#fff;border-radius:14px;padding:18px;";
  html += "box-shadow:0 8px 24px rgba(0,0,0,.08);} h1{margin:0 0 10px;color:#0d5f57;}";
  html += "label{display:block;margin:10px 0 6px;color:#2a2a2a;}";
  html += "input{width:100%;padding:10px;border:1px solid #bbb;border-radius:8px;box-sizing:border-box;}";
  html += ".btn{margin-top:12px;border:none;border-radius:8px;padding:10px 14px;cursor:pointer;";
  html += "font-weight:700;color:#fff;background:#0a9f6f;} .meta{color:#666;font-size:13px;}";
  html += ".msg{color:#0d5f57;font-weight:700;}";
  html += "</style></head><body><div class='card'>";
  html += "<h1>Device Config</h1>";
  if (message.length() > 0) {
    html += "<p class='msg'>" + htmlEscape(message) + "</p>";
  }
  html += "<form method='post' action='/config'>";
  html += "<label>WiFi SSID</label>";
  html += "<input name='wifiSsid' value='" + htmlEscape(config.wifiSsid) + "'>";
  html += "<label>WiFi Password</label>";
  html += "<input name='wifiPass' value='" + htmlEscape(config.wifiPass) + "'>";
  html += "<label>OTA Hostname</label>";
  html += "<input name='otaHostname' value='" + htmlEscape(config.otaHostname) + "'>";
  html += "<label>OTA Password</label>";
  html += "<input name='otaPassword' value='" + htmlEscape(config.otaPassword) + "'>";
  html += "<label>AP Password</label>";
  html += "<input name='apPassword' value='" + htmlEscape(config.apPassword) + "'>";
  html += "<label>Device ID</label>";
  html += "<input name='deviceId' value='" + htmlEscape(config.deviceId) + "'>";
  html += "<label>API Base URL</label>";
  html += "<input name='apiBaseUrl' value='" + htmlEscape(config.apiBaseUrl) + "'>";
  html += "<button class='btn' type='submit'>Save</button>";
  html += "</form>";
  html += "<p class='meta'>Reboot after save to apply WiFi/OTA changes.</p>";
  html += "</div></body></html>";
  return html;
}

void writePin(uint8_t index, bool on) {
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(RELAY_PINS[index], on ? LOW : HIGH);
  } else {
    digitalWrite(RELAY_PINS[index], on ? HIGH : LOW);
  }
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

String renderPage() {
  String html;
  html.reserve(1600);
  html += "<!doctype html><html><head><meta charset='utf-8'>";
  html += "<meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<title>HOME_LIGHT_CONTROL</title></head><body>";
  html += "<h2>HOME_LIGHT_CONTROL</h2>";
  html += "<p>Config: <a href='/config'>/config</a></p>";
  html += "<h3>Runtime</h3>";
  html += "<p><strong>Device ID:</strong> ";
  html += htmlEscape(config.deviceId);
  html += "</p>";
  html += "<p><strong>API Base URL:</strong> ";
  html += htmlEscape(config.apiBaseUrl);
  html += "</p>";
  html += "<p><strong>Polling URL:</strong> ";
  html += htmlEscape(buildApiUrl(String("/api/devices/") + config.deviceId + "/state/raw"));
  html += "</p>";
  html += "<p><strong>Expire URL (example):</strong> ";
  html += htmlEscape(buildApiUrl(String("/api/devices/") + config.deviceId + "/pins/4/expire"));
  html += "</p>";
  html += "</body></html>";
  return html;
}

void handleRoot() {
  server.send(200, "text/html", renderPage());
}

void handleConfigGet() {
  server.send(200, "text/html", renderConfigPage(""));
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
  server.send(200, "text/html", renderConfigPage("Saved"));
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
}
