const config = require("../config");
const { runAdbCommand } = require("../adb/commands");
const fs = require("fs");

const TEMP_DIR = "C:\\temp\\android_control";

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
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

async function listFiles(path) {
  const result = await runAdbCommand(`shell ls -la ${path}`);
  return formatListOutput(result, path);
}

async function readFile(filePath) {
  return await runAdbCommand(`shell cat "${filePath}"`);
}

async function writeFile(path, content) {
  const filename = path.split("/").pop();
  const localFile = TEMP_DIR + "\\" + filename;
  
  fs.writeFileSync(localFile, content);
  await runAdbCommand(`push "${localFile}" "${path}"`);
  fs.unlinkSync(localFile);
  
  return "File written successfully";
}

async function deletePath(path) {
  return await runAdbCommand(`shell rm -rf "${path}"`);
}

async function createDirectory(path) {
  return await runAdbCommand(`shell mkdir -p "${path}"`);
}

async function renamePath(sourcePath, destPath) {
  return await runAdbCommand(`shell mv "${sourcePath}" "${destPath}"`);
}

async function copyPath(sourcePath, destPath) {
  return await runAdbCommand(`shell cp -r "${sourcePath}" "${destPath}"`);
}

async function searchFiles(path, pattern) {
  try {
    const searchDirs = ['DCIM', 'Download', 'Pictures', 'Documents', 'Music', 'Movies'];
    let allFiles = [];
    
    for (const dir of searchDirs) {
      const searchPath = path + '/' + dir;
      try {
        const result = await runAdbCommand('shell ls ' + searchPath);
        const lines = result.split(/[\n\r]+/).filter(l => l.trim());
        const files = lines.filter(l => l.toLowerCase().includes(pattern.toLowerCase()));
        for (const file of files) {
          allFiles.push(searchPath + '/' + file.trim());
        }
      } catch (e) {
        // Skip directories we can't access
      }
    }
    
    if (allFiles.length === 0) {
      return `No files found matching "${pattern}"`;
    }
    
    let output = `🔍 Found ${allFiles.length} files matching "${pattern}":\n\n`;
    for (const file of allFiles.slice(0, 30)) {
      const name = file.split('/').pop();
      output += `📄 ${name}\n   ${file}\n`;
    }
    
    if (allFiles.length > 30) {
      output += `\n... and ${allFiles.length - 30} more files`;
    }
    
    return output;
  } catch (error) {
    return `Error searching files: ${error.message}`;
  }
}

async function getFileInfo(filePath) {
  try {
    const statResult = await runAdbCommand('shell ls -ld ' + filePath);
    const lines = statResult.split("\n").filter(l => l.trim());
    
    if (lines.length === 0) {
      return `File not found: ${filePath}`;
    }
    
    const line = lines[0];
    const parts = line.split(/\s+/);
    const isDir = line.startsWith('d');
    const name = filePath.split('/').pop();
    
    let output = `📋 **File Info:**\n\n`;
    output += `**Name:** ${name || filePath}\n`;
    output += `**Path:** ${filePath}\n`;
    output += `**Type:** ${isDir ? 'Directory' : 'File'}\n`;
    
    if (!isDir && parts.length >= 5) {
      output += `**Size:** ${parts[4] || 'Unknown'}\n`;
    }
    
    if (parts.length >= 6) {
      output += `**Permissions:** ${parts[0]}\n`;
      output += `**Last Modified:** ${parts[5]} ${parts[6]} ${parts[7]}\n`;
    }
    
    if (!isDir) {
      const ext = filePath.split('.').pop();
      output += `**Extension:** ${ext ? '.' + ext : 'None'}\n`;
    }
    
    return output;
  } catch (error) {
    return `Error getting file info: ${error.message}`;
  }
}

async function runShell(command) {
  return await runAdbCommand(`shell ${command}`);
}

module.exports = {
  listFiles,
  readFile,
  writeFile,
  deletePath,
  createDirectory,
  renamePath,
  copyPath,
  searchFiles,
  getFileInfo,
  runShell,
  formatListOutput,
};
