'use strict';
// Load a saved holiday directly into the poster editor without downloading and re-uploading GPX files.
(function(){
  var params=new URLSearchParams(location.search),vacationId=params.get('vacation');
  if(!vacationId||!/^\d+$/.test(vacationId)){return;}
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
  async function loadVacation(){
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
  window.openVacationRoutePoster=function(rowId){
    var row=state.vacationTracks.filter(function(item){return item.id===rowId;})[0];
    if(!row||!row.track){return;}
    setPosterMode('route');
    state.title=row.name.replace(/\.gpx$/i,'')||row.name;
    $('#title').value=state.title;
    if(state.linkedVacation){
      state.region=state.linkedVacation.destination||'';
      if(!row.track.date){state.date=state.linkedVacation.startDate;}
    }
    $('#region').value=state.region;$('#date').value=state.date;
    loadBuiltTrack(row.track,row.name);
    say('Route aus „'+(state.linkedVacation?state.linkedVacation.title:'der GPX-Auswahl')+'“ als Routenposter geladen.');
  };
  window.addEventListener('load',loadVacation,{once:true});
})();
