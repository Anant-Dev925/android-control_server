const express = require("express");
const { exec } = require("child_process");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const ANDROID_IP = "100.125.170.26:5555";

function runAdbCommand(command) {
  return new Promise((resolve, reject) => {
    const fullCommand = `adb -s ${ANDROID_IP} ${command}`;
    exec(fullCommand, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(error.message);
      } else {
        resolve(stdout);
      }
    });
  });
}

app.post("/api/execute", async (req, res) => {
  try {
    const { command, action, path, content } = req.body;

    let result;

    switch (action) {
      case "list":
        result = await runAdbCommand(`shell ls -la "${path}"`);
        break;
      case "read":
        result = await runAdbCommand(`shell cat "${path}"`);
        break;
      case "write":
        result = await runAdbCommand(`shell echo "${content}" > "${path}"`);
        break;
      case "delete":
        result = await runAdbCommand(`shell rm "${path}"`);
        break;
      case "push":
        result = await runAdbCommand(`push "${content}" "${path}"`);
        break;
      case "pull":
        result = await runAdbCommand(`pull "${path}" "${content}"`);
        break;
      case "mkdir":
        result = await runAdbCommand(`shell mkdir "${path}"`);
        break;
      case "exists":
        result = await runAdbCommand(`shell ls "${path}"`);
        break;
      default:
        result = await runAdbCommand(`shell ${command}`);
    }

    res.json({ success: true, result: result || "Done" });
  } catch (error) {
    res.status(500).json({ success: false, error: error });
  }
});

app.get("/api/status", (req, res) => {
  runAdbCommand("get-state")
    .then(() => res.json({ connected: true }))
    .catch(() => res.json({ connected: false }));
});

const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access via: http://100.85.62.80:${PORT}`);
});
