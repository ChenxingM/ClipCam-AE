/**
 * .clipcam binary parser (Node.js Buffer)
 * Supports version 1 (single camera) and version 2 (multi-camera)
 */

const fs = require("fs");

const MAGIC = Buffer.from("CLIPCAM\0");
const INTERP_NAMES = { 0: "smooth", 1: "linear", 2: "hold" };

function parseClipCam(filePath) {
  const buf = fs.readFileSync(filePath);
  return parseClipCamBuffer(buf);
}

function _parseFCurves(buf, pos, propCount) {
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
  return { fcurves, pos };
}

function parseClipCamBuffer(buf) {
  if (buf.length < 12 || !buf.slice(0, 8).equals(MAGIC)) {
    throw new Error("Invalid .clipcam file");
  }

  let pos = 8;
  const version = buf.readUInt16LE(pos); pos += 2;

  if (version === 1) {
    // Version 1: single camera, no name
    const frameRate = buf.readDoubleLE(pos); pos += 8;
    const canvasWidth = buf.readUInt32LE(pos); pos += 4;
    const canvasHeight = buf.readUInt32LE(pos); pos += 4;
    const startFrame = buf.readUInt32LE(pos); pos += 4;
    const endFrame = buf.readUInt32LE(pos); pos += 4;
    const propCount = buf.readUInt16LE(pos); pos += 2;
    const result = _parseFCurves(buf, pos, propCount);
    return {
      version,
      cameras: [{
        name: "Camera",
        frameRate, canvasWidth, canvasHeight,
        startFrame, endFrame, fcurves: result.fcurves,
      }],
    };
  }

  // Version 2: multi-camera
  const camCount = buf.readUInt16LE(pos); pos += 2;
  const cameras = [];

  for (let c = 0; c < camCount; c++) {
    const nameLen = buf[pos]; pos += 1;
    const name = buf.toString("utf8", pos, pos + nameLen); pos += nameLen;
    const frameRate = buf.readDoubleLE(pos); pos += 8;
    const canvasWidth = buf.readUInt32LE(pos); pos += 4;
    const canvasHeight = buf.readUInt32LE(pos); pos += 4;
    const startFrame = buf.readUInt32LE(pos); pos += 4;
    const endFrame = buf.readUInt32LE(pos); pos += 4;
    const propCount = buf.readUInt16LE(pos); pos += 2;
    const result = _parseFCurves(buf, pos, propCount);
    pos = result.pos;
    cameras.push({
      name, frameRate, canvasWidth, canvasHeight,
      startFrame, endFrame, fcurves: result.fcurves,
    });
  }

  return { version, cameras };
}

// Export for Node.js (CEP mixed-context)
if (typeof module !== "undefined") {
  module.exports = { parseClipCam, parseClipCamBuffer, INTERP_NAMES };
}
