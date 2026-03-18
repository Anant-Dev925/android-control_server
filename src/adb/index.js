const { exec } = require("child_process");
const config = require("../config");

function runAdbCommand(command) {
  return new Promise((resolve, reject) => {
    const fullCommand = `adb -s ${config.ANDROID_IP} ${command}`;
    exec(fullCommand, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
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
  const lines = result.split('\n').filter(l => l.trim());
  let formatted = `📁 Files in ${path}:\n\n`;
  let dirs = [], files = [];
  
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(/\s+/);
    if (parts.length >= 8) {
      const perms = parts[0];
      const name = parts.slice(7).join(' ');
      if (perms.startsWith('d')) {
        dirs.push(`📁 ${name}/`);
      } else {
        files.push(`📄 ${name}`);
      }
    }
  }
  
  formatted += dirs.join('\n') + (dirs.length && files.length ? '\n' : '') + files.join('\n');
  return formatted;
}

async function executeAction(action, path, content) {
  let result;
  const safePath = path.replace(/"/g, '\\"');
  const safeContent = content ? content.replace(/"/g, '\\"') : "";

  switch (action) {
    case "list":
      result = await runAdbCommand(`shell ls -la ${safePath}`);
      result = formatListOutput(result, path);
      break;
    case "read":
      if (path.toLowerCase().endsWith('.pdf')) {
        result = "⚠️ Cannot read PDF files directly. Please download the file to your computer.";
      } else {
        result = await runAdbCommand(`shell cat ${safePath}`);
      }
      break;
    case "write":
      result = await runAdbCommand(`shell echo "${safeContent}" > ${safePath}`);
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
  executeAction
};
