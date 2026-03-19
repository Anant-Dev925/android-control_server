const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const config = require("./src/config");
const apiRoutes = require("./src/routes/api");
const { checkConnection } = require("./src/adb");

const app = express();
const server = http.createServer(app);

// Middleware
app.use(express.json());
app.use(cors());

// Routes
app.use("/api", apiRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// WebSocket
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingInterval: config.PING_INTERVAL,
  pingTimeout: config.PING_TIMEOUT,
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.emit("connected", { clientId: socket.id });

  checkConnection().then((connected) => {
    socket.emit("status", { connected, androidIp: config.ANDROID_IP });
  });

  socket.on("ping", () => {
    socket.emit("pong", { timestamp: Date.now() });
  });

  socket.on("chat", async (data, callback) => {
    const { callOllamaWithTools, callOllama } = require("./ollama");
    const { executeAction } = require("./adb");

    try {
      const response = await callOllamaWithTools(data.message);

      let toolCalls = response.message?.tool_calls || [];
      const content = response.message?.content || "";

      if (toolCalls.length === 0 && content.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(content);
          if (parsed.name && parsed.arguments) {
            toolCalls = [{ function: parsed }];
          }
        } catch (e) {}
      }

      if (toolCalls.length > 0) {
        const toolResults = [];
        for (const toolCall of toolCalls) {
          const { name, arguments: args } = toolCall.function;
          try {
            const result = await executeAction(
              name.replace("adb_", ""),
              args.path || "",
              args.content || "",
            );
            toolResults.push({ tool: name, result });
          } catch (e) {
            toolResults.push({ tool: name, error: e.message });
          }
        }

        const isFileOperation = toolCalls.some((tc) =>
          ["adb_list", "adb_read"].includes(tc.function.name),
        );

        if (isFileOperation) {
          callback({
            response:
              "🤖 Here's what I found:\n\n" + (toolResults[0].result || "Done"),
            toolResults,
          });
          return;
        }

        const finalResponse = await callOllama(
          `User asked: "${data.message}". Tool results: ${JSON.stringify(toolResults)}. Provide a short response.`,
          "Keep responses short and based only on actual tool results.",
        );

        callback({
          response: "🤖 " + (finalResponse.message?.content || "Done"),
          toolResults,
        });
      } else {
        callback({
          response: "🤖 " + (response.message?.content || "No response"),
        });
      }
    } catch (error) {
      callback({ error: error.message });
    }
  });

  socket.on("execute", async (data, callback) => {
    const { executeAction } = require("./adb");
    try {
      const { action, path, content } = data;
      const result = await executeAction(action, path, content);
      callback({ success: true, result });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  socket.on("status", async (callback) => {
    const connected = await checkConnection();
    callback({ connected });
  });

  socket.on("disconnect", (reason) => {
    console.log("Client disconnected:", socket.id, reason);
  });
});

// Heartbeat
setInterval(async () => {
  const connected = await checkConnection();
  io.emit("heartbeat", { connected, timestamp: Date.now() });
}, config.HEARTBEAT_INTERVAL);

// Start server
server.listen(config.PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${config.PORT}`);
  console.log(`HTTP API: http://${config.SERVER_IP}:${config.PORT}/api/chat`);
  console.log(`ADB: ${config.ANDROID_IP}`);
  console.log(`Heartbeat: every ${config.HEARTBEAT_INTERVAL / 1000}s`);
});
