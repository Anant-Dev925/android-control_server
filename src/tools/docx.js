const { Document, Packer, Paragraph, TextRun } = require("docx");
const config = require("../config");
const { runAdbCommand } = require("../adb/commands");
const fs = require("fs");

const TEMP_DIR = "C:\\temp\\android_control";

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

async function readDocx(filePath) {
  const filename = filePath.split("/").pop();
  const tempFile = TEMP_DIR + "\\" + filename;

  try {
    await runAdbCommand(`pull "${filePath}" "${tempFile}"`);

    if (!fs.existsSync(tempFile)) {
      return "Error: Failed to download file";
    }

    const result = await runCommand(`unzip -p "${tempFile}" word/document.xml | sed "s/<[^>]*>//g"`);

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

async function createDocx(path, text) {
  const filename = path.split("/").pop();
  const localFile = TEMP_DIR + "\\" + filename;

  try {
    const paragraphs = text.split("\n\n").map((para) =>
      new Paragraph({
        children: [
          new TextRun({
            text: para,
            size: 24,
          }),
        ],
      })
    );

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: paragraphs,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(localFile, buffer);

    await runAdbCommand(`push "${localFile}" "${path}"`);
    fs.unlinkSync(localFile);

    return "DOCX created successfully";
  } catch (error) {
    if (fs.existsSync(localFile)) fs.unlinkSync(localFile);
    throw new Error("Failed to create DOCX: " + error.message);
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
  readDocx,
  createDocx,
};
