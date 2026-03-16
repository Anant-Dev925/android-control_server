# Android File Management Server

REST API server to control Android files from PC over Tailscale VPN.

## Quick Start

```bash
# Install dependencies
npm install

# Start server
node server.js
```

Server runs on `http://100.85.62.80:3000`

## Connection Setup

### Prerequisites
1. **Tailscale** installed on both PC and Android
2. **ADB Over Network** app installed on Android (from Play Store)

### Step-by-Step

**On Android:**
1. Open ADB Over Network app
2. Keep app running (foreground service)

**On PC:**
```bash
# Check Tailscale status
tailscale status

# Connect to Android (use Tailscale IP)
adb connect 100.125.170.26:5555

# Verify connection
adb devices
```

**Start Server:**
```bash
node server.js
```

**Test:**
```bash
curl http://localhost:3000/api/status
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Check Android connection |
| `/api/execute` | POST | Run file operations |

### Execute Actions

```json
// List files
{"action": "list", "path": "/sdcard/Download"}

// Read file
{"action": "read", "path": "/sdcard/file.txt"}

// Write file
{"action": "write", "path": "/sdcard/test.txt", "content": "Hello World"}

// Delete file
{"action": "delete", "path": "/sdcard/file.txt"}

// Create folder
{"action": "mkdir", "path": "/sdcard/newfolder"}

// Push file to Android
{"action": "push", "path": "/sdcard/", "content": "local-file.txt"}

// Pull file from Android
{"action": "pull", "path": "/sdcard/file.txt", "content": "local-path/"}
```

## Reconnect (If Connection Breaks)

```bash
adb connect 100.125.170.26:5555
adb devices
node server.js
```

## Architecture

```
[Flutter App] → [PC Server:3000] → [ADB] → [Android]
     ↑                              ↑
     └──── Tailscale VPN ──────────┘
```

---

## TODO

- [ ] Add WebSocket support for persistent connection
- [ ] Add auto-reconnect logic in server
- [ ] Add Ollama integration for AI commands
- [ ] Add authentication to API
- [ ] Add logging system
- [ ] Create Flutter app integration code
- [ ] Add support for multiple Android devices
- [ ] Add file transfer progress tracking
- [ ] Add error handling and retry logic
- [ ] Add unit tests

## Dependencies

- express: ^4.18.2
- cors: ^2.8.5

## Notes

- Works over any internet (WiFi, mobile data) via Tailscale
- Android must keep ADB Over Network app running
- Both devices must be on same Tailscale account