const PptxGenJS = require("pptxgenjs");
const config = require("../config");
const { runAdbCommand } = require("../adb/commands");
const fs = require("fs");

const TEMP_DIR = "C:\\temp\\android_control";

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

async function readPptx(filePath) {
  const filename = filePath.split("/").pop();
  const tempFile = TEMP_DIR + "\\" + filename;

  try {
    await runAdbCommand(`pull "${filePath}" "${tempFile}"`);

    if (!fs.existsSync(tempFile)) {
      return "Error: Failed to download file";
    }

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

async function createPptx(path, content) {
  const filename = path.split("/").pop();
  const localFile = TEMP_DIR + "\\" + filename;

  try {
    const pptx = new PptxGenJS();

    const slidesData = content.split("---slide---").filter((s) => s.trim());

    if (slidesData.length === 0) {
      slidesData.push(content);
    }

    slidesData.forEach((slideContent, index) => {
      const slide = pptx.addSlide();

      const lines = slideContent.trim().split("\n");
      const title = lines[0] || `Slide ${index + 1}`;
      const body = lines.slice(1).join("\n");

      slide.addText(title, {
        x: 0.5,
        y: 0.5,
        w: "90%",
        h: 1,
        fontSize: 32,
        bold: true,
        color: "363636",
      });

      if (body) {
        slide.addText(body, {
          x: 0.5,
          y: 1.8,
          w: "90%",
          h: 5,
          fontSize: 18,
          color: "666666",
        });
      }
    });

    const buffer = await pptx.writeFile({ fileName: localFile });

    await runAdbCommand(`push "${localFile}" "${path}"`);
    fs.unlinkSync(localFile);

    return "PPTX created successfully";
  } catch (error) {
    if (fs.existsSync(localFile)) fs.unlinkSync(localFile);
    throw new Error("Failed to create PPTX: " + error.message);
  }
}

function runCommand(command) {
  return new Promise((resolve, reject) => {
    const { exec } = require("child_process");
    exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        resolve("");
      } else {
        resolve(stdout);
      }
    });
  });
}

module.exports = {
  readPptx,
  createPptx,
};
