const express = require("express");
const { checkConnection, executeAction } = require("../adb");
const { callOllama, callOllamaWithTools } = require("../ollama");

const router = express.Router();

// Chat endpoint
router.post("/chat", async (req, res) => {
  try {
    const { message, useTools = true } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    console.log("Received message:", message);

    const response = useTools
      ? await callOllamaWithTools(message)
      : await callOllama(message);

    console.log("Ollama response:", JSON.stringify(response));

    let toolCalls = response.message?.tool_calls || [];

    // Check if tool calls are embedded in content as JSON
    const content = response.message?.content || "";
    if (toolCalls.length === 0) {
      const cleanContent = content.replace(/```json?/g, '').replace(/```/g, '').trim();
      
      if (cleanContent.startsWith("{") || cleanContent.startsWith("[")) {
        try {
          const parsed = JSON.parse(cleanContent);
          const toolList = Array.isArray(parsed) ? parsed : [parsed];
          const validTools = toolList.filter(t => t.name && t.arguments);
          if (validTools.length > 0) {
            toolCalls = validTools.map(t => ({ function: t }));
            console.log("Tool call found in content:", toolCalls);
          }
        } catch (e) {}
      }
    }

    if (toolCalls.length > 0) {
      console.log("Tool calls detected:", toolCalls);
      const toolResults = [];

      for (const toolCall of toolCalls) {
        const { name, arguments: args } = toolCall.function;
        console.log("Executing tool:", name, "with args:", args);
        try {
          const result = await executeAction(
            name.replace("adb_", ""),
            args.path || "",
            args.content || ""
          );
          console.log("Tool result:", result);
          toolResults.push({ tool: name, result });
        } catch (e) {
          console.log("Tool error:", e.message);
          toolResults.push({ tool: name, error: e.message });
        }
      }

      // For file operations, return raw result
      const isFileOperation = toolCalls.some((tc) =>
        ["adb_list", "adb_read"].includes(tc.function.name)
      );

      if (isFileOperation) {
        console.log("Returning raw file operation result");
        res.json({
          response: "🤖 Here's what I found:\n\n" + (toolResults[0].result || "Done"),
          toolCalls: toolResults
        });
        return;
      }

      // For other operations, use AI summary
      const finalPrompt = `User asked: "${message}". 
Tool results: ${JSON.stringify(toolResults)}.
IMPORTANT: Use ONLY actual tool results. Provide a short response.`;

      const finalResponse = await callOllama(
        finalPrompt,
        "Keep responses short and based only on actual tool results."
      );

      res.json({
        response: "🤖 " + (finalResponse.message?.content || "Done"),
        toolCalls: toolResults
      });
    } else {
      console.log("No tool calls, returning direct response");
      res.json({
        response: "🤖 " + (response.message?.content || "No response")
      });
    }
  } catch (error) {
    console.log("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Direct execute endpoint
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

// Status endpoint
router.get("/status", async (req, res) => {
  const connected = await checkConnection();
  res.json({ connected, androidIp: config.ANDROID_IP });
});

// Reconnect endpoint
router.post("/reconnect", async (req, res) => {
  const { exec } = require("child_process");
  try {
    exec(`adb connect ${config.ANDROID_IP}`, (error, stdout) => {
      if (error) {
        res.json({ success: false, error: error.message });
      } else {
        checkConnection().then(connected => {
          res.json({ success: connected, message: stdout });
        });
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
