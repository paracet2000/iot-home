# AirControl

โปรเจ็กต์แยกสำหรับ Smart Air + Light Control

## โครงสร้าง
- `backend/` Node/Express API + Frontend
- `esp8266/` โค้ด PlatformIO สำหรับ ESP8266

## Backend setup
1. สร้างฐานข้อมูลใน Neon แล้วตั้งค่า `.env`
2. รันคำสั่ง
   - `npm install`
   - `npm run seed` (สร้างตาราง)
   - `npm run dev`
3. เปิดเว็บ `http://<host>:4000/login`

## Device
แก้ค่าใน `esp8266/AirControlClient/AirControlClient.ino`
- `WIFI_SSID`, `WIFI_PASS`
- `API_BASE`, `DEVICE_CODE`, `DEVICE_TOKEN`
