const express = require("express");
const { checkConnection, executeAction } = require("../adb");
const { callOllama, callOllamaWithTools } = require("../ollama");
const sessionManager = require("../session");
const config = require("../config");

const router = express.Router();

// ============ SESSION ENDPOINTS ============

// Get all sessions
router.get("/sessions", (req, res) => {
  try {
    const sessions = sessionManager.getAllSessions();
    res.json({ success: true, sessions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new session
router.post("/sessions", (req, res) => {
  try {
    const session = sessionManager.createSession();
    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get session history
router.get("/sessions/:id", (req, res) => {
  try {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      return res
        .status(404)
        .json({ success: false, error: "Session not found" });
    }
    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete session
router.delete("/sessions/:id", (req, res) => {
  try {
    const success = sessionManager.clearSession(req.params.id);
    res.json({ success });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rename session
router.put("/sessions/:id", (req, res) => {
  try {
    const { name } = req.body;
    const session = sessionManager.renameSession(req.params.id, name);
    if (!session) {
      return res.status(404).json({ success: false, error: "Session not found" });
    }
    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ CHAT ENDPOINT ============

router.post("/chat", async (req, res) => {
  try {
    const { message, useTools = true, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Get or create session
    let currentSession;
    if (sessionId) {
      currentSession = sessionManager.getSession(sessionId);
    }

    // Create new session if none exists
    if (!currentSession) {
      currentSession = sessionManager.createSession();
      console.log("Created new session:", currentSession.id);
    }

    const sessionId_used = currentSession.id;
    console.log("Using session:", sessionId_used);
    console.log("Message history:", currentSession.messages.length, "messages");

    // Build conversation history for Ollama - limit to last 20 messages
    const recentMessages = currentSession.messages.slice(-20);
    const conversationHistory = recentMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    console.log("Sending", conversationHistory.length, "messages to Ollama");
    console.log("Received message:", message);

    const response = useTools
      ? await callOllamaWithTools(message, conversationHistory)
      : await callOllama(message);

    console.log("Ollama response:", JSON.stringify(response).substring(0, 200));

    let toolCalls = response.message?.tool_calls || [];

    // Check if tool calls are embedded in content as JSON
    const content = response.message?.content || "";
    if (toolCalls.length === 0 && content.trim()) {
      const cleanContent = content
        .replace(/```json?/g, "")
        .replace(/```/g, "")
        .trim();

      try {
        const parsed = JSON.parse(cleanContent);
        if (parsed.name && parsed.arguments) {
          toolCalls = [{ function: parsed }];
        } else if (Array.isArray(parsed) && parsed.length > 0) {
          const validTools = parsed.filter((t) => t && t.name && t.arguments);
          if (validTools.length > 0) {
            toolCalls = validTools.map((t) => ({ function: t }));
          }
        }
      } catch (e) {
        const lines = cleanContent
          .split("\n")
          .filter((l) => l.trim().startsWith("{"));
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line.trim());
            if (parsed.name && parsed.arguments) {
              toolCalls.push({ function: parsed });
            }
          } catch (e2) {}
        }
      }
    }

    // Define userMessage early so we can use it for willHandleWrite check
    const userMessage = message.toLowerCase();

    // If we have list + read + write pattern with summarize intent, handle write ourselves
    const hasListCall = toolCalls.some((t) => t.function.name === "adb_list");
    const hasReadCalls = toolCalls.some((t) => t.function.name === "adb_read");
    const hasWriteCall = toolCalls.some((t) => t.function.name === "adb_write");

    const willHandleWrite =
      hasListCall &&
      hasReadCalls &&
      hasWriteCall &&
      userMessage.includes("read") &&
      (userMessage.includes("summary") ||
        userMessage.includes("create") ||
        userMessage.includes("third"));

    const filteredToolCalls = willHandleWrite
      ? toolCalls.filter((t) => t.function.name !== "adb_write")
      : toolCalls;

    let finalResponse = "";
    let toolResults = [];

    if (filteredToolCalls.length > 0) {
      console.log("Tool calls detected:", filteredToolCalls);

      // Execute tools in order
      for (const toolCall of filteredToolCalls) {
        const { name, arguments: args } = toolCall.function;
        console.log("Executing tool:", name, "with args:", args);

        try {
          const result = await executeAction(
            name.replace("adb_", ""),
            args.path || "",
            args.content || "",
          );
          console.log("Tool result:", result.substring(0, 200));
          toolResults.push({ tool: name, result, arguments: args });
        } catch (e) {
          console.log("Tool error:", e.message);
          toolResults.push({ tool: name, error: e.message, arguments: args });
        }
      }

      // If we listed a folder and user wants to read files
      const listResult = toolResults.find(
        (r) => r.tool === "adb_list" && !r.error,
      );

      if (listResult && userMessage.includes("read")) {
        const fileMatches = listResult.result.match(/📄 (.+?)(?:\n|$)/g);
        if (fileMatches) {
          const files = fileMatches
            .map((f) => f.replace("📄 ", "").replace("\n", "").trim())
            .filter((f) => f);
          const folderPath = toolCalls[0].function.arguments.path;
          console.log("Auto-reading files from list:", files);

          const readResults = [];
          for (const file of files) {
            if (
              file.endsWith(".txt") ||
              file.endsWith(".md") ||
              file.endsWith(".pdf") ||
              file.endsWith(".docx")
            ) {
              const fullPath = folderPath + "/" + file;
              try {
                const result = await executeAction("read", fullPath, "");
                readResults.push({
                  tool: "adb_read",
                  result,
                  arguments: { path: fullPath },
                  success: true,
                });
              } catch (e) {
                readResults.push({
                  tool: "adb_read",
                  error: e.message,
                  arguments: { path: fullPath },
                  success: false,
                });
              }
            }
          }

          const successfulReads = readResults.filter((r) => r.success);

          if (successfulReads.length > 0) {
            const readContent = successfulReads
              .map((r) => `File: ${r.arguments?.path}\n${r.result}`)
              .join("\n\n---\n\n");
            const summaryPrompt = `Summarize these files. Return ONLY the summary text.

Files:
${readContent}`;
            const summary = await callOllama(
              summaryPrompt,
              "Return only plain text summary.",
            );

            const summaryContent =
              summary.message?.content || "Summary not generated";
            console.log("Generated summary:", summaryContent.substring(0, 100));

            const wantsSummaryFile =
              userMessage.includes("summary") ||
              userMessage.includes("summar") ||
              userMessage.includes("create");

            if (wantsSummaryFile) {
              let summaryFilename = "summary.txt";
              const namedMatch = userMessage.match(
                /(?:named|called)\s+["']?(\S+?)["']?(?:\s|$)/i,
              );
              const asMatch = userMessage.match(
                /as\s+["']?(\S+?)["']?(?:\s|$)/i,
              );
              if (namedMatch) {
                summaryFilename = namedMatch[1];
              } else if (asMatch && asMatch[1].length > 2) {
                summaryFilename = asMatch[1];
              }
              if (
                !summaryFilename.endsWith(".txt") &&
                !summaryFilename.includes(".")
              ) {
                summaryFilename += ".txt";
              }

              const summaryPath = folderPath + "/" + summaryFilename;
              await executeAction("write", summaryPath, summaryContent);

              finalResponse =
                "I've read all files and created **" +
                summaryFilename +
                "** with the summary:\n\n" +
                summaryContent;
              toolResults = [...toolResults, ...readResults];

              // Save to session
              sessionManager.addMessageToSession(
                sessionId_used,
                "user",
                message,
              );
              sessionManager.addMessageToSession(
                sessionId_used,
                "assistant",
                finalResponse,
                toolResults,
              );

              res.json({
                response: finalResponse,
                toolCalls: toolResults,
                sessionId: sessionId_used,
              });
              return;
            }

            finalResponse = "I've read the files:\n\n" + readContent;
            toolResults = [...toolResults, ...readResults];

            sessionManager.addMessageToSession(sessionId_used, "user", message);
            sessionManager.addMessageToSession(
              sessionId_used,
              "assistant",
              finalResponse,
              toolResults,
            );

            res.json({
              response: finalResponse,
              toolCalls: toolResults,
              sessionId: sessionId_used,
            });
            return;
          }
        }
      }

      // Return appropriate response for list
      if (["adb_list"].includes(filteredToolCalls[0].function.name)) {
        finalResponse =
          "Here's what I found:\n\n" +
          (toolResults.find((r) => !r.error)?.result || "Done");
      } else {
        // Get AI response for tool results
        const toolResponse = await callOllama(
          `User asked: "${message}". Tool results: ${JSON.stringify(toolResults)}. Provide a short response.`,
          "Keep responses short and based only on actual tool results.",
        );
        finalResponse = toolResponse.message?.content || "Done";
      }

      // Save to session
      sessionManager.addMessageToSession(sessionId_used, "user", message);
      sessionManager.addMessageToSession(
        sessionId_used,
        "assistant",
        finalResponse,
        toolResults,
      );

      res.json({
        response: finalResponse,
        toolCalls: toolResults,
        sessionId: sessionId_used,
      });
      return;
    } else if (toolCalls.length === 0) {
      console.log("No tool calls, returning direct response");
      finalResponse = content || "No response";

      // Save to session
      sessionManager.addMessageToSession(sessionId_used, "user", message);
      sessionManager.addMessageToSession(
        sessionId_used,
        "assistant",
        finalResponse,
      );

      res.json({
        response: finalResponse,
        sessionId: sessionId_used,
      });
    }
  } catch (error) {
    console.log("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============ DIRECT EXECUTE ENDPOINT ============

router.post("/execute", async (req, res) => {
  try {
    const { action, path, content } = req.body;
    console.log("Direct execute:", action, path);
    const result = await executeAction(action, path, content);
    console.log("Direct execute result:", result);
    res.json({ success: true, result });
  } catch (error) {
    console.log("Direct execute error:", error);
    res.json({ success: false, error: error.message });
  }
});

// ============ STATUS ENDPOINT ============

router.get("/status", async (req, res) => {
  const connected = await checkConnection();
  res.json({ connected, androidIp: config.ANDROID_IP });
});

// ============ RECONNECT ENDPOINT ============

router.post("/reconnect", async (req, res) => {
  const { exec } = require("child_process");
  try {
    exec(`adb connect ${config.ANDROID_IP}`, (error, stdout) => {
      if (error) {
        res.json({ success: false, error: error.message });
      } else {
        checkConnection().then((connected) => {
          res.json({ success: connected, message: stdout });
        });
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
