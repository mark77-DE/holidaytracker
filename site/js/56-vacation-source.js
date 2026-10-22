'use strict';
// Load a saved holiday directly into the poster editor without downloading and re-uploading GPX files.
(function(){
  var params=new URLSearchParams(location.search),vacationId=params.get('vacation');
  function apiError(data){return data&&data.error?data.error:'Urlaub oder GPX-Datei konnte nicht geladen werden.';}
  async function loadJson(url){
    var response=await fetch(url,{credentials:'same-origin'});
    var data={};try{data=await response.json();}catch(e){}
    if(!response.ok){throw new Error(apiError(data));}
    return data;
  }
  function periodLabel(vacation){
    var start=vacationDateLabel(vacation.startDate,{day:'numeric',month:'short',year:'numeric'});
    var end=vacationDateLabel(vacation.endDate,{day:'numeric',month:'short',year:'numeric'});
    return start===end?start:start+' – '+end;
  }
  // Holidaytracker-only route actions decorate the shared tour list.
  var renderVacationList=vacationRenderList;
  vacationRenderList=function(){
    renderVacationList();
    var list=$('#vacationList');
    state.vacationTracks.forEach(function(item,index){
      if(!item.track){return;}
      var row=list.children[index];if(!row){return;}
      var button=document.createElement('button');button.type='button';button.className='btn small vac-route-poster';
      button.textContent='Routenposter';button.title='Diese GPX-Route als einzelnes Routenposter öffnen';
      button.addEventListener('click',function(){window.openVacationRoutePoster(item.id);});
      row.appendChild(button);
    });
  };
  function loadBuiltTrack(track,name){
    state.track=track;state.mapB=LAY.mapB;state.hl=[];state.osm=[];
    mapReset();setAddMode(false);syncLabelModeUi();syncStatsUi();
    if(track.date){state.date=track.date;$('#date').value=track.date;}
    var info=de(track.total/1000,1)+' km';if(track.hasEle){info+=', '+de(track.ascent)+' Höhenmeter';}
    $('#tinfo').textContent=(name?name+': ':'')+info;
    if(!track.hasEle){say('Die Datei enthält keine Höhendaten, das Höhenprofil entfällt.');}
    renderOsm();renderList();render();
  }
  window.openVacationRoutePoster=function(rowId){
    var row=state.vacationTracks.filter(function(item){return item.id===rowId;})[0];
    if(!row||!row.track){return;}
    setPosterMode('route');
    state.title=row.name.replace(/\.gpx$/i,'')||row.name;$('#title').value=state.title;
    if(state.linkedVacation){state.region=state.linkedVacation.destination||'';if(!row.track.date){state.date=state.linkedVacation.startDate;}}
    $('#region').value=state.region;$('#date').value=state.date;
    loadBuiltTrack(row.track,row.name);
    say('Route aus „'+(state.linkedVacation?state.linkedVacation.title:'der GPX-Auswahl')+'“ als Routenposter geladen.');
  };
  async function loadVacation(){
    if(!vacationId||!/^\d+$/.test(vacationId)){return;}
    $('#vacationMsg').textContent='Urlaub und gespeicherte GPX-Tracks werden geladen …';
    try{
      var data=await loadJson('/api/vacations');
      var vacation=data.vacations.filter(function(v){return String(v.id)===vacationId;})[0];
      if(!vacation){throw new Error('Der ausgewählte Urlaub wurde nicht gefunden.');}
      state.linkedVacation={id:vacation.id,title:vacation.title,destination:vacation.destination||'',startDate:vacation.startDate,endDate:vacation.endDate};
      state.vacationFallbackPeriod=periodLabel(vacation);
      setPosterMode('vacation');
      state.title=vacation.title;$('#title').value=vacation.title;
      state.region=vacation.destination||'';$('#region').value=state.region;
      var trackData=await loadJson('/api/vacations/'+encodeURIComponent(vacation.id)+'/tracks'),rows=[];
      for(var i=0;i<trackData.tracks.length;i++){
        var saved=trackData.tracks[i];
        try{
          var response=await fetch('/api/tracks/'+encodeURIComponent(saved.id),{credentials:'same-origin'});
          if(!response.ok){var errorData={};try{errorData=await response.json();}catch(ignore){}throw new Error(apiError(errorData));}
          var track=buildTrack(parseGPX(await response.text()));
          rows.push({id:state.nextVacationId++,name:saved.filename,track:track,include:true,error:'',sourceTrackId:saved.id,color:stageDefaultColor(rows.length)});
        }catch(error){
          rows.push({id:state.nextVacationId++,name:saved.filename,track:null,include:false,error:error.message||'GPX-Datei konnte nicht gelesen werden.',sourceTrackId:saved.id});
        }
        $('#vacationMsg').textContent='GPX-Tracks werden geladen … '+(i+1)+' von '+trackData.tracks.length;
      }
      state.vacationTracks=vacationSortStagesByDate(rows);
      vacationRenderList();syncStatsUi();render();
      $('#vacationMsg').textContent=trackData.tracks.length
        ?'Urlaub „'+vacation.title+'“: '+vacationSelected().length+' von '+trackData.tracks.length+' GPX-Tracks geladen.'
        :'Urlaub „'+vacation.title+'“ hat noch keine gespeicherten GPX-Tracks.';
    }catch(error){
      $('#vacationMsg').textContent=error.message||'Der Urlaub konnte nicht geladen werden.';
    }
  }
  window.addEventListener('load',loadVacation,{once:true});
})();

