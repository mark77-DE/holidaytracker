'use strict';
// ---------- Pointer interaction on the poster ----------
var drag=null, raf=0, mapDrag=null;
function toSvg(e){
  var pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}
svg.addEventListener('pointerdown',function(e){
  if(state.mapPosMode){var mp=toSvg(e);mapDrag={sx:mp.x,sy:mp.y,x:state.map.view.x,y:state.map.view.y};svg.setPointerCapture(e.pointerId);svg.classList.add('dragging');e.preventDefault();return;}
  if(state.posMode&&state.bg){
    var q=toSvg(e);
    bgDrag={sx:q.x,sy:q.y,ox:state.bg.ox,oy:state.bg.oy};
    svg.setPointerCapture(e.pointerId); svg.classList.add('dragging'); e.preventDefault(); return;
  }
  if(!state.track){return;}
  var p=toSvg(e), geo=geometry();
  if(state.addMode){
    var d;
    if(state.track.hasEle&&p.y>(LAY.mapB+LAY.profT)/2){d=clamp((p.x-M)/W,0,1)*state.track.total;}
    else{d=nearestD(p.x,p.y,geo);}
    var hl=addHL(d,'');
    setAddMode(false); renderList(); render();
    var inp=document.querySelector('.hl-card[data-id="'+hl.id+'"] .hl-name');
    if(inp){inp.focus({preventScroll:true});}
    e.preventDefault(); return;
  }
  var el=e.target.closest('[data-drag]'); if(!el){return;}
  var hl2=byId(+el.getAttribute('data-id')); if(!hl2){return;}
  drag={type:el.getAttribute('data-drag'),hl:hl2,sx:p.x,sy:p.y,lx:hl2.lx,ly:hl2.ly};
  svg.setPointerCapture(e.pointerId);
  svg.classList.add('dragging');
  e.preventDefault();
});
svg.addEventListener('pointermove',function(e){
  if(mapDrag){var q=toSvg(e);state.map.view.x=clamp(mapDrag.x+q.x-mapDrag.sx,-60,60);state.map.view.y=clamp(mapDrag.y+q.y-mapDrag.sy,-60,60);render();return;}
  if(bgDrag){
    var q=toSvg(e);
    state.bg.ox=clamp(bgDrag.ox+q.x-bgDrag.sx,-150,150); state.bg.oy=clamp(bgDrag.oy+q.y-bgDrag.sy,-150,150);
    bgApply(); return;
  }
  if(!drag){return;}
  var p=toSvg(e), geo=geometry(), t=state.track;
  if(drag.type==='marker'){drag.hl.d=clamp((p.x-M)/W,0,1)*t.total;}
  else if(drag.type==='mappin'){drag.hl.d=nearestD(p.x,p.y,geo);}
  else{drag.hl.manual=true;drag.hl.lx=clamp(drag.lx+(p.x-drag.sx),2,98);drag.hl.ly=clamp(drag.ly+(p.y-drag.sy),4,fmt().H-3);}
  if(!raf){raf=requestAnimationFrame(function(){raf=0;render();});}
});
function endDrag(){
  if(mapDrag){mapDrag=null;svg.classList.remove('dragging');render();return;}
  if(bgDrag){bgDrag=null;svg.classList.remove('dragging');return;}
  if(!drag){return;}
  drag=null; svg.classList.remove('dragging');
  renderList(); render();
}
svg.addEventListener('pointerup',endDrag);
svg.addEventListener('pointercancel',endDrag);

// ---------- Loading tracks ----------
function loadRaw(raw,name){
  var t=buildTrack(raw);
  state.track=t; state.mapB=LAY.mapB; state.hl=[]; state.osm=[]; mapReset(); setAddMode(false); syncLabelModeUi(); syncStatsUi();
  if(t.date){state.date=t.date;$('#date').value=t.date;}
  var info=de(t.total/1000,1)+' km';
  if(t.hasEle){info+=', '+de(t.ascent)+' Höhenmeter';}
  $('#tinfo').textContent=(name?name+': ':'')+info;
  if(!t.hasEle){say('Die Datei enthält keine Höhendaten, das Höhenprofil entfällt.');}
  renderOsm(); renderList(); render();
}
function readFile(file){
  if(!file){return;}
  var r=new FileReader();
  r.onload=function(){
    try{loadRaw(parseGPX(String(r.result)),file.name);}
    catch(err){say(err.message||'Die Datei konnte nicht gelesen werden.');}
  };
  r.onerror=function(){say('Die Datei konnte nicht gelesen werden.');};
  r.readAsText(file);
}
$('#file').addEventListener('change',function(e){readFile(e.target.files[0]);e.target.value='';});
$('#demo').addEventListener('click',function(){
  loadRaw(demoRaw(),'Beispielroute');
  var found=findPeaks(2,40);
  found.forEach(function(p){addHL(p.d,'');});
  renderList(); render();
});
var stage=$('#stage');
stage.addEventListener('dragover',function(e){e.preventDefault();stage.classList.add('drop');});
stage.addEventListener('dragleave',function(){stage.classList.remove('drop');});
stage.addEventListener('drop',function(e){
  e.preventDefault(); stage.classList.remove('drop');
  if(e.dataTransfer&&e.dataTransfer.files.length){readFile(e.dataTransfer.files[0]);}
});
