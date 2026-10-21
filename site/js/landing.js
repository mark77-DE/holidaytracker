'use strict';
(function(){
  var $=function(id){return document.getElementById(id);};
  var params=new URLSearchParams(location.search);
  var hashParams=new URLSearchParams(location.hash.slice(1));
  var hasNext=params.has('next');
  var next=params.get('next');
  if(!next||!/^\/poster\.html(?:\?shared=1)?$/.test(next)){next='/poster.html';}
  $('year').textContent=new Date().getFullYear();
  function message(id,text,success){var el=$(id);el.textContent=text||'';el.classList.toggle('success',!!success);}
  async function api(path,options){
    var response=await fetch(path,Object.assign({credentials:'same-origin',headers:{'Content-Type':'application/json'}},options||{}));
    var body={};try{body=await response.json();}catch(e){}
    if(!response.ok){throw new Error(body.error||'Anfrage fehlgeschlagen.');}
    return body;
  }
  function show(view){['login-view','invite-view','dashboard-view'].forEach(function(id){$(id).hidden=id!==view;});document.body.classList.toggle('is-authenticated',view==='dashboard-view');}
  function vacationDateRange(v){
    var start=new Date(v.startDate+'T12:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'});
    var end=new Date(v.endDate+'T12:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'});
    return start===end?start:start+' – '+end;
  }
  function resetVacationForm(){
    $('vacation-form').reset();$('vacation-id').value='';$('vacation-submit').innerHTML='Urlaub speichern <span aria-hidden="true">→</span>';$('vacation-cancel').hidden=true;message('vacation-message','');
  }
  function formatBytes(value){return value<1024?value+' B':value<1024*1024?(value/1024).toFixed(0)+' KB':(value/1024/1024).toFixed(1)+' MB';}
  var routePointCache=Object.create(null),topoTileCache=Object.create(null),routeColors=['#c24b32','#267f70','#446fc1','#9b6b1e','#8653a5','#267b9b','#c15d85','#647b35'];
  function routeColor(index){return routeColors[index%routeColors.length];}
  async function getRoutePoints(trackId){
    if(routePointCache[trackId])return routePointCache[trackId];
    routePointCache[trackId]=(async function(){
      var response=await fetch('/api/tracks/'+trackId,{credentials:'same-origin'});
      if(!response.ok)throw new Error('GPX-Datei konnte nicht geladen werden.');
      var doc=new DOMParser().parseFromString(await response.text(),'application/xml');
      if(doc.querySelector('parsererror'))throw new Error('GPX-Datei ist ungültig.');
      var nodes=Array.from(doc.getElementsByTagNameNS('*','trkpt'));
      if(!nodes.length)nodes=Array.from(doc.getElementsByTagNameNS('*','rtept'));
      var points=nodes.map(function(n){return {lat:parseFloat(n.getAttribute('lat')),lon:parseFloat(n.getAttribute('lon'))};}).filter(function(p){return isFinite(p.lat)&&isFinite(p.lon);});
      if(points.length<2)throw new Error('Die GPX-Datei enthält keine Route mit mindestens zwei Punkten.');
      return points;
    })().catch(function(error){delete routePointCache[trackId];throw error;});
    return routePointCache[trackId];
  }
  function topoTile(z,x,y){
    var n=Math.pow(2,z);if(y<0||y>=n)return Promise.resolve(null);x=((x%n)+n)%n;
    var key=z+'/'+x+'/'+y;if(topoTileCache[key])return topoTileCache[key];
    topoTileCache[key]=new Promise(function(resolve){var img=new Image();img.onload=function(){resolve(img);};img.onerror=function(){resolve(null);};img.src='https://tile.opentopomap.org/'+key+'.png';});
    return topoTileCache[key];
  }
  function worldPoint(point,z){
    var lat=Math.max(-85.05112878,Math.min(85.05112878,point.lat))*Math.PI/180,n=Math.pow(2,z)*256;
    return {x:(point.lon+180)/360*n,y:(1-Math.asinh(Math.tan(lat))/Math.PI)/2*n};
  }
  async function drawVacationMap(mapState){
    var seq=++mapState.seq,canvas=mapState.canvas,ctx=canvas.getContext('2d'),w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h)return;
    var ratio=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle='#e8eee6';ctx.fillRect(0,0,w,h);
    var shown=mapState.selectedId!=null?mapState.tracks.filter(function(t){return t.id===mapState.selectedId&&!mapState.hidden.has(t.id);}):mapState.tracks.filter(function(t){return !mapState.hidden.has(t.id);});
    if(!shown.length){mapState.status.textContent=mapState.tracks.length?'Keine Tracks auf der Karte aktiviert.':'Noch keine GPX-Tracks.';return;}
    mapState.status.textContent='Routen werden geladen …';
    var results=await Promise.all(shown.map(async function(track,index){try{return {track:track,points:await getRoutePoints(track.id),color:routeColor(mapState.tracks.indexOf(track))};}catch(e){return {track:track,error:e.message,color:routeColor(mapState.tracks.indexOf(track))};}}));
    if(seq!==mapState.seq)return;
    var routes=results.filter(function(r){return r.points;});
    if(!routes.length){mapState.status.textContent=results[0].error||'Keine Route darstellbar.';return;}
    var minLat=90,maxLat=-90,minLon=180,maxLon=-180;
    routes.forEach(function(r){r.points.forEach(function(p){minLat=Math.min(minLat,p.lat);maxLat=Math.max(maxLat,p.lat);minLon=Math.min(minLon,p.lon);maxLon=Math.max(maxLon,p.lon);});});
    var z=2,coords=null;
    for(var candidate=2;candidate<=17;candidate++){
      var points=[];routes.forEach(function(r){r.points.forEach(function(p){points.push(worldPoint(p,candidate));});});
      var xs=points.map(function(p){return p.x;}),ys=points.map(function(p){return p.y;}),spanX=Math.max.apply(null,xs)-Math.min.apply(null,xs),spanY=Math.max.apply(null,ys)-Math.min.apply(null,ys);
      z=candidate;coords={points:points,minX:Math.min.apply(null,xs),maxX:Math.max.apply(null,xs),minY:Math.min.apply(null,ys),maxY:Math.max.apply(null,ys)};
      if(spanX>w-56||spanY>h-56){z=Math.max(2,candidate-1);coords=null;break;}
    }
    if(!coords){var all=[];routes.forEach(function(r){r.points.forEach(function(p){all.push(worldPoint(p,z));});});var xx=all.map(function(p){return p.x;}),yy=all.map(function(p){return p.y;});coords={points:all,minX:Math.min.apply(null,xx),maxX:Math.max.apply(null,xx),minY:Math.min.apply(null,yy),maxY:Math.max.apply(null,yy)};}
    var spanX=Math.max(1,coords.maxX-coords.minX),spanY=Math.max(1,coords.maxY-coords.minY),fitScale=Math.min((w-48)/spanX,(h-48)/spanY),zoomFactor=Math.max(1,mapState.zoom||1),tileSteps=Math.min(17-z,Math.floor(Math.log(zoomFactor)/Math.LN2+0.5)),tileFactor=Math.pow(2,tileSteps);z+=tileSteps;var scale=fitScale*zoomFactor/tileFactor,centerX=((coords.minX+coords.maxX)/2)*tileFactor-(mapState.panX||0)/scale,centerY=((coords.minY+coords.maxY)/2)*tileFactor-(mapState.panY||0)/scale;
    var tx0=Math.floor((centerX-w/(2*scale))/256),tx1=Math.floor((centerX+w/(2*scale))/256),ty0=Math.floor((centerY-h/(2*scale))/256),ty1=Math.floor((centerY+h/(2*scale))/256),tiles=[];
    for(var ty=ty0;ty<=ty1;ty++)for(var tx=tx0;tx<=tx1;tx++)tiles.push({x:tx,y:ty});
    var images=await Promise.all(tiles.map(function(t){return topoTile(z,t.x,t.y);}));
    if(seq!==mapState.seq)return;
    var missing=0;ctx.save();ctx.globalAlpha=mapState.mapOpacity==null?1:mapState.mapOpacity;tiles.forEach(function(t,i){if(!images[i]){missing++;return;}var px=w/2+(t.x*256-centerX)*scale,py=h/2+(t.y*256-centerY)*scale;ctx.drawImage(images[i],px,py,256*scale,256*scale);});ctx.restore();
    routes.forEach(function(route){
      var pts=route.points.map(function(p){var q=worldPoint(p,z);return [w/2+(q.x-centerX)*scale,h/2+(q.y-centerY)*scale];});
      ctx.save();ctx.globalAlpha=mapState.routeOpacity==null?1:mapState.routeOpacity;ctx.beginPath();pts.forEach(function(p,i){if(i===0)ctx.moveTo(p[0],p[1]);else ctx.lineTo(p[0],p[1]);});ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle='rgba(255,255,255,.94)';ctx.lineWidth=7;ctx.stroke();ctx.strokeStyle=route.color;ctx.lineWidth=3.5;ctx.stroke();
      [[pts[0],route.color],[pts[pts.length-1],'#b74735']].forEach(function(item){ctx.beginPath();ctx.arc(item[0][0],item[0][1],5,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.lineWidth=3;ctx.strokeStyle=item[1];ctx.stroke();});ctx.restore();
    });
    var failures=results.filter(function(r){return r.error;}).length;
    mapState.status.textContent=(mapState.selectedId!=null?'Ausgewählte Route':' '+routes.length+' von '+shown.length+' Tracks')+' · OpenTopoMap'+(missing?' · '+missing+' Kartenkacheln fehlen':'')+(failures?' · '+failures+' GPX-Dateien nicht lesbar':'');
  }
  async function loadTracks(vacationId,box,status,mapState){
    try{
      var data=await api('/api/vacations/'+vacationId+'/tracks');box.replaceChildren();mapState.tracks=data.tracks;
      if(mapState.selectedId!=null&&!data.tracks.some(function(t){return t.id===mapState.selectedId;}))mapState.selectedId=null;
      mapState.panel.hidden=!data.tracks.length;
      if(!data.tracks.length){var empty=document.createElement('p');empty.className='track-empty';empty.textContent='Noch keine Tracks gespeichert.';box.appendChild(empty);return;}
      data.tracks.forEach(function(track,index){
        var row=document.createElement('div');row.className='track-row';row.style.setProperty('--track-color',routeColor(index));
        var toggle=document.createElement('input');toggle.type='checkbox';toggle.className='track-toggle';toggle.checked=!mapState.hidden.has(track.id);toggle.setAttribute('aria-label','Route '+track.filename+' auf der Karte anzeigen');
        toggle.addEventListener('change',function(){if(toggle.checked)mapState.hidden.delete(track.id);else mapState.hidden.add(track.id);if(!toggle.checked&&mapState.selectedId===track.id)mapState.selectedId=null;drawVacationMap(mapState);});
        var select=document.createElement('button');select.type='button';select.className='track-select';select.textContent=track.filename;select.setAttribute('aria-pressed',mapState.selectedId===track.id?'true':'false');
        select.addEventListener('click',function(){mapState.selectedId=mapState.selectedId===track.id?null:track.id;loadTracks(vacationId,box,status,mapState);});
        var info=document.createElement('span');info.className='track-info';var meta=document.createElement('small');meta.textContent=formatBytes(track.size)+' · '+new Date(track.uploadedAt).toLocaleDateString('de-DE');info.append(select,meta);
        var actions=document.createElement('span');actions.className='track-actions';
        var download=document.createElement('a');download.className='text-action';download.href='/api/tracks/'+track.id;download.download=track.filename;download.textContent='Herunterladen';
        var remove=document.createElement('button');remove.type='button';remove.className='text-action danger-action';remove.textContent='Entfernen';
        remove.addEventListener('click',async function(){if(!window.confirm('Diesen GPX-Track entfernen?'))return;try{await api('/api/tracks/'+track.id,{method:'DELETE'});status.textContent='GPX-Track entfernt.';await loadTracks(vacationId,box,status,mapState);}catch(e){status.textContent=e.message;}});
        actions.append(download,remove);row.append(toggle,info,actions);box.appendChild(row);
      });
      mapState.allButton.disabled=mapState.selectedId==null;drawVacationMap(mapState);
    }catch(e){box.textContent=e.message;mapState.status.textContent=e.message;}
  }
  async function refreshVacations(){
    var box=$('vacation-list');
    try{
      var data=await api('/api/vacations');$('vacation-count').textContent=String(data.vacations.length);box.replaceChildren();
      if(!data.vacations.length){box.innerHTML='<p class="empty-state">Noch keine Urlaube angelegt. Legt euren ersten gemeinsamen Urlaub an.</p>';return;}
      data.vacations.forEach(function(v){
        var card=document.createElement('article');card.className='vacation-card';
        var head=document.createElement('div');head.className='vacation-card-head';
        var title=document.createElement('h4');title.textContent=v.title;head.appendChild(title);
        if(v.destination){var place=document.createElement('span');place.className='vacation-place';place.textContent=v.destination;head.appendChild(place);}
        var dates=document.createElement('p');dates.className='vacation-dates';dates.textContent=vacationDateRange(v);
        card.append(head,dates);
        if(v.notes){var notes=document.createElement('p');notes.className='vacation-card-notes';notes.textContent=v.notes;card.appendChild(notes);}
        var actions=document.createElement('div');actions.className='vacation-card-actions';
        var edit=document.createElement('button');edit.type='button';edit.className='text-action';edit.textContent='Bearbeiten';
        edit.addEventListener('click',function(){$('vacation-id').value=v.id;$('vacation-title-input').value=v.title;$('vacation-destination').value=v.destination;$('vacation-start').value=v.startDate;$('vacation-end').value=v.endDate;$('vacation-notes').value=v.notes;$('vacation-submit').innerHTML='Änderungen speichern <span aria-hidden="true">→</span>';$('vacation-cancel').hidden=false;$('vacation-title-input').focus();});
        var remove=document.createElement('button');remove.type='button';remove.className='text-action danger-action';remove.textContent='Löschen';
        remove.addEventListener('click',async function(){if(!window.confirm('Diesen Urlaub wirklich löschen?'))return;try{await api('/api/vacations/'+v.id,{method:'DELETE'});refreshVacations();}catch(e){message('vacation-message',e.message);}});
        var poster=document.createElement('a');poster.className='text-action';poster.href='/poster.html?vacation='+encodeURIComponent(v.id);poster.textContent='Poster erstellen';
        actions.append(poster,edit,remove);card.appendChild(actions);
        var trackSection=document.createElement('section');trackSection.className='vacation-tracks';
        var trackHeading=document.createElement('h5');trackHeading.textContent='GPX-Tracks';trackSection.appendChild(trackHeading);
        var uploadLabel=document.createElement('label');uploadLabel.className='track-upload';uploadLabel.textContent='GPX-Dateien hinzufügen';
        var fileInput=document.createElement('input');fileInput.type='file';fileInput.accept='.gpx,application/gpx+xml,application/xml,text/xml';fileInput.multiple=true;fileInput.className='track-file-input';
        uploadLabel.appendChild(fileInput);trackSection.appendChild(uploadLabel);
        var trackMessage=document.createElement('p');trackMessage.className='track-message';trackMessage.setAttribute('role','status');trackMessage.setAttribute('aria-live','polite');trackSection.appendChild(trackMessage);
        var trackList=document.createElement('div');trackList.className='track-list';trackSection.appendChild(trackList);
        var mapPanel=document.createElement('section');mapPanel.className='vacation-map';mapPanel.hidden=true;
        var mapTop=document.createElement('div');mapTop.className='map-topline';
        var mapTitle=document.createElement('h5');mapTitle.textContent='Routenkarte';mapTop.appendChild(mapTitle);
        var allButton=document.createElement('button');allButton.type='button';allButton.className='map-all-button';allButton.textContent='Alle Tracks anzeigen';allButton.disabled=true;mapTop.appendChild(allButton);mapPanel.appendChild(mapTop);
        var mapStatus=document.createElement('p');mapStatus.className='map-status';mapStatus.setAttribute('role','status');mapStatus.setAttribute('aria-live','polite');mapPanel.appendChild(mapStatus);
        var controls=document.createElement('div');controls.className='map-controls';
        var zoomOut=document.createElement('button');zoomOut.type='button';zoomOut.className='map-control-button';zoomOut.textContent='−';zoomOut.setAttribute('aria-label','Karte verkleinern');
        var zoomReadout=document.createElement('span');zoomReadout.className='map-zoom-readout';zoomReadout.textContent='100%';
        var zoomIn=document.createElement('button');zoomIn.type='button';zoomIn.className='map-control-button';zoomIn.textContent='+';zoomIn.setAttribute('aria-label','Karte vergrößern');
        var resetView=document.createElement('button');resetView.type='button';resetView.className='map-reset-button';resetView.textContent='Ansicht zurücksetzen';
        var opacityLabel=document.createElement('label');opacityLabel.className='map-opacity-control';opacityLabel.innerHTML='<span>Routen-Deckkraft</span>';
        var opacity=document.createElement('input');opacity.type='range';opacity.min='0.25';opacity.max='1';opacity.step='0.05';opacity.value='1';opacity.setAttribute('aria-label','Deckkraft der Routen');opacityLabel.appendChild(opacity);
        var mapOpacityLabel=document.createElement('label');mapOpacityLabel.className='map-opacity-control';mapOpacityLabel.innerHTML='<span>Kartendeckkraft</span>';
        var mapOpacity=document.createElement('input');mapOpacity.type='range';mapOpacity.min='0.25';mapOpacity.max='1';mapOpacity.step='0.05';mapOpacity.value='1';mapOpacity.setAttribute('aria-label','Deckkraft des Kartenhintergrunds');mapOpacityLabel.appendChild(mapOpacity);
        controls.append(zoomOut,zoomReadout,zoomIn,resetView,opacityLabel,mapOpacityLabel);mapPanel.appendChild(controls);
        var canvas=document.createElement('canvas');canvas.className='vacation-map-canvas';canvas.setAttribute('aria-label','OpenTopoMap mit GPX-Routen');canvas.setAttribute('role','img');canvas.setAttribute('title','Zoomen mit Mausrad, Karte durch Ziehen verschieben');mapPanel.appendChild(canvas);
        var attribution=document.createElement('div');attribution.className='map-attribution';attribution.innerHTML='<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">Kartendaten © OpenStreetMap-Mitwirkende</a> · SRTM · <a href="https://opentopomap.org" target="_blank" rel="noopener">© OpenTopoMap (CC-BY-SA)</a>';mapPanel.appendChild(attribution);
        var mapState={panel:mapPanel,canvas:canvas,status:mapStatus,allButton:allButton,tracks:[],selectedId:null,hidden:new Set(),seq:0,zoom:1,panX:0,panY:0,routeOpacity:1,mapOpacity:1};
        function updateZoom(){zoomReadout.textContent=Math.round(mapState.zoom*100)+'%';zoomOut.disabled=mapState.zoom<=1;zoomIn.disabled=mapState.zoom>=8;}
        function setZoom(value){mapState.zoom=Math.max(1,Math.min(8,value));updateZoom();drawVacationMap(mapState);}
        zoomIn.addEventListener('click',function(){setZoom(mapState.zoom*1.25);});
        zoomOut.addEventListener('click',function(){setZoom(mapState.zoom/1.25);});
        resetView.addEventListener('click',function(){mapState.zoom=1;mapState.panX=0;mapState.panY=0;updateZoom();drawVacationMap(mapState);});
        opacity.addEventListener('input',function(){mapState.routeOpacity=Number(opacity.value);drawVacationMap(mapState);});
        mapOpacity.addEventListener('input',function(){mapState.mapOpacity=Number(mapOpacity.value);drawVacationMap(mapState);});
        canvas.addEventListener('wheel',function(event){event.preventDefault();setZoom(mapState.zoom*(event.deltaY<0?1.15:1/1.15));},{passive:false});
        var dragging=false,lastX=0,lastY=0;
        canvas.addEventListener('pointerdown',function(event){if(event.button!==undefined&&event.button!==0)return;dragging=true;lastX=event.clientX;lastY=event.clientY;canvas.classList.add('is-dragging');canvas.setPointerCapture(event.pointerId);});
        canvas.addEventListener('pointermove',function(event){if(!dragging)return;mapState.panX+=event.clientX-lastX;mapState.panY+=event.clientY-lastY;lastX=event.clientX;lastY=event.clientY;drawVacationMap(mapState);});
        function stopDrag(){dragging=false;canvas.classList.remove('is-dragging');}
        canvas.addEventListener('pointerup',stopDrag);canvas.addEventListener('pointercancel',stopDrag);canvas.addEventListener('lostpointercapture',stopDrag);updateZoom();
        allButton.addEventListener('click',function(){mapState.selectedId=null;loadTracks(v.id,trackList,trackMessage,mapState);});
        trackSection.appendChild(mapPanel);
        fileInput.addEventListener('change',async function(){
          var files=Array.from(fileInput.files||[]);if(!files.length)return;fileInput.disabled=true;trackMessage.textContent='GPX-Datei wird gespeichert …';
          try{
            for(var i=0;i<files.length;i++){
              var file=files[i];if(!file.name.toLowerCase().endsWith('.gpx'))throw new Error('Nur .gpx-Dateien können gespeichert werden.');
              if(file.size>20*1024*1024)throw new Error(file.name+' ist größer als 20 MB.');
              var response=await fetch('/api/vacations/'+v.id+'/tracks?filename='+encodeURIComponent(file.name),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/gpx+xml'},body:file});
              var result={};try{result=await response.json();}catch(ignore){}
              if(!response.ok)throw new Error(result.error||'Upload fehlgeschlagen.');
            }
            trackMessage.textContent=files.length===1?'GPX-Datei gespeichert.':files.length+' GPX-Dateien gespeichert.';await loadTracks(v.id,trackList,trackMessage,mapState);
          }catch(error){trackMessage.textContent=error.message;}
          finally{fileInput.value='';fileInput.disabled=false;}
        });
        card.appendChild(trackSection);box.appendChild(card);loadTracks(v.id,trackList,trackMessage,mapState);
      });
    }catch(e){box.textContent=e.message;}
  }
  $('vacation-form').addEventListener('submit',async function(e){
    e.preventDefault();var button=$('vacation-submit'),id=$('vacation-id').value;button.disabled=true;message('vacation-message','');
    var payload={title:$('vacation-title-input').value,destination:$('vacation-destination').value,startDate:$('vacation-start').value,endDate:$('vacation-end').value,notes:$('vacation-notes').value};
    try{await api(id?'/api/vacations/'+id:'/api/vacations',{method:id?'PUT':'POST',body:JSON.stringify(payload)});resetVacationForm();await refreshVacations();}
    catch(err){message('vacation-message',err.message);}finally{button.disabled=false;}
  });
  $('vacation-cancel').addEventListener('click',resetVacationForm);
  function dashboard(user){
    show('dashboard-view');$('welcome-copy').textContent=user.email+' · du bist angemeldet.';
    $('admin-page-link').hidden=user.role!=='admin';refreshVacations();
  }
  async function initialize(){
    var inviteToken=hashParams.get('invite');
    if(inviteToken){
      $('login-view').hidden=true;$('invite-view').hidden=false;
      try{var invitation=await api('/api/invitations/check',{method:'POST',body:JSON.stringify({token:inviteToken})});$('invite-email').value=invitation.email;}
      catch(e){message('invite-message',e.message);}
      return;
    }
    try{
      var data=await api('/api/auth/session');
      if(data.user){
        if(params.get('shared')==='1'){location.replace('/poster.html?shared=1');return;}
        dashboard(data.user);
      }else{show('login-view');}
    }catch(e){show('login-view');message('login-message','Der Server ist gerade nicht erreichbar. Bitte versuche es erneut.');$('offline-editor-link').hidden=!!navigator.onLine;}
  }
  $('login-form').addEventListener('submit',async function(e){
    e.preventDefault();var button=e.submitter;button.disabled=true;message('login-message','');
    try{
      var data=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:$('login-email').value,password:$('login-password').value})});
      if(params.get('shared')==='1'){location.replace('/poster.html?shared=1');return;}
      if(hasNext){location.replace(next);return;}
      dashboard(data.user);
    }catch(err){message('login-message',err.message);}finally{button.disabled=false;}
  });
  $('invite-form').addEventListener('submit',async function(e){
    e.preventDefault();var button=e.submitter;button.disabled=true;message('invite-message','');
    if($('invite-password').value!==$('invite-confirm').value){message('invite-message','Die Passwörter stimmen nicht überein.');button.disabled=false;return;}
    try{
      var data=await api('/api/invitations/accept',{method:'POST',body:JSON.stringify({token:hashParams.get('invite'),email:$('invite-email').value,password:$('invite-password').value})});
      history.replaceState(null,'',location.pathname);dashboard(data.user);
    }catch(err){message('invite-message',err.message);}finally{button.disabled=false;}
  });
  $('logout-button').addEventListener('click',async function(){
    try{await api('/api/auth/logout',{method:'POST',body:'{}'});}
    finally{
      if(navigator.serviceWorker&&navigator.serviceWorker.controller){navigator.serviceWorker.controller.postMessage({type:'clear-authenticated-cache'});}
      history.replaceState(null,'',location.pathname);show('login-view');$('login-password').value='';
    }
  });
  initialize();
})();
