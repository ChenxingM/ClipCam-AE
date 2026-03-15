/**
 * Interactive FCurve canvas renderer — port from CamViewer/curve_view.py
 */

// Per-property colors: each property has a unique color
var PROP_COLORS = {
  "ImageCenter.X":  "#5082e6",  // blue (anchor X)
  "ImageCenter.Y":  "#e6b432",  // yellow (anchor Y)
  "ImagePosition.X":"#e65050",  // red (position X)
  "ImagePosition.Y":"#50c850",  // green (position Y)
  "ImageRotation":  "#50c8c8",  // cyan
  "ImageScale":     "#e080b0",  // pink
  "Opacity":        "#b450e6",  // purple
};
// Fallback cycle
var CURVE_COLORS = [
  "#e65050", "#50c850", "#5082e6", "#e6b432", "#b450e6", "#50c8c8", "#e080b0",
];
const COLOR_BG = "#1e1e1e";
const COLOR_GRID = "#2e2e2e";
const COLOR_GRID_MAJOR = "#3c3c3c";
const COLOR_AXIS = "#505050";
const COLOR_TEXT = "#888";
const COLOR_KF = "#ffc83c";
const COLOR_KF_HOVER = "#ffff82";
const COLOR_HANDLE = "rgba(180,180,180,0.6)";

const KF_RADIUS = 4;
const HANDLE_RADIUS = 3;
const HANDLE_LEN = 18;

class CurveCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.curves = [];
    this.visibleSet = new Set();
    this.startFrame = 1;
    this.endFrame = 100;
    this.viewX = 0;
    this.viewY = 0;
    this.scaleX = 5;
    this.scaleY = 1;
    this._dragging = false;
    this._dragStart = null;
    this._dragView = null;
    this._hoverKf = null;

    this._bindEvents();
    this._resize();
    window.addEventListener("resize", () => { this._resize(); this.render(); });
  }

  setCurves(curves, startFrame, endFrame) {
    this.curves = curves;
    this.startFrame = startFrame;
    this.endFrame = endFrame;
    this.visibleSet = new Set(); // populated by buildPropList via setVisible()
    this._fitView();
    this.render();
  }

  setVisible(index, visible) {
    if (visible) this.visibleSet.add(index);
    else this.visibleSet.delete(index);
    this.render();
  }

  clear() {
    this.curves = [];
    this.visibleSet.clear();
    this.render();
  }

  // ── Coordinate transforms ──

  _frameToX(f) { return (f - this.viewX) * this.scaleX; }
  _valueToY(v) { return (this.viewY - v) * this.scaleY; }
  _xToFrame(x) { return x / this.scaleX + this.viewX; }
  _yToValue(y) { return this.viewY - y / this.scaleY; }

  _fitView() {
    const allKf = [];
    for (const fc of this.curves) for (const kf of fc.keyframes) allKf.push(kf);
    if (!allKf.length) {
      this.viewX = this.startFrame;
      this.viewY = 0;
      this.scaleX = (this._w - 80) / Math.max(1, this.endFrame - this.startFrame);
      this.scaleY = 1;
      return;
    }
    let minF = Math.min(this.startFrame, ...allKf.map(k => k.frame));
    let maxF = Math.max(this.endFrame, ...allKf.map(k => k.frame));
    let minV = Math.min(...allKf.map(k => k.value));
    let maxV = Math.max(...allKf.map(k => k.value));
    const fSpan = Math.max(1, maxF - minF);
    let vSpan = maxV - minV;
    if (vSpan < 1e-6) { vSpan = 10; minV -= 5; }
    const m = 50;
    this.scaleX = (this._w - m * 2) / fSpan;
    this.scaleY = (this._h - m * 2) / vSpan;
    this.viewX = minF - m / this.scaleX;
    this.viewY = maxV + m / this.scaleY;
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this._w = rect.width;
    this._h = rect.height;
    this.canvas.width = this._w * dpr;
    this.canvas.height = this._h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ── Rendering ──

  render() {
    const ctx = this.ctx;
    const w = this._w, h = this._h;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, w, h);

    if (!this.curves.length) return;

    this._drawGrid(w, h);
    this._drawCurves();
  }

  _drawGrid(w, h) {
    const ctx = this.ctx;
    ctx.font = "9px 'Consolas','monospace'";

    const fpx = 1 / this.scaleX;
    const vpx = 1 / this.scaleY;
    const fStep = _niceStep(fpx * 70);
    const vStep = _niceStep(vpx * 50);

    // Frame grid
    let f = Math.floor(this._xToFrame(0) / fStep) * fStep;
    const fEnd = this._xToFrame(w);
    while (f <= fEnd) {
      const x = this._frameToX(f);
      const major = fStep >= 1 && Math.round(f) % Math.max(1, Math.round(fStep * 5)) === 0;
      ctx.strokeStyle = Math.abs(f) < 0.01 ? COLOR_AXIS : (major ? COLOR_GRID_MAJOR : COLOR_GRID);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      ctx.fillStyle = COLOR_TEXT;
      ctx.fillText(fStep >= 1 ? Math.round(f).toString() : f.toFixed(1), x + 2, h - 4);
      f += fStep;
    }

    // Value grid
    let v = Math.floor(this._yToValue(h) / vStep) * vStep;
    const vEnd = this._yToValue(0);
    while (v <= vEnd) {
      const y = this._valueToY(v);
      ctx.strokeStyle = Math.abs(v) < vStep * 0.01 ? COLOR_AXIS : COLOR_GRID;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      ctx.fillStyle = COLOR_TEXT;
      ctx.fillText(Math.abs(vStep) < 1 ? v.toFixed(1) : Math.round(v).toString(), 4, y - 3);
      v += vStep;
    }
  }

  _getCurveColor(ci) {
    var fc = this.curves[ci];
    return PROP_COLORS[fc.label] || CURVE_COLORS[ci % CURVE_COLORS.length];
  }

  _drawCurves() {
    const ctx = this.ctx;

    // Draw dimmed curves first (unchecked but have kf), then active on top
    var order = [];
    for (let ci = 0; ci < this.curves.length; ci++) {
      var fc = this.curves[ci];
      if (!fc.keyframes || !fc.keyframes.length) continue;
      if (this.visibleSet.has(ci)) {
        order.push({ ci: ci, dimmed: false });
      } else {
        order.push({ ci: ci, dimmed: true });
      }
    }
    // Draw dimmed first, active on top
    order.sort(function (a, b) { return (a.dimmed ? 0 : 1) - (b.dimmed ? 0 : 1); });

    for (var oi = 0; oi < order.length; oi++) {
      var ci = order[oi].ci;
      var dimmed = order[oi].dimmed;
      var fc = this.curves[ci];
      var kfs = fc.keyframes;
      var color = this._getCurveColor(ci);

      ctx.globalAlpha = dimmed ? 0.3 : 1.0;

      // Segments
      ctx.lineWidth = dimmed ? 1 : 2;
      for (let i = 0; i < kfs.length - 1; i++) {
        const k0 = kfs[i], k1 = kfs[i + 1];
        const x0 = this._frameToX(k0.frame), y0 = this._valueToY(k0.value);
        const x1 = this._frameToX(k1.frame), y1 = this._valueToY(k1.value);

        ctx.strokeStyle = color;
        ctx.beginPath();
        if (k0.interpType === 2) { // hold
          ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y1);
        } else if (k0.interpType === 1) { // linear
          ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        } else { // smooth bezier
          const dx = (x1 - x0) / 3;
          const cp1x = x0 + dx;
          const cp1y = y0 - k0.rightSlope * dx / this.scaleX * this.scaleY;
          const cp2x = x1 - dx;
          const cp2y = y1 + k1.leftSlope * dx / this.scaleX * this.scaleY;
          ctx.moveTo(x0, y0);
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x1, y1);
        }
        ctx.stroke();
      }

      // Handles (only for active curves)
      if (!dimmed) {
        for (var ki2 = 0; ki2 < kfs.length; ki2++) {
          var kf = kfs[ki2];
          if (kf.interpType !== 0) continue;
          const cx = this._frameToX(kf.frame), cy = this._valueToY(kf.value);
          for (const dir of [-1, 1]) {
            const slope = dir === -1 ? kf.leftSlope : kf.rightSlope;
            const hx = cx + HANDLE_LEN * dir;
            const hy = cy - slope * HANDLE_LEN * dir / this.scaleX * this.scaleY;
            ctx.strokeStyle = COLOR_HANDLE;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(hx, hy); ctx.stroke();
            ctx.fillStyle = COLOR_HANDLE;
            ctx.beginPath(); ctx.arc(hx, hy, HANDLE_RADIUS, 0, Math.PI * 2); ctx.fill();
          }
        }
      }

      // Keyframe diamonds
      for (let ki = 0; ki < kfs.length; ki++) {
        const kf = kfs[ki];
        const x = this._frameToX(kf.frame), y = this._valueToY(kf.value);
        const hover = this._hoverKf && this._hoverKf[0] === ci && this._hoverKf[1] === ki;
        const r = KF_RADIUS + (hover ? 1 : 0);
        ctx.fillStyle = hover ? COLOR_KF_HOVER : COLOR_KF;
        ctx.beginPath();
        ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
        ctx.closePath(); ctx.fill();
      }

      // Label
      ctx.fillStyle = color;
      ctx.font = "10px 'Segoe UI',sans-serif";
      var displayLabel = (typeof AE_NAMES !== "undefined" && AE_NAMES[fc.label]) || fc.label;
      ctx.fillText(displayLabel, 8, 14 + ci * 14);

      ctx.globalAlpha = 1.0;
    }
  }

  // ── Interaction ──

  _bindEvents() {
    const c = this.canvas;
    c.addEventListener("wheel", (e) => this._onWheel(e), { passive: false });
    c.addEventListener("mousedown", (e) => this._onMouseDown(e));
    c.addEventListener("mousemove", (e) => this._onMouseMove(e));
    c.addEventListener("mouseup", () => this._onMouseUp());
    c.addEventListener("dblclick", () => { this._fitView(); this.render(); });
  }

  _onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const fAt = this._xToFrame(mx), vAt = this._yToValue(my);

    if (e.shiftKey) this.scaleY *= factor;
    else if (e.ctrlKey) this.scaleX *= factor;
    else { this.scaleX *= factor; this.scaleY *= factor; }

    this.viewX = fAt - mx / this.scaleX;
    this.viewY = vAt + my / this.scaleY;
    this.render();
  }

  _onMouseDown(e) {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      this._dragging = true;
      this._dragStart = [e.clientX, e.clientY];
      this._dragView = [this.viewX, this.viewY];
      this.canvas.style.cursor = "grabbing";
    }
  }

  _onMouseMove(e) {
    if (this._dragging) {
      const dx = e.clientX - this._dragStart[0];
      const dy = e.clientY - this._dragStart[1];
      this.viewX = this._dragView[0] - dx / this.scaleX;
      this.viewY = this._dragView[1] + dy / this.scaleY;
      this.render();
    } else {
      this._updateHover(e);
    }
  }

  _onMouseUp() {
    if (this._dragging) {
      this._dragging = false;
      this.canvas.style.cursor = "";
    }
  }

  _updateHover(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best = null, bestDist = KF_RADIUS * 3;
    for (let ci = 0; ci < this.curves.length; ci++) {
      if (!this.visibleSet.has(ci)) continue;
      for (let ki = 0; ki < this.curves[ci].keyframes.length; ki++) {
        const kf = this.curves[ci].keyframes[ki];
        const x = this._frameToX(kf.frame), y = this._valueToY(kf.value);
        const d = Math.hypot(mx - x, my - y);
        if (d < bestDist) { bestDist = d; best = [ci, ki]; }
      }
    }
    if (JSON.stringify(best) !== JSON.stringify(this._hoverKf)) {
      this._hoverKf = best;
      this.render();
    }
  }
}

function _niceStep(raw) {
  if (raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  const norm = raw / base;
  if (norm <= 1.5) return base;
  if (norm <= 3.5) return 2 * base;
  if (norm <= 7.5) return 5 * base;
  return 10 * base;
}
