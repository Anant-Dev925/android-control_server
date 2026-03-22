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
        description: "Write content to a file. Automatically creates proper format for .pdf, .docx, .pptx files",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path (use .pdf, .docx, .pptx, .txt extension)" },
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
    {
      type: "function",
      function: {
        name: "adb_storage",
        description: "Get storage information including total/used/available space and largest folders on the Android device",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "adb_battery",
        description: "Get battery status including charge level, charging status, and temperature",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "adb_specs",
        description: "Get complete Android device specifications including model, brand, android version, CPU, memory, display info",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "adb_edit_pdf",
        description: "Add text to the last page of an existing PDF file",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Full path to the PDF file to edit" },
            content: { type: "string", description: "Text to append to the PDF" },
          },
          required: ["path", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "adb_rename",
        description: "Rename or move a file/folder to a new location",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Current file/folder path" },
            content: { type: "string", description: "New destination path (can be new name or new location)" },
          },
          required: ["path", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "adb_copy",
        description: "Copy a file or folder to a new location",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Source file/folder path" },
            content: { type: "string", description: "Destination path for the copy" },
          },
          required: ["path", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "adb_search",
        description: "Search for files by name pattern in a directory",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Directory to search in (default: /sdcard)" },
            content: { type: "string", description: "Search pattern (e.g., 'notes', 'photo', 'document')" },
          },
          required: ["content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "adb_info",
        description: "Get detailed information about a file or folder (size, permissions, type, modified date)",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File or folder path" },
          },
          required: ["path"],
        },
      },
    },
  ],
};

const SYSTEM_PROMPT = `You are an AI assistant for an Android device.

YOUR IDENTITY:
"I am an AI assistant created by Anant Dev, powered by Qwen2.5 AI model."

CRITICAL RULE - ALWAYS USE TOOLS:
**IF USER MENTIONS ANY FILE, YOU MUST USE A TOOL. NO TEXT RESPONSE.**

TOOL USAGE (MUST FOLLOW):
- "create/make/write file" → adb_write
- "edit/append/modify file" → adb_write (use same file path with new content)
- "delete/remove file" → adb_delete
- "read/show/view file" → adb_read
- "list/show files" → adb_list
- "make folder" → adb_mkdir
- "storage/space/disk/memory/how much" → adb_storage
- "battery/charge/how much battery" → adb_battery
- "specs/specifications/android info/device info" → adb_specs
- "rename/move file" → adb_rename (path=current, content=new)
- "copy/duplicate file" → adb_copy (path=source, content=destination)
- "search/find files" → adb_search (path=folder, content=pattern)
- "file info/details/properties" → adb_info

HOW TO EDIT A FILE:
- "edit file.docx by appending text X" → adb_write with path to that file and NEW full content
- You cannot append to docx/pptx, you must create a NEW version with updated content
- Read the file first, modify the content, then use adb_write with the new content

IMPORTANT: 
- For PDF editing only: adb_edit_pdf appends text
- For all other files: adb_write creates a NEW file with new content
- You MUST read the file first before editing, to know the current content

JSON FORMAT (ALWAYS USE):
{"name":"TOOL_NAME","arguments":{"path":"/full/path/file.ext","content":"text here"}}

AVAILABLE TOOLS:
- adb_list: List files
- adb_read: Read file content
- adb_write: Create OR overwrite file
- adb_edit_pdf: Append text to PDF only
- adb_delete: Delete files/folders
- adb_mkdir: Create directories
- adb_storage: Get storage info (total/used/available space and largest folders)
- adb_rename: Rename or move file/folder
- adb_copy: Copy file/folder
- adb_search: Search files by name pattern
- adb_info: Get file/folder details
- adb_battery: Get battery status (level, charging, temperature)
- adb_specs: Get Android device specifications (model, version, CPU, memory, display)`;

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
