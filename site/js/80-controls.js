'use strict';
// ---------- Label spacing ----------
$('#gap').addEventListener('input',function(e){
  state.labelGap=+e.target.value; $('#gapOut').textContent=de(state.labelGap,1); render();
});
$('#hlFont').addEventListener('input',function(e){
  state.hlFontSize=+e.target.value; $('#hlFontOut').textContent=state.hlFontSize+' %'; render();
});
function syncLabelModeUi(){
  var profileOption=$('#labelMode').querySelector('option[value="profile"]');
  profileOption.disabled=!!(state.track&&!state.track.hasEle);
  if(state.track&&!state.track.hasEle&&state.labelMode==='profile'){
    state.labelMode='route'; $('#labelMode').value='route';
  }
  $('#gapLabel').textContent=state.labelMode==='route'?'Abstand zur Route':'Abstand zum höchsten Punkt';
}
$('#labelMode').addEventListener('change',function(e){
  state.labelMode=e.target.value;
  if(state.labelMode==='route'){state.mapB=LAY.mapB;}
  syncLabelModeUi(); render();
});
syncLabelModeUi();
$('#resetPos').addEventListener('click',function(){
  state.hl.forEach(function(h){h.manual=false;});
  render();
});

// ---------- Text and format controls ----------
state.subtitle=typeof state.subtitle==='string'?state.subtitle:'';
$('#title').value=state.title; $('#subtitle').value=state.subtitle; $('#showTitle').checked=state.showTitle; $('#showSubtitle').checked=state.showSubtitle;
$('#activityLogo').value=state.activityLogo||'none';
$('#titleFontSize').value=state.titleFontSize; $('#titleFontSizeOut').textContent=state.titleFontSize+' %';
$('#subtitleFontSize').value=state.subtitleFontSize; $('#subtitleFontSizeOut').textContent=state.subtitleFontSize+' %';
$('#metaFontSize').value=state.metaFontSize; $('#metaFontSizeOut').textContent=state.metaFontSize+' %';
$('#region').value=state.region; $('#showRegion').checked=state.showRegion; $('#date').value=state.date; $('#showDate').checked=state.showDate;
$('#title').addEventListener('input',function(e){state.title=e.target.value;render();});
$('#activityLogo').addEventListener('change',function(e){state.activityLogo=e.target.value;render();});
$('#showTitle').addEventListener('change',function(e){state.showTitle=e.target.checked;applyFormat();render();});
$('#titleFontSize').addEventListener('input',function(e){state.titleFontSize=+e.target.value;$('#titleFontSizeOut').textContent=state.titleFontSize+' %';applyFormat();render();});
$('#subtitle').addEventListener('input',function(e){state.subtitle=e.target.value;applyFormat();render();});
$('#showSubtitle').addEventListener('change',function(e){state.showSubtitle=e.target.checked;applyFormat();render();});
$('#subtitleFontSize').addEventListener('input',function(e){state.subtitleFontSize=+e.target.value;$('#subtitleFontSizeOut').textContent=state.subtitleFontSize+' %';applyFormat();render();});
$('#region').addEventListener('input',function(e){state.region=e.target.value;render();});
$('#showRegion').addEventListener('change',function(e){state.showRegion=e.target.checked;applyFormat();render();});
$('#date').addEventListener('input',function(e){state.date=e.target.value;render();});
$('#showDate').addEventListener('change',function(e){state.showDate=e.target.checked;applyFormat();render();});
$('#metaFontSize').addEventListener('input',function(e){state.metaFontSize=+e.target.value;$('#metaFontSizeOut').textContent=state.metaFontSize+' %';applyFormat();render();});
$('#optEle').addEventListener('change',function(e){state.showEle=e.target.checked;render();});
function syncStatsUi(){
  var enabled=state.showStats,t=state.track,hasEle=t?t.hasEle:true,hasTime=t?t.hasTime:true;
  if(state.posterMode==='stages'){
    var rows=vacationSelected(),eleRows=rows.filter(function(r){return r.track.hasEle;}),timeRows=rows.filter(function(r){return r.track.hasTime;});
    hasEle=eleRows.length>0;hasTime=timeRows.length>0;
  }
  $('#statsOptions').querySelectorAll('input[data-stat]').forEach(function(input){
    input.disabled=!enabled||((input.dataset.stat==='ascent'||input.dataset.stat==='max'||input.dataset.stat==='min')&&!hasEle)
      ||((input.dataset.stat==='elapsed'||input.dataset.stat==='moving')&&!hasTime);
  });
}
$('#optStats').addEventListener('change',function(e){state.showStats=e.target.checked;syncStatsUi();render();});
$('#statsOptions').addEventListener('change',function(e){
  var key=e.target.dataset.stat;
  if(!key){return;}
  state.stats[key]=e.target.checked; render();
});
$('#statsFont').addEventListener('input',function(e){
  state.statsFontSize=+e.target.value;
  $('#statsFontOut').textContent=state.statsFontSize+' %';
  render();
});
syncStatsUi();
$('#optPlates').addEventListener('change',function(e){state.plates=e.target.checked;render();});
$('#plateOpacity').addEventListener('input',function(e){
  state.plateOpacity=+e.target.value; $('#plateOpacityOut').textContent=state.plateOpacity+' %'; render();
});
$('#profilePlate').addEventListener('change',function(e){state.profilePlate=e.target.checked;render();});
function bindSeg(id,attr,onPick){
  $(id).addEventListener('click',function(e){
    var b=e.target.closest('button'); if(!b){return;}
    Array.prototype.forEach.call($(id).querySelectorAll('button'),function(x){x.setAttribute('aria-pressed',x===b?'true':'false');});
    onPick(b.getAttribute(attr));
  });
}
Array.prototype.forEach.call(document.querySelectorAll('.fmtseg'),function(seg){
  seg.addEventListener('click',function(e){
    var b=e.target.closest('button'); if(!b){return;}
    var previousFormat=state.fmt;
    state.fmt=b.getAttribute('data-fmt'); applyFormatDefaults(state.fmt,previousFormat); syncColors(); syncMapUi(); applyFormat(); render();
  });
});
function applyFormatDefaults(key,previousKey){
  var compact=key==='c100';
  var nextFormat=FORMATS[key],oldFormat=FORMATS[previousKey];
  if(nextFormat&&nextFormat.print&&(!oldFormat||!oldFormat.print)){state.colors.bg='#ffffff';}
  state.hlFontSize=compact?90:100; $('#hlFont').value=state.hlFontSize; $('#hlFontOut').textContent=state.hlFontSize+' %';
  state.vacTextSize=100; $('#vacTextSize').value=100; $('#vacTextSizeOut').textContent='100 %';
  state.vacLabelSize=100; $('#vacLabelSize').value=100; $('#vacLabelSizeOut').textContent='100 %';
  state.vacValueSize=100; $('#vacValueSize').value=100; $('#vacValueSizeOut').textContent='100 %';
  state.labelGap=compact?4:9; $('#gap').value=state.labelGap; $('#gapOut').textContent=de(state.labelGap,1);
  state.plates=!compact; $('#optPlates').checked=state.plates;
  state.colors.statLabel=compact?state.colors.statValue:mixHex(state.colors.bg,state.colors.ink,0.68);
  state.map.op=compact?65:70; $('#mapOp').value=state.map.op; $('#mapOpOut').textContent=state.map.op+' %';
  syncColors();
}
function refreshPrintFormat(){syncMapUi();applyFormat();render();}
['customWidth','customHeight'].forEach(function(id){
  $('#'+id).addEventListener('input',function(e){
    var v=+e.target.value;
    if(!isFinite(v)){return;}
    v=clamp(v,50,1000); state[id==='customWidth'?'customWidth':'customHeight']=v;
    if(state.fmt==='custom'){refreshPrintFormat();}
  });
});
$('#printBleed').addEventListener('input',function(e){
  var v=+e.target.value; if(!isFinite(v)){return;}
  state.printBleedMm=clamp(v,0,10); refreshPrintFormat();
});
$('#optSafe').addEventListener('change',function(e){state.safe=e.target.checked;render();});

// ---------- Colors ----------
state.customPresets=state.customPresets||[];
function allPresets(){return PRESETS.concat(state.customPresets);}
function renderPresets(){
  var box=$('#presets'); box.innerHTML='';
  allPresets().forEach(function(p,i){
    var b=document.createElement('button');
    b.type='button'; b.className='preset'; b.dataset.i=i;
    b.innerHTML='<span class="sw"><i style="background:'+p.bg+'"></i><i style="background:'+p.ink+'"></i><i style="background:'+p.route+'"></i></span><span>'+esc(p.name)+'</span>';
    box.appendChild(b);
  });
}
function syncColors(){
  var c=state.colors;
  $('#cBg').value=c.bg; $('#cInk').value=c.ink; $('#cRoute').value=c.route; $('#cStartFlag').value=c.startFlag||c.route; $('#cStageLegend').value=c.stageLegend||c.ink;
  $('#cProfile').value=c.profile||c.ink; $('#cHighlight').value=c.highlight||c.ink;
  $('#cStatValue').value=c.statValue||c.ink; $('#cStatLabel').value=c.statLabel||mixHex(c.bg,c.ink,0.68); $('#cDate').value=c.date||mixHex(c.bg,c.ink,0.68); $('#cSubtitle').value=c.subtitle||mixHex(c.bg,c.ink,0.68);
  Array.prototype.forEach.call($('#presets').children,function(b){
    var p=allPresets()[+b.dataset.i];
    var expected={bg:p.bg,ink:p.ink,route:p.route,startFlag:p.startFlag||p.route,stageLegend:p.stageLegend||p.ink,profile:p.profile||p.ink,highlight:p.highlight||p.ink,statValue:p.statValue||p.ink,statLabel:p.statLabel||mixHex(p.bg,p.ink,0.68),date:p.date||mixHex(p.bg,p.ink,0.68),subtitle:p.subtitle||mixHex(p.bg,p.ink,0.68)};
    var on=['bg','ink','route','startFlag','stageLegend','profile','highlight','statValue','statLabel','date','subtitle'].every(function(k){return (expected[k]||'').toLowerCase()===(c[k]||'').toLowerCase();});
    b.setAttribute('aria-pressed',on?'true':'false');
  });
  var hint='';
  if(contrast(c.ink,c.bg)<4.5){hint='Schrift und Hintergrund haben wenig Kontrast.';}
  else if(contrast(c.route,c.bg)<3){hint=state.posterMode==='vacation'?'Die Balken heben sich kaum vom Hintergrund ab.':'Die Route hebt sich kaum vom Hintergrund ab.';}
  $('#contrastHint').textContent=hint;
}
function syncColorMode(){
  var vacation=state.posterMode==='vacation';
  var stages=state.posterMode==='stages';
  $('#colorRouteLabel').textContent=vacation?'Balken':(stages?'Etappen':'Route');
  $('#colorProfileRow').hidden=vacation||stages;
  $('#colorHighlightRow').hidden=vacation||stages;
}
$('#presets').addEventListener('click',function(e){
  var b=e.target.closest('.preset'); if(!b){return;}
  var p=allPresets()[+b.dataset.i];
  applyPreset(p);presetMessage('Einstellungen „'+p.name+'“ wurden angewendet.');
});
[['#cBg','bg'],['#cInk','ink'],['#cRoute','route'],['#cStartFlag','startFlag'],['#cStageLegend','stageLegend'],['#cProfile','profile'],['#cHighlight','highlight'],['#cStatValue','statValue'],['#cStatLabel','statLabel'],['#cDate','date'],['#cSubtitle','subtitle']].forEach(function(pair){
  $(pair[0]).addEventListener('input',function(e){
    state.colors[pair[1]]=e.target.value; syncColors(); render();
  });
});
var presetColorKeys=['bg','ink','route','startFlag','stageLegend','profile','highlight','statValue','statLabel','date','subtitle'];
var presetStatKeys=['distance','ascent','max','min','elapsed','moving'];
var vacationStatKeys=['tours','ascent','days','longest','highest','average','elapsed','moving'];
var presetSettingKeys=['fmt','customWidth','customHeight','printBleedMm','safe','showStageFlags','stageLegendPosition','stageLegendFontSize','stageLegendBackground','stageLegendOpacity','activityLogo','showEle','showStats','stats','statsFontSize','plates','profilePlate','plateOpacity','labelGap','labelMode','hlFontSize','titleFontSize','subtitleFontSize','metaFontSize','showTitle','showSubtitle','showRegion','showDate','vacTextSize','vacLabelSize','vacValueSize','vacationStats','vacationStatOrder'];
function currentPresetColors(){
  var c=state.colors,out={};
  presetColorKeys.forEach(function(k){out[k]=c[k]||c.ink;});
  return out;
}
function currentPresetSettings(){
  var out={};presetSettingKeys.forEach(function(k){out[k]=state[k];});
  out.stats={};presetStatKeys.forEach(function(k){out.stats[k]=!!state.stats[k];});
  out.vacationStats={};vacationStatKeys.forEach(function(k){out.vacationStats[k]=!!state.vacationStats[k];});
  out.vacationStatOrder=state.vacationStatOrder.slice();
  out.map={style:state.map.style,op:state.map.op,gray:state.map.gray,ext:state.map.ext,attr:state.map.attr,maxZ:state.map.maxZ};
  return out;
}
function applyPreset(p){
  var s=p.settings||{};
  presetSettingKeys.forEach(function(k){if(s[k]!==undefined){state[k]=s[k];}});
  var presetColors=p.colors||{bg:p.bg,ink:p.ink,route:p.route,startFlag:p.route,stageLegend:p.ink,profile:p.profile||p.ink,highlight:p.highlight||p.ink,statValue:p.statValue||p.ink,statLabel:p.statLabel||mixHex(p.bg,p.ink,0.68),date:p.date||mixHex(p.bg,p.ink,0.68),subtitle:p.subtitle||mixHex(p.bg,p.ink,0.68)};
  state.colors={};presetColorKeys.forEach(function(k){state.colors[k]=presetColors[k]|| (k==='startFlag'?presetColors.route:k==='stageLegend'?presetColors.ink:undefined);});
  if(s.stats){state.stats={};presetStatKeys.forEach(function(k){state.stats[k]=!!s.stats[k];});}
  if(s.vacationStats){state.vacationStats={};vacationStatKeys.forEach(function(k){state.vacationStats[k]=!!s.vacationStats[k];});}
  if(s.vacationStatOrder){state.vacationStatOrder=s.vacationStatOrder.slice();}
  if(s.map){var currentMapView=state.map.view;state.map=Object.assign({},state.map,s.map);state.map.view=currentMapView||{scale:1,x:0,y:0};}
  if(state.map.style==='light'||state.map.style==='dark'){state.map.style='osm';}
  var numeric={customWidth:[50,1000],customHeight:[50,1000],printBleedMm:[0,10],statsFontSize:[80,180],plateOpacity:[0,100],stageLegendFontSize:[70,160],stageLegendOpacity:[0,100],labelGap:[0,40],hlFontSize:[50,200],titleFontSize:[50,200],subtitleFontSize:[50,200],metaFontSize:[50,200],vacTextSize:[70,160],vacLabelSize:[70,160],vacValueSize:[70,160]};
  Object.keys(numeric).forEach(function(k){if(!isFinite(+state[k])){state[k]=100;}state[k]=clamp(+state[k],numeric[k][0],numeric[k][1]);});
  ['safe','showStageFlags','stageLegendBackground','showEle','showStats','plates','profilePlate','showTitle','showSubtitle','showRegion','showDate'].forEach(function(k){state[k]=!!state[k];});
  if(['none','top','bottom','left','right'].indexOf(state.stageLegendPosition)<0){state.stageLegendPosition='none';}
  if(['none','hike','run','bike','kayak','sup','swim'].indexOf(state.activityLogo)<0){state.activityLogo='none';}
  if(['c100','c150','c200','story','feed','sq','custom'].indexOf(state.fmt)<0){state.fmt='c150';}
  if(['route','profile'].indexOf(state.labelMode)<0){state.labelMode='profile';}
  $('#customWidth').value=state.customWidth;$('#customHeight').value=state.customHeight;$('#printBleed').value=state.printBleedMm;
  $('#optSafe').checked=state.safe;$('#optEle').checked=state.showEle;$('#optStats').checked=state.showStats;$('#optPlates').checked=state.plates;$('#profilePlate').checked=state.profilePlate;
  $('#statsFont').value=state.statsFontSize;$('#statsFontOut').textContent=state.statsFontSize+' %';$('#plateOpacity').value=state.plateOpacity;$('#plateOpacityOut').textContent=state.plateOpacity+' %';
  $('#gap').value=state.labelGap;$('#gapOut').textContent=de(state.labelGap,1);$('#hlFont').value=state.hlFontSize;$('#hlFontOut').textContent=state.hlFontSize+' %';
  [['titleFontSize','titleFontSizeOut'],['subtitleFontSize','subtitleFontSizeOut'],['metaFontSize','metaFontSizeOut'],['vacTextSize','vacTextSizeOut'],['vacLabelSize','vacLabelSizeOut'],['vacValueSize','vacValueSizeOut']].forEach(function(pair){$('#'+pair[0]).value=state[pair[0]];$('#'+pair[1]).textContent=state[pair[0]]+' %';});
  $('#showTitle').checked=state.showTitle;$('#showSubtitle').checked=state.showSubtitle;$('#showRegion').checked=state.showRegion;$('#showDate').checked=state.showDate;$('#showStageFlags').checked=state.showStageFlags;$('#labelMode').value=state.labelMode;
  $('#activityLogo').value=state.activityLogo;
  $('#stageLegendPosition').value=state.stageLegendPosition;
  $('#stageLegendFontSize').value=state.stageLegendFontSize;$('#stageLegendFontSizeOut').textContent=state.stageLegendFontSize+' %';$('#stageLegendBackground').checked=state.stageLegendBackground;$('#stageLegendOpacity').value=state.stageLegendOpacity;$('#stageLegendOpacityOut').textContent=state.stageLegendOpacity+' %';
  $('#mapStyle').value=state.map.style;$('#mapOp').value=state.map.op;$('#mapOpOut').textContent=state.map.op+' %';$('#mapGray').checked=!!state.map.gray;$('#mapExt').value=state.map.ext;$('#mapAttr').checked=!!state.map.attr;
  $('#statsOptions').querySelectorAll('input[data-stat]').forEach(function(input){input.checked=!!state.stats[input.dataset.stat];});
  if(typeof vacationSyncStatOptionOrder==='function'){vacationSyncStatOptionOrder();}
  document.querySelectorAll('.fmtseg button').forEach(function(button){button.setAttribute('aria-pressed',button.dataset.fmt===state.fmt?'true':'false');});
  syncLabelModeUi();syncStatsUi();syncColors();syncMapUi();applyFormat();render();
}
function presetMessage(message,isError){var el=$('#presetHint');el.textContent=message;el.style.color=isError?'#b3261e':'';}
$('#exportPreset').addEventListener('click',function(){
  var name=$('#presetName').value.trim()||'Eigenes Farbschema';
  var payload={format:'wanderposter-preset',version:2,name:name,colors:currentPresetColors(),settings:currentPresetSettings()};
  var blob=new Blob([JSON.stringify(payload,null,2)+'\n'],{type:'application/json'});
  var url=URL.createObjectURL(blob),a=document.createElement('a');
  var slug=name.toLowerCase().replace(/[^a-z0-9äöüß]+/gi,'-').replace(/^-+|-+$/g,'')||'farbschema';
  a.href=url;a.download=slug+'.json';document.body.appendChild(a);a.click();a.remove();
  setTimeout(function(){URL.revokeObjectURL(url);},1000);
  presetMessage('Preset „'+name+'“ mit Farben, Größen und Optionen wurde exportiert.');
});
$('#importPreset').addEventListener('click',function(){$('#presetFile').click();});
$('#presetFile').addEventListener('change',function(e){
  var file=e.target.files&&e.target.files[0];if(!file){return;}
  var reader=new FileReader();
  reader.onload=function(){
    try{
      var data=JSON.parse(String(reader.result));
      if(!data||!data.colors||!((data.format==='wanderposter-colors'&&data.version===1)||(data.format==='wanderposter-preset'&&data.version===2))){throw new Error('Das ist keine unterstützte Wanderposter-Preset-Datei.');}
      var name=String(data.name||'Importiertes Farbschema').trim().slice(0,40)||'Importiertes Farbschema';
      var colors={};
      presetColorKeys.forEach(function(k){
        var value=data.colors[k];
        if(k==='startFlag'&&value===undefined){value=data.colors.route;}
        if(k==='stageLegend'&&value===undefined){value=data.colors.ink;}
        if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value)){throw new Error('Die Farbe „'+k+'“ fehlt oder ist ungültig.');}
        colors[k]=value.toLowerCase();
      });
      var preset={name:name,colors:colors,settings:data.settings||{}};
      if(data.settings){
        var s=data.settings;
        if(s.fmt!==undefined&&['c100','c150','c200','story','feed','sq','custom'].indexOf(s.fmt)<0){throw new Error('Das Ausgabeformat in der Datei ist ungültig.');}
        ['safe','showStageFlags','stageLegendBackground','showEle','showStats','plates','profilePlate','showTitle','showSubtitle','showRegion','showDate'].forEach(function(k){if(s[k]!==undefined&&typeof s[k]!=='boolean'){throw new Error('Die Option „'+k+'“ in der Datei ist ungültig.');}});
        if(s.stageLegendPosition!==undefined&&['none','top','bottom','left','right'].indexOf(s.stageLegendPosition)<0){throw new Error('Die Position der Etappenlegende ist ungültig.');}
        if(s.activityLogo!==undefined&&['none','hike','run','bike','kayak','sup','swim'].indexOf(s.activityLogo)<0){throw new Error('Das Aktivitätssymbol im Preset ist ungültig.');}
        ['customWidth','customHeight','printBleedMm','statsFontSize','plateOpacity','stageLegendFontSize','stageLegendOpacity','labelGap','hlFontSize','titleFontSize','subtitleFontSize','metaFontSize','vacTextSize','vacLabelSize','vacValueSize'].forEach(function(k){if(s[k]!==undefined&&(!isFinite(+s[k])||typeof s[k]==='boolean')){throw new Error('Der Größenwert „'+k+'“ in der Datei ist ungültig.');}});
        if(s.labelMode!==undefined&&['route','profile'].indexOf(s.labelMode)<0){throw new Error('Der Beschriftungsabstand in der Datei ist ungültig.');}
        if(s.stats&&presetStatKeys.some(function(k){return typeof s.stats[k]!=='boolean';})){throw new Error('Die Statistikoptionen in der Datei sind ungültig.');}
        if(s.vacationStats&&vacationStatKeys.some(function(k){return typeof s.vacationStats[k]!=='boolean';})){throw new Error('Die Urlaubsstatistikoptionen in der Datei sind ungültig.');}
        if(s.vacationStatOrder&&(!Array.isArray(s.vacationStatOrder)||s.vacationStatOrder.length!==vacationStatKeys.length||vacationStatKeys.some(function(k){return s.vacationStatOrder.indexOf(k)<0;}))){throw new Error('Die Reihenfolge der Urlaubsstatistik ist ungültig.');}
        if(s.map&&(typeof s.map!=='object'||(s.map.style!==undefined&&['none','osm','topo','light','dark','custom'].indexOf(s.map.style)<0)||(s.map.op!==undefined&&(!isFinite(+s.map.op)||+s.map.op<10||+s.map.op>100))||(s.map.gray!==undefined&&typeof s.map.gray!=='boolean')||(s.map.attr!==undefined&&typeof s.map.attr!=='boolean'))){throw new Error('Die Karteneinstellungen in der Datei sind ungültig.');}
      }
      state.customPresets.push(preset);$('#presetName').value=name;
      renderPresets();applyPreset(preset);presetMessage('Preset „'+name+'“ mit Farben, Größen und Optionen wurde importiert und angewendet.');
    }catch(err){presetMessage(err.message||'Die Datei konnte nicht gelesen werden.',true);}
    e.target.value='';
  };
  reader.onerror=function(){presetMessage('Die Datei konnte nicht gelesen werden.',true);e.target.value='';};
  reader.readAsText(file);
});
renderPresets(); syncColors(); syncColorMode();
