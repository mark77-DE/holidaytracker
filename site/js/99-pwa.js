'use strict';
// ---------- Installable web app: service worker and GPX received via the share sheet ----------
if('serviceWorker' in navigator&&location.protocol!=='file:'){
  window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){});});
}
(async function(){
  if(!/[?&]shared=1/.test(location.search)||!window.caches){return;}
  try{
    var cache=await caches.open('wander-poster-shared'), res=await cache.match('shared-gpx');
    if(!res){return;}
    var text=await res.text(), name=decodeURIComponent(res.headers.get('X-File-Name')||'geteilt.gpx');
    await cache.delete('shared-gpx');
    history.replaceState(null,'',location.pathname);
    loadRaw(parseGPX(text),name);
    say('GPX aus dem Teilen-Menü übernommen.');
  }catch(err){say('Die geteilte Datei konnte nicht gelesen werden.');}
})();
