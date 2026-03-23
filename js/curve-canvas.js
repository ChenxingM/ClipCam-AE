/**
 * Interactive FCurve canvas — view + edit keyframes, handles, undo, context menu
 */

var PROP_COLORS = {
  "ImageCenter.X":"#5082e6","ImageCenter.Y":"#e6b432",
  "ImagePosition.X":"#E65050","ImagePosition.Y":"#5EDD9E",
  "ImageRotation":"#4CC9F0","ImageScale":"#F76B8A","Opacity":"#B450E6",
};
var CURVE_COLORS = ["#E65050","#5EDD9E","#5082e6","#e6b432","#B450E6","#4CC9F0","#F76B8A"];
var COLOR_BG="#1E1E1E",COLOR_GRID="#272727",COLOR_GRID_MAJ="#333",COLOR_AXIS="#444",COLOR_TEXT="#555";
var COLOR_KF="#E6E6E6",COLOR_KF_HOV="#fff",COLOR_KF_DRAG="#2D8CEB";
var COLOR_HANDLE="rgba(160,160,160,0.5)",COLOR_HANDLE_ACT="rgba(45,140,235,0.9)";
var KF_R=4, HANDLE_R=3, HANDLE_LEN=22, MIN_HANDLE_PX=8, HIT=9;

class CurveCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.curves = []; this.visibleSet = new Set();
    this.startFrame = 1; this.endFrame = 100;
    this.viewX=0; this.viewY=0; this.scaleX=5; this.scaleY=1;

    // Interaction
    this._pan=false; this._panS=null; this._panV=null;
    this._hovKf=null; this._hovH=null;
    this._dragKf=null; this._dragH=null;
    this._dragSM=null; this._dragSV=null;

    // Handle edit mode: "symmetric" or "free"
    this.handleMode = "symmetric";

    // Undo stack
    this._undoStack = [];
    this._maxUndo = 50;

    // Context menu element
    this._ctxMenu = null;
    this.onCurveEdited = null;

    this._bind();
    this._resize();
    window.addEventListener("resize", () => { this._resize(); this.render(); });
    window.addEventListener("keydown", (e) => this._onKey(e));
  }

  setCurves(c, sf, ef) {
    this.curves=c; this.startFrame=sf; this.endFrame=ef;
    this.visibleSet=new Set(); this._undoStack=[];
    this._fitView(); this.render();
  }
  setVisible(i,v) { if(v) this.visibleSet.add(i); else this.visibleSet.delete(i); this.render(); }
  clear() { this.curves=[]; this.visibleSet.clear(); this.render(); }

  // ── Undo ──
  _saveUndo() {
    // Deep snapshot of all keyframe values
    var snap = [];
    for (var c of this.curves) {
      var kfs = [];
      for (var k of c.keyframes) kfs.push({frame:k.frame,value:k.value,leftSlope:k.leftSlope,rightSlope:k.rightSlope,leftHandleWeight:k.leftHandleWeight,rightHandleWeight:k.rightHandleWeight,interpType:k.interpType});
      snap.push(kfs);
    }
    this._undoStack.push(snap);
    if (this._undoStack.length > this._maxUndo) this._undoStack.shift();
  }

  _undo() {
    if (!this._undoStack.length) return;
    var snap = this._undoStack.pop();
    for (var ci=0; ci<this.curves.length && ci<snap.length; ci++) {
      if(!snap[ci]) continue;
      var kfs = this.curves[ci].keyframes;
      var sk = snap[ci];
      for (var ki=0; ki<kfs.length && ki<sk.length; ki++) {
        kfs[ki].frame = sk[ki].frame;
        kfs[ki].value = sk[ki].value;
        kfs[ki].leftSlope = sk[ki].leftSlope;
        kfs[ki].rightSlope = sk[ki].rightSlope;
        kfs[ki].leftHandleWeight = sk[ki].leftHandleWeight;
        kfs[ki].rightHandleWeight = sk[ki].rightHandleWeight;
        kfs[ki].interpType = sk[ki].interpType;
      }
    }
    if(this.onCurveEdited) this.onCurveEdited({ci:-1,ki:-1,type:"undo"});
    this.render();
  }

  // ── Transforms ──
  _f2x(f){return(f-this.viewX)*this.scaleX;}
  _v2y(v){return(this.viewY-v)*this.scaleY;}
  _x2f(x){return x/this.scaleX+this.viewX;}
  _y2v(y){return this.viewY-y/this.scaleY;}
  _hPos(kf,dir){
    var w=dir===-1?kf.leftHandleWeight:kf.rightHandleWeight;
    var sl=dir===-1?kf.leftSlope:kf.rightSlope;
    var hPx=Math.max(MIN_HANDLE_PX,Math.abs(w)>0.001?Math.abs(w)*this.scaleX:HANDLE_LEN);
    var cx=this._f2x(kf.frame),cy=this._v2y(kf.value);
    return{x:cx+hPx*dir,y:cy-sl*hPx*dir/this.scaleX*this.scaleY,cx:cx,cy:cy};
  }

  _fitView() {
    // Collect keyframes from VISIBLE curves only (or all if none visible)
    var kfs = [];
    for (var ci = 0; ci < this.curves.length; ci++) {
      if (this.visibleSet.size > 0 && !this.visibleSet.has(ci)) continue;
      for (var k of this.curves[ci].keyframes) kfs.push(k);
    }
    if (!kfs.length) {
      // Fallback: use all curves
      for (var c of this.curves) for (var k of c.keyframes) kfs.push(k);
    }
    if (!kfs.length) {
      this.viewX = this.startFrame; this.viewY = 0;
      this.scaleX = Math.max(1, (this._w-60) / Math.max(1, this.endFrame-this.startFrame));
      this.scaleY = 1; return;
    }

    // Fit to keyframe data range (not timeline endFrame which may be much larger)
    var minF = Infinity, maxF = -Infinity, minV = Infinity, maxV = -Infinity;
    for (var k of kfs) {
      if (k.frame < minF) minF = k.frame;
      if (k.frame > maxF) maxF = k.frame;
      if (k.value < minV) minV = k.value;
      if (k.value > maxV) maxV = k.value;
    }
    // Add small padding around data range
    var fPad = Math.max(1, (maxF - minF) * 0.08);
    var vPad = Math.max(1, (maxV - minV) * 0.08);
    minF -= fPad; maxF += fPad;
    minV -= vPad; maxV += vPad;

    var fs = Math.max(1, maxF - minF), vs = maxV - minV;
    if (vs < 1e-6) { vs = 10; minV -= 5; }
    var mx = 36, my = 30;
    this.scaleX = (this._w - mx*2) / fs;
    this.scaleY = (this._h - my*2) / vs;
    this.viewX = minF - mx / this.scaleX;
    this.viewY = maxV + my / this.scaleY;
  }

  _clampView() {
    // Prevent scrolling too far from data
    if (!this.curves.length) return;
    var pad = 200;
    var minF = this.startFrame, maxF = this.endFrame;
    var minV = Infinity, maxV = -Infinity;
    for (var c of this.curves) for (var k of c.keyframes) {
      if (k.frame < minF) minF = k.frame;
      if (k.frame > maxF) maxF = k.frame;
      if (k.value < minV) minV = k.value;
      if (k.value > maxV) maxV = k.value;
    }
    if (minV === Infinity) { minV = -100; maxV = 100; }
    var padF = pad/this.scaleX, padV = pad/this.scaleY;
    this.viewX = Math.max(minF - padF, Math.min(maxF - this._w/this.scaleX + padF, this.viewX));
    this.viewY = Math.min(maxV + padV, Math.max(minV + this._h/this.scaleY - padV, this.viewY));
  }

  _resize() {
    var dpr=window.devicePixelRatio||1;
    var par=this.canvas.parentElement;
    // Use getBoundingClientRect for actual rendered size, subtract border (1px each side)
    var r = par.getBoundingClientRect();
    this._w = Math.floor(r.width) - 2;
    this._h = Math.floor(r.height) - 2;
    if (this._w < 1) this._w = 1;
    if (this._h < 1) this._h = 1;
    this.canvas.width = this._w * dpr;
    this.canvas.height = this._h * dpr;
    this.canvas.style.width = this._w + "px";
    this.canvas.style.height = this._h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _color(ci){return PROP_COLORS[this.curves[ci].label]||CURVE_COLORS[ci%CURVE_COLORS.length];}

  // ── Render ──
  render() {
    // Always check if parent size changed
    var par = this.canvas.parentElement;
    var r = par.getBoundingClientRect();
    var newW = Math.floor(r.width) - 2, newH = Math.floor(r.height) - 2;
    if (newW !== this._w || newH !== this._h) this._resize();
    var ctx=this.ctx, w=this._w, h=this._h;
    if (w < 10 || h < 10) return;
    ctx.save();
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle=COLOR_BG; ctx.fillRect(0,0,w,h);
    if(this.curves.length) {
      this._drawGrid(w,h);
      this._drawCurves();
    }
    this._drawToolbar();
    ctx.restore();
  }

  _drawGrid(w,h) {
    var ctx=this.ctx;
    ctx.font="9px Inter,sans-serif";
    var fpx=1/this.scaleX, vpx=1/this.scaleY;

    // Frame grid — always integer steps, labeled as frame numbers
    var fStep = Math.max(1, Math.round(_niceStep(fpx*60)));
    var fStart = Math.max(1, Math.floor(this._x2f(0)/fStep)*fStep);
    var fEnd = this._x2f(w);
    for (var f=fStart; f<=fEnd; f+=fStep) {
      var x = this._f2x(f);
      var major = f % Math.max(1, fStep*5) === 0;
      ctx.strokeStyle = major ? COLOR_GRID_MAJ : COLOR_GRID;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke();
      ctx.fillStyle = COLOR_TEXT;
      ctx.fillText(f+"f", x+3, h-5);
    }

    // Value grid
    var vS=_niceStep(vpx*50);
    var v=Math.floor(this._y2v(h)/vS)*vS,vE=this._y2v(0);
    while(v<=vE){var y=this._v2y(v);ctx.strokeStyle=Math.abs(v)<vS*.01?COLOR_AXIS:COLOR_GRID;
      ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();
      ctx.fillStyle=COLOR_TEXT;ctx.fillText(Math.abs(vS)<1?v.toFixed(1):Math.round(v)+"",4,y-4);v+=vS;}
  }

  _drawCurves() {
    var ctx=this.ctx;
    var items=[];
    for(var ci=0;ci<this.curves.length;ci++){
      var kfs=this.curves[ci].keyframes;
      if(!kfs||!kfs.length) continue;
      items.push({ci:ci,active:this.visibleSet.has(ci)});
    }
    items.sort(function(a,b){return(a.active?1:0)-(b.active?1:0);});

    for(var ii=0;ii<items.length;ii++){
      var ci=items[ii].ci,active=items[ii].active;
      var fc=this.curves[ci],kfs=fc.keyframes,col=this._color(ci);
      ctx.globalAlpha=active?1:.2;

      // Segments
      ctx.strokeStyle=col; ctx.lineWidth=active?1.8:1;
      for(var i=0;i<kfs.length-1;i++){
        var k0=kfs[i],k1=kfs[i+1];
        var x0=this._f2x(k0.frame),y0=this._v2y(k0.value),x1=this._f2x(k1.frame),y1=this._v2y(k1.value);
        ctx.beginPath();
        if(k0.interpType===2){ctx.moveTo(x0,y0);ctx.lineTo(x1,y0);ctx.lineTo(x1,y1);}
        else if(k0.interpType===1&&k1.interpType!==0){ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);}
        else{var segW=x1-x0;
          var dxr=Math.abs(k0.rightHandleWeight)>0.001?Math.abs(k0.rightHandleWeight)*this.scaleX:segW/3;
          var dxl=Math.abs(k1.leftHandleWeight)>0.001?Math.abs(k1.leftHandleWeight)*this.scaleX:segW/3;
          ctx.moveTo(x0,y0);
          var cp1y=k0.interpType===0?y0-k0.rightSlope*dxr/this.scaleX*this.scaleY:y0+(y1-y0)*dxr/segW;
          var cp2y=k1.interpType===0?y1+k1.leftSlope*dxl/this.scaleX*this.scaleY:y1-(y1-y0)*dxl/segW;
          ctx.bezierCurveTo(x0+dxr,cp1y,x1-dxl,cp2y,x1,y1);}
        ctx.stroke();
      }

      // Handles
      if(active){
        for(var ki=0;ki<kfs.length;ki++){
          var kf=kfs[ki]; if(kf.interpType!==0) continue;
          var cx=this._f2x(kf.frame),cy=this._v2y(kf.value);
          for(var dir of [-1,1]){
            var hp=this._hPos(kf,dir);
            var isAct=this._isHandleActive(ci,ki,dir);
            ctx.strokeStyle=isAct?COLOR_HANDLE_ACT:COLOR_HANDLE;ctx.lineWidth=1;
            ctx.beginPath();ctx.moveTo(hp.cx,hp.cy);ctx.lineTo(hp.x,hp.y);ctx.stroke();
            ctx.fillStyle=isAct?COLOR_HANDLE_ACT:COLOR_HANDLE;
            ctx.beginPath();ctx.arc(hp.x,hp.y,isAct?4:HANDLE_R,0,Math.PI*2);ctx.fill();
          }
        }
      }

      // Keyframe diamonds
      for(var ki=0;ki<kfs.length;ki++){
        var kf=kfs[ki],x=this._f2x(kf.frame),y=this._v2y(kf.value);
        var isD=this._dragKf&&this._dragKf[0]===ci&&this._dragKf[1]===ki;
        var isH=this._hovKf&&this._hovKf[0]===ci&&this._hovKf[1]===ki;
        var r=KF_R+(isH||isD?1.5:0);

        // Interp-dependent shape
        ctx.fillStyle=isD?COLOR_KF_DRAG:(isH?COLOR_KF_HOV:col);
        ctx.beginPath();
        if (kf.interpType === 1) {
          // Linear: diamond
          ctx.moveTo(x,y-r);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r,y);
        } else if (kf.interpType === 2) {
          // Hold: square
          ctx.rect(x-r*0.75, y-r*0.75, r*1.5, r*1.5);
        } else {
          // Smooth: circle
          ctx.arc(x,y,r,0,Math.PI*2);
        }
        ctx.closePath(); ctx.fill();
        if(active){ctx.strokeStyle="rgba(0,0,0,0.3)";ctx.lineWidth=.5;ctx.stroke();}
      }

      ctx.globalAlpha=1;
    }
  }

  _isHandleActive(ci,ki,dir) {
    return (this._dragH&&this._dragH[0]===ci&&this._dragH[1]===ki&&this._dragH[2]===dir)||
           (this._hovH&&this._hovH[0]===ci&&this._hovH[1]===ki&&this._hovH[2]===dir);
  }

  // ── Toolbar (bottom-right corner) ──
  _initToolbarIcons() {
    if(this._tbIcons) return;
    this._tbIcons={};
    var svgs={
      fit:"PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW1vdmUtZGlhZ29uYWwyLWljb24gbHVjaWRlLW1vdmUtZGlhZ29uYWwtMiI+PHBhdGggZD0iTTE5IDEzdjZoLTYiLz48cGF0aCBkPSJNNSAxMVY1aDYiLz48cGF0aCBkPSJtNSA1IDE0IDE0Ii8+PC9zdmc+",
      zin:"PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLXpvb20taW4taWNvbiBsdWNpZGUtem9vbS1pbiI+PGNpcmNsZSBjeD0iMTEiIGN5PSIxMSIgcj0iOCIvPjxsaW5lIHgxPSIyMSIgeDI9IjE2LjY1IiB5MT0iMjEiIHkyPSIxNi42NSIvPjxsaW5lIHgxPSIxMSIgeDI9IjExIiB5MT0iOCIgeTI9IjE0Ii8+PGxpbmUgeDE9IjgiIHgyPSIxNCIgeTE9IjExIiB5Mj0iMTEiLz48L3N2Zz4=",
      zout:"PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLXpvb20tb3V0LWljb24gbHVjaWRlLXpvb20tb3V0Ij48Y2lyY2xlIGN4PSIxMSIgY3k9IjExIiByPSI4Ii8+PGxpbmUgeDE9IjIxIiB4Mj0iMTYuNjUiIHkxPSIyMSIgeTI9IjE2LjY1Ii8+PGxpbmUgeDE9IjgiIHgyPSIxNCIgeTE9IjExIiB5Mj0iMTEiLz48L3N2Zz4=",
      hmode:"PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLXRhbmdlbnQtaWNvbiBsdWNpZGUtdGFuZ2VudCI+PGNpcmNsZSBjeD0iMTciIGN5PSI0IiByPSIyIi8+PHBhdGggZD0iTTE1LjU5IDUuNDEgNS40MSAxNS41OSIvPjxjaXJjbGUgY3g9IjQiIGN5PSIxNyIgcj0iMiIvPjxwYXRoIGQ9Ik0xMiAyMnMtNC05LTEuNS0xMS41UzIyIDEyIDIyIDEyIi8+PC9zdmc+"
    };
    var self=this;
    function makeIcon(key,color){
      var raw=atob(svgs[key]);
      var colored=raw.replace(/stroke="currentColor"/g,'stroke="'+color+'"');
      var img=new Image();
      img.onload=function(){self.render();};
      img.src="data:image/svg+xml;base64,"+btoa(colored);
      return img;
    }
    for(var k in svgs){
      this._tbIcons[k]={gray:makeIcon(k,"#aaa"),blue:makeIcon(k,"#2D8CEB")};
    }
  }

  _drawToolbar() {
    this._initToolbarIcons();
    var ctx=this.ctx, w=this._w, h=this._h;
    var bsz=24, gap=3, pad=10, cr=6, isz=16;
    var btns = [
      {id:"fit"},
      {id:"zin"},
      {id:"zout"},
      {id:"hmode"},
    ];

    var totalW = btns.length*bsz + (btns.length-1)*gap + pad*2;
    var barH = bsz + pad;
    var barX = w - totalW - 6;
    var barY = h - barH - 6;

    ctx.save();

    this._toolbarBtns = [];
    for (var i=0; i<btns.length; i++) {
      var bx = barX + pad + i*(bsz+gap);
      var by = barY + (barH-bsz)/2;

      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.beginPath();
      ctx.moveTo(bx+4,by); ctx.arcTo(bx+bsz,by,bx+bsz,by+bsz,4);
      ctx.arcTo(bx+bsz,by+bsz,bx,by+bsz,4); ctx.arcTo(bx,by+bsz,bx,by,4);
      ctx.arcTo(bx,by,bx+bsz,by,4); ctx.closePath(); ctx.fill();

      var id=btns[i].id;
      var useBlue=(id==="hmode"&&this.handleMode==="symmetric");
      var icon=this._tbIcons[id];
      var img=useBlue?icon.blue:icon.gray;
      if(img.complete) ctx.drawImage(img,bx+(bsz-isz)/2,by+(bsz-isz)/2,isz,isz);

      this._toolbarBtns.push({x:bx, y:by, w:bsz, h:bsz, id:id});
    }
    ctx.restore();
  }

  _hitToolbar(mx,my) {
    if(!this._toolbarBtns) return null;
    for(var b of this._toolbarBtns){
      if(mx>=b.x&&mx<=b.x+b.w&&my>=b.y&&my<=b.y+b.h) return b.id;
    }
    return null;
  }

  _doToolbar(id) {
    if(id==="fit"){this._fitView();this.render();}
    else if(id==="zin"){this.scaleX*=1.3;this.scaleY*=1.3;this._clampView();this.render();}
    else if(id==="zout"){this.scaleX/=1.3;this.scaleY/=1.3;this._clampView();this.render();}
    else if(id==="hmode"){
      this.handleMode = this.handleMode==="symmetric"?"free":"symmetric";
      this.render();
    }
  }

  // ── Context menu (right-click on keyframe) ──
  _showCtxMenu(ci, ki, mx, my) {
    this._hideCtxMenu();
    var kf = this.curves[ci].keyframes[ki];
    var menu = document.createElement("div");
    menu.className = "ctx-menu";
    menu.style.left = mx + "px";
    menu.style.top = my + "px";

    var types = [
      {label:"Smooth", type:0, icon:"●"},
      {label:"Linear", type:1, icon:"◆"},
      {label:"Hold",   type:2, icon:"■"},
    ];

    for (var t of types) {
      var item = document.createElement("div");
      item.className = "ctx-item" + (kf.interpType===t.type?" active":"");
      item.innerHTML = '<span class="ctx-icon">'+t.icon+'</span>'+t.label;
      (function(ci2,ki2,newType){
        item.addEventListener("click", function() {
          this._saveUndo();
          var k = this.curves[ci2].keyframes[ki2];
          k.interpType = newType;
          // Reset slopes for non-smooth
          if (newType !== 0) { k.leftSlope = 0; k.rightSlope = 0; }
          this._hideCtxMenu();
          this.render();
        }.bind(this));
      }.bind(this))(ci, ki, t.type);
      menu.appendChild(item);
    }

    this.canvas.parentElement.appendChild(menu);
    this._ctxMenu = menu;

    // Close on outside click
    setTimeout(function(){
      document.addEventListener("mousedown", this._ctxClose = function(e){
        if(!menu.contains(e.target)){this._hideCtxMenu();}
      }.bind(this));
    }.bind(this), 10);
  }

  _hideCtxMenu() {
    if(this._ctxMenu){this._ctxMenu.remove();this._ctxMenu=null;}
    if(this._ctxClose){document.removeEventListener("mousedown",this._ctxClose);this._ctxClose=null;}
  }

  // ── Hit test ──
  _hit(mx,my) {
    for(var ci=0;ci<this.curves.length;ci++){
      if(!this.visibleSet.has(ci)) continue;
      var kfs=this.curves[ci].keyframes;
      for(var ki=0;ki<kfs.length;ki++){
        var kf=kfs[ki]; if(kf.interpType!==0) continue;
        for(var dir of[-1,1]){
          var hp=this._hPos(kf,dir);
          if(Math.hypot(mx-hp.x,my-hp.y)<HIT) return{type:"handle",ci:ci,ki:ki,dir:dir};
        }
      }
    }
    for(var ci=0;ci<this.curves.length;ci++){
      if(!this.visibleSet.has(ci)) continue;
      var kfs=this.curves[ci].keyframes;
      for(var ki=0;ki<kfs.length;ki++){
        var x=this._f2x(kfs[ki].frame),y=this._v2y(kfs[ki].value);
        if(Math.hypot(mx-x,my-y)<HIT) return{type:"kf",ci:ci,ki:ki};
      }
    }
    return null;
  }

  // ── Events ──
  _bind() {
    var c=this.canvas;
    c.addEventListener("wheel",(e)=>this._onWheel(e),{passive:false});
    c.addEventListener("mousedown",(e)=>this._onDown(e));
    c.addEventListener("mousemove",(e)=>this._onMove(e));
    c.addEventListener("mouseup",()=>this._onUp());
    c.addEventListener("mouseleave",()=>this._onUp());
    c.addEventListener("dblclick",()=>{this._fitView();this.render();});
    c.addEventListener("contextmenu",(e)=>this._onCtx(e));
  }

  _onKey(e) {
    if ((e.ctrlKey||e.metaKey) && e.key==="z") { e.preventDefault(); this._undo(); }
  }

  _onWheel(e) {
    e.preventDefault();
    var f=e.deltaY<0?1.12:1/1.12;
    var r=this.canvas.getBoundingClientRect();
    var mx=e.clientX-r.left,my=e.clientY-r.top;
    var fa=this._x2f(mx),va=this._y2v(my);
    if(e.shiftKey) this.scaleY*=f;
    else if(e.ctrlKey) this.scaleX*=f;
    else{this.scaleX*=f;this.scaleY*=f;}
    // Clamp minimum zoom
    this.scaleX = Math.max(0.5, this.scaleX);
    this.scaleY = Math.max(0.01, this.scaleY);
    this.viewX=fa-mx/this.scaleX; this.viewY=va+my/this.scaleY;
    this._clampView();
    this.render();
  }

  _onDown(e) {
    this._hideCtxMenu();
    var r=this.canvas.getBoundingClientRect();
    var mx=e.clientX-r.left,my=e.clientY-r.top;

    // Toolbar
    var tb = this._hitToolbar(mx,my);
    if(tb){this._doToolbar(tb);return;}

    // Pan
    if(e.button===1||(e.button===0&&e.altKey)){
      this._pan=true;this._panS=[e.clientX,e.clientY];this._panV=[this.viewX,this.viewY];
      this.canvas.style.cursor="grabbing";return;
    }
    if(e.button!==0) return;

    var hit=this._hit(mx,my);
    if(hit&&hit.type==="handle"){
      this._saveUndo();
      this._dragH=[hit.ci,hit.ki,hit.dir];
      this.canvas.style.cursor="crosshair";this.render();
    } else if(hit&&hit.type==="kf"){
      this._saveUndo();
      this._dragKf=[hit.ci,hit.ki];
      this.canvas.style.cursor="grab";this.render();
    }
  }

  _onMove(e) {
    var r=this.canvas.getBoundingClientRect();
    var mx=e.clientX-r.left,my=e.clientY-r.top;

    if(this._pan){
      this.viewX=this._panV[0]-(e.clientX-this._panS[0])/this.scaleX;
      this.viewY=this._panV[1]+(e.clientY-this._panS[1])/this.scaleY;
      this._clampView(); this.render(); return;
    }

    if(this._dragKf){
      var ci=this._dragKf[0],ki=this._dragKf[1];
      var kf=this.curves[ci].keyframes[ki];
      var nf=Math.round(this._x2f(mx)),nv=this._y2v(my);
      var kfs=this.curves[ci].keyframes;
      var lo=ki>0?kfs[ki-1].frame+1:this.startFrame;
      var hi=ki<kfs.length-1?kfs[ki+1].frame-1:this.endFrame;
      kf.frame=Math.max(lo,Math.min(hi,nf)); kf.value=nv;
      this.render(); return;
    }

    if(this._dragH){
      var ci=this._dragH[0],ki=this._dragH[1],dir=this._dragH[2];
      var kf=this.curves[ci].keyframes[ki];
      var cx=this._f2x(kf.frame),cy=this._v2y(kf.value);
      var dxPx=(mx-cx)*dir; if(dxPx<1) dxPx=1;
      var dy=-(my-cy);
      var ns=(dy/(dxPx*dir))*(this.scaleX/this.scaleY);
      var nw=dxPx/this.scaleX;
      if(dir===-1){kf.leftSlope=ns;kf.leftHandleWeight=nw;} else{kf.rightSlope=ns;kf.rightHandleWeight=nw;}
      if(this.handleMode==="symmetric"){
        if(dir===-1){kf.rightSlope=ns;kf.rightHandleWeight=nw;} else{kf.leftSlope=ns;kf.leftHandleWeight=nw;}
      }
      this.render(); return;
    }

    // Hover
    var hit=this._hit(mx,my);
    var nKf=null,nH=null;
    if(hit&&hit.type==="handle"){nH=[hit.ci,hit.ki,hit.dir];this.canvas.style.cursor="crosshair";}
    else if(hit&&hit.type==="kf"){nKf=[hit.ci,hit.ki];this.canvas.style.cursor="grab";}
    else{
      // Check toolbar hover
      var tb=this._hitToolbar(mx,my);
      this.canvas.style.cursor=tb?"pointer":"";
    }
    if(JSON.stringify(nKf)!==JSON.stringify(this._hovKf)||JSON.stringify(nH)!==JSON.stringify(this._hovH)){
      this._hovKf=nKf;this._hovH=nH;this.render();
    }
  }

  _onUp(){
    if(this._pan){this._pan=false;this.canvas.style.cursor="";}
    if(this._dragKf||this._dragH){
      var info=this._dragKf?{ci:this._dragKf[0],ki:this._dragKf[1],type:"kf"}
                           :{ci:this._dragH[0],ki:this._dragH[1],type:"handle"};
      this._dragKf=null;this._dragH=null;this.canvas.style.cursor="";
      if(this.onCurveEdited) this.onCurveEdited(info);
      this.render();
    }
  }

  _onCtx(e) {
    e.preventDefault();
    var r=this.canvas.getBoundingClientRect();
    var mx=e.clientX-r.left,my=e.clientY-r.top;
    var hit=this._hit(mx,my);
    if(hit&&hit.type==="kf"){
      this._showCtxMenu(hit.ci,hit.ki,mx,my);
    }
  }
}

function _niceStep(r){if(r<=0)return 1;var e=Math.floor(Math.log10(r)),b=Math.pow(10,e),n=r/b;return n<=1.5?b:n<=3.5?2*b:n<=7.5?5*b:10*b;}

// ── Bezier FCurve evaluator ──
