const config = require("../config");
const { pdf, docx, pptx, storage, files } = require("../tools");
const { runAdbCommand, runCommand, checkConnection } = require("./commands");

const TEMP_DIR = "C:\\temp\\android_control";
const fs = require("fs");

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

async function executeAction(action, path, content) {
  let result;
  const safePath = (path || "").replace(/"/g, '\\"');
  const safeContent = content ? content.replace(/"/g, '\\"') : "";

  switch (action) {
    case "list":
      result = await files.listFiles(path);
      break;
      
    case "read":
      const lowerPath = path.toLowerCase();
      if (lowerPath.endsWith(".pdf")) {
        result = await pdf.readPdf(path);
      } else if (lowerPath.endsWith(".docx")) {
        result = await docx.readDocx(path);
      } else if (lowerPath.endsWith(".pptx")) {
        result = await pptx.readPptx(path);
      } else {
        result = await files.readFile(path);
      }
      break;
      
    case "write":
      const writeLowerPath = path.toLowerCase();
      try {
        if (writeLowerPath.endsWith(".pdf")) {
          result = await pdf.createPdf(path, content);
        } else if (writeLowerPath.endsWith(".docx")) {
          result = await docx.createDocx(path, content);
        } else if (writeLowerPath.endsWith(".pptx")) {
          result = await pptx.createPptx(path, content);
        } else {
          result = await files.writeFile(path, content);
        }
      } catch (e) {
        result = "Error writing file: " + e.message;
      }
      break;
      
    case "delete":
      result = await files.deletePath(safePath);
      break;
      
    case "push":
      result = await runAdbCommand(`push "${safeContent}" ${safePath}`);
      break;
      
    case "pull":
      result = await runAdbCommand(`pull ${safePath} "${safeContent}"`);
      break;
      
    case "mkdir":
      result = await files.createDirectory(safePath);
      break;
      
    case "rename":
      if (!content) {
        result = "Error: Destination path required for rename";
      } else {
        result = await files.renamePath(path, content);
      }
      break;
      
    case "move":
      if (!content) {
        result = "Error: Destination path required for move";
      } else {
        result = await files.renamePath(path, content);
      }
      break;
      
    case "copy":
      if (!content) {
        result = "Error: Destination path required for copy";
      } else {
        result = await files.copyPath(path, content);
      }
      break;
      
    case "search":
      if (!content) {
        result = "Error: Search pattern required";
      } else {
        const searchPath = path || "/sdcard";
        result = await files.searchFiles(searchPath, content);
      }
      break;
      
    case "info":
      result = await files.getFileInfo(path);
      break;
      
    case "status":
      const connected = await checkConnection();
      result = connected
        ? "✅ Android device connected"
        : "❌ Android device not connected";
      break;
      
    case "storage":
      result = await storage.getStorageInfo();
      break;
      
    case "battery":
      result = await storage.getBatteryStatus();
      break;
      
    case "specs":
      result = await storage.getDeviceSpecs();
      break;
      
    case "shell":
      result = await files.runShell(safePath);
      break;
      
    default:
      result = await runAdbCommand(`shell ${action}`);
  }
  return result || "Done";
}

module.exports = {
  runAdbCommand,
  checkConnection,
  executeAction,
  runCommand,
  tools: { pdf, docx, pptx, storage, files },
};
