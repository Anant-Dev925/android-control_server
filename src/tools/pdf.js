const PDFDocument = require("pdfkit");
const { PDFDocument: PDFLib, rgb } = require("pdf-lib");
const config = require("../config");
const { runAdbCommand } = require("../adb/commands");
const fs = require("fs");

const TEMP_DIR = "C:\\temp\\android_control";

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

async function readPdf(filePath) {
  const filename = filePath.split("/").pop();
  const tempFile = TEMP_DIR + "\\" + filename;

  try {
    await runAdbCommand(`pull "${filePath}" "${tempFile}"`);

    if (!fs.existsSync(tempFile)) {
      return "Error: Failed to download PDF";
    }

    const result = await runCommand(`pdftotext "${tempFile}" -`);

    fs.unlinkSync(tempFile);

    if (result && result.trim()) {
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
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    return `Error reading PDF: ${error.message}`;
  }
}

async function createPdf(path, text) {
  return new Promise((resolve, reject) => {
    const filename = path.split("/").pop();
    const localFile = TEMP_DIR + "\\" + filename;

    try {
      const doc = new PDFDocument();
      const stream = fs.createWriteStream(localFile);

      stream.on("finish", async () => {
        try {
          await runAdbCommand(`push "${localFile}" "${path}"`);
          fs.unlinkSync(localFile);
          resolve("PDF created successfully");
        } catch (e) {
          if (fs.existsSync(localFile)) fs.unlinkSync(localFile);
          reject(new Error("Failed to push PDF: " + e.message));
        }
      });

      stream.on("error", (err) => {
        reject(new Error("Failed to create PDF: " + err.message));
      });

      doc.pipe(stream);
      doc.text(text);
      doc.end();
    } catch (error) {
      reject(new Error("Failed to create PDF: " + error.message));
    }
  });
}

async function editPdf(filePath, newText, append = true) {
  const filename = filePath.split("/").pop();
  const tempFile = TEMP_DIR + "\\" + filename;
  const outputFile = TEMP_DIR + "\\temp_edit_" + filename;

  try {
    await runAdbCommand(`pull "${filePath}" "${tempFile}"`);

    if (!fs.existsSync(tempFile)) {
      throw new Error("Failed to download PDF for editing");
    }

    const pdfBytes = fs.readFileSync(tempFile);
    const pdfDoc = await PDFLib.load(pdfBytes);

    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    const { height } = lastPage.getSize();

    lastPage.drawText(newText, {
      x: 50,
      y: height - 50,
      size: 12,
      color: rgb(0, 0, 0),
    });

    const modifiedPdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputFile, modifiedPdfBytes);

    await runAdbCommand(`push "${outputFile}" "${filePath}"`);

    fs.unlinkSync(tempFile);
    fs.unlinkSync(outputFile);

    return "PDF edited successfully";
  } catch (error) {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
    throw error;
  }
}

async function mergePdfs(filePaths, outputPath) {
  const tempFiles = [];

  try {
    for (const filePath of filePaths) {
      const filename = filePath.split("/").pop();
      const tempFile = TEMP_DIR + "\\" + filename;
      tempFiles.push({ filePath, tempFile });
      await runAdbCommand(`pull "${filePath}" "${tempFile}"`);
    }

    const mergedPdf = await PDFLib.createDocument();
    
    for (const { tempFile } of tempFiles) {
      if (fs.existsSync(tempFile)) {
        const pdfBytes = fs.readFileSync(tempFile);
        const srcDoc = await PDFLib.load(pdfBytes);
        const srcPages = srcDoc.getPages();
        for (const page of srcPages) {
          const { width, height } = page.getSize();
          const newPage = mergedPdf.addPage([width, height]);
          const streams = page.getStreams();
          for (const stream of streams) {
            newPage.doc.context.write(
              newPage.doc.context.stream(
                Buffer.from(page.getCommands().map(cmd => cmd.toString()).join('\n'))
              )
            );
          }
        }
      }
    }

    const outputFilename = outputPath.split("/").pop();
    const mergedFile = TEMP_DIR + "\\" + outputFilename;
    const mergedPdfBytes = await mergedPdf.save();
    fs.writeFileSync(mergedFile, mergedPdfBytes);

    await runAdbCommand(`push "${mergedFile}" "${outputPath}"`);

    for (const { tempFile } of tempFiles) {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
    fs.unlinkSync(mergedFile);

    return "PDFs merged successfully";
  } catch (error) {
    for (const { tempFile } of tempFiles) {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
    throw error;
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
  readPdf,
  createPdf,
  editPdf,
  mergePdfs,
};
