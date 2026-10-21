'use strict';
// ---------- OpenStreetMap suggestions (Overpass API) ----------
// OSM-BEGIN
function osmQuery(t,R){
  // route as a polyline of at most ~90 vertices, used with Overpass "around"
  var s=t.s, step=Math.max(1,Math.ceil(s.length/90)), c=[], i;
  function push(p){var ll=t.toLL(p.px,p.py);c.push(ll[0].toFixed(5),ll[1].toFixed(5));}
  for(i=0;i<s.length;i+=step){push(s[i]);}
  push(s[s.length-1]);
  var A='(around:'+R+','+c.join(',')+')';
  return '[out:json][timeout:50];('+
    'node["natural"~"^(peak|hill)$"]["name"]'+A+';'+
    'node["tourism"="viewpoint"]["name"]'+A+';'+
    'nwr["wikipedia"]["name"][!"place"][!"boundary"][!"highway"]["type"!="route"]["leisure"!="nature_reserve"]'+A+';'+
    'nwr["historic"~"^(castle|monastery|ruins|fort|palace|manor|church|archaeological_site)$"]["name"]["wikidata"]'+A+';'+
    'nwr["tourism"="attraction"]["name"]["wikidata"]'+A+';'+
    'nwr["natural"~"^(waterfall|cave_entrance|gorge)$"]["name"]'+A+';'+
    ');out tags center qt;';
}
function osmSearchQuery(t,R,term){
  var s=t.s, step=Math.max(1,Math.ceil(s.length/90)), c=[], i;
  function push(p){var ll=t.toLL(p.px,p.py);c.push(ll[0].toFixed(5),ll[1].toFixed(5));}
  for(i=0;i<s.length;i+=step){push(s[i]);}
  push(s[s.length-1]);
  var A='(around:'+R+','+c.join(',')+')';
  var escaped=term.replace(/[.*+?^${}()|[\]\\"]/g,'\\$&');
  return '[out:json][timeout:50];(nwr["name"~"'+escaped+'",i]'+A+';);out tags center qt;';
}
function osmCandidates(json,t,R){
  var out=[], seen={};
  (json.elements||[]).forEach(function(el){
    var tags=el.tags||{}, name=tags['name:de']||tags.name;
    if(!name){return;}
    var lat=el.lat!=null?el.lat:(el.center&&el.center.lat), lon=el.lon!=null?el.lon:(el.center&&el.center.lon);
    if(lat==null||lon==null){return;}
    var key=el.type+el.id; if(seen[key]){return;} seen[key]=1;
    var xy=t.toXY(lat,lon), px=xy[0], py=xy[1], best=0, bd=Infinity;
    for(var i=0;i<t.s.length;i++){
      var dx=t.s[i].px-px, dy=t.s[i].py-py, dd=dx*dx+dy*dy;
      if(dd<bd){bd=dd;best=i;}
    }
    var dist=Math.sqrt(bd)*t.kcos; if(dist>R){return;}   // Mercator metres -> ground metres
    var kind='Sehenswürdigkeit';
    if(tags.natural==='peak'||tags.natural==='hill'){kind='Gipfel';}
    else if(tags.tourism==='viewpoint'){kind='Aussichtspunkt';}
    else if(/^(waterfall|cave_entrance|gorge)$/.test(tags.natural||'')){kind='Natur';}
    var ele=parseFloat(String(tags.ele||'').replace(',','.'));
    out.push({id:key,name:name,kind:kind,ele:isFinite(ele)?ele:null,dist:dist,d:t.s[best].d});
  });
  out.sort(function(a,b){return a.d-b.d;});
  var res=[];
  out.forEach(function(c){
    if(!res.some(function(r){return r.name===c.name&&Math.abs(r.d-c.d)<300;})){res.push(c);}
  });
  if(res.length>60){
    res.sort(function(a,b){return a.dist-b.dist;});
    res=res.slice(0,60).sort(function(a,b){return a.d-b.d;});
  }
  return res;
}
// OSM-END

var OSM_ENDPOINTS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
async function osmFetch(q){
  var failures=[], emptyResponse=null;
  for(var i=0;i<OSM_ENDPOINTS.length;i++){
    // Overpass may queue a request for up to 15 seconds before starting it.
    // Leave enough time for its 50-second query timeout plus that queue time.
    var ctl=new AbortController(), timer=setTimeout(function(){ctl.abort();},70000);
    try{
      var res=await fetch(OSM_ENDPOINTS[i],{method:'POST',body:new URLSearchParams({data:q}),signal:ctl.signal});
      if(!res.ok){var httpErr=new Error('HTTP '+res.status);httpErr.status=res.status;throw httpErr;}
      var json=await res.json();
      if(!Array.isArray(json.elements)){throw new Error('Ungültige Antwort vom Overpass-Dienst.');}
      if(json.elements.length){return json;}
      // A successful empty response from one replica can be transient or stale.
      // Check the other configured replica before telling the user there are no places.
      emptyResponse=json;
    }catch(err){failures.push({endpoint:OSM_ENDPOINTS[i],error:err});}
    finally{clearTimeout(timer);}
  }
  var gateway=failures.find(function(f){return f.error.status===502||f.error.status===503||f.error.status===504;});
  if(gateway){
    var other=failures.find(function(f){return f!==gateway;});
    var detail='Overpass meldet HTTP '+gateway.error.status+' ('+new URL(gateway.endpoint).host+').';
    if(other){detail+=' Der Ausweichdienst '+new URL(other.endpoint).host+' antwortete ebenfalls nicht ('+((other.error&&other.error.message)||'Netzwerkfehler')+').';}
    detail+=' Das ist ein Dienstfehler; ein kleinerer Suchabstand behebt ihn nicht. Bitte später erneut versuchen.';
    var serviceErr=new Error(detail);serviceErr.name='OverpassServiceError';throw serviceErr;
  }
  if(emptyResponse){
    if(failures.length){emptyResponse._overpassWarnings=failures.map(function(f){return new URL(f.endpoint).host+': '+((f.error&&f.error.message)||'Anfrage fehlgeschlagen');});}
    return emptyResponse;
  }
  throw failures.length?failures[failures.length-1].error:new Error('Keine Overpass-Dienste verfügbar.');
}
function osmEmptyNotice(json,base){
  var warnings=json&&json._overpassWarnings;
  return base+(warnings&&warnings.length?' Ein weiterer Overpass-Dienst hatte einen Fehler ('+warnings.join('; ')+').':'');
}
state.osm=[];
function renderOsm(){
  var box=$('#osmbox'), list=$('#osmlist');
  list.innerHTML='';
  if(!state.osm.length){box.hidden=true;return;}
  box.hidden=false;
  var detected=state.track.hasEle?findPeaks(8,25):[];
  state.osm.forEach(function(c,i){
    var pre=c.kind==='Gipfel'&&detected.some(function(p){return Math.abs(p.d-c.d)<400;});
    var meta=c.kind+(c.ele!=null?', '+de(c.ele)+' m':'')+', '+de(Math.round(c.dist))+' m von der Route';
    var row=document.createElement('label'); row.className='cand';
    row.innerHTML='<input type="checkbox" data-i="'+i+'"'+(pre?' checked':'')+'><span><b>'+esc(c.name)+'</b><small>'+esc(meta)+'</small></span>';
    list.appendChild(row);
  });
}
$('#osm').addEventListener('click',async function(){
  if(!state.track){say('Bitte zuerst eine Route laden.');return;}
  var R=+$('#osmR').value, btn=$('#osm');
  btn.disabled=true; btn.textContent='Suche läuft …';
  try{
    var json=await osmFetch(osmQuery(state.track,R));
    state.osm=osmCandidates(json,state.track,R);
    renderOsm();
    say(state.osm.length?state.osm.length+' Vorschläge gefunden.':osmEmptyNotice(json,'Keine benannten Orte in diesem Abstand gefunden.'));
  }catch(err){
    say(err&&err.name==='AbortError'
      ?'Der OpenStreetMap-Dienst hat nach 70 Sekunden nicht geantwortet. Bitte später erneut versuchen.'
      :err&&err.name==='TypeError'
      ?'OpenStreetMap-Suche nicht erreichbar oder vom Dienst/Browser blockiert. Bitte 30 Sekunden warten und erneut versuchen.'
      :'Abfrage fehlgeschlagen: '+((err&&err.message)||'unbekannter Fehler'));
  }finally{btn.disabled=false;btn.textContent='Vorschläge aus OpenStreetMap';}
});
$('#osmSearchBtn').addEventListener('click',async function(){
  if(!state.track){say('Bitte zuerst eine Route laden.');return;}
  var term=$('#osmSearch').value.trim();
  if(!term){say('Bitte einen Suchbegriff eingeben.');$('#osmSearch').focus();return;}
  var R=+$('#osmR').value, btn=$('#osmSearchBtn');
  btn.disabled=true; btn.textContent='Suche läuft …';
  try{
    var json=await osmFetch(osmSearchQuery(state.track,R,term));
    state.osm=osmCandidates(json,state.track,R);
    renderOsm();
    say(state.osm.length?state.osm.length+' passende Orte gefunden.':osmEmptyNotice(json,'Keine passenden Orte in diesem Abstand gefunden.'));
  }catch(err){
    say(err&&err.name==='AbortError'
      ?'Der OpenStreetMap-Dienst hat nach 70 Sekunden nicht geantwortet. Bitte später erneut versuchen.'
      :err&&err.name==='TypeError'
      ?'OpenStreetMap-Suche nicht erreichbar oder vom Dienst/Browser blockiert. Bitte 30 Sekunden warten und erneut versuchen.'
      :'Abfrage fehlgeschlagen: '+((err&&err.message)||'unbekannter Fehler'));
  }finally{btn.disabled=false;btn.textContent='Suchen';}
});
$('#osmSearch').addEventListener('keydown',function(e){if(e.key==='Enter'){$('#osmSearchBtn').click();}});
$('#osmAdd').addEventListener('click',function(){
  var added=0;
  Array.prototype.forEach.call($('#osmlist').querySelectorAll('input:checked'),function(cb){
    var c=state.osm[+cb.getAttribute('data-i')];
    if(!c||state.hl.some(function(h){return h.name===c.name&&Math.abs(h.d-c.d)<150;})){return;}
    var hl=addHL(c.d,c.name);
    if(c.ele!=null){hl.ele=c.ele;}
    else if(c.kind!=='Gipfel'){hl.hideEle=true;}
    added++;
  });
  state.osm=[]; renderOsm(); renderList(); render();
  say(added?added+(added===1?' Highlight':' Highlights')+' übernommen.':'Nichts ausgewählt.');
});
