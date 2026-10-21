'use strict';
// ---------- Map backdrop (raster tiles) ----------
var MAPSTYLES={
  topo :{url:'https://tile.opentopomap.org/{z}/{x}/{y}.png',maxZ:17,attr:'Kartendaten: © OpenStreetMap-Mitwirkende, SRTM | Kartenstil: © OpenTopoMap (CC-BY-SA)'},
  osm  :{url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',maxZ:17,attr:'© OpenStreetMap-Mitwirkende'}
};
var MAX_TILES=160;
var tileCache={}, mapData=null, mapG=null, mapClip=null, mapClipRect=null, mapImg=null, mapTimer=0, mapSeq=0;

function mapStyleDef(){
  var m=state.map;
  if(m.style==='custom'){return {url:m.url,maxZ:m.maxZ,attr:m.attrText};}
  return MAPSTYLES[m.style]||null;
}
function mapProjectionTrack(){return state.posterMode==='stages'?(state.stageMapRef||state.track):state.track;}
function attrOn(){return state.map.style!=='none'&&(state.map.attr||!fmt().print);}
function attrText(){var d=mapStyleDef();return d?(d.attr||''):'';}
function setMapStatus(txt){var el=$('#mapStatus'); if(el){el.textContent=txt;}}
function mapReset(){mapSeq++;mapData=null;mapG=null;mapClip=null;mapClipRect=null;mapImg=null;}

// tile maths (Web Mercator, coordinates relative to the track centre)
function relToWorld(X,Y,z){
  var t=mapProjectionTrack(), N=256*Math.pow(2,z), c=2*Math.PI*MERC_R;
  return [(X+MERC_R*t.lon0*Math.PI/180+c/2)/c*N, (c/2-(Y+t.y0))/c*N];
}
function worldToRel(wx,wy,z){
  var t=mapProjectionTrack(), N=256*Math.pow(2,z), c=2*Math.PI*MERC_R;
  return [wx/N*c-c/2-MERC_R*t.lon0*Math.PI/180, c/2-wy/N*c-t.y0];
}
function regionExtent(geo,margin){
  var H=fmt().H, r=state.map.ext==='all'?{x0:0,x1:100,y0:0,y1:H}:{x0:M,x1:M+W,y0:LAY.mapT,y1:state.mapB};
  var X0=geo.minX+(r.x0-geo.ox)/geo.sc, X1=geo.minX+(r.x1-geo.ox)/geo.sc;
  var Yt=geo.maxY-(r.y0-geo.oy)/geo.sc, Yb=geo.maxY-(r.y1-geo.oy)/geo.sc;
  var mx=(X1-X0)*margin, my=(Yt-Yb)*margin;
  return {X0:X0-mx,X1:X1+mx,Yb:Yb-my,Yt:Yt+my};
}
function tileRange(ext,z){
  var a=relToWorld(ext.X0,ext.Yt,z), b=relToWorld(ext.X1,ext.Yb,z), n=Math.pow(2,z)-1;
  return {tx0:clamp(Math.floor(a[0]/256),0,n),tx1:clamp(Math.floor(b[0]/256),0,n),ty0:clamp(Math.floor(a[1]/256),0,n),ty1:clamp(Math.floor(b[1]/256),0,n),a:a,b:b};
}
function pickZoom(geo,maxZ){
  var F=fmt(), full=F.print?Math.round(F.mmW/25.4*300):F.px[0];
  var target=full*(state.map.ext==='all'?100:W)/100;               // pixels the region will have in the export
  var ex=regionExtent(geo,0), wide=ex.X1-ex.X0, want=regionExtent(geo,0.15), z;
  for(z=5;z<maxZ;z++){
    if(wide/(2*Math.PI*MERC_R/(256*Math.pow(2,z)))>=0.9*target){break;}
  }
  for(;z>5;z--){
    var r=tileRange(want,z);
    if((r.tx1-r.tx0+1)*(r.ty1-r.ty0+1)<=MAX_TILES){break;}
  }
  return z;
}
function covers(d,need){return d.Xl<=need.X0&&d.Xr>=need.X1&&d.Yb<=need.Yb&&d.Yt>=need.Yt;}

function loadTile(url){
  if(tileCache[url]){return Promise.resolve(tileCache[url]);}
  return new Promise(function(res){
    var img=new Image(); img.crossOrigin='anonymous';
    img.onload=function(){tileCache[url]=img;res(img);};
    img.onerror=function(){res(null);};
    img.src=url;
  });
}
async function loadAll(list,onTick){
  var out=new Array(list.length), idx=0;
  async function worker(){while(idx<list.length){var i=idx++; out[i]=await loadTile(list[i].url); onTick();}}
  var ws=[]; for(var k=0;k<6;k++){ws.push(worker());}
  await Promise.all(ws);
  return out;
}
function tileUrl(def,z,x,y){
  return def.url.replace('{z}',z).replace('{x}',x).replace('{y}',y).replace('{s}','abcd'.charAt((x+y)%4));
}

function ensureBackdrop(){clearTimeout(mapTimer);mapTimer=setTimeout(runBackdrop,250);}
function clearMapAndRender(){
  var had=!!mapG; mapReset(); setMapStatus('');
  if(had){render();}
}
async function runBackdrop(){
  var m=state.map, def=mapStyleDef(), t=state.posterMode==='stages'?state.stageMapRef:state.track;
  if(m.style==='none'||!t){clearMapAndRender();return;}
  if(!def||!def.url||def.url.indexOf('{z}')<0||def.url.indexOf('{x}')<0||def.url.indexOf('{y}')<0){
    setMapStatus(m.style==='custom'?'Bitte eine Kachel-URL mit {z}, {x} und {y} eintragen.':'');
    return;
  }
  var geo=geometry(), need=regionExtent(geo,0.02), want=regionExtent(geo,0.15);
  var z=pickZoom(geo,def.maxZ||17);
  var key=[m.style,def.url,m.gray?1:0,z,t.lon0,t.y0].join('|');
  if(mapData&&mapData.key===key&&covers(mapData,need)){return;}
  var my=++mapSeq;
  var rg=tileRange(want,z), list=[], x, y;
  for(y=rg.ty0;y<=rg.ty1;y++){for(x=rg.tx0;x<=rg.tx1;x++){list.push({x:x,y:y,url:tileUrl(def,z,x,y)});}}
  var done=0;
  setMapStatus('Lade Karte … 0/'+list.length);
  var imgs=await loadAll(list,function(){done++;if(my===mapSeq){setMapStatus('Lade Karte … '+done+'/'+list.length);}});
  if(my!==mapSeq){return;}
  var fails=imgs.filter(function(i){return !i;}).length;
  if(fails>list.length*0.3){
    setMapStatus('Kacheln konnten nicht geladen werden. Mögliche Ursachen: Server nicht erreichbar, blockiert oder ohne CORS-Freigabe. Eine eigene Proxy-URL hilft.');
    return;
  }
  // stitch the tiles into one canvas that covers the wanted extent
  var wx0=Math.floor(rg.a[0]), wy0=Math.floor(rg.a[1]), w=Math.ceil(rg.b[0])-wx0, h=Math.ceil(rg.b[1])-wy0;
  var cv=document.createElement('canvas'); cv.width=w; cv.height=h;
  var ctx=cv.getContext('2d');
  ctx.fillStyle='#dcdcdc'; ctx.fillRect(0,0,w,h);                  // neutral colour behind missing tiles
  list.forEach(function(tl,i){if(imgs[i]){ctx.drawImage(imgs[i],tl.x*256-wx0,tl.y*256-wy0);}});
  if(m.gray){
    var id=ctx.getImageData(0,0,w,h), d=id.data;
    for(var q=0;q<d.length;q+=4){var g=0.299*d[q]+0.587*d[q+1]+0.114*d[q+2];d[q]=d[q+1]=d[q+2]=g;}
    ctx.putImageData(id,0,0);
  }
  var url;
  try{url=cv.toDataURL('image/jpeg',0.92);}
  catch(err){setMapStatus('Die Karte konnte nicht ausgelesen werden (CORS). Eine eigene Proxy-URL hilft.');return;}
  var tl0=worldToRel(wx0,wy0,z), br0=worldToRel(wx0+w,wy0+h,z);
  mapData={key:key,z:z,Xl:tl0[0],Yt:tl0[1],Xr:br0[0],Yb:br0[1],url:url};
  mapClip=svgEl('clipPath',{id:'mapclip'},null); mapClipRect=svgEl('rect',{},mapClip);
  mapImg=document.createElementNS(NS,'image');
  mapImg.setAttribute('href',url); mapImg.setAttributeNS(XLINK,'xlink:href',url); mapImg.setAttribute('preserveAspectRatio','none');
  mapG=svgEl('g',{'clip-path':'url(#mapclip)'},null); mapG.appendChild(mapImg);
  setMapStatus('Zoom '+z+', '+list.length+' Kacheln'+(fails?', '+fails+' fehlend':''));
  render();
}
function placeMap(geo){
  var d=mapData, H=fmt().H;
  mapImg.setAttribute('x',f(geo.ox+(d.Xl-geo.minX)*geo.sc));
  mapImg.setAttribute('y',f(geo.oy+(geo.maxY-d.Yt)*geo.sc));
  mapImg.setAttribute('width',f((d.Xr-d.Xl)*geo.sc));
  mapImg.setAttribute('height',f((d.Yt-d.Yb)*geo.sc));
  mapImg.setAttribute('opacity',f(state.map.op/100));
  var r=state.map.ext==='all'?[0,0,100,H]:[M,LAY.mapT,W,state.mapB-LAY.mapT];
  mapClipRect.setAttribute('x',f(r[0])); mapClipRect.setAttribute('y',f(r[1]));
  mapClipRect.setAttribute('width',f(r[2])); mapClipRect.setAttribute('height',f(r[3]));
}

function syncMapUi(){
  var m=state.map, social=!fmt().print;
  $('#mapCtl').hidden=(m.style==='none'); $('#mapCustom').hidden=(m.style!=='custom');
  $('#mapPos').disabled=m.style==='none';
  $('#mapZoom').value=Math.round((m.view&&m.view.scale||1)*100);$('#mapZoomOut').textContent=$('#mapZoom').value+' %';
  $('#mapAttr').checked=m.attr||social; $('#mapAttr').disabled=social;
  $('#mapAttrHint').textContent=social
    ?'Bei den Social-Media-Formaten bleibt die Quellenangabe immer an.'
    :'Rein privat kannst du die Quellenangabe weglassen. Beim Weitergeben oder Veröffentlichen ist sie nötig.';
}
function setMapPosMode(on){
  state.mapPosMode=!!on&&state.map.style!=='none';
  $('#mapPos').setAttribute('aria-pressed',state.mapPosMode?'true':'false');
  $('#mapPos').textContent=state.mapPosMode?'Positionieren beenden':'Karte positionieren';
  svg.classList.toggle('map-posing',state.mapPosMode);
  if(state.mapPosMode){setPosMode(false);setAddMode(false);}
}
$('#mapPos').addEventListener('click',function(){setMapPosMode(!state.mapPosMode);});
$('#mapFit').addEventListener('click',function(){state.map.view={scale:1,x:0,y:0};syncMapUi();mapReset();render();});
$('#mapZoom').addEventListener('input',function(e){state.map.view.scale=+e.target.value/100;$('#mapZoomOut').textContent=e.target.value+' %';render();});
svg.addEventListener('wheel',function(e){
  if(!state.mapPosMode){return;}e.preventDefault();
  var p=toSvg(e),v=state.map.view,cx=50,cy=(LAY.mapT+state.mapB)/2,old=v.scale||1,next=clamp(old*(1-e.deltaY*.0015),.65,2.5);
  v.x=p.x-cx-((p.x-cx-v.x)/old)*next;v.y=p.y-cy-((p.y-cy-v.y)/old)*next;v.scale=next;
  syncMapUi();render();
},{passive:false});
$('#mapStyle').addEventListener('change',function(e){
  state.map.style=e.target.value; if(state.map.style==='none'){setMapPosMode(false);} mapReset(); syncMapUi(); applyFormat(); render();
});
$('#mapUrl').addEventListener('change',function(e){state.map.url=e.target.value.trim();mapReset();render();});
$('#mapAttrText').addEventListener('input',function(e){state.map.attrText=e.target.value;render();});
$('#mapOp').addEventListener('input',function(e){
  state.map.op=+e.target.value; $('#mapOpOut').textContent=state.map.op+' %';
  if(mapImg){mapImg.setAttribute('opacity',f(state.map.op/100));}
});
$('#mapGray').addEventListener('change',function(e){state.map.gray=e.target.checked;render();});
$('#mapExt').addEventListener('change',function(e){state.map.ext=e.target.value;render();});
$('#mapAttr').addEventListener('change',function(e){state.map.attr=e.target.checked;applyFormat();render();});
