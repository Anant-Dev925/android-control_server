const { exec } = require("child_process");
const config = require("../config");

function runAdbCommand(command) {
  return new Promise((resolve, reject) => {
    const fullCommand = `cmd /c "adb -s ${config.ANDROID_IP} ${command}"`;
    
    exec(fullCommand, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (stdout && stdout.trim()) {
        resolve(stdout);
      } else if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout || stderr || "");
      }
    });
  });
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

async function checkConnection() {
  try {
    await runAdbCommand("get-state");
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  runAdbCommand,
  runCommand,
  checkConnection,
};
