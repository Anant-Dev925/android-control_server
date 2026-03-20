const http = require("http");
const config = require("../config");

const tools = {
  tools: [
    {
      type: "function",
      function: {
        name: "adb_list",
        description: "List files and folders on Android device",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Directory path (e.g., /sdcard/Download)",
            },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "adb_read",
        description:
          "Read contents of a text file, PDF, DOCX, or PPTX file. Extracts and returns text content.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                "Full file path to any readable file (supports .txt, .pdf, .docx, .pptx, .md, .json, etc.)",
            },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "adb_write",
        description: "Write content to a file",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path" },
            content: { type: "string", description: "Content to write" },
          },
          required: ["path", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "adb_delete",
        description: "Delete a file or folder",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File/folder path to delete" },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "adb_mkdir",
        description: "Create a new directory",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Directory path to create" },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "adb_status",
        description: "Check Android device connection status",
        parameters: { type: "object", properties: {} },
      },
    },
  ],
};

const SYSTEM_PROMPT = `You are an AI assistant for an Android device.

YOUR IDENTITY:
"I am an AI assistant created by Anant Dev, powered by Qwen2.5 AI model."

IMPORTANT RULES:
- For greetings/conversation: respond naturally without tools
- For file operations (list, read, write, delete): use tools
- For summaries/text generation: return PLAIN TEXT only, no JSON, no tool calls

AVAILABLE TOOLS:
- adb_list: List files in a directory
- adb_read: Read any file including PDF, DOCX, PPTX
- adb_write: Write content to a file
- adb_delete: Delete file or folder
- adb_mkdir: Create directory
- adb_status: Check device connection`;

function makeRequest(prompt, systemPrompt, useTools = false, conversationHistory = []) {
  return new Promise((resolve, reject) => {
    const messages = [
      {
        role: "system",
        content: systemPrompt || SYSTEM_PROMPT,
      },
    ];

    // Add conversation history
    if (conversationHistory.length > 0) {
      messages.push(...conversationHistory);
    }

    // Add current user message
    messages.push({ role: "user", content: prompt });

    const requestBody = {
      model: config.OLLAMA_MODEL,
      messages,
      stream: false,
      keep_alive: 300,
      options: {
        temperature: 0.7,
        top_p: 0.9,
      }
    };

    if (useTools) {
      Object.assign(requestBody, tools);
    }

    const data = JSON.stringify(requestBody);

    console.log("Ollama request size:", data.length, "bytes");

    const req = http.request(
      `${config.OLLAMA_HOST}/api/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch (e) {
            console.error("Ollama parse error:", e.message);
            console.error("Ollama response body:", body.substring(0, 500));
            reject(new Error(`Failed to parse Ollama response: ${body.substring(0, 200)}`));
          }
        });
      },
    );

    req.on("error", (e) => {
      console.error("Ollama connection error:", e.message);
      reject(e);
    });
    req.write(data);
    req.end();
  });
}

function callOllama(prompt, systemPrompt) {
  return makeRequest(prompt, systemPrompt, false);
}

function callOllamaWithTools(prompt, conversationHistory = []) {
  return makeRequest(prompt, null, true, conversationHistory);
}

module.exports = {
  callOllama,
  callOllamaWithTools,
};
