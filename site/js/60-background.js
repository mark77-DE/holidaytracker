'use strict';
// ---------- Background image ----------
var XLINK='http://www.w3.org/1999/xlink';
var bgEl=null, bgDrag=null;
function makeBgEl(url){
  // one persistent <image> element: render() rebuilds the rest of the poster but re-inserts this one
  bgEl=document.createElementNS(NS,'image');
  bgEl.setAttribute('href',url);
  bgEl.setAttributeNS(XLINK,'xlink:href',url);
  bgEl.setAttribute('preserveAspectRatio','none');
}
function bgApply(){
  var bg=state.bg; if(!bg||!bgEl){return;}
  var k=Math.max(100/bg.w,fmt().H/bg.h), dw=bg.w*k*bg.s, dh=bg.h*k*bg.s;   // base size = "cover" of the square
  bgEl.setAttribute('x',f(50+bg.ox-dw/2)); bgEl.setAttribute('y',f(fmt().H/2+bg.oy-dh/2));
  bgEl.setAttribute('width',f(dw)); bgEl.setAttribute('height',f(dh));
  bgEl.setAttribute('opacity',f(1-bg.t/100));
}
function syncBgUi(){
  var bg=state.bg, on=!!bg;
  $('#bgCtl').hidden=!on; $('#bgRemove').hidden=!on;
  if(!on){setPosMode(false);return;}
  $('#bgT').value=bg.t; $('#bgTOut').textContent=bg.t+' %';
  $('#bgS').value=Math.round(bg.s*100); $('#bgSOut').textContent=Math.round(bg.s*100)+' %';
  $('#bgOrig').hidden=(bg.img===bg.orig.img);
}
function setBg(url,w,h){
  state.bg={img:url,w:w,h:h,s:1,ox:0,oy:0,t:65,orig:{img:url,w:w,h:h}};
  makeBgEl(url); syncBgUi(); render();
}
function loadBgFile(file){
  if(!file){return;}
  var r=new FileReader();
  r.onload=function(){
    var img=new Image();
    img.onload=function(){
      // downscale large photos so the export stays small
      var k=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight));
      var w=Math.round(img.naturalWidth*k), h=Math.round(img.naturalHeight*k);
      var cv=document.createElement('canvas'); cv.width=w; cv.height=h;
      cv.getContext('2d').drawImage(img,0,0,w,h);
      setBg(cv.toDataURL(file.type==='image/png'?'image/png':'image/jpeg',0.9),w,h);
    };
    img.onerror=function(){say('Das Bild konnte nicht gelesen werden.');};
    img.src=String(r.result);
  };
  r.onerror=function(){say('Das Bild konnte nicht gelesen werden.');};
  r.readAsDataURL(file);
}
function setPosMode(on){
  state.posMode=on&&!!state.bg;
  $('#bgPos').setAttribute('aria-pressed',state.posMode?'true':'false');
  $('#bgPos').textContent=state.posMode?'Positionieren beenden':'Bild positionieren';
  svg.classList.toggle('posing',state.posMode);
  if(state.posMode){setAddMode(false);}
}
$('#bgFile').addEventListener('change',function(e){loadBgFile(e.target.files[0]);e.target.value='';});
$('#bgT').addEventListener('input',function(e){
  state.bg.t=+e.target.value; $('#bgTOut').textContent=state.bg.t+' %'; bgApply();
});
$('#bgS').addEventListener('input',function(e){
  state.bg.s=+e.target.value/100; $('#bgSOut').textContent=e.target.value+' %'; bgApply();
});
$('#bgFit').addEventListener('click',function(){
  if(!state.bg){return;}
  state.bg.s=1; state.bg.ox=0; state.bg.oy=0; syncBgUi(); bgApply();
});
$('#bgPos').addEventListener('click',function(){setPosMode(!state.posMode);});
$('#bgRemove').addEventListener('click',function(){
  state.bg=null; bgEl=null; syncBgUi(); render();
});
$('#bgOrig').addEventListener('click',function(){
  var bg=state.bg; if(!bg){return;}
  bg.img=bg.orig.img; bg.w=bg.orig.w; bg.h=bg.orig.h; bg.s=1; bg.ox=0; bg.oy=0;
  makeBgEl(bg.img); syncBgUi(); render();
});
$('#bgCrop').addEventListener('click',function(){
  var bg=state.bg; if(!bg){return;}
  var img=new Image();
  img.onload=function(){
    var PH=fmt().H;
    var k=Math.max(100/bg.w,PH/bg.h)*bg.s;                // poster units per source pixel
    var x0=50+bg.ox-bg.w*k/2, y0=PH/2+bg.oy-bg.h*k/2;     // top-left corner of the image in poster units
    var sx=-x0/k, sy=-y0/k, sw=100/k, sh=PH/k;            // visible area in source pixels
    var shrink=Math.min(1,2400/Math.max(sw,sh));
    var ow=Math.max(64,Math.round(sw*shrink)), oh=Math.max(64,Math.round(sh*shrink));
    var cv=document.createElement('canvas'); cv.width=ow; cv.height=oh;
    cv.getContext('2d').drawImage(img,sx,sy,sw,sh,0,0,ow,oh);
    var gaps=x0>0.01||y0>0.01||x0+bg.w*k<99.99||y0+bg.h*k<PH-0.01;
    bg.img=cv.toDataURL(gaps?'image/png':'image/jpeg',0.92);
    bg.w=ow; bg.h=oh; bg.s=1; bg.ox=0; bg.oy=0;
    makeBgEl(bg.img); syncBgUi(); render();
    say('Auf das Format zugeschnitten. „Original“ stellt das ganze Bild wieder her.');
  };
  img.src=bg.img;
});
svg.addEventListener('wheel',function(e){
  if(!state.posMode||!state.bg){return;}
  e.preventDefault();
  state.bg.s=clamp(state.bg.s*(1-e.deltaY*0.0015),0.5,4);
  syncBgUi(); bgApply();
},{passive:false});
