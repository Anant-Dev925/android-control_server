const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SESSIONS_DIR = path.join(__dirname, "../../sessions");

// Ensure sessions directory exists
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function getSessionFile(sessionId) {
  return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

function generateSessionId() {
  return crypto.randomBytes(16).toString("hex");
}

function createSession(name = null) {
  const sessionId = generateSessionId();
  const session = {
    id: sessionId,
    name: name || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
  };

  fs.writeFileSync(getSessionFile(sessionId), JSON.stringify(session, null, 2));
  return session;
}

function renameSession(sessionId, newName) {
  const session = getSession(sessionId);
  if (!session) {
    return null;
  }

  session.name = newName || null;
  session.updatedAt = new Date().toISOString();
  fs.writeFileSync(getSessionFile(sessionId), JSON.stringify(session, null, 2));
  return session;
}

function getSession(sessionId) {
  const filePath = getSessionFile(sessionId);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

function updateSession(sessionId, messages) {
  const session = getSession(sessionId);
  if (!session) {
    return null;
  }

  session.messages = messages;
  session.updatedAt = new Date().toISOString();
  fs.writeFileSync(getSessionFile(sessionId), JSON.stringify(session, null, 2));
  return session;
}

function addMessageToSession(sessionId, role, content, toolCalls = []) {
  const session = getSession(sessionId);
  if (!session) {
    return null;
  }

  const message = {
    role,
    content,
    toolCalls,
    timestamp: new Date().toISOString(),
  };

  session.messages.push(message);
  session.updatedAt = new Date().toISOString();
  fs.writeFileSync(getSessionFile(sessionId), JSON.stringify(session, null, 2));
  return session;
}

function clearSession(sessionId) {
  const filePath = getSessionFile(sessionId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

function getAllSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    return [];
  }

  const files = fs.readdirSync(SESSIONS_DIR);
  const sessions = [];

  for (const file of files) {
    if (file.endsWith(".json")) {
      try {
        const data = fs.readFileSync(path.join(SESSIONS_DIR, file), "utf8");
        const session = JSON.parse(data);
        // Return summary without full messages
        sessions.push({
          id: session.id,
          name: session.name,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          messageCount: session.messages.length,
          preview: session.name || (session.messages.length > 0 
            ? (session.messages[session.messages.length - 1].content?.substring(0, 50) + "...")
            : "Empty session"),
        });
      } catch (e) {
        // Skip invalid files
      }
    }
  }

  // Sort by updatedAt descending
  sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return sessions;
}

module.exports = {
  createSession,
  getSession,
  updateSession,
  addMessageToSession,
  clearSession,
  getAllSessions,
  renameSession,
};
