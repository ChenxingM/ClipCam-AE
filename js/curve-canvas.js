/**
 * Interactive FCurve canvas — view + edit keyframes & bezier handles
 */

// Per-property colors
var PROP_COLORS = {
  "ImageCenter.X":  "#5082e6",
  "ImageCenter.Y":  "#e6b432",
  "ImagePosition.X":"#E65050",
  "ImagePosition.Y":"#5EDD9E",
  "ImageRotation":  "#4CC9F0",
  "ImageScale":     "#F76B8A",
  "Opacity":        "#B450E6",
};
var CURVE_COLORS = ["#E65050","#5EDD9E","#5082e6","#e6b432","#B450E6","#4CC9F0","#F76B8A"];

var COLOR_BG = "#1E1E1E";
var COLOR_GRID = "#272727";
var COLOR_GRID_MAJOR = "#333";
var COLOR_AXIS = "#444";
var COLOR_TEXT = "#666";
var COLOR_KF = "#E6E6E6";
var COLOR_KF_HOVER = "#fff";
var COLOR_KF_DRAG = "#2D8CEB";
var COLOR_HANDLE = "rgba(180,180,180,0.5)";
var COLOR_HANDLE_DRAG = "rgba(45,140,235,0.9)";

var KF_RADIUS = 4;
var HANDLE_RADIUS = 3;
var HANDLE_LEN = 20;
var HIT_THRESH = 8;

class CurveCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.curves = [];
    this.visibleSet = new Set();
    this.startFrame = 1;
    this.endFrame = 100;
    this.viewX = 0; this.viewY = 0;
    this.scaleX = 5; this.scaleY = 1;

    // Interaction state
    this._panning = false;
    this._panStart = null;
    this._panView = null;
    this._hoverKf = null;     // [ci, ki]
    this._hoverHandle = null; // [ci, ki, dir] dir=-1 left, 1 right
    this._dragKf = null;      // [ci, ki]
    this._dragHandle = null;  // [ci, ki, dir]
    this._dragStartMouse = null;
    this._dragStartVal = null;

    this._bindEvents();
    this._resize();
    window.addEventListener("resize", () => { this._resize(); this.render(); });
  }

  setCurves(curves, startFrame, endFrame) {
    this.curves = curves;
    this.startFrame = startFrame;
    this.endFrame = endFrame;
    this.visibleSet = new Set();
    this._fitView();
    this.render();
  }

  setVisible(idx, vis) {
    if (vis) this.visibleSet.add(idx); else this.visibleSet.delete(idx);
    this.render();
  }

  clear() { this.curves = []; this.visibleSet.clear(); this.render(); }

  // ── Transforms ──
  _f2x(f) { return (f - this.viewX) * this.scaleX; }
  _v2y(v) { return (this.viewY - v) * this.scaleY; }
  _x2f(x) { return x / this.scaleX + this.viewX; }
  _y2v(y) { return this.viewY - y / this.scaleY; }

  _fitView() {
    var kfs = [];
    for (var c of this.curves) for (var k of c.keyframes) kfs.push(k);
    if (!kfs.length) {
      this.viewX = this.startFrame; this.viewY = 0;
      this.scaleX = Math.max(1, (this._w - 80) / Math.max(1, this.endFrame - this.startFrame));
      this.scaleY = 1; return;
    }
    var minF = Math.min(this.startFrame, ...kfs.map(k=>k.frame));
    var maxF = Math.max(this.endFrame, ...kfs.map(k=>k.frame));
    var minV = Math.min(...kfs.map(k=>k.value));
    var maxV = Math.max(...kfs.map(k=>k.value));
    var fs = Math.max(1, maxF-minF), vs = maxV-minV;
    if (vs < 1e-6) { vs = 10; minV -= 5; }
    var m = 44;
    this.scaleX = (this._w - m*2) / fs;
    this.scaleY = (this._h - m*2) / vs;
    this.viewX = minF - m / this.scaleX;
    this.viewY = maxV + m / this.scaleY;
  }

  _resize() {
    var dpr = window.devicePixelRatio || 1;
    var r = this.canvas.parentElement.getBoundingClientRect();
    this._w = r.width; this._h = r.height;
    this.canvas.width = this._w * dpr;
    this.canvas.height = this._h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _color(ci) {
    return PROP_COLORS[this.curves[ci].label] || CURVE_COLORS[ci % CURVE_COLORS.length];
  }

  // ── Render ──
  render() {
    var ctx = this.ctx, w = this._w, h = this._h;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = COLOR_BG; ctx.fillRect(0,0,w,h);
    if (!this.curves.length) return;
    this._drawGrid(w,h);
    this._drawCurves();
  }

  _drawGrid(w, h) {
    var ctx = this.ctx;
    ctx.font = "9px Consolas, monospace";
    var fpx = 1/this.scaleX, vpx = 1/this.scaleY;
    var fS = _niceStep(fpx*70), vS = _niceStep(vpx*50);

    var f = Math.floor(this._x2f(0)/fS)*fS, fE = this._x2f(w);
    while (f <= fE) {
      var x = this._f2x(f);
      var maj = fS >= 1 && Math.round(f)%Math.max(1,Math.round(fS*5))===0;
      ctx.strokeStyle = Math.abs(f)<0.01 ? COLOR_AXIS : (maj ? COLOR_GRID_MAJOR : COLOR_GRID);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke();
      ctx.fillStyle = COLOR_TEXT;
      ctx.fillText(fS>=1 ? Math.round(f)+"" : f.toFixed(1), x+3, h-5);
      f += fS;
    }
    var v = Math.floor(this._y2v(h)/vS)*vS, vE = this._y2v(0);
    while (v <= vE) {
      var y = this._v2y(v);
      ctx.strokeStyle = Math.abs(v)<vS*0.01 ? COLOR_AXIS : COLOR_GRID;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
      ctx.fillStyle = COLOR_TEXT;
      ctx.fillText(Math.abs(vS)<1 ? v.toFixed(1) : Math.round(v)+"", 4, y-4);
      v += vS;
    }
  }

  _drawCurves() {
    var ctx = this.ctx;
    // Sort: dimmed first, active on top
    var items = [];
    for (var ci = 0; ci < this.curves.length; ci++) {
      var kfs = this.curves[ci].keyframes;
      if (!kfs || !kfs.length) continue;
      items.push({ ci:ci, active: this.visibleSet.has(ci) });
    }
    items.sort(function(a,b){ return (a.active?1:0)-(b.active?1:0); });

    for (var ii = 0; ii < items.length; ii++) {
      var ci = items[ii].ci, active = items[ii].active;
      var fc = this.curves[ci], kfs = fc.keyframes, col = this._color(ci);
      ctx.globalAlpha = active ? 1.0 : 0.25;

      // Segments
      ctx.strokeStyle = col;
      ctx.lineWidth = active ? 1.8 : 1;
      for (var i = 0; i < kfs.length-1; i++) {
        var k0 = kfs[i], k1 = kfs[i+1];
        var x0=this._f2x(k0.frame), y0=this._v2y(k0.value);
        var x1=this._f2x(k1.frame), y1=this._v2y(k1.value);
        ctx.beginPath();
        if (k0.interpType===2) { ctx.moveTo(x0,y0); ctx.lineTo(x1,y0); ctx.lineTo(x1,y1); }
        else if (k0.interpType===1) { ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); }
        else {
          var dx=(x1-x0)/3;
          ctx.moveTo(x0,y0);
          ctx.bezierCurveTo(
            x0+dx, y0-k0.rightSlope*dx/this.scaleX*this.scaleY,
            x1-dx, y1+k1.leftSlope*dx/this.scaleX*this.scaleY,
            x1, y1);
        }
        ctx.stroke();
      }

      // Handles (active only)
      if (active) {
        for (var ki=0; ki<kfs.length; ki++) {
          var kf = kfs[ki];
          if (kf.interpType !== 0) continue;
          var cx=this._f2x(kf.frame), cy=this._v2y(kf.value);
          for (var dir of [-1,1]) {
            var sl = dir===-1 ? kf.leftSlope : kf.rightSlope;
            var hx = cx+HANDLE_LEN*dir;
            var hy = cy - sl*HANDLE_LEN*dir/this.scaleX*this.scaleY;
            var isDrag = this._dragHandle && this._dragHandle[0]===ci && this._dragHandle[1]===ki && this._dragHandle[2]===dir;
            var isHov = this._hoverHandle && this._hoverHandle[0]===ci && this._hoverHandle[1]===ki && this._hoverHandle[2]===dir;
            ctx.strokeStyle = isDrag ? COLOR_HANDLE_DRAG : COLOR_HANDLE;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(hx,hy); ctx.stroke();
            ctx.fillStyle = isDrag||isHov ? COLOR_HANDLE_DRAG : COLOR_HANDLE;
            ctx.beginPath(); ctx.arc(hx,hy, isDrag||isHov?4:HANDLE_RADIUS, 0, Math.PI*2); ctx.fill();
          }
        }
      }

      // Keyframe diamonds
      for (var ki=0; ki<kfs.length; ki++) {
        var kf = kfs[ki];
        var x=this._f2x(kf.frame), y=this._v2y(kf.value);
        var isDrag = this._dragKf && this._dragKf[0]===ci && this._dragKf[1]===ki;
        var isHov = this._hoverKf && this._hoverKf[0]===ci && this._hoverKf[1]===ki;
        var r = KF_RADIUS + (isHov||isDrag ? 1.5 : 0);
        ctx.fillStyle = isDrag ? COLOR_KF_DRAG : (isHov ? COLOR_KF_HOVER : col);
        ctx.beginPath();
        ctx.moveTo(x,y-r); ctx.lineTo(x+r,y); ctx.lineTo(x,y+r); ctx.lineTo(x-r,y);
        ctx.closePath(); ctx.fill();
        // Outline for visibility
        if (active) {
          ctx.strokeStyle = "rgba(0,0,0,0.4)";
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      // Legend label
      ctx.fillStyle = col;
      ctx.font = "10px 'Segoe UI', sans-serif";
      var lbl = (typeof AE_NAMES!=="undefined" && AE_NAMES[fc.label]) || fc.label;
      ctx.fillText(lbl, 8, 14 + ci*14);
      ctx.globalAlpha = 1.0;
    }
  }

  // ── Hit testing ──
  _hitTest(mx, my) {
    // Check handles first (higher priority), then keyframes
    for (var ci=0; ci<this.curves.length; ci++) {
      if (!this.visibleSet.has(ci)) continue;
      var kfs = this.curves[ci].keyframes;
      for (var ki=0; ki<kfs.length; ki++) {
        var kf = kfs[ki];
        if (kf.interpType !== 0) continue;
        var cx=this._f2x(kf.frame), cy=this._v2y(kf.value);
        for (var dir of [-1,1]) {
          var sl = dir===-1 ? kf.leftSlope : kf.rightSlope;
          var hx = cx+HANDLE_LEN*dir;
          var hy = cy - sl*HANDLE_LEN*dir/this.scaleX*this.scaleY;
          if (Math.hypot(mx-hx, my-hy) < HIT_THRESH) return { type:"handle", ci:ci, ki:ki, dir:dir };
        }
      }
    }
    for (var ci=0; ci<this.curves.length; ci++) {
      if (!this.visibleSet.has(ci)) continue;
      var kfs = this.curves[ci].keyframes;
      for (var ki=0; ki<kfs.length; ki++) {
        var x=this._f2x(kfs[ki].frame), y=this._v2y(kfs[ki].value);
        if (Math.hypot(mx-x, my-y) < HIT_THRESH) return { type:"kf", ci:ci, ki:ki };
      }
    }
    return null;
  }

  // ── Events ──
  _bindEvents() {
    var c = this.canvas;
    c.addEventListener("wheel", (e) => this._onWheel(e), {passive:false});
    c.addEventListener("mousedown", (e) => this._onDown(e));
    c.addEventListener("mousemove", (e) => this._onMove(e));
    c.addEventListener("mouseup", () => this._onUp());
    c.addEventListener("mouseleave", () => this._onUp());
    c.addEventListener("dblclick", () => { this._fitView(); this.render(); });
  }

  _onWheel(e) {
    e.preventDefault();
    var f = e.deltaY<0 ? 1.12 : 1/1.12;
    var r = this.canvas.getBoundingClientRect();
    var mx=e.clientX-r.left, my=e.clientY-r.top;
    var fa=this._x2f(mx), va=this._y2v(my);
    if (e.shiftKey) this.scaleY*=f;
    else if (e.ctrlKey) this.scaleX*=f;
    else { this.scaleX*=f; this.scaleY*=f; }
    this.viewX = fa - mx/this.scaleX;
    this.viewY = va + my/this.scaleY;
    this.render();
  }

  _onDown(e) {
    var r = this.canvas.getBoundingClientRect();
    var mx=e.clientX-r.left, my=e.clientY-r.top;

    // Pan: middle click or alt+left
    if (e.button===1 || (e.button===0 && e.altKey)) {
      this._panning = true;
      this._panStart = [e.clientX, e.clientY];
      this._panView = [this.viewX, this.viewY];
      this.canvas.style.cursor = "grabbing";
      return;
    }

    if (e.button !== 0) return;

    var hit = this._hitTest(mx, my);
    if (hit && hit.type === "handle") {
      this._dragHandle = [hit.ci, hit.ki, hit.dir];
      this._dragStartMouse = [mx, my];
      var kf = this.curves[hit.ci].keyframes[hit.ki];
      this._dragStartVal = hit.dir===-1 ? kf.leftSlope : kf.rightSlope;
      this.canvas.style.cursor = "crosshair";
      this.render();
    } else if (hit && hit.type === "kf") {
      this._dragKf = [hit.ci, hit.ki];
      this._dragStartMouse = [mx, my];
      var kf = this.curves[hit.ci].keyframes[hit.ki];
      this._dragStartVal = { frame: kf.frame, value: kf.value };
      this.canvas.style.cursor = "grab";
      this.render();
    }
  }

  _onMove(e) {
    var r = this.canvas.getBoundingClientRect();
    var mx=e.clientX-r.left, my=e.clientY-r.top;

    if (this._panning) {
      this.viewX = this._panView[0] - (e.clientX-this._panStart[0])/this.scaleX;
      this.viewY = this._panView[1] + (e.clientY-this._panStart[1])/this.scaleY;
      this.render(); return;
    }

    if (this._dragKf) {
      var ci=this._dragKf[0], ki=this._dragKf[1];
      var kf = this.curves[ci].keyframes[ki];
      var newFrame = Math.round(this._x2f(mx));
      var newValue = this._y2v(my);
      // Constrain frame between adjacent keyframes
      var kfs = this.curves[ci].keyframes;
      var minF = ki > 0 ? kfs[ki-1].frame + 1 : this.startFrame;
      var maxF = ki < kfs.length-1 ? kfs[ki+1].frame - 1 : this.endFrame;
      kf.frame = Math.max(minF, Math.min(maxF, newFrame));
      kf.value = newValue;
      this.render(); return;
    }

    if (this._dragHandle) {
      var ci=this._dragHandle[0], ki=this._dragHandle[1], dir=this._dragHandle[2];
      var kf = this.curves[ci].keyframes[ki];
      var cx=this._f2x(kf.frame), cy=this._v2y(kf.value);
      // Compute slope from mouse position relative to keyframe
      var dx = (mx - cx) * dir;
      if (Math.abs(dx) < 1) dx = 1;
      var dy = -(my - cy);
      var newSlope = (dy / dx) * (this.scaleX / this.scaleY);
      if (dir === -1) kf.leftSlope = newSlope;
      else kf.rightSlope = newSlope;
      this.render(); return;
    }

    // Hover detection
    var hit = this._hitTest(mx, my);
    var newHoverKf = null, newHoverHandle = null;
    if (hit && hit.type === "handle") {
      newHoverHandle = [hit.ci, hit.ki, hit.dir];
      this.canvas.style.cursor = "crosshair";
    } else if (hit && hit.type === "kf") {
      newHoverKf = [hit.ci, hit.ki];
      this.canvas.style.cursor = "grab";
    } else {
      this.canvas.style.cursor = "";
    }

    if (JSON.stringify(newHoverKf)!==JSON.stringify(this._hoverKf) ||
        JSON.stringify(newHoverHandle)!==JSON.stringify(this._hoverHandle)) {
      this._hoverKf = newHoverKf;
      this._hoverHandle = newHoverHandle;
      this.render();
    }
  }

  _onUp() {
    if (this._panning) { this._panning=false; this.canvas.style.cursor=""; }
    if (this._dragKf || this._dragHandle) {
      this._dragKf = null; this._dragHandle = null;
      this.canvas.style.cursor = "";
      this.render();
    }
  }
}

function _niceStep(raw) {
  if (raw<=0) return 1;
  var exp=Math.floor(Math.log10(raw)), base=Math.pow(10,exp), n=raw/base;
  return n<=1.5?base:n<=3.5?2*base:n<=7.5?5*base:10*base;
}
