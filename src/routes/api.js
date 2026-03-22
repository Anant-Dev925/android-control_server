const express = require("express");
const { checkConnection, executeAction, tools } = require("../adb");
const { callOllama, callOllamaWithTools } = require("../ollama");
const sessionManager = require("../session");
const config = require("../config");

const router = express.Router();

// ============ AUTO-PARSE FILE OPERATIONS ============

function autoParseFileOperation(message) {
  const msg = message.toLowerCase();
  
  // Delete pattern: "delete /path/to/file" or "delete file.txt"
  const deleteMatch = message.match(/delete\s+["']?([^\s'"]+)["']?/i);
  if ((msg.includes("delete") || msg.includes("remove")) && deleteMatch) {
    let path = deleteMatch[1];
    if (!path.startsWith("/")) {
      path = "/sdcard/Download/" + path;
    }
    return { function: { name: "adb_delete", arguments: { path } } };
  }
  
  // Read pattern: "read /path/to/file" or "show me file.txt"
  const readMatch = message.match(/(?:read|show|open|view|check)\s+["']?([^\s'"]+)["']?/i);
  if ((msg.includes("read") || msg.includes("show") || msg.includes("view")) && readMatch && !msg.includes("read both")) {
    let path = readMatch[1];
    if (!path.startsWith("/")) {
      path = "/sdcard/Download/" + path;
    }
    return { function: { name: "adb_read", arguments: { path } } };
  }
  
  // List pattern: "list files in /path" or "ls /path"
  const listMatch = message.match(/(?:list|show|ls)\s+(?:files?\s+(?:in|from|at))?\s*["']?([^\s'"]+)["']?/i);
  if ((msg.includes("list") || msg.includes("show files") || msg.includes("ls ")) && listMatch) {
    let path = listMatch[1];
    if (!path.startsWith("/")) {
      path = "/sdcard/Download/" + path;
    }
    return { function: { name: "adb_list", arguments: { path } } };
  }
  
  // Write pattern: "write ... to /path/file.txt" or "create file.txt with ..."
  const writeMatch = message.match(/(?:write|create|save|make)\s+(?:a\s+)?(?:file\s+)?(?:named?\s+)?["']?([^\s'"]+\.\w+)\s+(?:with|containing|and\s+)?/i);
  if ((msg.includes("write") || msg.includes("create")) && writeMatch && !msg.includes("append") && !msg.includes("edit") && !msg.includes("add text")) {
    let path = writeMatch[1];
    if (!path.startsWith("/")) {
      path = "/sdcard/Download/" + path;
    }
    // Extract content after "with" or "containing"
    const contentMatch = message.match(/(?:with|containing|content:|:\s*)(.+)$/is);
    const content = contentMatch ? contentMatch[1].trim() : "Empty file";
    return { function: { name: "adb_write", arguments: { path, content } } };
  }
  
  // Write pattern WITHOUT filename: "create file at /path" → use AI_gen
  const writeNoFileMatch = message.match(/(?:write|create|save|make)\s+(?:a\s+)?(?:file|doc|pdf|text|note)\s+(?:at|in|to)\s+["']?([^\s'"]+)["']?/i);
  if ((msg.includes("write") || msg.includes("create")) && writeNoFileMatch && !msg.includes("append") && !msg.includes("edit")) {
    let folderPath = writeNoFileMatch[1];
    if (!folderPath.startsWith("/")) {
      folderPath = "/sdcard/Download/" + folderPath;
    }
    // Determine extension from context
    let ext = ".txt";
    if (msg.includes("pdf") || msg.includes("document")) ext = ".pdf";
    else if (msg.includes("docx") || msg.includes("docs") || msg.includes("word")) ext = ".docx";
    else if (msg.includes("pptx") || msg.includes("powerpoint")) ext = ".pptx";
    else if (msg.includes("xlsx") || msg.includes("excel")) ext = ".xlsx";
    else if (msg.includes("md") || msg.includes("markdown")) ext = ".md";
    const path = folderPath.endsWith("/") ? folderPath + "AI_gen" + ext : folderPath + "/AI_gen" + ext;
    
    // Extract content - try quoted text first
    let content = "Generated content";
    const quotedMatch = message.match(/["']([^"']{2,})["']/);
    if (quotedMatch) {
      content = quotedMatch[1];
    } else {
      const withMatch = message.match(/(?:with|containing)\s+["']?([^"']+)["']?/i);
      if (withMatch) {
        content = withMatch[1].trim();
      }
    }
    
    return { function: { name: "adb_write", arguments: { path, content } } };
  }
  
  // Docs/Docx file pattern: "create docs file at /path" or "create a docx"
  if ((msg.includes("docs") || msg.includes("docx") || msg.includes("word")) && (msg.includes("create") || msg.includes("write") || msg.includes("make"))) {
    // Extract path - find /sdcard/... pattern
    const pathMatch = message.match(/\/sdcard\/[^\s'"]+/i);
    let path = "/sdcard/Download/document.docx";
    if (pathMatch) {
      let extractedPath = pathMatch[0];
      // If path is a directory, add filename
      if (!extractedPath.includes(".")) {
        extractedPath = extractedPath + "/document.docx";
      } else if (!extractedPath.endsWith(".docx")) {
        const name = extractedPath.split("/").pop();
        extractedPath = extractedPath.replace(name, "document.docx");
      }
      path = extractedPath;
    }
    
    // Extract content - find text in quotes or after "containing"/"with"
    let content = "Document content";
    const quotedMatch = message.match(/["']([^"']{3,})["']/);
    if (quotedMatch) {
      content = quotedMatch[1];
    } else {
      const withMatch = message.match(/(?:with|containing)\s+["']?([^"']+)["']?/i);
      if (withMatch) {
        content = withMatch[1].trim();
      }
    }
    
    // Check for emoji keyword
    if (msg.includes("emoji")) {
      content += " 😊";
    }
    
    return { function: { name: "adb_write", arguments: { path, content } } };
  }
  
  // Edit/Append pattern for any file type
  if ((msg.includes("append") || msg.includes("edit") || msg.includes("add text") || msg.includes("modify")) && !msg.includes("read")) {
    // Find file in message (any extension)
    const fileMatch = message.match(/([^\s]+\.(?:pdf|docx|pptx|txt|md|json|xlsx))/i);
    if (fileMatch) {
      let path = fileMatch[1];
      if (!path.startsWith("/")) {
        path = "/sdcard/Download/" + path;
      }
      // Extract text to add
      const textMatch = message.match(/["']([^"']{2,})["']/);
      let content = textMatch ? textMatch[1] : "Updated content";
      
      if (path.toLowerCase().endsWith(".pdf")) {
        return { function: { name: "adb_edit_pdf", arguments: { path, content } } };
      } else {
        // For docx/pptx/txt, we need to create new version
        // This is a limitation - auto-parse can't read existing content
        return { function: { name: "adb_write", arguments: { path, content } } };
      }
    }
    
    // Also check for /sdcard path patterns
    const sdcardMatch = message.match(/\/sdcard\/[^\s]+/i);
    if (sdcardMatch && (msg.includes("append") || msg.includes("edit"))) {
      const textMatch = message.match(/["']([^"']{2,})["']/);
      let content = textMatch ? textMatch[1] : "Updated content";
      return { function: { name: "adb_write", arguments: { path: sdcardMatch[0], content } } };
    }
  }
  
  // Storage pattern: "how much space", "storage info", "disk usage", etc.
  if (msg.includes("storage") || msg.includes("space") || msg.includes("disk") || 
      msg.includes("memory") || (msg.includes("how much") && msg.includes("free")) ||
      msg.includes("biggest files") || msg.includes("largest folders")) {
    return { function: { name: "adb_storage", arguments: {} } };
  }
  
  // Battery pattern: "battery", "charge", "how much battery", etc.
  if (msg.includes("battery") || msg.includes("charge") || 
      (msg.includes("how much") && msg.includes("battery")) ||
      (msg.includes("battery") && msg.includes("left")) ||
      msg.includes("charging")) {
    return { function: { name: "adb_battery", arguments: {} } };
  }
  
  // Specs pattern: "specs", "specifications", "device info", "android info", etc.
  if (msg.includes("specs") || msg.includes("specification") ||
      msg.includes("device info") || msg.includes("android info") ||
      msg.includes("phone info") || msg.includes("system info")) {
    return { function: { name: "adb_specs", arguments: {} } };
  }
  
  // Rename/Move pattern: "rename file to X" or "move file to X" or "rename X as Y"
  const renameMatch = message.match(/rename\s+["']?([^\s'"]+)["']?\s+(?:to|as)\s+["']?([^\s'"]+)["']?/i);
  if ((msg.includes("rename") || msg.includes("move")) && renameMatch) {
    let sourcePath = renameMatch[1];
    let destPath = renameMatch[2];
    // Only add prefix if path doesn't contain a slash
    if (!sourcePath.includes("/")) {
      sourcePath = "/sdcard/Download/" + sourcePath;
    }
    if (!destPath.includes("/")) {
      destPath = "/sdcard/" + destPath;
    }
    return { function: { name: "adb_rename", arguments: { path: sourcePath, content: destPath } } };
  }
  
  // Copy pattern: "copy file to X" or "duplicate file"
  const copyMatch = message.match(/copy\s+["']?([^\s'"]+)["']?\s+(?:to|as)\s+["']?([^\s'"]+)["']?/i);
  if (msg.includes("copy") || msg.includes("duplicate")) {
    if (copyMatch) {
      let sourcePath = copyMatch[1];
      let destPath = copyMatch[2];
      // Only add prefix if path doesn't contain a slash
      if (!sourcePath.includes("/")) {
        sourcePath = "/sdcard/Download/" + sourcePath;
      }
      if (!destPath.includes("/")) {
        destPath = "/sdcard/" + destPath;
      }
      return { function: { name: "adb_copy", arguments: { path: sourcePath, content: destPath } } };
    }
  }
  
  // Search pattern: "search for X" or "find files named X" or "find X"
  const searchMatch = message.match(/(?:search|find|look for)\s+(?:files?\s+(?:named|called)?\s*)?["']?([^\s'"]+)["']?/i);
  if ((msg.includes("search") || msg.includes("find")) && searchMatch) {
    const pattern = searchMatch[1];
    return { function: { name: "adb_search", arguments: { path: "/sdcard", content: pattern } } };
  }
  
  // Info pattern: "info about file" or "file details" or "tell me about file"
  const infoMatch = message.match(/(?:info|details|about)\s+(?:of|about|for)?\s*(?:file\s*)?["']?([^\s'"]+)["']?/i);
  if ((msg.includes("info") || msg.includes("details") || msg.includes("tell me about")) && infoMatch) {
    let path = infoMatch[1];
    if (!path.startsWith("/")) {
      path = "/sdcard/Download/" + path;
    }
    return { function: { name: "adb_info", arguments: { path } } };
  }
  
  return null;
}

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

// ============ /TRAIN COMMAND ============

async function handleTrainCommand(message, sessionId) {
  const files = [];
  
  const filePattern = /[\/"']([^\s'""]+\.(?:txt|md|pdf|docx|pptx|json))[\/"']/gi;
  let match;
  while ((match = filePattern.exec(message)) !== null) {
    let path = match[1];
    if (!path.startsWith("/")) {
      path = "/sdcard/Download/" + path;
    }
    files.push({ path, name: match[1] });
  }

  if (files.length === 0) {
    const folderMatch = message.match(/\/sdcard\/[^\s'"]+/i);
    if (folderMatch) {
      const folderPath = folderMatch[0];
      const listResult = await executeAction("list", folderPath, "");
      const fileMatches = listResult.match(/📄 (.+?)(?:\n|$)/g);
      if (fileMatches) {
        for (const f of fileMatches) {
          const name = f.replace("📄 ", "").trim();
          if (/\.(txt|md|pdf|docx|pptx|json)$/i.test(name)) {
            files.push({ path: folderPath + "/" + name, name });
          }
        }
      }
    }
  }

  if (files.length === 0) {
    return { success: false, message: "No files found to learn from. Use: /train <file1.txt> <file2.md> or /train /folder/path" };
  }

  const learned = [];
  for (const file of files) {
    try {
      const content = await executeAction("read", file.path, "");
      const topic = file.name.replace(/\.[^.]+$/, "");
      sessionManager.addKnowledge(sessionId, topic, content);
      learned.push(file.name);
    } catch (e) {
      console.log("Failed to read:", file.name, e.message);
    }
  }

  if (learned.length > 0) {
    const knowledge = sessionManager.getKnowledge(sessionId);
    return {
      success: true,
      message: `Learned from ${learned.length} file(s): ${learned.join(", ")}\n\nI now have ${knowledge.length} knowledge item(s) in this session. I'll use this context in future conversations.`,
      knowledgeCount: knowledge.length,
    };
  }

  return { success: false, message: "Failed to read any files" };
}

// ============ KNOWLEDGE ENDPOINTS ============

router.get("/knowledge/:sessionId", (req, res) => {
  try {
    const knowledge = sessionManager.getKnowledge(req.params.sessionId);
    res.json({ success: true, knowledge, count: knowledge.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete("/knowledge/:sessionId", (req, res) => {
  try {
    sessionManager.clearKnowledge(req.params.sessionId);
    res.json({ success: true, message: "Knowledge cleared" });
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

    // Check for /train command
    if (message.toLowerCase().startsWith("/train")) {
      let currentSession;
      if (sessionId) {
        currentSession = sessionManager.getSession(sessionId);
      }
      if (!currentSession) {
        currentSession = sessionManager.createSession();
      }

      const trainResult = await handleTrainCommand(message, currentSession.id);
      
      sessionManager.addMessageToSession(currentSession.id, "user", message);
      sessionManager.addMessageToSession(currentSession.id, "assistant", trainResult.message);

      return res.json({
        response: trainResult.message,
        sessionId: currentSession.id,
        knowledgeCount: trainResult.knowledgeCount || 0,
      });
    }

    // Check for /forget command
    if (message.toLowerCase().startsWith("/forget")) {
      let currentSession;
      if (sessionId) {
        currentSession = sessionManager.getSession(sessionId);
      }
      if (!currentSession) {
        currentSession = sessionManager.createSession();
      }

      sessionManager.clearKnowledge(currentSession.id);
      sessionManager.addMessageToSession(currentSession.id, "user", message);
      sessionManager.addMessageToSession(currentSession.id, "assistant", "I've forgotten all learned knowledge in this session.");

      return res.json({
        response: "I've forgotten all learned knowledge in this session.",
        sessionId: currentSession.id,
        knowledgeCount: 0,
      });
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

    // Get knowledge for context
    const knowledge = sessionManager.getKnowledge(sessionId_used);
    let knowledgeContext = "";
    if (knowledge.length > 0) {
      knowledgeContext = "\n\nLEARNED KNOWLEDGE (use this in your responses):\n" +
        knowledge.map((k, i) => `[${i + 1}] ${k.topic}: ${k.content}`).join("\n");
    }

    // Build conversation history for Ollama - limit to last 20 messages
    const recentMessages = currentSession.messages.slice(-20);
    const conversationHistory = recentMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    console.log("Sending", conversationHistory.length, "messages to Ollama");
    console.log("Received message:", message);

    const userMessageWithKnowledge = knowledgeContext
      ? message + knowledgeContext
      : message;

    const response = useTools
      ? await callOllamaWithTools(userMessageWithKnowledge, conversationHistory)
      : await callOllama(userMessageWithKnowledge);

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

    // AUTO-PARSE: If model didn't use tools but message is about file operations
    if (toolCalls.length === 0 && useTools) {
      const autoParsed = autoParseFileOperation(message);
      if (autoParsed) {
        console.log("Auto-parsed tool call:", autoParsed);
        toolCalls = [autoParsed];
      }
    }

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
          let result;
          if (name === "adb_edit_pdf") {
            result = await tools.pdf.editPdf(args.path, args.content);
          } else {
            result = await executeAction(
              name.replace("adb_", ""),
              args.path || "",
              args.content || "",
            );
          }
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
