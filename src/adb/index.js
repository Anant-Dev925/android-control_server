const { exec, spawn } = require("child_process");
const fs = require("fs");
const config = require("../config");

// Use temp folder without spaces - Windows path
const TEMP_DIR = "C:\\temp\\android_control";

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function runAdbCommand(command) {
  return new Promise((resolve, reject) => {
    // Use cmd /c to properly handle paths on Windows
    const fullCommand = `cmd /c "adb -s ${config.ANDROID_IP} ${command}"`;
    
    exec(fullCommand, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

async function checkConnection() {
  try {
    await runAdbCommand("get-state");
    return true;
  } catch {
    return false;
  }
}

function formatListOutput(result, path) {
  const lines = result.split("\n").filter((l) => l.trim());
  let formatted = `📁 Files in ${path}:\n\n`;
  let dirs = [],
    files = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(/\s+/);
    if (parts.length >= 8) {
      const perms = parts[0];
      const name = parts.slice(7).join(" ");
      if (perms.startsWith("d")) {
        dirs.push(`📁 ${name}/`);
      } else {
        files.push(`📄 ${name}`);
      }
    }
  }

  formatted +=
    dirs.join("\n") +
    (dirs.length && files.length ? "\n" : "") +
    files.join("\n");
  return formatted;
}

// Read PDF and extract text
async function readPdf(filePath) {
  const filename = filePath.split("/").pop();
  const tempFile = TEMP_DIR + "\\" + filename;

  try {
    // Pull PDF to temp directory
    await runAdbCommand(`pull "${filePath}" "${tempFile}"`);

    // Check if file exists
    if (!fs.existsSync(tempFile)) {
      return "Error: Failed to download PDF";
    }

    // Extract text using pdftotext
    const result = await runCommand(`pdftotext "${tempFile}" -`);

    // Clean up temp file
    fs.unlinkSync(tempFile);

    if (result && result.trim()) {
      // Limit text to first 5000 characters for AI context
      const text = result.trim();
      if (text.length > 5000) {
        return (
          text.substring(0, 5000) +
          "\n\n... (truncated, first 5000 characters shown)"
        );
      }
      return text;
    } else {
      return "⚠️ Could not extract text from this PDF. It might be a scanned/image-based PDF.";
    }
  } catch (error) {
    // Clean up on error
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    return `Error reading PDF: ${error.message}`;
  }
}

// Read DOCX and extract text
async function readDocx(filePath) {
  const filename = filePath.split("/").pop();
  const tempFile = TEMP_DIR + "\\" + filename;

  try {
    // Pull file to temp directory
    await runAdbCommand(`pull "${filePath}" "${tempFile}"`);

    if (!fs.existsSync(tempFile)) {
      return "Error: Failed to download file";
    }

    // Extract text from DOCX (it's a ZIP with XML)
    const result = await runCommand(`unzip -p "${tempFile}" word/document.xml | sed "s/<[^>]*>//g"`);

    // Clean up
    fs.unlinkSync(tempFile);

    if (result && result.trim()) {
      const text = result.trim().replace(/\s+/g, " ");
      if (text.length > 5000) {
        return text.substring(0, 5000) + "\n\n... (truncated)";
      }
      return text;
    } else {
      return "⚠️ Could not extract text from this DOCX file.";
    }
  } catch (error) {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    return `Error reading DOCX: ${error.message}`;
  }
}

// Read PPTX and extract text
async function readPptx(filePath) {
  const filename = filePath.split("/").pop();
  const tempFile = TEMP_DIR + "\\" + filename;

  try {
    await runAdbCommand(`pull "${filePath}" "${tempFile}"`);

    if (!fs.existsSync(tempFile)) {
      return "Error: Failed to download file";
    }

    // Extract text from PPTX slides
    const result = await runCommand(
      `unzip -p "${tempFile}" "ppt/slides/*.xml" | sed "s/<[^>]*>//g"`,
    );

    fs.unlinkSync(tempFile);

    if (result && result.trim()) {
      const text = result.trim().replace(/\s+/g, " ");
      if (text.length > 5000) {
        return text.substring(0, 5000) + "\n\n... (truncated)";
      }
      return text;
    } else {
      return "⚠️ Could not extract text from this PPTX file.";
    }
  } catch (error) {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    return `Error reading PPTX: ${error.message}`;
  }
}

function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        resolve("");
      } else {
        resolve(stdout);
      }
    });
  });
}

async function executeAction(action, path, content) {
  let result;
  const safePath = (path || "").replace(/"/g, '\\"');
  const safeContent = content ? content.replace(/"/g, '\\"') : "";

  switch (action) {
    case "list":
      result = await runAdbCommand(`shell ls -la ${safePath}`);
      result = formatListOutput(result, path);
      break;
    case "read":
      const lowerPath = path.toLowerCase();
      if (lowerPath.endsWith(".pdf")) {
        result = await readPdf(path);
      } else if (lowerPath.endsWith(".docx")) {
        result = await readDocx(path);
      } else if (lowerPath.endsWith(".pptx")) {
        result = await readPptx(path);
      } else {
        result = await runAdbCommand(`shell cat ${safePath}`);
      }
      break;
    case "write":
      // Write file by creating locally and pushing to Android
      const filename = path.split("/").pop();
      const localFile = TEMP_DIR + "\\" + filename;
      try {
        fs.writeFileSync(localFile, content);
        await runAdbCommand(`push "${localFile}" "${path}"`);
        fs.unlinkSync(localFile);
        result = "File written successfully";
      } catch (e) {
        result = "Error writing file: " + e.message;
      }
      break;
    case "delete":
      result = await runAdbCommand(`shell rm -rf ${safePath}`);
      break;
    case "push":
      result = await runAdbCommand(`push "${safeContent}" ${safePath}`);
      break;
    case "pull":
      result = await runAdbCommand(`pull ${safePath} "${safeContent}"`);
      break;
    case "mkdir":
      result = await runAdbCommand(`shell mkdir -p ${safePath}`);
      break;
    case "status":
      const connected = await checkConnection();
      result = connected
        ? "✅ Android device connected"
        : "❌ Android device not connected";
      break;
    case "shell":
      result = await runAdbCommand(`shell ${safePath}`);
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
};
