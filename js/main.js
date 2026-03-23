/**
 * ClipCamAE — main UI logic (Camera + Layer tabs)
 */
(function () {
  var csInterface, parser, extRoot;
  var fileData = null;   // { cameras:[], transforms:[], frameRate, ... }
  var camData = null;    // currently selected camera block
  var curveCanvas = null;
  var layerCurveCanvas = null;
  var currentTab = "camera";

  // ── AE property names + colors ──

  window.AE_NAMES = {
    "ImageCenter.X": "Anchor X",
    "ImageCenter.Y": "Anchor Y",
    "ImagePosition.X": "Position X",
    "ImagePosition.Y": "Position Y",
    "ImageRotation": "Rotation",
    "ImageScale": "Scale",
    "Opacity": "Opacity",
    "ImageAspectScale.X": "Scale X",
    "ImageAspectScale.Y": "Scale Y",
  };

  var LABEL_COLORS = {
    "ImageCenter.X":  "#5082e6",
    "ImageCenter.Y":  "#e6b432",
    "ImagePosition.X":"#E65050",
    "ImagePosition.Y":"#5EDD9E",
    "ImageRotation":  "#4CC9F0",
    "ImageScale":     "#F76B8A",
    "Opacity":        "#B450E6",
    "ImageAspectScale.X": "#F76B8A",
    "ImageAspectScale.Y": "#e6b432",
  };

  function aeDisplayName(fc) { return window.AE_NAMES[fc.label] || fc.label; }

  function isStatic(fc) {
    if (!fc.keyframes || fc.keyframes.length === 0) return true;
    var v0 = fc.keyframes[0].value;
    for (var i = 1; i < fc.keyframes.length; i++) {
      if (Math.abs(fc.keyframes[i].value - v0) > 1e-6) return false;
    }
    return true;
  }


  // ══════════════════════════════════════════════════════
  // Init
  // ══════════════════════════════════════════════════════

  function init() {
    try {
      csInterface = new CSInterface();
      var nodePath = require("path");
      extRoot = csInterface.getSystemPath(SystemPath.EXTENSION);
      parser = require(nodePath.join(extRoot, "js", "clipcam.js"));

      var jsxPath = nodePath.join(extRoot, "jsx", "hostscript.jsx").replace(/\\/g, "/");
      csInterface.evalScript('$.evalFile("' + jsxPath + '")');

      // Camera curve canvas
      curveCanvas = new CurveCanvas(document.getElementById("curve-canvas"));

      // Layer curve canvas
      layerCurveCanvas = new CurveCanvas(document.getElementById("layer-curve-canvas"));

      // Tab buttons
      var tabs = document.querySelectorAll(".tab-bar .tab");
      for (var i = 0; i < tabs.length; i++) {
        (function(tab) {
          tab.addEventListener("click", function() { switchTab(tab.getAttribute("data-tab")); });
        })(tabs[i]);
      }

      // Button bindings
      document.getElementById("btn-open-empty").addEventListener("click", openFile);
      document.getElementById("btn-open").addEventListener("click", openFile);
      document.getElementById("btn-import").addEventListener("click", importCameraToAE);
      document.getElementById("cam-select").addEventListener("change", function () {
        selectCamera(parseInt(this.value));
      });
      document.getElementById("btn-lo-from-csp").addEventListener("click", function () {
        if (fileData) {
          document.getElementById("lo-width").value = fileData.canvasWidth;
          document.getElementById("lo-height").value = fileData.canvasHeight;
        }
      });
      document.getElementById("btn-lo-from-comp").addEventListener("click", function () {
        csInterface.evalScript("getCompInfo()", function (r) {
          try { var c = JSON.parse(r); if (!c.error) { document.getElementById("lo-width").value = c.width; document.getElementById("lo-height").value = c.height; } } catch (e) {}
        });
      });

      // Restore saved preferences
      var savedMode = localStorage.getItem("clipcam.mode");
      var savedTarget = localStorage.getItem("clipcam.target");
      if (savedMode) document.getElementById("mode-select").value = savedMode;
      if (savedTarget) document.getElementById("target-select").value = savedTarget;
      document.getElementById("mode-select").addEventListener("change", function () {
        localStorage.setItem("clipcam.mode", this.value);
      });
      document.getElementById("target-select").addEventListener("change", function () {
        localStorage.setItem("clipcam.target", this.value);
      });

      // Layer tab buttons
      document.getElementById("btn-layer-refresh").addEventListener("click", fetchAndBuildLayerList);
      document.getElementById("btn-layer-automatch").addEventListener("click", function() { autoMatchLayers(); renderLayerList(); });
      document.getElementById("btn-apply-transforms").addEventListener("click", applyTransformsToAE);

      // Drag & drop
      var dragCount = 0;
      function showDrag() {
        var loaded = document.getElementById("loaded-state").style.display !== "none";
        if (loaded) document.getElementById("drag-overlay").classList.add("active");
        document.body.classList.add("dragging");
      }
      function hideDrag() {
        dragCount = 0;
        document.getElementById("drag-overlay").classList.remove("active");
        document.body.classList.remove("dragging");
      }
      document.body.addEventListener("dragenter", function (e) { e.preventDefault(); dragCount++; showDrag(); });
      document.body.addEventListener("dragleave", function (e) { e.preventDefault(); dragCount--; if (dragCount <= 0) hideDrag(); });
      document.body.addEventListener("dragover", function (e) { e.preventDefault(); });
      document.body.addEventListener("drop", function (e) { hideDrag(); onDrop(e); });
      document.body.addEventListener("dragend", function () { hideDrag(); });
      window.addEventListener("blur", function () { if (dragCount > 0) hideDrag(); });

      setStatus("");
    } catch (e) {
      alert("ClipCamAE init error:\n" + e.message);
    }
  }

  // ══════════════════════════════════════════════════════
  // Tab switching
  // ══════════════════════════════════════════════════════

  var _indicatorInit = false;
  function _moveIndicator() {
    var activeTab = document.querySelector(".tab-bar .tab.active");
    var indicator = document.getElementById("tab-indicator");
    if (!activeTab || !indicator) return;
    if (!_indicatorInit) {
      // First call: set position instantly (no transition)
      indicator.style.transition = "none";
      _indicatorInit = true;
    } else {
      indicator.style.transition = "";
    }
    indicator.style.left = activeTab.offsetLeft + 8 + "px";
    indicator.style.width = (activeTab.offsetWidth - 16) + "px";
  }

  function switchTab(tabName) {
    if (currentTab === tabName) return;
    currentTab = tabName;

    var tabs = document.querySelectorAll(".tab-bar .tab");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle("active", tabs[i].getAttribute("data-tab") === tabName);
    }
    _moveIndicator();

    var panels = document.querySelectorAll(".tab-panel");
    for (var i = 0; i < panels.length; i++) {
      panels[i].classList.toggle("active", panels[i].id === "tab-" + tabName);
    }

    if (tabName === "layer") {
      requestAnimationFrame(function () {
        layerCurveCanvas._resize();
        layerCurveCanvas.render();
      });
      // Auto-fetch layers if list is empty
      if (_aeLayers.length === 0 && fileData && fileData.transforms.length > 0) {
        fetchAndBuildLayerList();
      }
    } else {
      requestAnimationFrame(function () {
        curveCanvas._resize();
        curveCanvas.render();
      });
    }
  }

  // ══════════════════════════════════════════════════════
  // File ops
  // ══════════════════════════════════════════════════════

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
      if (item.kind === "file") { var f = item.getAsFile(); if (f) filePath = f.path || null; }
    }
    if (!filePath) {
      var uri = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
      if (uri) { uri = uri.trim(); if (uri.indexOf("file:///") === 0) filePath = decodeURIComponent(uri.substring(8)).replace(/\//g, "\\"); }
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
    var convExe = nodePath.join(extRoot, "bin", "clipcam-extractor.exe");
    var tmpOut = nodePath.join(require("os").tmpdir(), "clipcam_" + Date.now() + ".clipcam");
    setStatus("Converting .clip...");
    execFile(convExe, [clipPath, tmpOut], function (err, stdout, stderr) {
      if (err) { setStatus("Convert failed: " + (stderr || err.message), "error"); return; }
      try {
        fileData = parser.parseClipCam(tmpOut.replace(/\\/g, "/"));
        onFileDataReady(clipPath);
      } catch (e) { setStatus("Error: " + e.message, "error"); }
      try { require("fs").unlinkSync(tmpOut); } catch (e) {}
    });
  }

  function loadFile(filePath) {
    try {
      filePath = filePath.replace(/\\/g, "/");
      fileData = parser.parseClipCam(filePath);
      onFileDataReady(filePath);
    } catch (e) { setStatus("Error: " + e.message, "error"); }
  }

  function onFileDataReady(filePath) {
    // Reset layer state
    _aeLayers = [];
    _layerMatches = {};
    _selectedLayerRow = -1;

    selectCamera(0, filePath);
    updateLayerTab();
  }

  // ══════════════════════════════════════════════════════
  // Camera tab
  // ══════════════════════════════════════════════════════

  function selectCamera(idx, filePath) {
    if (!fileData || idx >= fileData.cameras.length) return;
    camData = fileData.cameras[idx];

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
    onCameraLoaded(filePath || "");
  }

  function onCameraLoaded(filePath) {
    var d = camData, fn = filePath.split(/[\\/]/).pop();

    document.getElementById("empty-state").style.display = "none";
    document.getElementById("loaded-state").style.display = "flex";
    _moveIndicator();

    document.getElementById("hdr-info").textContent =
      fn + "  |  " + fileData.frameRate + "fps  |  " + fileData.canvasWidth + "\u00d7" + fileData.canvasHeight +
      "  |  f" + fileData.startFrame + "\u2013" + fileData.endFrame;

    var activeIndices = buildPropTags(d.fcurves, "cam-prop-bar", CAM_PROP_GROUPS);
    requestAnimationFrame(function () {
      curveCanvas._resize();
      curveCanvas.setCurves(d.fcurves, fileData.startFrame, fileData.endFrame);
      for (var i = 0; i < activeIndices.length; i++) curveCanvas.setVisible(activeIndices[i], true);
    });

    document.getElementById("lo-width").value = fileData.canvasWidth;
    document.getElementById("lo-height").value = fileData.canvasHeight;
    document.getElementById("btn-import").disabled = false;
    setStatus("Loaded " + fn);
  }

  // ── Property tags ──

  var CAM_PROP_GROUPS = [
    ["ImageCenter.X", "ImageCenter.Y"],
    ["ImagePosition.X", "ImagePosition.Y"],
    ["ImageRotation", "ImageScale"],
    ["Opacity"],
  ];

  var LAYER_PROP_GROUPS = [
    ["ImageAspectScale.X", "ImageAspectScale.Y"],
    ["ImagePosition.X", "ImagePosition.Y"],
    ["ImageCenter.X", "ImageCenter.Y"],
    ["ImageRotation"],
    ["Opacity"],
  ];

  function buildPropTags(fcurves, barId, groups) {
    var bar = document.getElementById(barId);
    bar.innerHTML = "";
    var activeIndices = [];
    var labelToIdx = {};
    for (var i = 0; i < fcurves.length; i++) labelToIdx[fcurves[i].label] = i;
    var canvas = barId === "cam-prop-bar" ? curveCanvas : layerCurveCanvas;

    for (var gi = 0; gi < groups.length; gi++) {
      var group = groups[gi];
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
        var statusTxt = noKf ? "const" : (staticProp ? kfCount + "kf\u2248" : kfCount + "kf");
        tag.innerHTML =
          '<span class="prop-dot" style="background:' + color + '"></span>' +
          '<span class="prop-label">' + name + '</span>' +
          '<span class="prop-kf">' + statusTxt + '</span>';

        if (!noKf) {
          (function (i2, cv) {
            tag.addEventListener("click", function () {
              var isActive = this.classList.toggle("active");
              cv.setVisible(i2, isActive);
            });
          })(idx, canvas);
        }
        col.appendChild(tag);
      }
      if (col.childNodes.length > 0) bar.appendChild(col);
    }
    return activeIndices;
  }

  // ── Camera import ──

  function importCameraToAE() {
    if (!camData) return;
    csInterface.evalScript("getCompInfo()", function (compResult) {
      try {
        var comp = JSON.parse(compResult);
        if (comp.error) { setStatus("Error: " + comp.error, "error"); return; }
        var dur = (fileData.endFrame - fileData.startFrame + 1) / fileData.frameRate;
        if (comp.duration < dur - 0.01) {
          if (confirm("Comp is shorter (" + comp.duration.toFixed(1) + "s) than clipcam (" + dur.toFixed(1) + "s).\n\nExtend comp?")) {
            csInterface.evalScript("extendCompDuration(" + dur + ")", function () { doCameraImport(); }); return;
          }
        }
        doCameraImport();
      } catch (e) { doCameraImport(); }
    });
  }

  function doCameraImport() {
    setStatus("Importing...");
    var target = document.getElementById("target-select").value;
    var mode = document.getElementById("mode-select").value;
    var loW = parseInt(document.getElementById("lo-width").value) || fileData.canvasWidth;
    var loH = parseInt(document.getElementById("lo-height").value) || fileData.canvasHeight;

    var activeTags = document.querySelectorAll("#cam-prop-bar .prop-tag.active");
    var sel = {};
    for (var i = 0; i < activeTags.length; i++) sel[activeTags[i].getAttribute("data-index")] = true;

    var props = [];
    for (var i = 0; i < camData.fcurves.length; i++) {
      if (!sel[String(i)]) continue;
      var fc = camData.fcurves[i];
      var kfs = [];
      for (var k = 0; k < fc.keyframes.length; k++) {
        var kf = fc.keyframes[k];
        kfs.push({ frame: kf.frame, value: kf.value, leftSlope: kf.leftSlope, rightSlope: kf.rightSlope,
          leftHandleWeight: kf.leftHandleWeight, rightHandleWeight: kf.rightHandleWeight, interpType: kf.interpType });
      }
      props.push({ name: fc.propertyName, axis: fc.axis, label: fc.label, defaultValue: fc.defaultValue, keyframes: kfs });
    }

    var payload = JSON.stringify({
      frameRate: fileData.frameRate, canvasWidth: fileData.canvasWidth, canvasHeight: fileData.canvasHeight,
      startFrame: fileData.startFrame, endFrame: fileData.endFrame,
      cropOffsetX: fileData.cropOffsetX || 0, cropOffsetY: fileData.cropOffsetY || 0,
      target: target, mode: mode, loWidth: loW, loHeight: loH, properties: props
    });

    csInterface.evalScript("importClipCamData(" + JSON.stringify(payload) + ")", function (result) {
      try {
        var res = JSON.parse(result);
        if (res.error) setStatus("Error: " + res.error, "error");
        else setStatus("\u2713 Imported " + props.length + " properties to " + (res.layerName || "layer"), "success");
      } catch (e) { setStatus("Import failed", "error"); }
    });
  }

  // ══════════════════════════════════════════════════════
  // Layer tab
  // ══════════════════════════════════════════════════════

  var _aeLayers = [];       // [{index, name}, ...]
  var _layerMatches = {};   // aeIdx → transformIdx
  var _selectedLayerRow = -1;

  function updateLayerTab() {
    var badge = document.getElementById("layer-badge");
    var emptyEl = document.getElementById("layer-empty");
    var contentEl = document.getElementById("layer-content");

    if (!fileData || fileData.transforms.length === 0) {
      badge.style.display = "none";
      emptyEl.style.display = "flex";
      contentEl.style.display = "none";
      return;
    }

    badge.textContent = fileData.transforms.length;
    badge.style.display = "";
    emptyEl.style.display = "none";
    contentEl.style.display = "flex";
    document.getElementById("btn-apply-transforms").disabled = false;
  }

  function fetchAndBuildLayerList() {
    csInterface.evalScript("getCompLayers()", function (r) {
      try {
        var data = JSON.parse(r);
        if (data.error) {
          setLayerStatus(data.error, "error");
          return;
        }
        _aeLayers = data.layers || [];
        autoMatchLayers();
        renderLayerList();
        if (_aeLayers.length > 0) selectLayerRow(0);
      } catch (e) {
        setLayerStatus("Failed to get layers", "error");
      }
    });
  }

  // ── Auto-match: startsWith, longest match wins ──

  function autoMatchLayers() {
    if (!fileData || !fileData.transforms.length) return;
    _layerMatches = {};
    var xfms = fileData.transforms;
    var usedXfm = {};  // transformIdx → true (one-to-one)

    for (var ai = 0; ai < _aeLayers.length; ai++) {
      var aeName = _aeLayers[ai].name.toLowerCase();
      var bestIdx = -1, bestLen = 0, ambiguous = false;

      for (var xi = 0; xi < xfms.length; xi++) {
        if (usedXfm[xi]) continue;
        var xName = xfms[xi].name.toLowerCase();

        // Exact
        if (aeName === xName) { bestIdx = xi; bestLen = Infinity; ambiguous = false; break; }

        // AE name starts with transform name
        if (aeName.indexOf(xName) === 0 && xName.length > bestLen) {
          bestIdx = xi; bestLen = xName.length; ambiguous = false;
        } else if (aeName.indexOf(xName) === 0 && xName.length === bestLen && xi !== bestIdx) {
          ambiguous = true;
        }

        // Transform name starts with AE name
        if (xName.indexOf(aeName) === 0 && aeName.length > bestLen) {
          bestIdx = xi; bestLen = aeName.length; ambiguous = false;
        } else if (xName.indexOf(aeName) === 0 && aeName.length === bestLen && xi !== bestIdx) {
          ambiguous = true;
        }
      }

      if (bestIdx >= 0 && !ambiguous) {
        _layerMatches[ai] = bestIdx;
        usedXfm[bestIdx] = true;
      }
    }

    var matchCount = Object.keys(_layerMatches).length;
    document.getElementById("layer-match-info").textContent =
      matchCount + "/" + _aeLayers.length + " matched";
  }

  function renderLayerList() {
    var wrap = document.getElementById("layer-list-wrap");
    wrap.innerHTML = "";
    if (!fileData) return;
    var xfms = fileData.transforms;

    for (var ai = 0; ai < _aeLayers.length; ai++) {
      var row = document.createElement("div");
      row.className = "layer-row";
      if (_layerMatches[ai] !== undefined) row.classList.add("matched");
      if (ai === _selectedLayerRow) row.classList.add("selected");
      row.setAttribute("data-ae-idx", ai);

      var nameSpan = document.createElement("span");
      nameSpan.className = "layer-name";
      nameSpan.textContent = _aeLayers[ai].name;
      nameSpan.title = _aeLayers[ai].name;

      var arrow = document.createElement("span");
      arrow.className = "layer-arrow";
      var arrowImg = document.createElement("img");
      arrowImg.width = 10; arrowImg.height = 10;
      arrowImg.src = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM1NTUiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBjbGFzcz0ibHVjaWRlIGx1Y2lkZS1hcnJvdy1yaWdodC1pY29uIGx1Y2lkZS1hcnJvdy1yaWdodCI+PHBhdGggZD0iTTUgMTJoMTQiLz48cGF0aCBkPSJtMTIgNSA3IDctNyA3Ii8+PC9zdmc+";
      arrow.appendChild(arrowImg);

      var select = document.createElement("select");
      select.className = "layer-assign";
      var optNone = document.createElement("option");
      optNone.value = "";
      optNone.textContent = "\u2014";
      select.appendChild(optNone);
      for (var xi = 0; xi < xfms.length; xi++) {
        var opt = document.createElement("option");
        opt.value = xi;
        opt.textContent = xfms[xi].name;
        select.appendChild(opt);
      }
      if (_layerMatches[ai] !== undefined) select.value = _layerMatches[ai];

      // Events
      (function (aeIdx, rowEl, selEl) {
        rowEl.addEventListener("click", function (e) {
          if (e.target === selEl) return; // don't select row when clicking dropdown
          selectLayerRow(aeIdx);
        });
        selEl.addEventListener("change", function () {
          var val = this.value;
          if (val === "") {
            delete _layerMatches[aeIdx];
            rowEl.classList.remove("matched");
          } else {
            _layerMatches[aeIdx] = parseInt(val);
            rowEl.classList.add("matched");
          }
          // Update match info
          var matchCount = Object.keys(_layerMatches).length;
          document.getElementById("layer-match-info").textContent =
            matchCount + "/" + _aeLayers.length + " matched";
          // Show this transform's curves
          selectLayerRow(aeIdx);
        });
        selEl.addEventListener("click", function (e) { e.stopPropagation(); });
      })(ai, row, select);

      row.appendChild(nameSpan);
      row.appendChild(arrow);
      row.appendChild(select);
      wrap.appendChild(row);
    }
  }

  function selectLayerRow(aeIdx) {
    _selectedLayerRow = aeIdx;

    // Update row highlight
    var rows = document.querySelectorAll(".layer-row");
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.toggle("selected", parseInt(rows[i].getAttribute("data-ae-idx")) === aeIdx);
    }

    // Show transform curves for this row's assigned transform
    var xfmIdx = _layerMatches[aeIdx];
    if (xfmIdx !== undefined && fileData && fileData.transforms[xfmIdx]) {
      var xfm = fileData.transforms[xfmIdx];
      var activeIndices = buildPropTags(xfm.fcurves, "layer-prop-bar", LAYER_PROP_GROUPS);
      requestAnimationFrame(function () {
        layerCurveCanvas._resize();
        layerCurveCanvas.setCurves(xfm.fcurves, fileData.startFrame, fileData.endFrame);
        for (var i = 0; i < activeIndices.length; i++) layerCurveCanvas.setVisible(activeIndices[i], true);
      });
    } else {
      document.getElementById("layer-prop-bar").innerHTML = "";
      layerCurveCanvas.clear();
    }
  }

  // ── Apply transforms ──

  function applyTransformsToAE() {
    var matched = [];
    for (var ai in _layerMatches) {
      var xi = _layerMatches[ai];
      if (fileData && fileData.transforms[xi]) {
        matched.push({ aeLayer: _aeLayers[parseInt(ai)], transform: fileData.transforms[xi] });
      }
    }
    if (matched.length === 0) { setLayerStatus("No matched layers", "error"); return; }

    setLayerStatus("Applying 0/" + matched.length + "...");
    var idx = 0;

    function next() {
      if (idx >= matched.length) {
        setLayerStatus("\u2713 Applied " + matched.length + " layers", "success");
        return;
      }
      setLayerStatus("Applying " + (idx + 1) + "/" + matched.length + "...");
      var m = matched[idx];
      // Collect active property tags for this layer's curves
      var activeTags = document.querySelectorAll("#layer-prop-bar .prop-tag.active");
      var activeSel = {};
      for (var ai = 0; ai < activeTags.length; ai++) activeSel[activeTags[ai].getAttribute("data-index")] = true;

      var props = [];
      for (var fi = 0; fi < m.transform.fcurves.length; fi++) {
        if (!activeSel[String(fi)]) continue;
        var fc = m.transform.fcurves[fi];
        if (!fc.keyframes || fc.keyframes.length === 0) continue;
        var kfs = [];
        for (var k = 0; k < fc.keyframes.length; k++) {
          var kf = fc.keyframes[k];
          kfs.push({ frame: kf.frame, value: kf.value, leftSlope: kf.leftSlope, rightSlope: kf.rightSlope,
            leftHandleWeight: kf.leftHandleWeight, rightHandleWeight: kf.rightHandleWeight, interpType: kf.interpType });
        }
        props.push({ name: fc.propertyName, axis: fc.axis, label: fc.label, defaultValue: fc.defaultValue, keyframes: kfs });
      }

      var payload = JSON.stringify({
        layerIndex: m.aeLayer.index,
        frameRate: fileData.frameRate,
        canvasWidth: fileData.canvasWidth,
        canvasHeight: fileData.canvasHeight,
        cropOffsetX: fileData.cropOffsetX || 0,
        cropOffsetY: fileData.cropOffsetY || 0,
        properties: props,
      });

      csInterface.evalScript("importLayerTransform(" + JSON.stringify(payload) + ")", function (result) {
        try {
          var res = JSON.parse(result);
          if (res.error) { setLayerStatus("Error on " + m.aeLayer.name + ": " + res.error, "error"); return; }
        } catch (e) {}
        idx++;
        next();
      });
    }
    next();
  }

  // ── Status helpers ──

  function setStatus(msg, type) {
    var el = document.getElementById("status-bar");
    el.textContent = msg;
    el.className = "status-text" + (type ? " " + type : "");
  }

  function setLayerStatus(msg, type) {
    var el = document.getElementById("layer-status");
    el.textContent = msg;
    el.className = "status-text" + (type ? " " + type : "");
  }

  // ── Start ──
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
