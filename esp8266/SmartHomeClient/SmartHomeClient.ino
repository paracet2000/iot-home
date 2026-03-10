#include <ArduinoOTA.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WebServer.h>
#include <ESP8266WiFi.h>
#include <WiFiClientSecureBearSSL.h>
#include <arduino-timer.h>

const char* WIFI_SSID = "NOGLAK_2.4";
const char* WIFI_PASS = "0826165992";
const char* OTA_HOSTNAME = "HOME_LIGHT_CONTROL";
const char* OTA_PASSWORD = "";
const char* AP_PASSWORD = "12345678";

const char* DEVICE_ID = "esp8266-001";
const char* API_BASE_URL = "https://your-app.onrender.com";
const bool RELAY_ACTIVE_LOW = true;
const unsigned long API_POLL_INTERVAL_MS = 2000;

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
auto timers[6] = {
  timer_create_default(), timer_create_default(), timer_create_default(),
  timer_create_default(), timer_create_default(), timer_create_default()
};

uint8_t durationMinutes[5] = {0, 0, 0, 0, 0};   // duration byte1..byte5
bool timerState[5] = {false, false, false, false, false};  // per-pin timer running
uint8_t lastRawState[6] = {255, 255, 255, 255, 255, 255}; // เอาไว้เก็บค่าก่อนหน้าเพื่อเช็คว่ามีการเปลี่ยนแปลงหรือไม่

void writePin(uint8_t index, bool on) {
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(RELAY_PINS[index], on ? LOW : HIGH);
  } else {
    digitalWrite(RELAY_PINS[index], on ? HIGH : LOW);
  }
}


String buildApiUrl(const String& path) {
  String base = String(API_BASE_URL);
  while (base.endsWith("/")) base.remove(base.length() - 1);
  return base + path;
}

bool fetchRawState(uint8_t outBytes[6]) {
  // declare
  String url = buildApiUrl(String("/api/devices/") + DEVICE_ID + "/state/raw");
  HTTPClient http;

  // by using secure http
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

  // by using insecure http
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
    String("/api/devices/") + DEVICE_ID + "/pins/" + String(RELAY_PINS[pinIndex]) + "/expire"
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

  timerState[pinIndex] = false; // set back to idle state
  durationMinutes[pinIndex] = 0; // reset duration to 0 to reflect expired state
  writePin(pinIndex, false); // exactly aim of this function: turn off the pin when duration expires
  timers[pinIndex+1].stop();
  postPinExpired(pinIndex); // notify backend that the pin has expired  
  return false;

}

void applyRawState(const uint8_t raw[6]) {
  if (memcmp(lastRawState, raw, 6) == 0) return; // เหมือนเดิม ไม่ต้องทำอะไร
  for (uint8_t i = 0; i < 6; i++) lastRawState[i] = raw[i]; // อัปเดตสถานะล่าสุด

  uint8_t byte0 = raw[0];
  //
  //avoid to use timers[0] since it's used for polling, so timers[1..5] are for pins 0..4
  //
  for (uint8_t i = 0; i < 5; i++) {
    bool targetOn = (byte0 & (1 << i)) != 0; // bit0..bit4 = on/off
    uint8_t incomingDuration = raw[i + 1];

    if (!targetOn) {
 
      durationMinutes[i] = 0;
      timerState[i] = false;
      writePin(i, false);
      timers[i+1].stop();
      continue;
    }

   
    durationMinutes[i] = incomingDuration;
    writePin(i, true);

    if (incomingDuration == 0) {
      timerState[i] = false;
      timers[i+1].stop();
      continue;
    }

    // Timer already running: do nothing to avoid duplicate scheduling.
    if (!timerState[i]) {
      timers[i+1].in(durationMinutes[i] * 60UL * 1000UL, [i](void*) { return handlePinExpired(i); });
    }
  }
}

bool pollTimerCallback(void*) {
  timer0.in(API_POLL_INTERVAL_MS, pollTimerCallback);
  if (WiFi.status() != WL_CONNECTED) return false;

  uint8_t raw[6] = {0, 0, 0, 0, 0, 0};
  if (fetchRawState(raw)) {
    applyRawState(raw);
  }
  return false;
}


String renderPage() {
  String html;
  html.reserve(3600);

  return html;
}

void handleRoot() {
  server.send(200, "text/html", renderPage());
}


void handleNotFound() {
  server.send(404, "text/plain", "Not Found");
}

void connectWifi() {
  WiFi.mode(WIFI_AP_STA);
  String apSsid = String(OTA_HOSTNAME) + "_AP";
  bool apOk = WiFi.softAP(apSsid.c_str(), AP_PASSWORD);
  Serial.print("AP ready ");
  Serial.print(apSsid);
  Serial.print(": ");
  Serial.println(apOk ? "YES" : "NO");
  Serial.print("AP IP: ");
  Serial.println(WiFi.softAPIP());

  WiFi.begin(WIFI_SSID, WIFI_PASS);
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
  ArduinoOTA.setHostname(OTA_HOSTNAME);
  if (String(OTA_PASSWORD).length() > 0) {
    ArduinoOTA.setPassword(OTA_PASSWORD);
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
  for (auto& t : timers) t.tick(); // ถูกหรือเปล่านี่
}
