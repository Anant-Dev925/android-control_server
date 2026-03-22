const config = require("../config");
const { runAdbCommand } = require("../adb/commands");

async function getStorageInfo() {
  try {
    const result = await runAdbCommand("shell df -h /sdcard");
    const lines = result.split("\n").filter(l => l.trim());
    
    let storageInfo = "📊 **Storage Information:**\n\n";
    
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 6) {
        const filesystem = parts[0];
        const size = parts[1];
        const used = parts[2];
        const available = parts[3];
        const percent = parts[4];
        const mounted = parts[5];
        
        if (filesystem.includes("fuse") || filesystem.includes("sdcard") || filesystem.includes("data") || mounted.includes("storage")) {
          storageInfo += `**Filesystem:** ${filesystem}\n`;
          storageInfo += `**Total:** ${size}\n`;
          storageInfo += `**Used:** ${used} (${percent})\n`;
          storageInfo += `**Available:** ${available}\n`;
          storageInfo += `**Mount:** ${mounted}\n\n`;
        }
      }
    }
    
    const foldersResult = await runAdbCommand('shell "du -sh /storage/emulated/0/*"');
    const folders = foldersResult.split(/[\n\r]+/).filter(l => l.trim());
    
    const parseSize = (sizeStr) => {
      const match = sizeStr.match(/^([\d.]+)([KMGT])?/);
      if (!match) return 0;
      const num = parseFloat(match[1]);
      const unit = match[2] || '';
      const multipliers = { K: 1024, M: 1024*1024, G: 1024*1024*1024, T: 1024*1024*1024*1024 };
      return num * (multipliers[unit] || 1);
    };
    
    const sortedFolders = folders
      .map(line => {
        const match = line.match(/^([\d.]+[KMGT]?)\s+(.+)/);
        if (match) return { size: parseSize(match[1]), sizeStr: match[1], path: match[2] };
        return null;
      })
      .filter(f => f && !f.path.includes('cache'))
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);
    
    storageInfo += "📁 **Largest Folders:**\n";
    for (const folder of sortedFolders) {
      const name = folder.path.split('/').pop();
      storageInfo += `- **${name}:** ${folder.sizeStr}\n`;
    }
    
    return storageInfo;
  } catch (error) {
    return "Error getting storage info: " + error.message;
  }
}

async function getFileSizes(path = "/sdcard") {
  try {
    const result = await runAdbCommand(`shell find "${path}" -type f -exec ls -lh {} \\; 2>/dev/null | sort -k5 -hr | head -20`);
    
    let output = "📄 **Largest Files:**\n\n";
    const lines = result.split("\n").filter(l => l.trim());
    
    for (const line of lines.slice(0, 15)) {
      const match = line.match(/^([-dlwx]{10})\s+\d+\s+\d+\s+\d+\s+(\d+[KMGT]?)\s+\S+\s+\d+\s+\d+\s+\d+\s+(.+)/);
      if (match) {
        output += `- **${match[3]}:** ${match[2]}\n`;
      }
    }
    
    return output || "No files found";
  } catch (error) {
    return "Error getting file sizes: " + error.message;
  }
}

async function getBatteryStatus() {
  try {
    const result = await runAdbCommand('shell "dumpsys battery"');
    
    const levelMatch = result.match(/(?:^|\n)\s*level:\s*(\d+)/m);
    const statusMatch = result.match(/(?:^|\n)\s*status:\s*(\d+)/m);
    const tempMatch = result.match(/(?:^|\n)\s*temperature:\s*(\d+)/m);
    
    const level = levelMatch ? levelMatch[1] : "Unknown";
    const temp = tempMatch ? (parseInt(tempMatch[1]) / 10).toFixed(1) : "Unknown";
    
    let status = "Unknown";
    if (statusMatch) {
      const statusCode = parseInt(statusMatch[1]);
      switch (statusCode) {
        case 1: status = "Unknown"; break;
        case 2: status = "Charging"; break;
        case 3: status = "Discharging"; break;
        case 4: status = "Not Charging"; break;
        case 5: status = "Full"; break;
      }
    }
    
    let icon = "🔋";
    const levelNum = parseInt(level);
    if (levelNum >= 90) icon = "🟢";
    else if (levelNum >= 50) icon = "🟡";
    else if (levelNum >= 20) icon = "🟠";
    else icon = "🔴";
    
    if (status === "Charging") icon = "⚡";
    else if (status === "Full") icon = "✅";
    
    let output = `${icon} **Battery Status:**\n\n`;
    output += `**Level:** ${level}%\n`;
    output += `**Status:** ${status}\n`;
    output += `**Temperature:** ${temp}°C\n`;
    
    return output;
  } catch (error) {
    return "Error getting battery status: " + error.message;
  }
}

async function getDeviceSpecs() {
  try {
    let output = "📱 **Android Device Specifications:**\n\n";

    const props = [
      ['ro.product.model', 'Model'],
      ['ro.product.brand', 'Brand'],
      ['ro.product.manufacturer', 'Manufacturer'],
      ['ro.product.device', 'Device'],
      ['ro.build.version.release', 'Android Version'],
      ['ro.build.version.sdk', 'SDK Level'],
      ['ro.build.id', 'Build ID'],
      ['ro.build.type', 'Build Type'],
    ];

    for (const [prop, label] of props) {
      try {
        const result = await runAdbCommand('shell "getprop ' + prop + '"');
        const value = result.trim();
        if (value && value.length < 100) {
          output += `**${label}:** ${value}\n`;
        }
      } catch (e) {}
    }

    output += '\n📦 **Memory:**\n';
    try {
      const memResult = await runAdbCommand('shell "cat /proc/meminfo"');
      const memLines = memResult.split('\n');
      for (const line of memLines) {
        const parts = line.split(':');
        if (parts.length >= 2) {
          const name = parts[0].trim();
          const value = parts[1].trim();
          if (name === 'MemTotal' || name === 'MemFree') {
            output += `**${name}:** ${value}\n`;
          }
        }
      }
    } catch (e) {}

    output += '\n🖥️ **Display:**\n';
    try {
      const displayResult = await runAdbCommand('shell wm size');
      if (displayResult.trim()) {
        const displayParts = displayResult.trim().split(':');
        output += `**Resolution:** ${displayParts[displayParts.length - 1].trim()}\n`;
      }
    } catch (e) {}
    try {
      const densityResult = await runAdbCommand('shell wm density');
      if (densityResult.trim()) {
        const densityParts = densityResult.trim().split(':');
        output += `**Density:** ${densityParts[densityParts.length - 1].trim()}\n`;
      }
    } catch (e) {}

    output += '\n🔧 **CPU:**\n';
    try {
      const cpuResult = await runAdbCommand('shell "cat /proc/cpuinfo"');
      const lines = cpuResult.split('\n');
      for (const line of lines) {
        if (line.includes('Processor') || line.includes('model name')) {
          const match = line.match(/[^\:]+:\s*(.+)/);
          if (match) {
            output += `**${match[1].trim()}**\n`;
            break;
          }
        }
      }
    } catch (e) {}

    return output;
  } catch (error) {
    return "Error getting device specs: " + error.message;
  }
}

module.exports = {
  getStorageInfo,
  getFileSizes,
  getBatteryStatus,
  getDeviceSpecs,
};
