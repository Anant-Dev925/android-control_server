# Android AI Control - Project Documentation

## Overview

AI-powered Android file management app using Flutter + Node.js + Ollama, controlled over Tailscale VPN.

---

## Architecture

```
[Flutter App] → [PC Server:3000] → [Ollama qwen2.5-coder:7b] → [ADB Tools] → [Android]
       ↑                                                      ↑
       └──────────────── Tailscale VPN ──────────────────────┘
```

---

## Network Configuration

| Device  | Tailscale IP   | Port |
| ------- | -------------- | ---- |
| PC      | 100.85.62.80   | 3000 |
| Android | 100.101.120.96 | 5555 |

---

## Project Structure

```
D:\StudyMaterial\Notes\10th Semester\
├── Project/                     # Node.js Server
│   ├── server.js               # Main entry (Express + Socket.IO)
│   ├── package.json
│   ├── sessions/               # Chat histories (auto-created)
│   └── src/
│       ├── config/             # IP, ports, model config
│       ├── adb/                # ADB wrapper + dispatcher
│       ├── ollama/             # Ollama AI + tools
│       ├── session/            # Session + knowledge management
│       ├── routes/             # API routes
│       └── tools/              # PDF, DOCX, PPTX, files
│
└── Flutter\android_control\    # Flutter App
    └── lib/
        ├── core/               # Theme, constants, DI
        ├── data/               # Models, services
        └── presentation/       # UI (pages, widgets, cubits)
```

---

## Quick Start

### 1. Android Setup

- Install "ADB Over Network" app (qtcrafts)
- Keep app running (foreground service)

### 2. PC Setup

```bash
# Start Tailscale
tailscale up

# Connect ADB
adb connect 100.101.120.96:5555

# Start Ollama
ollama serve

# Start Server
cd D:\StudyMaterial\Notes\10th Semester\Project
node server.js
```

### 3. Run Flutter App

```bash
cd D:\StudyMaterial\Flutter\android_control
flutter run
```

---

## Server API Endpoints

| Endpoint             | Method         | Description          |
| -------------------- | -------------- | -------------------- |
| `/api/chat`          | POST           | Chat with AI         |
| `/api/status`        | GET            | Check connection     |
| `/api/execute`       | POST           | File operations      |
| `/api/sessions`      | GET/POST       | List/Create sessions |
| `/api/sessions/:id`  | GET/PUT/DELETE | Session CRUD         |
| `/api/knowledge/:id` | GET/DELETE     | Knowledge management |
| `/api/reconnect`     | POST           | Reconnect ADB        |
| `/health`            | GET            | Health check         |

---

## AI Commands

### Train / Learn

```bash
/train file1.txt file2.md     # Learn from files
/train /sdcard/Notes           # Learn from folder
/forget                       # Clear learned knowledge
```

### File Operations

- `read <file>` - Read .txt, .pdf, .docx, .pptx, .md, .json
- `write <file>` - Create/write files
- `delete <file>` - Delete files/folders
- `list <folder>` - List directory contents
- `mkdir <folder>` - Create directory
- `search <query>` - Search files
- `storage` - Check storage space

---

## Knowledge System

The `/train` command:

1. Reads files via ADB
2. Stores content in session knowledge base
3. Injects into every AI call context
4. Persists for the session

---

## Flutter App Features

### Theme

- Dark/Light mode toggle (AppBar)
- System default option
- Purple user bubble: light mode / dark purple (#4A3B6B) dark mode
- White text in dark mode, dark text in light mode

### Offline Mode

- Shows cached messages when disconnected
- Red connection indicators
- Disabled chat input with placeholder
- Auto-retry connection
- Local caching via SharedPreferences

### Settings Page

- Theme selection (System/Light/Dark)
- Syntax highlighting toggle
- Auto-scroll toggle
- Context limit (10/15/20/30/50 messages)
- Server/WebSocket URL display

### About Page

- App info & version
- AI model details
- Capabilities list
- Developer info

---

## Server Dependencies (npm)

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.x",
    "cors": "^2.8.5",
    "pdfkit": "^0.14.0"
  }
}
```

## Flutter Dependencies

```yaml
dependencies:
  flutter_bloc: ^8.1.6
  equatable: ^2.0.7
  get_it: ^8.0.3
  web_socket_channel: ^3.0.2
  flutter_highlight: ^0.7.0
  socket_io_client: ^3.0.2
  shared_preferences: ^2.3.0
```

---

## Configuration

### Server Config: `src/config/index.js`

```javascript
ANDROID_IP: "100.101.120.96:5555";
OLLAMA_HOST: "http://localhost:11434";
OLLAMA_MODEL: "qwen2.5-coder:7b";
PORT: 3000;
SERVER_IP: "100.85.62.80";
```

### Flutter Config: `lib/core/constants/app_constants.dart`

```dart
serverUrl: "http://100.85.62.80:3000"
wsUrl: "ws://100.85.62.80:3000"
connectionTimeout: 60s
receiveTimeout: 180s
```

---

### Completed ✅

- [x] /train and /forget commands
- [x] Settings page
- [x] About page
- [x] Dark/Light theme toggle
- [x] Offline mode with caching
- [x] Connection indicators (red when disconnected)
- [x] Local message caching
- [x] PDF, DOCX, PPTX support

### Pending

- [ ] Web Search integration
- [ ] File browser UI
- [ ] File upload/download
- [ ] SSH to Oracle VM
- [ ] Push notifications
- [ ] Voice input
- [ ] Production APK signing
- [ ] Shizuku integration

---

## Direct ADB Commands

```bash
POST http://100.85.62.80:3000/api/execute

{"action": "list", "path": "/sdcard/Download"}
{"action": "read", "path": "/sdcard/file.txt"}
{"action": "write", "path": "/sdcard/test.txt", "content": "Hello"}
{"action": "delete", "path": "/sdcard/file.txt"}
{"action": "mkdir", "path": "/sdcard/newfolder"}
```

---

## History

### 21-03-2026

- Added /train, /forget commands
- Added Settings & About pages
- Added theme toggle
- Added offline mode with caching
- Fixed dark mode bubble colors

### 20-03-2026

- Multi-step file operations fixed

### 17-03-2026

- Initial setup with Tailscale + Ollama + Flutter

---

## Notes

- Uses ADB for file operations (NOT Shizuku)
- Works over internet via Tailscale VPN
- Android must keep ADB Over Network app running
- Both devices must be on same Tailscale account
