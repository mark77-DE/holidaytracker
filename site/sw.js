// Holidaytracker service worker. Keep the public shell and poster assets available offline,
// but always check authentication online before serving the protected poster page or API.
var BUILD='2026102114';
var CACHE='holidaytracker-'+BUILD;
var AUTH_CACHE='holidaytracker-authenticated-'+BUILD;
var SHARED='wander-poster-shared';
var ASSETS=["./","index.html","manifest.webmanifest","css/landing.css?v=7","css/style.css?v=2026102111","js/landing.js?v=9","js/00-fonts.js?v=20261020081610","js/10-core.js?v=20261020081610","js/20-track.js?v=20261020081610","js/30-geometry.js?v=20261020081610","js/31-render.js?v=20261020081610","js/40-highlights.js?v=20261020081610","js/50-osm.js?v=2026102114","js/55-vacation.js?v=2026102111","js/56-vacation-source.js?v=2","js/60-background.js?v=20261020081610","js/61-map.js?v=20261020081610","js/70-interaction.js?v=2026102111","js/80-controls.js?v=20261020081610","js/90-export.js?v=20261020081610","js/98-start.js?v=20261020081610","js/99-pwa.js?v=2026102102","impressum.html","datenschutz.html","nutzung.html","web-icons/apple-touch-icon.png","web-icons/icon-192.png","web-icons/icon-512.png","web-icons/icon-maskable-512.png"];
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(ASSETS);}).then(function(){return self.skipWaiting();}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){return (k.indexOf('wander-poster-')===0||k.indexOf('holidaytracker-')===0)&&k!==CACHE&&k!==AUTH_CACHE&&k!==SHARED;}).map(function(k){return caches.delete(k);}));
  }).then(function(){return self.clients.claim();})); 
});
async function handleShare(request){
  try{
    var data=await request.formData(),file=data.get('gpx');
    if(file&&typeof file!=='string'){
      var cache=await caches.open(SHARED);
      await cache.put('shared-gpx',new Response(file,{headers:{'X-File-Name':encodeURIComponent(file.name||'geteilt.gpx')}}));
    }
  }catch(err){}
  return Response.redirect(new URL('./?shared=1',self.registration.scope).href,303);
}
self.addEventListener('message',function(e){
  if(e.data&&e.data.type==='clear-authenticated-cache'){e.waitUntil(caches.delete(AUTH_CACHE));}
});
self.addEventListener('fetch',function(e){
  var req=e.request,url=new URL(req.url);
  if(req.method==='POST'&&url.pathname.slice(-13)==='/share-target'){e.respondWith(handleShare(req));return;}
  if(req.method!=='GET'||url.origin!==self.location.origin){return;}
  if(url.pathname.indexOf('/api/')!==-1){e.respondWith(fetch(req));return;}
  if(url.pathname.endsWith('/admin.html')){e.respondWith(fetch(req));return;}
  if(url.pathname.endsWith('/poster.html')){
    e.respondWith((async function(){
      try{
        var response=await fetch(req);
        if(response.ok&&!response.redirected&&new URL(response.url).pathname.endsWith('/poster.html')){
          var authCache=await caches.open(AUTH_CACHE);await authCache.put(req,response.clone());
        }
        return response;
      }catch(err){
        var saved=await caches.match(req);if(saved){return saved;}throw err;
      }
    })());return;
  }
  e.respondWith(caches.match(req,{ignoreSearch:true}).then(function(hit){return hit||fetch(req);}));
});

