/**
 * .clipcam binary parser (Node.js Buffer)
 */

const fs = require("fs");

const MAGIC = Buffer.from("CLIPCAM\0");
const INTERP_NAMES = { 0: "smooth", 1: "linear", 2: "hold" };

function parseClipCam(filePath) {
  const buf = fs.readFileSync(filePath);
  return parseClipCamBuffer(buf);
}

function parseClipCamBuffer(buf) {
  if (buf.length < 36 || !buf.slice(0, 8).equals(MAGIC)) {
    throw new Error("Invalid .clipcam file");
  }

  let pos = 8;
  const version = buf.readUInt16LE(pos); pos += 2;
  const frameRate = buf.readDoubleLE(pos); pos += 8;
  const canvasWidth = buf.readUInt32LE(pos); pos += 4;
  const canvasHeight = buf.readUInt32LE(pos); pos += 4;
  const startFrame = buf.readUInt32LE(pos); pos += 4;
  const endFrame = buf.readUInt32LE(pos); pos += 4;

  const propCount = buf.readUInt16LE(pos); pos += 2;
  const fcurves = [];

  for (let p = 0; p < propCount; p++) {
    const nameLen = buf[pos]; pos += 1;
    const rawLabel = buf.toString("utf8", pos, pos + nameLen); pos += nameLen;
    const defaultValue = buf.readDoubleLE(pos); pos += 8;
    const kfCount = buf.readUInt32LE(pos); pos += 4;

    let propertyName, axis;
    const dot = rawLabel.lastIndexOf(".");
    if (dot >= 0) {
      propertyName = rawLabel.substring(0, dot);
      axis = rawLabel.substring(dot + 1);
    } else {
      propertyName = rawLabel;
      axis = "";
    }

    const keyframes = [];
    for (let k = 0; k < kfCount; k++) {
      const frame = buf.readUInt32LE(pos); pos += 4;
      const value = buf.readDoubleLE(pos); pos += 8;
      const leftSlope = buf.readDoubleLE(pos); pos += 8;
      const rightSlope = buf.readDoubleLE(pos); pos += 8;
      const leftHandleWeight = buf.readDoubleLE(pos); pos += 8;
      const rightHandleWeight = buf.readDoubleLE(pos); pos += 8;
      const autoSmooth = buf.readDoubleLE(pos); pos += 8;
      const interpType = buf[pos]; pos += 1;

      keyframes.push({
        frame, value, leftSlope, rightSlope,
        leftHandleWeight, rightHandleWeight, autoSmooth,
        interpType,
        interpName: INTERP_NAMES[interpType] || "unknown",
      });
    }

    fcurves.push({
      propertyName, axis,
      label: axis ? `${propertyName}.${axis}` : propertyName,
      defaultValue, keyframes,
    });
  }

  return {
    version, frameRate, canvasWidth, canvasHeight,
    startFrame, endFrame, fcurves,
  };
}

// Export for Node.js (CEP mixed-context)
if (typeof module !== "undefined") {
  module.exports = { parseClipCam, parseClipCamBuffer, INTERP_NAMES };
}
