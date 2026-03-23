/*
 * ClipCamAE — ExtendScript for After Effects
 * Imports .clipcam camera keyframes with bezier interpolation.
 */

// JSON polyfill for ExtendScript
if (typeof JSON === "undefined") {
    JSON = {};
    JSON.parse = function (s) { return eval("(" + s + ")"); };
    JSON.stringify = function (v) {
        if (v === null) return "null";
        if (typeof v === "undefined") return undefined;
        if (typeof v === "number" || typeof v === "boolean") return String(v);
        if (typeof v === "string") return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r") + '"';
        if (v instanceof Array) {
            var a = [];
            for (var i = 0; i < v.length; i++) a.push(JSON.stringify(v[i]));
            return "[" + a.join(",") + "]";
        }
        if (typeof v === "object") {
            var p = [];
            for (var k in v) if (v.hasOwnProperty(k)) p.push(JSON.stringify(k) + ":" + JSON.stringify(v[k]));
            return "{" + p.join(",") + "}";
        }
        return String(v);
    };
}

// ── Main entry point ──
//
// Mode "cam_frame": Cam Frame layer inside LO comp (Method 2)
//   position    = CSP ImagePosition (scaled to LO comp)
//   anchorPoint = CSP ImageCenter (scaled to LO comp)
//   scale       = CSP ImageScale
//   rotation    = CSP ImageRotation
//
// Mode "lo_layer": LO layer inside CAM comp (Method 1)
//   anchorPoint = CSP ImagePosition (scaled to LO comp)
//   position    = CAM comp center
//   scale       = [10000/ImageScale, 10000/ImageScale]
//   rotation    = -ImageRotation

function importClipCamData(jsonStr) {
    try {
        var data = JSON.parse(jsonStr);
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) {
            return JSON.stringify({ error: "No active composition" });
        }

        app.beginUndoGroup("ClipCamAE Import");

        var layer;
        if (data.target === "null" || comp.selectedLayers.length === 0) {
            layer = comp.layers.addNull();
            layer.name = "ClipCam";
        } else {
            layer = comp.selectedLayers[0];
        }

        var fps = data.frameRate;
        var mode = data.mode || "cam_frame";

        // Coordinate scale: CSP canvas → AE LO comp
        var scX = (data.loWidth || data.canvasWidth) / data.canvasWidth;
        var scY = (data.loHeight || data.canvasHeight) / data.canvasHeight;
        var compCenterX = comp.width / 2;
        var compCenterY = comp.height / 2;

        // Separate Position dimensions
        var transform = layer.property("Transform");
        var posProp = transform.property("Position");
        try { posProp.dimensionsSeparated = true; } catch (e) {}

        for (var i = 0; i < data.properties.length; i++) {
            var pd = data.properties[i];
            applyPropertyWithMode(layer, pd, fps, mode, scX, scY, compCenterX, compCenterY, data);
        }

        app.endUndoGroup();
        return JSON.stringify({ success: true, layerName: layer.name });

    } catch (e) {
        try { app.endUndoGroup(); } catch (x) {}
        return JSON.stringify({ error: e.toString() });
    }
}

function applyPropertyWithMode(layer, pd, fps, mode, scX, scY, compCX, compCY, data) {
    var transform = layer.property("Transform");
    var kfs = pd.keyframes;
    if (!kfs || kfs.length === 0) return;

    // Determine AE target and value transform based on mode + CSP property
    var prop, isDim2 = false, axisIdx = 0;

    if (pd.name === "ImagePosition") {
        var sc = pd.axis === "X" ? scX : scY;
        var posSep = transform.property("Position");
        if (posSep.dimensionsSeparated) {
            prop = posSep.getSeparationFollower(pd.axis === "X" ? 0 : 1);
        } else {
            prop = posSep; isDim2 = true; axisIdx = pd.axis === "X" ? 0 : 1;
        }

        if (mode === "cam_frame") {
            // Cam frame: CSP Position → AE Position directly (LO comp coords)
            setScaledKeyframes(prop, kfs, fps, sc, false, isDim2, axisIdx);
        } else {
            // LO layer: invert around CAM comp center
            // lo_pos = comp_center - (csp_pos * scale - lo_center)
            //        = comp_center + lo_center - csp_pos * scale
            var loCenter = pd.axis === "X" ? (data.loWidth || data.canvasWidth) / 2
                                           : (data.loHeight || data.canvasHeight) / 2;
            var compCenter = pd.axis === "X" ? compCX : compCY;
            setInvertedPosKeyframes(prop, kfs, fps, sc, compCenter, loCenter, isDim2, axisIdx);
        }

    } else if (pd.name === "ImageCenter") {
        if (mode === "cam_frame") {
            // Cam frame: CSP Center → AE Anchor Point (static, set once)
            var sc = pd.axis === "X" ? scX : scY;
            prop = transform.property("Anchor Point");
            var staticVal = kfs[0].value * sc;
            var curAnchor = prop.value;
            var newAnchor = [curAnchor[0], curAnchor[1]];
            newAnchor[pd.axis === "X" ? 0 : 1] = staticVal;
            prop.setValue(newAnchor);
        }
        // LO layer mode: skip ImageCenter
        return;

    } else if (pd.name === "ImageScale") {
        prop = transform.property("Scale");
        if (mode === "cam_frame") {
            setScaleKeyframes(prop, kfs, fps, false);
        } else {
            setScaleKeyframes(prop, kfs, fps, true);
        }
        return;

    } else if (pd.name === "ImageRotation") {
        prop = transform.property("Rotation");
        var negate = (mode === "lo_layer");
        setRotationKeyframes(prop, kfs, fps, negate);
        return;

    } else if (pd.name === "Opacity") {
        prop = transform.property("Opacity");
        setScaledKeyframes(prop, kfs, fps, 1, false, false, 0);
        return;

    } else {
        return;
    }

    // Apply easing for position/anchor
    applyEasing(prop, kfs, fps, isDim2);
}

function setScaledKeyframes(prop, kfs, fps, scale, negate, isDim2, axisIdx) {
    for (var k = 0; k < kfs.length; k++) {
        var time = (kfs[k].frame - 1) / fps;
        var val = kfs[k].value * scale;
        if (negate) val = -val;

        if (isDim2) {
            var cur = prop.valueAtTime(time, false);
            var nv = [cur[0], cur[1]];
            nv[axisIdx] = val;
            prop.setValueAtTime(time, nv);
        } else {
            prop.setValueAtTime(time, val);
        }
    }
    applyEasing(prop, kfs, fps, isDim2);
}

function setInvertedPosKeyframes(prop, kfs, fps, sc, compCenter, loCenter, isDim2, axisIdx) {
    // LO layer mode: lo_pos = compCenter + loCenter - csp_pos * scale
    // Camera right → LO left, camera down → LO up
    for (var k = 0; k < kfs.length; k++) {
        var time = (kfs[k].frame - 1) / fps;
        var val = compCenter + loCenter - kfs[k].value * sc;

        if (isDim2) {
            var cur = prop.valueAtTime(time, false);
            var nv = [cur[0], cur[1]];
            nv[axisIdx] = val;
            prop.setValueAtTime(time, nv);
        } else {
            prop.setValueAtTime(time, val);
        }
    }
    // Easing: slopes are negated because direction is inverted
    applyEasingWithNegate(prop, kfs, fps, isDim2);
}

function applyEasingWithNegate(prop, kfs, fps, isDim2) {
    for (var k = 1; k <= prop.numKeys; k++) {
        var kd = kfs[k - 1];
        if (!kd) continue;

        if (kd.interpType === 2) {
            prop.setInterpolationTypeAtKey(k,
                KeyframeInterpolationType.BEZIER,
                KeyframeInterpolationType.HOLD);
        } else if (kd.interpType === 1) {
            prop.setInterpolationTypeAtKey(k,
                KeyframeInterpolationType.LINEAR,
                KeyframeInterpolationType.LINEAR);
        } else {
            prop.setInterpolationTypeAtKey(k,
                KeyframeInterpolationType.BEZIER,
                KeyframeInterpolationType.BEZIER);

            // Negate slopes (direction inverted)
            var inSpeed = -kd.leftSlope * fps;
            var outSpeed = -kd.rightSlope * fps;

            var inInf = Math.abs(kd.leftHandleWeight) > 0.001
                ? clamp(Math.abs(kd.leftHandleWeight), 0.1, 100) : 33.33;
            var outInf = Math.abs(kd.rightHandleWeight) > 0.001
                ? clamp(Math.abs(kd.rightHandleWeight), 0.1, 100) : 33.33;

            try {
                var ie = new KeyframeEase(inSpeed, inInf);
                var oe = new KeyframeEase(outSpeed, outInf);
                if (isDim2) {
                    prop.setTemporalEaseAtKey(k, [ie, ie], [oe, oe]);
                } else {
                    prop.setTemporalEaseAtKey(k, [ie], [oe]);
                }
            } catch (e) {}
        }
    }
}

function setScaleKeyframes(prop, kfs, fps, invert) {
    for (var k = 0; k < kfs.length; k++) {
        var time = (kfs[k].frame - 1) / fps;
        var v = kfs[k].value;
        if (invert) v = 10000 / v;
        prop.setValueAtTime(time, [v, v]);
    }
    applyEasing(prop, kfs, fps, true);
}

function setRotationKeyframes(prop, kfs, fps, negate) {
    for (var k = 0; k < kfs.length; k++) {
        var time = (kfs[k].frame - 1) / fps;
        var v = kfs[k].value;
        if (negate) v = -v;
        prop.setValueAtTime(time, v);
    }
    applyEasing(prop, kfs, fps, false);
}

function applyEasing(prop, kfs, fps, isDim2) {
    for (var k = 1; k <= prop.numKeys; k++) {
        var kd = kfs[k - 1];
        if (!kd) continue;

        if (kd.interpType === 2) {
            prop.setInterpolationTypeAtKey(k,
                KeyframeInterpolationType.BEZIER,
                KeyframeInterpolationType.HOLD);
        } else if (kd.interpType === 1) {
            prop.setInterpolationTypeAtKey(k,
                KeyframeInterpolationType.LINEAR,
                KeyframeInterpolationType.LINEAR);
        } else {
            prop.setInterpolationTypeAtKey(k,
                KeyframeInterpolationType.BEZIER,
                KeyframeInterpolationType.BEZIER);

            var inSpeed = kd.leftSlope * fps;
            var outSpeed = kd.rightSlope * fps;

            var inInf = Math.abs(kd.leftHandleWeight) > 0.001
                ? clamp(Math.abs(kd.leftHandleWeight), 0.1, 100) : 33.33;
            var outInf = Math.abs(kd.rightHandleWeight) > 0.001
                ? clamp(Math.abs(kd.rightHandleWeight), 0.1, 100) : 33.33;

            try {
                var ie = new KeyframeEase(inSpeed, inInf);
                var oe = new KeyframeEase(outSpeed, outInf);
                if (isDim2) {
                    prop.setTemporalEaseAtKey(k, [ie, ie], [oe, oe]);
                } else {
                    prop.setTemporalEaseAtKey(k, [ie], [oe]);
                }
            } catch (e) {}
        }
    }
}

function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

// ── Utility: get comp info ──

function getCompInfo() {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) {
        return JSON.stringify({ error: "No active composition" });
    }
    return JSON.stringify({
        name: comp.name,
        width: comp.width,
        height: comp.height,
        fps: comp.frameRate,
        duration: comp.duration,
        numLayers: comp.numLayers,
    });
}

// ── Extend comp duration ──

function extendCompDuration(newDuration) {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) {
        return JSON.stringify({ error: "No active composition" });
    }
    app.beginUndoGroup("Extend Comp Duration");
    comp.duration = newDuration;
    app.endUndoGroup();
    return JSON.stringify({ success: true, duration: newDuration });
}

// ── Get comp layers ──

function getCompLayers() {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) {
        return JSON.stringify({ error: "No active composition" });
    }
    var layers = [];
    for (var i = 1; i <= comp.numLayers; i++) {
        layers.push({ index: i, name: comp.layer(i).name });
    }
    return JSON.stringify({ layers: layers });
}

// ── Import layer transform ──

function importLayerTransform(jsonStr) {
    try {
        var data = JSON.parse(jsonStr);
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) {
            return JSON.stringify({ error: "No active composition" });
        }

        var layer = comp.layer(data.layerIndex);
        if (!layer) {
            return JSON.stringify({ error: "Layer not found: index " + data.layerIndex });
        }

        app.beginUndoGroup("ClipCamAE Layer Transform");

        var fps = data.frameRate;
        var transform = layer.property("Transform");

        for (var i = 0; i < data.properties.length; i++) {
            var pd = data.properties[i];
            if (!pd.keyframes || pd.keyframes.length === 0) continue;

            if (pd.name === "ImageAspectScale") {
                // Non-uniform scale → AE Scale [x, y]
                var scaleProp = transform.property("Scale");
                var axisIdx = pd.axis === "X" ? 0 : 1;
                for (var k = 0; k < pd.keyframes.length; k++) {
                    var time = (pd.keyframes[k].frame - 1) / fps;
                    var cur = scaleProp.valueAtTime(time, false);
                    var nv = [cur[0], cur[1]];
                    nv[axisIdx] = pd.keyframes[k].value;
                    scaleProp.setValueAtTime(time, nv);
                }
                applyEasing(scaleProp, pd.keyframes, fps, true);

            } else if (pd.name === "ImagePosition") {
                var posProp = transform.property("Position");
                try { posProp.dimensionsSeparated = true; } catch (e) {}
                if (posProp.dimensionsSeparated) {
                    var sepProp = posProp.getSeparationFollower(pd.axis === "X" ? 0 : 1);
                    for (var k = 0; k < pd.keyframes.length; k++) {
                        var time = (pd.keyframes[k].frame - 1) / fps;
                        sepProp.setValueAtTime(time, pd.keyframes[k].value);
                    }
                    applyEasing(sepProp, pd.keyframes, fps, false);
                } else {
                    var axisIdx = pd.axis === "X" ? 0 : 1;
                    for (var k = 0; k < pd.keyframes.length; k++) {
                        var time = (pd.keyframes[k].frame - 1) / fps;
                        var cur = posProp.valueAtTime(time, false);
                        var nv = [cur[0], cur[1]];
                        nv[axisIdx] = pd.keyframes[k].value;
                        posProp.setValueAtTime(time, nv);
                    }
                    applyEasing(posProp, pd.keyframes, fps, true);
                }

            } else if (pd.name === "ImageRotation") {
                var rotProp = transform.property("Rotation");
                for (var k = 0; k < pd.keyframes.length; k++) {
                    var time = (pd.keyframes[k].frame - 1) / fps;
                    rotProp.setValueAtTime(time, pd.keyframes[k].value);
                }
                applyEasing(rotProp, pd.keyframes, fps, false);

            } else if (pd.name === "Opacity") {
                var opProp = transform.property("Opacity");
                for (var k = 0; k < pd.keyframes.length; k++) {
                    var time = (pd.keyframes[k].frame - 1) / fps;
                    opProp.setValueAtTime(time, pd.keyframes[k].value);
                }
                applyEasing(opProp, pd.keyframes, fps, false);
            }
            // ImageCenter is typically constant in transforms — skip
        }

        app.endUndoGroup();
        return JSON.stringify({ success: true, layerName: layer.name });

    } catch (e) {
        try { app.endUndoGroup(); } catch (x) {}
        return JSON.stringify({ error: e.toString() });
    }
}

// ── File dialog (fallback for CEP file input) ──

function openFileDialog() {
    var f = File.openDialog("Select file", "CLIP Studio:*.clip,ClipCam:*.clipcam,All Files:*.*");
    if (f) {
        return f.fsName;
    }
    return null;
}
