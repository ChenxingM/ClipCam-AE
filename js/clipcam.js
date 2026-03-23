/**
 * .clipcam binary parser (Node.js Buffer)
 *
 * .clipcam file format (little-endian):
 *   Header: "CLIPCAM\0" (8B), version u16=3, fps f64,
 *           canvas_w u32, canvas_h u32, start u32, end u32
 *   Camera section: count u16, [count × Block]
 *   Transform section: count u16, [count × Block]
 *   Block: name_len u8, name UTF-8, fcurve_count u16, [FCurves]
 *   FCurve: label_len u8, label UTF-8, default f64, kf_count u32
 *   Keyframe (45B): frame u32, value f64, leftSlope f64, rightSlope f64,
 *                   leftHandleWeight f64, rightHandleWeight f64, interpType u8
 */

const fs = require("fs");

const MAGIC = Buffer.from("CLIPCAM\0");
const INTERP_NAMES = { 0: "smooth", 1: "linear", 2: "hold" };

function parseClipCam(filePath) {
  var buf = fs.readFileSync(filePath);
  return parseClipCamBuffer(buf);
}

function _parseFCurves(buf, pos, propCount) {
  var fcurves = [];
  for (var p = 0; p < propCount; p++) {
    var nameLen = buf[pos]; pos += 1;
    var rawLabel = buf.toString("utf8", pos, pos + nameLen); pos += nameLen;
    var defaultValue = buf.readDoubleLE(pos); pos += 8;
    var kfCount = buf.readUInt32LE(pos); pos += 4;

    var propertyName, axis;
    var dot = rawLabel.lastIndexOf(".");
    if (dot >= 0) {
      propertyName = rawLabel.substring(0, dot);
      axis = rawLabel.substring(dot + 1);
    } else {
      propertyName = rawLabel;
      axis = "";
    }

    var keyframes = [];
    for (var k = 0; k < kfCount; k++) {
      var frame = buf.readUInt32LE(pos); pos += 4;
      var value = buf.readDoubleLE(pos); pos += 8;
      var leftSlope = buf.readDoubleLE(pos); pos += 8;
      var rightSlope = buf.readDoubleLE(pos); pos += 8;
      var leftHandleWeight = buf.readDoubleLE(pos); pos += 8;
      var rightHandleWeight = buf.readDoubleLE(pos); pos += 8;
      var interpType = buf[pos]; pos += 1;

      keyframes.push({
        frame: frame, value: value,
        leftSlope: leftSlope, rightSlope: rightSlope,
        leftHandleWeight: leftHandleWeight, rightHandleWeight: rightHandleWeight,
        interpType: interpType,
        interpName: INTERP_NAMES[interpType] || "unknown",
      });
    }

    fcurves.push({
      propertyName: propertyName, axis: axis,
      label: axis ? propertyName + "." + axis : propertyName,
      defaultValue: defaultValue, keyframes: keyframes,
    });
  }
  return { fcurves: fcurves, pos: pos };
}

function _parseBlock(buf, pos) {
  var nameLen = buf[pos]; pos += 1;
  var name = buf.toString("utf8", pos, pos + nameLen); pos += nameLen;
  var propCount = buf.readUInt16LE(pos); pos += 2;
  var result = _parseFCurves(buf, pos, propCount);
  return { name: name, fcurves: result.fcurves, pos: result.pos };
}

function parseClipCamBuffer(buf) {
  if (buf.length < 12 || !buf.slice(0, 8).equals(MAGIC)) {
    throw new Error("Invalid .clipcam file");
  }

  var pos = 8;
  var version = buf.readUInt16LE(pos); pos += 2;
  if (version !== 3) {
    throw new Error("Unsupported .clipcam version: " + version + " (expected 3)");
  }

  var frameRate = buf.readDoubleLE(pos); pos += 8;
  var canvasWidth = buf.readUInt32LE(pos); pos += 4;
  var canvasHeight = buf.readUInt32LE(pos); pos += 4;
  var startFrame = buf.readUInt32LE(pos); pos += 4;
  var endFrame = buf.readUInt32LE(pos); pos += 4;
  var cropFrameWidth = buf.readDoubleLE(pos); pos += 8;
  var cropFrameHeight = buf.readDoubleLE(pos); pos += 8;
  var cropOffsetX = buf.readDoubleLE(pos); pos += 8;
  var cropOffsetY = buf.readDoubleLE(pos); pos += 8;

  // Camera section
  var camCount = buf.readUInt16LE(pos); pos += 2;
  var cameras = [];
  for (var c = 0; c < camCount; c++) {
    var block = _parseBlock(buf, pos);
    pos = block.pos;
    cameras.push({
      name: block.name,
      frameRate: frameRate, canvasWidth: canvasWidth, canvasHeight: canvasHeight,
      startFrame: startFrame, endFrame: endFrame,
      fcurves: block.fcurves,
    });
  }

  // Transform section
  var xfmCount = buf.readUInt16LE(pos); pos += 2;
  var transforms = [];
  for (var t = 0; t < xfmCount; t++) {
    var block = _parseBlock(buf, pos);
    pos = block.pos;
    transforms.push({
      name: block.name,
      fcurves: block.fcurves,
    });
  }

  return {
    version: 3,
    frameRate: frameRate, canvasWidth: canvasWidth, canvasHeight: canvasHeight,
    startFrame: startFrame, endFrame: endFrame,
    cropFrameWidth: cropFrameWidth, cropFrameHeight: cropFrameHeight,
    cropOffsetX: cropOffsetX, cropOffsetY: cropOffsetY,
    cameras: cameras,
    transforms: transforms,
  };
}

// Export for Node.js (CEP mixed-context)
if (typeof module !== "undefined") {
  module.exports = { parseClipCam, parseClipCamBuffer, INTERP_NAMES };
}
