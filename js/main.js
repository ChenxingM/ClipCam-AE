/**
 * ClipCamAE — main UI logic
 */

(function () {
  var csInterface, parser, extRoot;
  var camData = null;
  var curveCanvas = null;

  // ── Init ──

  function init() {
    try {
      csInterface = new CSInterface();
      var nodePath = require("path");
      var nodeFs = require("fs");
      extRoot = csInterface.getSystemPath(SystemPath.EXTENSION);
      parser = require(nodePath.join(extRoot, "js", "clipcam.js"));

      // Load ExtendScript
      var jsxPath = nodePath.join(extRoot, "jsx", "hostscript.jsx").replace(/\\/g, "/");
      csInterface.evalScript('$.evalFile("' + jsxPath + '")');

      // Init curve canvas
      var canvas = document.getElementById("curve-canvas");
      curveCanvas = new CurveCanvas(canvas);

      // Bind events
      document.getElementById("btn-open").addEventListener("click", openFile);
      document.getElementById("btn-import").addEventListener("click", importToAE);
      document.getElementById("btn-lo-from-csp").addEventListener("click", function () {
        if (camData) {
          document.getElementById("lo-width").value = camData.canvasWidth;
          document.getElementById("lo-height").value = camData.canvasHeight;
        }
      });
      document.getElementById("btn-lo-from-comp").addEventListener("click", function () {
        csInterface.evalScript("getCompInfo()", function (r) {
          try {
            var c = JSON.parse(r);
            if (!c.error) {
              document.getElementById("lo-width").value = c.width;
              document.getElementById("lo-height").value = c.height;
            }
          } catch (e) {}
        });
      });

      // Drag and drop on the whole panel
      document.body.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.stopPropagation();
        document.body.style.outline = "2px solid #4a90d9";
      });
      document.body.addEventListener("dragleave", function (e) {
        e.preventDefault();
        document.body.style.outline = "none";
      });
      document.body.addEventListener("drop", onDrop);

      setStatus("Ready");
    } catch (e) {
      document.getElementById("status-bar").textContent = "Init error: " + e.message;
      document.getElementById("status-bar").className = "status-bar error";
      alert("ClipCamAE init error:\n" + e.message + "\n\n" + e.stack);
    }
  }

  // ── File open via ExtendScript dialog ──

  function openFile() {
    csInterface.evalScript("openFileDialog()", function (result) {
      if (result && result !== "null" && result !== "undefined" && result !== "EvalScript error.") {
        loadFile(result);
      }
    });
  }

  // ── Drag and drop ──

  function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    document.body.style.outline = "none";

    // CEP drag-drop: try multiple ways to get the file path
    var filePath = null;

    // Method 1: dataTransfer.files (may have .path in CEP Node.js context)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      var file = e.dataTransfer.files[0];
      filePath = file.path || null;
    }

    // Method 2: dataTransfer items with getAsFile
    if (!filePath && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      var item = e.dataTransfer.items[0];
      if (item.kind === "file") {
        var f = item.getAsFile();
        if (f) filePath = f.path || null;
      }
    }

    // Method 3: text/uri-list
    if (!filePath) {
      var uri = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
      if (uri) {
        // Convert file:// URI to path
        uri = uri.trim();
        if (uri.indexOf("file:///") === 0) {
          filePath = decodeURIComponent(uri.substring(8)).replace(/\//g, "\\");
        } else if (uri.indexOf("file://") === 0) {
          filePath = decodeURIComponent(uri.substring(7));
        }
      }
    }

    if (filePath && filePath.toLowerCase().indexOf(".clipcam") >= 0) {
      loadFile(filePath);
    } else if (filePath) {
      setStatus("Not a .clipcam file: " + filePath, "error");
    } else {
      setStatus("Could not get file path from drop", "error");
    }
  }

  // ── Load .clipcam file ──

  function loadFile(filePath) {
    try {
      // Normalize path
      filePath = filePath.replace(/\\/g, "/");
      camData = parser.parseClipCam(filePath);
      onFileLoaded(filePath);
    } catch (e) {
      setStatus("Error: " + e.message, "error");
    }
  }

  function onFileLoaded(filePath) {
    var d = camData;
    var fileName = filePath.split(/[\\/]/).pop();

    // Info bar
    document.getElementById("info-bar").innerHTML =
      '<span class="highlight">' + fileName + '</span> &nbsp;|&nbsp; ' +
      d.frameRate + 'fps &nbsp;|&nbsp; ' + d.canvasWidth + '\u00d7' + d.canvasHeight + ' &nbsp;|&nbsp; ' +
      'f' + d.startFrame + '\u2013' + d.endFrame + ' &nbsp;|&nbsp; ' + d.fcurves.length + ' curves';

    // Curve canvas
    curveCanvas.setCurves(d.fcurves, d.startFrame, d.endFrame);
    document.getElementById("curve-empty").style.display = "none";

    // Property list
    buildPropList(d.fcurves);

    // Auto-set LO size from clipcam canvas
    document.getElementById("lo-width").value = d.canvasWidth;
    document.getElementById("lo-height").value = d.canvasHeight;

    // Enable import
    document.getElementById("btn-import").disabled = false;
    setStatus("Loaded " + fileName);
  }

  // ── Property display names (CSP → AE) ──

  // Exposed globally for curve-canvas label display
  window.AE_NAMES = {
    "ImageCenter.X": "Anchor Point X",
    "ImageCenter.Y": "Anchor Point Y",
    "ImagePosition.X": "Position X",
    "ImagePosition.Y": "Position Y",
    "ImageRotation": "Rotation",
    "ImageScale": "Scale",
    "Opacity": "Opacity",
  };

  // Must match PROP_COLORS in curve-canvas.js
  var LABEL_COLORS = {
    "ImageCenter.X":  "#5082e6",
    "ImageCenter.Y":  "#e6b432",
    "ImagePosition.X":"#e65050",
    "ImagePosition.Y":"#50c850",
    "ImageRotation":  "#50c8c8",
    "ImageScale":     "#e080b0",
    "Opacity":        "#b450e6",
  };

  function aeDisplayName(fc) {
    return window.AE_NAMES[fc.label] || fc.label;
  }

  // ── Property analysis ──

  function isStatic(fc) {
    // No keyframes at all
    if (!fc.keyframes || fc.keyframes.length === 0) return true;
    // Has keyframes but all values are the same → no actual animation
    var first = fc.keyframes[0].value;
    for (var i = 1; i < fc.keyframes.length; i++) {
      if (Math.abs(fc.keyframes[i].value - first) > 1e-6) return false;
    }
    return true;
  }

  // ── Property list ──

  function buildPropList(fcurves) {
    var section = document.getElementById("prop-section");
    section.innerHTML = "";

    var grid = document.createElement("div");
    grid.className = "prop-grid";

    for (var i = 0; i < fcurves.length; i++) {
      var fc = fcurves[i];
      var noKf = !fc.keyframes || fc.keyframes.length === 0;
      var staticProp = isStatic(fc);
      var color = LABEL_COLORS[fc.label] || CURVE_COLORS[i % CURVE_COLORS.length];
      var kfCount = fc.keyframes.length;
      var displayName = aeDisplayName(fc);
      var defaultOn = !staticProp; // animated props default on

      var cell = document.createElement("div");
      cell.className = "prop-cell";

      var statusText;
      if (noKf) statusText = "const";
      else if (staticProp) statusText = kfCount + "kf\u2248";
      else statusText = kfCount + "kf";

      cell.innerHTML =
        '<label>' +
        '<input type="checkbox" data-index="' + i + '"' +
        (defaultOn ? ' checked' : '') +
        (noKf ? ' disabled' : '') + '>' +
        '<span class="prop-color" style="background:' + color + '"></span>' +
        '<span class="prop-name" style="color:' + color + '">' + displayName + '</span>' +
        '</label>' +
        '<span class="prop-kf-count">' + statusText + '</span>';

      if (noKf) {
        cell.classList.add("prop-const");
      }

      // All non-const props get toggle (including static ones)
      if (!noKf) {
        (function (idx, on) {
          var cb = cell.querySelector("input");
          curveCanvas.setVisible(idx, on);
          cb.addEventListener("change", function () {
            curveCanvas.setVisible(idx, this.checked);
          });
        })(i, defaultOn);
      }

      grid.appendChild(cell);
    }
    section.appendChild(grid);
  }

  // ── AE Import ──

  function importToAE() {
    if (!camData) return;

    // First check comp length
    csInterface.evalScript("getCompInfo()", function (compResult) {
      try {
        var comp = JSON.parse(compResult);
        if (comp.error) {
          setStatus("Error: " + comp.error, "error");
          return;
        }

        var clipDurationSec = (camData.endFrame - camData.startFrame + 1) / camData.frameRate;
        if (comp.duration < clipDurationSec - 0.01) {
          var msg = "Comp duration (" + comp.duration.toFixed(1) + "s) is shorter than clipcam (" +
                    clipDurationSec.toFixed(1) + "s).\n\nExtend comp to fit?";
          if (confirm(msg)) {
            csInterface.evalScript("extendCompDuration(" + clipDurationSec + ")", function () {
              doImport();
            });
            return;
          }
        }
        doImport();
      } catch (e) {
        // Can't get comp info, proceed anyway
        doImport();
      }
    });
  }

  function doImport() {
    setStatus("Importing...");
    var target = document.getElementById("target-select").value;
    var mode = document.getElementById("mode-select").value;
    var loWidth = parseInt(document.getElementById("lo-width").value) || camData.canvasWidth;
    var loHeight = parseInt(document.getElementById("lo-height").value) || camData.canvasHeight;

    var checkboxes = document.querySelectorAll("#prop-section input[type=checkbox]:checked");
    var selectedIndices = {};
    for (var i = 0; i < checkboxes.length; i++) {
      selectedIndices[checkboxes[i].getAttribute("data-index")] = true;
    }

    var properties = [];
    for (var i = 0; i < camData.fcurves.length; i++) {
      if (!selectedIndices[String(i)]) continue;
      var fc = camData.fcurves[i];
      var kfs = [];
      for (var k = 0; k < fc.keyframes.length; k++) {
        var kf = fc.keyframes[k];
        kfs.push({
          frame: kf.frame,
          value: kf.value,
          leftSlope: kf.leftSlope,
          rightSlope: kf.rightSlope,
          leftHandleWeight: kf.leftHandleWeight,
          rightHandleWeight: kf.rightHandleWeight,
          interpType: kf.interpType,
        });
      }
      properties.push({
        name: fc.propertyName,
        axis: fc.axis,
        label: fc.label,
        defaultValue: fc.defaultValue,
        keyframes: kfs,
      });
    }

    var payload = JSON.stringify({
      frameRate: camData.frameRate,
      canvasWidth: camData.canvasWidth,
      canvasHeight: camData.canvasHeight,
      startFrame: camData.startFrame,
      endFrame: camData.endFrame,
      target: target,
      mode: mode,
      loWidth: loWidth,
      loHeight: loHeight,
      properties: properties,
    });

    csInterface.evalScript("importClipCamData(" + JSON.stringify(payload) + ")", function (result) {
      try {
        var res = JSON.parse(result);
        if (res.error) {
          setStatus("Error: " + res.error, "error");
        } else {
          setStatus("Imported " + properties.length + " properties to " + (res.layerName || "layer"), "success");
        }
      } catch (e) {
        setStatus("Import failed: " + result, "error");
      }
    });
  }

  // ── Status ──

  function setStatus(msg, type) {
    var bar = document.getElementById("status-bar");
    bar.textContent = msg;
    bar.className = "status-bar" + (type ? " " + type : "");
  }

  // ── Start ──
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
