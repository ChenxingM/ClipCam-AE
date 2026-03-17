/**
 * ClipCamAE — main UI logic
 */
(function () {
  var csInterface, parser, extRoot;
  var fileData = null;  // { cameras: [...] } from parser
  var camData = null;   // currently selected camera
  var curveCanvas = null;

  // ── AE property names + colors ──

  window.AE_NAMES = {
    "ImageCenter.X": "Anchor Point X",
    "ImageCenter.Y": "Anchor Point Y",
    "ImagePosition.X": "Position X",
    "ImagePosition.Y": "Position Y",
    "ImageRotation": "Rotation",
    "ImageScale": "Scale",
    "Opacity": "Opacity",
    "_Speed": "Speed",
  };

  var LABEL_COLORS = {
    "ImageCenter.X":  "#5082e6",
    "ImageCenter.Y":  "#e6b432",
    "ImagePosition.X":"#E65050",
    "ImagePosition.Y":"#5EDD9E",
    "ImageRotation":  "#4CC9F0",
    "ImageScale":     "#F76B8A",
    "Opacity":        "#B450E6",
    "_Speed":         "#FFB347",
  };

  function aeDisplayName(fc) { return window.AE_NAMES[fc.label] || fc.label; }

  function isStatic(fc) {
    if (!fc.keyframes || fc.keyframes.length === 0) return true;
    var v0 = fc.keyframes[0].value;
    for (var i=1; i<fc.keyframes.length; i++) {
      if (Math.abs(fc.keyframes[i].value - v0) > 1e-6) return false;
    }
    return true;
  }

  // ── Speed curve ──

  function _findFC(label) {
    if (!camData) return null;
    for (var i = 0; i < camData.fcurves.length; i++) {
      if (camData.fcurves[i].label === label) return camData.fcurves[i];
    }
    return null;
  }

  function _speedAtFrame(posX, posY, f) {
    var x0 = evaluateFCurveAtFrame(posX, f - 0.5), y0 = evaluateFCurveAtFrame(posY, f - 0.5);
    var x1 = evaluateFCurveAtFrame(posX, f + 0.5), y1 = evaluateFCurveAtFrame(posY, f + 0.5);
    return Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
  }

  function computeSpeedCurve(fcurves, sf, ef) {
    var posX = null, posY = null;
    for (var i = 0; i < fcurves.length; i++) {
      if (fcurves[i].label === "ImagePosition.X") posX = fcurves[i];
      if (fcurves[i].label === "ImagePosition.Y") posY = fcurves[i];
    }
    if (!posX || !posY || !posX.keyframes.length || !posY.keyframes.length) return null;
    // Same keyframes as posX
    var kfs = [];
    var speeds = [];
    for (var ki = 0; ki < posX.keyframes.length; ki++) {
      var pk = posX.keyframes[ki];
      var spd = _speedAtFrame(posX, posY, pk.frame);
      speeds.push(spd);
      var pyKf = posY.keyframes[ki] || pk;
      kfs.push({
        frame: pk.frame, value: spd,
        leftSlope: 0, rightSlope: 0,
        leftHandleWeight: (Math.abs(pk.leftHandleWeight) + Math.abs(pyKf.leftHandleWeight)) / 2,
        rightHandleWeight: (Math.abs(pk.rightHandleWeight) + Math.abs(pyKf.rightHandleWeight)) / 2,
        interpType: pk.interpType,
      });
    }
    // Estimate slopes from finite differences
    for (var ki = 0; ki < kfs.length; ki++) {
      if (ki < kfs.length - 1) {
        kfs[ki].rightSlope = (speeds[ki + 1] - speeds[ki]) / (kfs[ki + 1].frame - kfs[ki].frame);
      }
      if (ki > 0) {
        kfs[ki].leftSlope = (speeds[ki] - speeds[ki - 1]) / (kfs[ki].frame - kfs[ki - 1].frame);
      }
      if (ki === 0) kfs[ki].leftSlope = kfs[ki].rightSlope;
      if (ki === kfs.length - 1) kfs[ki].rightSlope = kfs[ki].leftSlope;
    }
    return {
      label: "_Speed", propertyName: "Speed", axis: "", defaultValue: 0,
      keyframes: kfs, _speedCurve: true, _lockFrames: true,
    };
  }

  // Refresh speed curve values from current X/Y data
  // Only updates VALUES — preserves user-edited slopes/weights
  function refreshSpeedCurve() {
    if (!camData) return;
    var posX = _findFC("ImagePosition.X"), posY = _findFC("ImagePosition.Y");
    var sc = _findFC("_Speed");
    if (!posX || !posY || !sc) return;
    for (var ki = 0; ki < sc.keyframes.length && ki < posX.keyframes.length; ki++) {
      sc.keyframes[ki].value = _speedAtFrame(posX, posY, sc.keyframes[ki].frame);
    }
  }

  // Propagate speed value edit → scale X/Y slopes
  var _speedDragOrig = null;

  function onSpeedDragStart(ki) {
    var posX = _findFC("ImagePosition.X"), posY = _findFC("ImagePosition.Y");
    var sc = _findFC("_Speed");
    if (!posX || !posY || !sc) return;
    _speedDragOrig = [];
    for (var i = 0; i < posX.keyframes.length; i++) {
      var px = posX.keyframes[i], py = posY.keyframes[i];
      var f = px.frame;
      // Velocity direction from finite difference (actual motion direction)
      var vx = evaluateFCurveAtFrame(posX, f + 0.5) - evaluateFCurveAtFrame(posX, f - 0.5);
      var vy = evaluateFCurveAtFrame(posY, f + 0.5) - evaluateFCurveAtFrame(posY, f - 0.5);
      _speedDragOrig.push({
        pxL: px.leftSlope, pxR: px.rightSlope,
        pyL: py.leftSlope, pyR: py.rightSlope,
        pxLW: px.leftHandleWeight, pxRW: px.rightHandleWeight,
        pyLW: py.leftHandleWeight, pyRW: py.rightHandleWeight,
        vx: vx, vy: vy,
        speed: sc.keyframes[i].value,
      });
    }
  }

  function onSpeedDragMove(ki) {
    if (!_speedDragOrig) return;
    var posX = _findFC("ImagePosition.X"), posY = _findFC("ImagePosition.Y");
    var sc = _findFC("_Speed");
    if (!posX || !posY || !sc) return;
    var orig = _speedDragOrig[ki];
    if (!orig || orig.speed < 0.001) return;
    var newSpeed = Math.max(0, sc.keyframes[ki].value);
    var ratio = newSpeed / orig.speed;
    var px = posX.keyframes[ki], py = posY.keyframes[ki];
    var hasSlopes = Math.abs(orig.pxL) > 0.001 || Math.abs(orig.pxR) > 0.001 ||
                    Math.abs(orig.pyL) > 0.001 || Math.abs(orig.pyR) > 0.001;
    if (hasSlopes) {
      // Scale existing slopes and weights
      px.leftSlope = orig.pxL * ratio; px.rightSlope = orig.pxR * ratio;
      py.leftSlope = orig.pyL * ratio; py.rightSlope = orig.pyR * ratio;
      px.leftHandleWeight = orig.pxLW * ratio; px.rightHandleWeight = orig.pxRW * ratio;
      py.leftHandleWeight = orig.pyLW * ratio; py.rightHandleWeight = orig.pyRW * ratio;
    } else {
      // Slopes are all 0 — derive from actual motion direction
      // Also promote to smooth so slopes actually affect the bezier
      px.leftSlope = orig.vx * ratio; px.rightSlope = orig.vx * ratio;
      py.leftSlope = orig.vy * ratio; py.rightSlope = orig.vy * ratio;
      if (px.interpType === 1) px.interpType = 0;
      if (py.interpType === 1) py.interpType = 0;
    }
  }

  function onSpeedDragEnd() { _speedDragOrig = null; }

  // Propagate speed handle edit → copy weights to X/Y
  function onSpeedHandleMove(ki) {
    var posX = _findFC("ImagePosition.X"), posY = _findFC("ImagePosition.Y");
    var sc = _findFC("_Speed");
    if (!posX || !posY || !sc || ki >= sc.keyframes.length) return;
    var sk = sc.keyframes[ki];
    var px = posX.keyframes[ki], py = posY.keyframes[ki];
    px.leftHandleWeight = sk.leftHandleWeight;
    px.rightHandleWeight = sk.rightHandleWeight;
    py.leftHandleWeight = sk.leftHandleWeight;
    py.rightHandleWeight = sk.rightHandleWeight;
  }

  // ── Init ──

  function init() {
    try {
      csInterface = new CSInterface();
      var nodePath = require("path");
      extRoot = csInterface.getSystemPath(SystemPath.EXTENSION);
      parser = require(nodePath.join(extRoot, "js", "clipcam.js"));

      var jsxPath = nodePath.join(extRoot, "jsx", "hostscript.jsx").replace(/\\/g, "/");
      csInterface.evalScript('$.evalFile("' + jsxPath + '")');

      curveCanvas = new CurveCanvas(document.getElementById("curve-canvas"));
      curveCanvas.onDragStart = function(ci, ki, type) {
        if (camData && camData.fcurves[ci] && camData.fcurves[ci]._speedCurve && type === "kf") {
          onSpeedDragStart(ki);
        }
      };
      curveCanvas.onDragUpdate = function(ci, ki, type) {
        if (!camData || !camData.fcurves[ci] || !camData.fcurves[ci]._speedCurve) return;
        if (type === "kf") onSpeedDragMove(ki);
        else if (type === "handle") onSpeedHandleMove(ki);
      };
      curveCanvas.onCurveEdited = function(info) {
        if (!camData) return;
        if (info.type === "undo") { refreshSpeedCurve(); return; }
        var fc = info.ci >= 0 ? camData.fcurves[info.ci] : null;
        if (fc && fc._speedCurve) {
          onSpeedDragEnd();
          refreshSpeedCurve(); // recompute from X/Y so speed stays accurate
        } else {
          refreshSpeedCurve();
        }
      };
      window._cc = curveCanvas; // debug access

      // Button bindings
      document.getElementById("btn-open-empty").addEventListener("click", openFile);
      document.getElementById("btn-open").addEventListener("click", openFile);
      document.getElementById("btn-import").addEventListener("click", importToAE);
      document.getElementById("cam-select").addEventListener("change", function () {
        selectCamera(parseInt(this.value));
      });
      document.getElementById("btn-lo-from-csp").addEventListener("click", function () {
        if (camData) {
          document.getElementById("lo-width").value = camData.canvasWidth;
          document.getElementById("lo-height").value = camData.canvasHeight;
        }
      });
      document.getElementById("btn-lo-from-comp").addEventListener("click", function () {
        csInterface.evalScript("getCompInfo()", function (r) {
          try { var c=JSON.parse(r); if(!c.error){ document.getElementById("lo-width").value=c.width; document.getElementById("lo-height").value=c.height; } } catch(e){}
        });
      });

      // Drag & drop
      var dragCount = 0;
      function showDrag() {
        // Only show overlay when file is loaded (has content to cover)
        var loaded = document.getElementById("loaded-state").style.display !== "none";
        if (loaded) document.getElementById("drag-overlay").classList.add("active");
        document.body.classList.add("dragging");
      }
      function hideDrag() {
        dragCount = 0;
        document.getElementById("drag-overlay").classList.remove("active");
        document.body.classList.remove("dragging");
      }
      document.body.addEventListener("dragenter", function (e) {
        e.preventDefault(); dragCount++; showDrag();
      });
      document.body.addEventListener("dragleave", function (e) {
        e.preventDefault(); dragCount--;
        if (dragCount <= 0) hideDrag();
      });
      document.body.addEventListener("dragover", function (e) { e.preventDefault(); });
      document.body.addEventListener("drop", function (e) { hideDrag(); onDrop(e); });
      // Fallback: hide overlay if drag ends without drop (cursor left window)
      document.body.addEventListener("dragend", function () { hideDrag(); });
      window.addEventListener("blur", function () { if (dragCount > 0) hideDrag(); });

      setStatus("");
    } catch (e) {
      alert("ClipCamAE init error:\n" + e.message);
    }
  }

  // ── File ops ──

  function openFile() {
    csInterface.evalScript("openFileDialog()", function (result) {
      if (!result || result === "null" || result === "undefined" || result === "EvalScript error.") return;
      if (result.toLowerCase().indexOf(".clip") >= 0 && result.toLowerCase().indexOf(".clipcam") < 0) {
        convertAndLoad(result);
      } else {
        loadFile(result);
      }
    });
  }

  function onDrop(e) {
    e.preventDefault(); e.stopPropagation();
    var filePath = null;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) filePath = e.dataTransfer.files[0].path || null;
    if (!filePath && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      var item = e.dataTransfer.items[0];
      if (item.kind==="file") { var f=item.getAsFile(); if(f) filePath=f.path||null; }
    }
    if (!filePath) {
      var uri = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
      if (uri) { uri=uri.trim(); if(uri.indexOf("file:///")===0) filePath=decodeURIComponent(uri.substring(8)).replace(/\//g,"\\"); }
    }
    if (filePath) {
      var lower = filePath.toLowerCase();
      if (lower.indexOf(".clipcam") >= 0) loadFile(filePath);
      else if (lower.indexOf(".clip") >= 0) convertAndLoad(filePath);
      else setStatus("Not a .clip or .clipcam file", "error");
    }
  }

  function convertAndLoad(clipPath) {
    clipPath = clipPath.replace(/\\/g, "/");
    var nodePath = require("path");
    var execFile = require("child_process").execFile;
    var convExe = nodePath.join(extRoot, "bin", "clipcam-conv.exe");
    var tmpOut = nodePath.join(require("os").tmpdir(), "clipcam_" + Date.now() + ".clipcam");
    setStatus("Converting .clip...");
    execFile(convExe, [clipPath, tmpOut], function (err, stdout, stderr) {
      if (err) {
        setStatus("Convert failed: " + (stderr || err.message), "error");
        return;
      }
      try {
        fileData = parser.parseClipCam(tmpOut.replace(/\\/g, "/"));
        selectCamera(0, clipPath);
      } catch (e) { setStatus("Error: " + e.message, "error"); }
      try { require("fs").unlinkSync(tmpOut); } catch(e) {}
    });
  }

  function loadFile(filePath) {
    try {
      filePath = filePath.replace(/\\/g, "/");
      fileData = parser.parseClipCam(filePath);
      selectCamera(0, filePath);
    } catch (e) { setStatus("Error: " + e.message, "error"); }
  }

  function selectCamera(idx, filePath) {
    if (!fileData || idx >= fileData.cameras.length) return;
    camData = fileData.cameras[idx];
    // Build camera selector
    var sel = document.getElementById("cam-select");
    if (fileData.cameras.length > 1) {
      sel.innerHTML = "";
      for (var i = 0; i < fileData.cameras.length; i++) {
        var opt = document.createElement("option");
        opt.value = i;
        opt.textContent = fileData.cameras[i].name || ("Camera " + (i + 1));
        sel.appendChild(opt);
      }
      sel.value = idx;
      sel.style.display = "";
    } else {
      sel.style.display = "none";
    }
    onFileLoaded(filePath || "");
  }

  function onFileLoaded(filePath) {
    var d = camData, fn = filePath.split(/[\\/]/).pop();

    // Switch to loaded state
    document.getElementById("empty-state").style.display = "none";
    document.getElementById("loaded-state").style.display = "flex";

    // Header info
    document.getElementById("hdr-info").textContent =
      fn + "  |  " + d.frameRate + "fps  |  " + d.canvasWidth + "\u00d7" + d.canvasHeight +
      "  |  Frame " + d.startFrame + "\u2013" + d.endFrame;

    // Compute and append speed curve
    d.fcurves = d.fcurves.filter(function(fc) { return !fc._speedCurve; });
    var sc = computeSpeedCurve(d.fcurves, d.startFrame, d.endFrame);
    if (sc) d.fcurves.push(sc);

    // Build prop tags first (affects layout), then resize canvas
    // Collect which indices should be visible
    var activeIndices = buildPropTags(d.fcurves);
    // Wait for layout to settle, then size canvas correctly
    requestAnimationFrame(function () {
      curveCanvas._resize();
      curveCanvas.setCurves(d.fcurves, d.startFrame, d.endFrame);
      // Restore visibility AFTER setCurves (which clears visibleSet)
      for (var i = 0; i < activeIndices.length; i++) {
        curveCanvas.setVisible(activeIndices[i], true);
      }
    });

    // LO size
    document.getElementById("lo-width").value = d.canvasWidth;
    document.getElementById("lo-height").value = d.canvasHeight;
    document.getElementById("btn-import").disabled = false;
    setStatus("Loaded " + fn);
  }

  // ── Property tags ──

  // Group layout: [Anchor X/Y] [Position X/Y] [Rotation, Scale] [Opacity]
  var PROP_GROUPS = [
    ["ImageCenter.X", "ImageCenter.Y"],
    ["ImagePosition.X", "ImagePosition.Y"],
    ["ImageRotation", "ImageScale"],
    ["Opacity"],
    ["_Speed"],
  ];

  function buildPropTags(fcurves) {
    var bar = document.getElementById("prop-bar");
    bar.innerHTML = "";
    var activeIndices = [];

    // Build index map: label → fcurve index
    var labelToIdx = {};
    for (var i = 0; i < fcurves.length; i++) labelToIdx[fcurves[i].label] = i;

    for (var gi = 0; gi < PROP_GROUPS.length; gi++) {
      var group = PROP_GROUPS[gi];
      var col = document.createElement("div");
      col.className = "prop-col";

      for (var pi = 0; pi < group.length; pi++) {
        var label = group[pi];
        var idx = labelToIdx[label];
        if (idx === undefined) continue;
        var fc = fcurves[idx];

        var noKf = !fc.keyframes || fc.keyframes.length === 0;
        var staticProp = isStatic(fc);
        var color = LABEL_COLORS[fc.label] || CURVE_COLORS[idx % CURVE_COLORS.length];
        var kfCount = fc.keyframes.length;
        var name = aeDisplayName(fc);
        var defaultOn = !staticProp;

        if (defaultOn) activeIndices.push(idx);

        var tag = document.createElement("button");
        tag.className = "prop-tag" + (defaultOn ? " active" : "") + (noKf ? " disabled" : "");
        tag.setAttribute("data-index", idx);

        var statusTxt = fc._speedCurve ? "calc" : (noKf ? "const" : (staticProp ? kfCount + "kf\u2248" : kfCount + "kf"));
        tag.innerHTML =
          '<span class="prop-dot" style="background:' + color + '"></span>' +
          '<span class="prop-label">' + name + '</span>' +
          '<span class="prop-kf">' + statusTxt + '</span>';

        if (!noKf) {
          (function (i2) {
            tag.addEventListener("click", function () {
              var isActive = this.classList.toggle("active");
              curveCanvas.setVisible(i2, isActive);
            });
          })(idx);
        }
        col.appendChild(tag);
      }

      if (col.childNodes.length > 0) bar.appendChild(col);
    }
    return activeIndices;
  }

  // ── Import ──

  function importToAE() {
    if (!camData) return;
    csInterface.evalScript("getCompInfo()", function (compResult) {
      try {
        var comp = JSON.parse(compResult);
        if (comp.error) { setStatus("Error: "+comp.error, "error"); return; }
        var dur = (camData.endFrame - camData.startFrame + 1) / camData.frameRate;
        if (comp.duration < dur - 0.01) {
          if (confirm("Comp is shorter ("+comp.duration.toFixed(1)+"s) than clipcam ("+dur.toFixed(1)+"s).\n\nExtend comp?")) {
            csInterface.evalScript("extendCompDuration("+dur+")", function(){ doImport(); }); return;
          }
        }
        doImport();
      } catch(e) { doImport(); }
    });
  }

  function doImport() {
    setStatus("Importing...");
    var target = document.getElementById("target-select").value;
    var mode = document.getElementById("mode-select").value;
    var loW = parseInt(document.getElementById("lo-width").value)||camData.canvasWidth;
    var loH = parseInt(document.getElementById("lo-height").value)||camData.canvasHeight;

    // Collect active tags
    var activeTags = document.querySelectorAll("#prop-bar .prop-tag.active");
    var sel = {};
    for (var i=0;i<activeTags.length;i++) sel[activeTags[i].getAttribute("data-index")] = true;

    var props = [];
    for (var i=0; i<camData.fcurves.length; i++) {
      if (!sel[String(i)] || camData.fcurves[i]._speedCurve) continue;
      var fc = camData.fcurves[i];
      var kfs = [];
      for (var k=0; k<fc.keyframes.length; k++) {
        var kf = fc.keyframes[k];
        kfs.push({ frame:kf.frame, value:kf.value, leftSlope:kf.leftSlope, rightSlope:kf.rightSlope,
                    leftHandleWeight:kf.leftHandleWeight, rightHandleWeight:kf.rightHandleWeight, interpType:kf.interpType });
      }
      props.push({ name:fc.propertyName, axis:fc.axis, label:fc.label, defaultValue:fc.defaultValue, keyframes:kfs });
    }

    var payload = JSON.stringify({
      frameRate:camData.frameRate, canvasWidth:camData.canvasWidth, canvasHeight:camData.canvasHeight,
      startFrame:camData.startFrame, endFrame:camData.endFrame,
      target:target, mode:mode, loWidth:loW, loHeight:loH, properties:props
    });

    csInterface.evalScript("importClipCamData("+JSON.stringify(payload)+")", function(result) {
      try {
        var res = JSON.parse(result);
        if (res.error) setStatus("Error: "+res.error, "error");
        else setStatus("\u2713 Imported "+props.length+" properties to "+(res.layerName||"layer"), "success");
      } catch(e) { setStatus("Import failed", "error"); }
    });
  }

  // ── Status ──

  function setStatus(msg, type) {
    var el = document.getElementById("status-bar");
    el.textContent = msg;
    el.className = "status-text" + (type ? " "+type : "");
  }

  // ── Start ──
  if (document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
