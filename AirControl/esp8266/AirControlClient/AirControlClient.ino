#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ArduinoOTA.h>
#include <ArduinoJson.h>

// WiFi
const char *WIFI_SSID = "NOGLAK_2.4";
const char *WIFI_PASS = "0826165992";

// API
const char *API_BASE = "http://your-server:4000";
const char *DEVICE_CODE = "air-light-main";
const char *DEVICE_TOKEN = "change-this-device-token";
const char *OTA_HOSTNAME = "SMART_AIR";
const char *OTA_PASSWORD = "";

// Pins (adjust to your wiring)
const int LIGHT1_PIN = D1;
const int LIGHT2_PIN = D2;
const int LIGHT3_PIN = D5;
const int AIR_PIN = D6;

// Relay logic
const bool ACTIVE_HIGH = true;

unsigned long lastPollMs = 0;
const unsigned long POLL_INTERVAL_MS = 5000;

bool light1 = false;
bool light2 = false;
bool light3 = false;
int airOnMinutes = 0;
int airCycleMinutes = 10;
unsigned long airCycleStartMs = 0;

void setRelay(int pin, bool on) {
  if (ACTIVE_HIGH) {
    digitalWrite(pin, on ? HIGH : LOW);
  } else {
    digitalWrite(pin, on ? LOW : HIGH);
  }
}

void applyAirCycle() {
  if (airCycleMinutes <= 0) {
    setRelay(AIR_PIN, false);
    return;
  }

  if (airOnMinutes <= 0) {
    setRelay(AIR_PIN, false);
    return;
  }

  if (airOnMinutes >= airCycleMinutes) {
    setRelay(AIR_PIN, true);
    return;
  }

  unsigned long cycleMs = (unsigned long)airCycleMinutes * 60000UL;
  unsigned long onMs = (unsigned long)airOnMinutes * 60000UL;
  unsigned long elapsed = (millis() - airCycleStartMs) % cycleMs;
  setRelay(AIR_PIN, elapsed < onMs);
}

void applyOutputs() {
  setRelay(LIGHT1_PIN, light1);
  setRelay(LIGHT2_PIN, light2);
  setRelay(LIGHT3_PIN, light3);
  applyAirCycle();
}

void setAirSchedule(int onMinutes, int cycleMinutes) {
  bool changed = false;
  if (onMinutes != airOnMinutes) {
    airOnMinutes = onMinutes;
    changed = true;
  }
  if (cycleMinutes != airCycleMinutes) {
    airCycleMinutes = cycleMinutes;
    changed = true;
  }
  if (changed) {
    airCycleStartMs = millis();
  }
}

bool fetchState() {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClient client;
  HTTPClient http;
  String url = String(API_BASE) + "/api/devices/" + DEVICE_CODE + "/state";
  http.begin(client, url);
  http.addHeader("x-device-token", DEVICE_TOKEN);

  int httpCode = http.GET();
  if (httpCode != HTTP_CODE_OK) {
    http.end();
    return false;
  }

  String payload = http.getString();
  http.end();

  StaticJsonDocument<1024> doc;
  DeserializationError err = deserializeJson(doc, payload);
  if (err) return false;

  JsonObject state = doc["state"];
  JsonObject config = doc["config"];

  light1 = state["light1"] | false;
  light2 = state["light2"] | false;
  light3 = state["light3"] | false;
  int onMinutes = state["airOnMinutes"] | 0;
  int cycleMinutes = config["airCycleMinutes"] | 10;

  setAirSchedule(onMinutes, cycleMinutes);
  return true;
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
}

void setup() {
  pinMode(LIGHT1_PIN, OUTPUT);
  pinMode(LIGHT2_PIN, OUTPUT);
  pinMode(LIGHT3_PIN, OUTPUT);
  pinMode(AIR_PIN, OUTPUT);

  setRelay(LIGHT1_PIN, false);
  setRelay(LIGHT2_PIN, false);
  setRelay(LIGHT3_PIN, false);
  setRelay(AIR_PIN, false);

  connectWiFi();

  ArduinoOTA.setHostname(OTA_HOSTNAME);
  if (strlen(OTA_PASSWORD) > 0) {
    ArduinoOTA.setPassword(OTA_PASSWORD);
  }
  ArduinoOTA.begin();

  fetchState();
  applyOutputs();
  lastPollMs = millis();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  ArduinoOTA.handle();

  unsigned long now = millis();
  if (now - lastPollMs >= POLL_INTERVAL_MS) {
    if (fetchState()) {
      applyOutputs();
    }
    lastPollMs = now;
  }

  applyAirCycle();
  delay(100);
}
