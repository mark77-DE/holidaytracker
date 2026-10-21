'use strict';
// ---------- Export ----------
var downloads=null;
(async function(){
  try{if(window.claude&&window.claude.use){downloads=await window.claude.use('downloads');}}catch(err){downloads=null;}
})();

function exportSVGString(wpx,hpx){
  var c=svg.cloneNode(true);
  Array.prototype.forEach.call(c.querySelectorAll('.ui'),function(n){n.remove();});
  Array.prototype.forEach.call(c.querySelectorAll('[data-drag]'),function(n){n.removeAttribute('data-drag');n.removeAttribute('data-id');});
  c.removeAttribute('id'); c.removeAttribute('class'); c.removeAttribute('role'); c.removeAttribute('aria-label');
  c.setAttribute('xmlns',NS);
  c.setAttribute('viewBox','0 0 100 '+f(fmt().H));
  c.setAttribute('width',wpx); c.setAttribute('height',hpx);
  var st=document.createElementNS(NS,'style'); st.textContent=FONT_CSS;
  c.insertBefore(st,c.firstChild);
  return new XMLSerializer().serializeToString(c);
}
function slug(){
  var s=(state.title||'wanderung').toLowerCase().replace(/[^a-z0-9äöüß]+/g,'-').replace(/^-+|-+$/g,'');
  var F=fmt();return (s||'wanderung')+'-'+(F.print?F.mmW+'x'+F.mmH+'mm':F.tag);
}
async function saveFile(name,data){
  if(downloads){
    try{await downloads.save({filename:name,data:data});say('Gespeichert: '+name);}
    catch(err){say(err&&err.code==='declined'?'Speichern abgebrochen.':'Speichern nicht möglich ('+((err&&err.code)||'Fehler')+').');}
    return;
  }
  // fallback outside the viewer: plain anchor download
  var url=URL.createObjectURL(data), a=document.createElement('a');
  a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){URL.revokeObjectURL(url);},3000);
}
$('#expSvg').addEventListener('click',function(){
  if(!state.track){say('Bitte zuerst eine Route laden.');return;}
  var F=fmt(), xml=F.print?exportSVGString(F.mmW+'mm',F.mmH+'mm'):exportSVGString(F.px[0],F.px[1]);
  saveFile(slug()+'.svg',new Blob([xml],{type:'image/svg+xml'}));
});
// renders the current poster to a PNG at its export size (300 dpi for print formats, pixel size for social formats)
function pngChunk(type,data){
  var chunk=new Uint8Array(data.length+12), view=new DataView(chunk.buffer);
  view.setUint32(0,data.length,false);
  for(var i=0;i<4;i++){chunk[4+i]=type.charCodeAt(i);}
  chunk.set(data,8);
  var crc=0xffffffff;
  for(i=4;i<8+data.length;i++){
    crc^=chunk[i];
    for(var bit=0;bit<8;bit++){crc=(crc&1)?(crc>>>1)^0xedb88320:crc>>>1;}
  }
  view.setUint32(8+data.length,(crc^0xffffffff)>>>0,false);
  return chunk;
}
async function pngAtDpi(blob,dpi){
  var input=new Uint8Array(await blob.arrayBuffer());
  var signature=[137,80,78,71,13,10,26,10];
  if(input.length<33||!signature.every(function(b,i){return input[i]===b;})){
    throw new Error('Ungültige PNG-Datei.');
  }
  var ppm=Math.round(dpi/0.0254), phys=new Uint8Array(9), pv=new DataView(phys.buffer);
  pv.setUint32(0,ppm,false); pv.setUint32(4,ppm,false); phys[8]=1;
  var physChunk=pngChunk('pHYs',phys), chunks=[], offset=8, inserted=false, view=new DataView(input.buffer);
  while(offset+12<=input.length){
    var length=view.getUint32(offset,false), end=offset+length+12;
    if(end>input.length){throw new Error('Ungültige PNG-Datei.');}
    var type=String.fromCharCode(input[offset+4],input[offset+5],input[offset+6],input[offset+7]);
    if(type!=='pHYs'){chunks.push(input.subarray(offset,end));}
    if(type==='IHDR'&&!inserted){chunks.push(physChunk);inserted=true;}
    offset=end;
  }
  if(!inserted||offset!==input.length){throw new Error('Ungültige PNG-Datei.');}
  return new Blob([input.subarray(0,8)].concat(chunks),{type:'image/png'});
}
async function renderPngBlob(){
  var F=fmt(), pw=F.print?Math.round(F.mmW/25.4*300):F.px[0], ph=F.print?Math.round(F.mmH/25.4*300):F.px[1];
  var xml=exportSVGString(pw,ph);
  var img=new Image();
  await new Promise(function(res,rej){img.onload=res;img.onerror=rej;img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml);});
  var cv=document.createElement('canvas'); cv.width=pw; cv.height=ph;
  var ctx=cv.getContext('2d');
  ctx.drawImage(img,0,0,pw,ph);                                  // first draw lets the embedded font settle
  await new Promise(function(r){setTimeout(r,120);});
  ctx.clearRect(0,0,pw,ph); ctx.drawImage(img,0,0,pw,ph);
  var blob=await new Promise(function(r){cv.toBlob(r,'image/png');});
  if(!blob){throw new Error('PNG konnte nicht erzeugt werden.');}
  return F.print?pngAtDpi(blob,300):blob;
}
$('#expPng').addEventListener('click',async function(){
  if(!state.track){say('Bitte zuerst eine Route laden.');return;}
  try{saveFile(slug()+'.png',await renderPngBlob());}
  catch(err){say('PNG-Export fehlgeschlagen.');}
});

// share sheet of the phone (WhatsApp, Instagram, ...): only offered when the browser can share files
function canShareFiles(){
  try{return !!(navigator.share&&navigator.canShare&&navigator.canShare({files:[new File(['x'],'x.png',{type:'image/png'})]}));}
  catch(err){return false;}
}
$('#shareBtn').hidden=!canShareFiles();
$('#shareBtn').addEventListener('click',async function(){
  if(!state.track){say('Bitte zuerst eine Route laden.');return;}
  try{
    var file=new File([await renderPngBlob()],slug()+'.png',{type:'image/png'});
    await navigator.share({files:[file],title:state.title||'Wander-Poster'});
  }catch(err){
    if(!err||err.name!=='AbortError'){say('Teilen ist hier nicht möglich.');}
  }
});
