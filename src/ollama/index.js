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
            path: { type: "string", description: "Directory path (e.g., /sdcard/Download)" }
          },
          required: ["path"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "adb_read",
        description: "Read contents of a text file",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Full file path" }
          },
          required: ["path"]
        }
      }
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
            content: { type: "string", description: "Content to write" }
          },
          required: ["path", "content"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "adb_delete",
        description: "Delete a file or folder",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File/folder path to delete" }
          },
          required: ["path"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "adb_mkdir",
        description: "Create a new directory",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Directory path to create" }
          },
          required: ["path"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "adb_status",
        description: "Check Android device connection status",
        parameters: { type: "object", properties: {} }
      }
    }
  ]
};

function makeRequest(prompt, systemPrompt, useTools = false) {
  return new Promise((resolve, reject) => {
    const messages = [
      {
        role: "system",
        content: `You are an AI assistant for an Android device.

YOUR IDENTITY (keep this exact intro when asked about yourself):
"I am an AI assistant created by Anant Dev, powered by Qwen2.5 AI model."

Then add a friendly sentence about what you can help with. Make it sound natural, not robotic.

IMPORTANT:
- Only use tools when the user explicitly asks for file operations, reading, writing, deleting, or checking device status.
- For greeting messages like "Hello", "Hi", "How are you?", "Who are you?", "Tell me about yourself", just respond naturally WITHOUT using any tools.
- When user asks to list/read/write/delete files, THEN use the appropriate tool.
- Do not call tools unless specifically requested by the user.

Available tools (use ONLY when needed):
- adb_list: List files in a directory
- adb_read: Read a text file
- adb_write: Write to a file
- adb_delete: Delete file/folder
- adb_mkdir: Create directory
- adb_status: Check device connection`
      },
      { role: "user", content: prompt }
    ];

    const requestBody = {
      model: config.OLLAMA_MODEL,
      messages,
      stream: false
    };

    if (useTools) {
      Object.assign(requestBody, tools);
    }

    const data = JSON.stringify(requestBody);

    const req = http.request(`${config.OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length,
      },
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function callOllama(prompt, systemPrompt) {
  return makeRequest(prompt, systemPrompt, false);
}

function callOllamaWithTools(prompt) {
  return makeRequest(prompt, null, true);
}

module.exports = {
  callOllama,
  callOllamaWithTools
};
