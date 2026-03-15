/**
 * ClipCamAE — main UI logic
 */
(function () {
  var csInterface, parser, extRoot;
  var camData = null;
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
  };

  var LABEL_COLORS = {
    "ImageCenter.X":  "#5082e6",
    "ImageCenter.Y":  "#e6b432",
    "ImagePosition.X":"#E65050",
    "ImagePosition.Y":"#5EDD9E",
    "ImageRotation":  "#4CC9F0",
    "ImageScale":     "#F76B8A",
    "Opacity":        "#B450E6",
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

      // Button bindings
      document.getElementById("btn-open-empty").addEventListener("click", openFile);
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
          try { var c=JSON.parse(r); if(!c.error){ document.getElementById("lo-width").value=c.width; document.getElementById("lo-height").value=c.height; } } catch(e){}
        });
      });

      // Drag & drop
      var dragCount = 0;
      document.body.addEventListener("dragenter", function (e) {
        e.preventDefault(); dragCount++;
        document.getElementById("drag-overlay").classList.add("active");
      });
      document.body.addEventListener("dragleave", function (e) {
        e.preventDefault(); dragCount--;
        if (dragCount <= 0) { dragCount=0; document.getElementById("drag-overlay").classList.remove("active"); }
      });
      document.body.addEventListener("dragover", function (e) { e.preventDefault(); });
      document.body.addEventListener("drop", onDrop);

      setStatus("");
    } catch (e) {
      alert("ClipCamAE init error:\n" + e.message);
    }
  }

  // ── File ops ──

  function openFile() {
    csInterface.evalScript("openFileDialog()", function (result) {
      if (result && result !== "null" && result !== "undefined" && result !== "EvalScript error.") loadFile(result);
    });
  }

  function onDrop(e) {
    e.preventDefault(); e.stopPropagation();
    document.getElementById("drag-overlay").classList.remove("active");
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
    if (filePath && filePath.toLowerCase().indexOf(".clipcam")>=0) loadFile(filePath);
    else setStatus("Not a .clipcam file", "error");
  }

  function loadFile(filePath) {
    try {
      filePath = filePath.replace(/\\/g, "/");
      camData = parser.parseClipCam(filePath);
      onFileLoaded(filePath);
    } catch (e) { setStatus("Error: " + e.message, "error"); }
  }

  function onFileLoaded(filePath) {
    var d = camData, fn = filePath.split(/[\\/]/).pop();

    // Switch to loaded state
    document.getElementById("empty-state").style.display = "none";
    document.getElementById("loaded-state").style.display = "flex";

    // Header info
    document.getElementById("hdr-info").textContent =
      fn + "  |  " + d.frameRate + "fps  |  " + d.canvasWidth + "\u00d7" + d.canvasHeight +
      "  |  f" + d.startFrame + "\u2013" + d.endFrame;

    // Curve canvas
    setTimeout(function () {
      curveCanvas._resize();
      curveCanvas.setCurves(d.fcurves, d.startFrame, d.endFrame);
      buildPropTags(d.fcurves);
    }, 50);

    // LO size
    document.getElementById("lo-width").value = d.canvasWidth;
    document.getElementById("lo-height").value = d.canvasHeight;
    document.getElementById("btn-import").disabled = false;
    setStatus("Loaded " + fn);
  }

  // ── Property tags ──

  function buildPropTags(fcurves) {
    var bar = document.getElementById("prop-bar");
    bar.innerHTML = "";

    for (var i=0; i<fcurves.length; i++) {
      var fc = fcurves[i];
      var noKf = !fc.keyframes || fc.keyframes.length===0;
      var staticProp = isStatic(fc);
      var col = LABEL_COLORS[fc.label] || CURVE_COLORS[i%CURVE_COLORS.length];
      var kfCount = fc.keyframes.length;
      var name = aeDisplayName(fc);
      var defaultOn = !staticProp;

      var tag = document.createElement("button");
      tag.className = "prop-tag" + (defaultOn ? " active" : "") + (noKf ? " disabled" : "");
      tag.setAttribute("data-index", i);

      var statusTxt = noKf ? "const" : (staticProp ? kfCount+"kf\u2248" : kfCount+"kf");
      tag.innerHTML =
        '<span class="prop-dot" style="background:'+col+'"></span>' +
        '<span class="prop-label">'+name+'</span>' +
        '<span class="prop-kf">'+statusTxt+'</span>';

      if (!noKf) {
        (function(idx, on) {
          curveCanvas.setVisible(idx, on);
          tag.addEventListener("click", function() {
            var isActive = this.classList.toggle("active");
            curveCanvas.setVisible(idx, isActive);
          });
        })(i, defaultOn);
      }
      bar.appendChild(tag);
    }
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
      if (!sel[String(i)]) continue;
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
