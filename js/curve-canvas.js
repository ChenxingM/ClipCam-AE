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
var KF_R=4, HANDLE_R=3, HANDLE_LEN=22, HIT=9;

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
      for (var k of c.keyframes) kfs.push({frame:k.frame,value:k.value,leftSlope:k.leftSlope,rightSlope:k.rightSlope,interpType:k.interpType});
      snap.push(kfs);
    }
    this._undoStack.push(snap);
    if (this._undoStack.length > this._maxUndo) this._undoStack.shift();
  }

  _undo() {
    if (!this._undoStack.length) return;
    var snap = this._undoStack.pop();
    for (var ci=0; ci<this.curves.length && ci<snap.length; ci++) {
      var kfs = this.curves[ci].keyframes;
      var sk = snap[ci];
      for (var ki=0; ki<kfs.length && ki<sk.length; ki++) {
        kfs[ki].frame = sk[ki].frame;
        kfs[ki].value = sk[ki].value;
        kfs[ki].leftSlope = sk[ki].leftSlope;
        kfs[ki].rightSlope = sk[ki].rightSlope;
        kfs[ki].interpType = sk[ki].interpType;
      }
    }
    this.render();
  }

  // ── Transforms ──
  _f2x(f){return(f-this.viewX)*this.scaleX;}
  _v2y(v){return(this.viewY-v)*this.scaleY;}
  _x2f(x){return x/this.scaleX+this.viewX;}
  _y2v(y){return this.viewY-y/this.scaleY;}

  _fitView() {
    var kfs=[];
    for(var c of this.curves) for(var k of c.keyframes) kfs.push(k);
    if(!kfs.length){this.viewX=this.startFrame;this.viewY=0;this.scaleX=Math.max(1,(this._w-60)/Math.max(1,this.endFrame-this.startFrame));this.scaleY=1;return;}
    var minF=Math.min(this.startFrame,...kfs.map(k=>k.frame));
    var maxF=Math.max(this.endFrame,...kfs.map(k=>k.frame));
    var minV=Math.min(...kfs.map(k=>k.value));
    var maxV=Math.max(...kfs.map(k=>k.value));
    var fs=Math.max(1,maxF-minF),vs=maxV-minV;
    if(vs<1e-6){vs=10;minV-=5;}
    var m=40;
    this.scaleX=(this._w-m*2)/fs; this.scaleY=(this._h-m*2)/vs;
    this.viewX=minF-m/this.scaleX; this.viewY=maxV+m/this.scaleY;
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
    var r=this.canvas.parentElement.getBoundingClientRect();
    this._w=r.width; this._h=r.height;
    this.canvas.width=this._w*dpr; this.canvas.height=this._h*dpr;
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  _color(ci){return PROP_COLORS[this.curves[ci].label]||CURVE_COLORS[ci%CURVE_COLORS.length];}

  // ── Render ──
  render() {
    var ctx=this.ctx,w=this._w,h=this._h;
    ctx.clearRect(0,0,w,h);
    // Rounded clip region
    var cr = 8;
    ctx.beginPath();
    ctx.moveTo(cr,0); ctx.lineTo(w-cr,0); ctx.arcTo(w,0,w,cr,cr);
    ctx.lineTo(w,h-cr); ctx.arcTo(w,h,w-cr,h,cr);
    ctx.lineTo(cr,h); ctx.arcTo(0,h,0,h-cr,cr);
    ctx.lineTo(0,cr); ctx.arcTo(0,0,cr,0,cr);
    ctx.closePath(); ctx.clip();
    ctx.fillStyle=COLOR_BG; ctx.fillRect(0,0,w,h);
    if(!this.curves.length) return;
    this._drawGrid(w,h);
    this._drawCurves();
    this._drawToolbar();
  }

  _drawGrid(w,h) {
    var ctx=this.ctx;
    ctx.font="9px Consolas,monospace";
    var fpx=1/this.scaleX,vpx=1/this.scaleY;
    var fS=_niceStep(fpx*70),vS=_niceStep(vpx*50);
    var f=Math.floor(this._x2f(0)/fS)*fS,fE=this._x2f(w);
    while(f<=fE){var x=this._f2x(f);var maj=fS>=1&&Math.round(f)%Math.max(1,Math.round(fS*5))===0;
      ctx.strokeStyle=Math.abs(f)<.01?COLOR_AXIS:(maj?COLOR_GRID_MAJ:COLOR_GRID);ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();
      ctx.fillStyle=COLOR_TEXT;ctx.fillText(fS>=1?Math.round(f)+"":f.toFixed(1),x+3,h-5);f+=fS;}
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
        else if(k0.interpType===1){ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);}
        else{var dx=(x1-x0)/3;ctx.moveTo(x0,y0);
          ctx.bezierCurveTo(x0+dx,y0-k0.rightSlope*dx/this.scaleX*this.scaleY,
            x1-dx,y1+k1.leftSlope*dx/this.scaleX*this.scaleY,x1,y1);}
        ctx.stroke();
      }

      // Handles
      if(active){
        for(var ki=0;ki<kfs.length;ki++){
          var kf=kfs[ki]; if(kf.interpType!==0) continue;
          var cx=this._f2x(kf.frame),cy=this._v2y(kf.value);
          for(var dir of [-1,1]){
            var sl=dir===-1?kf.leftSlope:kf.rightSlope;
            var hx=cx+HANDLE_LEN*dir,hy=cy-sl*HANDLE_LEN*dir/this.scaleX*this.scaleY;
            var isAct=this._isHandleActive(ci,ki,dir);
            ctx.strokeStyle=isAct?COLOR_HANDLE_ACT:COLOR_HANDLE;ctx.lineWidth=1;
            ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(hx,hy);ctx.stroke();
            ctx.fillStyle=isAct?COLOR_HANDLE_ACT:COLOR_HANDLE;
            ctx.beginPath();ctx.arc(hx,hy,isAct?4:HANDLE_R,0,Math.PI*2);ctx.fill();
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
          // Linear: small square
          ctx.rect(x-r*0.75, y-r*0.75, r*1.5, r*1.5);
        } else if (kf.interpType === 2) {
          // Hold: small triangle pointing right
          ctx.moveTo(x-r,y-r); ctx.lineTo(x+r,y); ctx.lineTo(x-r,y+r);
        } else {
          // Smooth: diamond
          ctx.moveTo(x,y-r);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r,y);
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
  _drawToolbar() {
    var ctx=this.ctx, bsz=22, gap=4, pad=8;
    var btns = [
      {id:"fit", icon:"⊡"},
      {id:"zin", icon:"+"},
      {id:"zout",icon:"−"},
      {id:"hmode",icon:this.handleMode==="symmetric"?"⟷":"→"},
    ];
    var totalW = btns.length*(bsz+gap)-gap;
    var ox = this._w - pad - totalW, oy = this._h - pad - bsz;
    this._toolbarBtns = [];
    for (var i=0; i<btns.length; i++) {
      var bx = ox + i*(bsz+gap);
      ctx.fillStyle = "rgba(30,30,30,0.85)";
      ctx.beginPath();
      var cr=5;
      ctx.moveTo(bx+cr,oy);ctx.arcTo(bx+bsz,oy,bx+bsz,oy+bsz,cr);
      ctx.arcTo(bx+bsz,oy+bsz,bx,oy+bsz,cr);ctx.arcTo(bx,oy+bsz,bx,oy,cr);
      ctx.arcTo(bx,oy,bx+bsz,oy,cr);ctx.closePath();ctx.fill();
      ctx.strokeStyle="rgba(255,255,255,0.08)";ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle="#999";ctx.font="12px 'Segoe UI',sans-serif";
      ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.fillText(btns[i].icon, bx+bsz/2, oy+bsz/2);
      ctx.textAlign="start";ctx.textBaseline="alphabetic";
      this._toolbarBtns.push({x:bx,y:oy,w:bsz,h:bsz,id:btns[i].id});
    }
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
      {label:"Smooth", type:0, icon:"◆"},
      {label:"Linear", type:1, icon:"■"},
      {label:"Hold",   type:2, icon:"▶"},
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
        var cx=this._f2x(kf.frame),cy=this._v2y(kf.value);
        for(var dir of[-1,1]){
          var sl=dir===-1?kf.leftSlope:kf.rightSlope;
          var hx=cx+HANDLE_LEN*dir,hy=cy-sl*HANDLE_LEN*dir/this.scaleX*this.scaleY;
          if(Math.hypot(mx-hx,my-hy)<HIT) return{type:"handle",ci:ci,ki:ki,dir:dir};
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
      var dx=(mx-cx)*dir; if(Math.abs(dx)<1)dx=1;
      var dy=-(my-cy);
      var ns=(dy/dx)*(this.scaleX/this.scaleY);
      if(dir===-1) kf.leftSlope=ns; else kf.rightSlope=ns;
      // Symmetric mode: mirror to other handle
      if(this.handleMode==="symmetric"){
        if(dir===-1) kf.rightSlope=ns; else kf.leftSlope=ns;
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
    if(this._dragKf||this._dragH){this._dragKf=null;this._dragH=null;this.canvas.style.cursor="";this.render();}
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
