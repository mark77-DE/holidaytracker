'use strict';
// ---------- Constants ----------
var NS='http://www.w3.org/2000/svg';
var M=7, W=86;                       // side margin and usable width in poster units (poster is 100 x 100)
var LAY={titleY:12, regionY:9.1, dateY:12, ruleY:15.6, mapT:19.2, mapB:56, profT:75, profB:86, axisY:89.3, statY:94.6};
var TITLE_FS=6.8;
var PRESETS=[
  {name:'Hell',  bg:'#ffffff', ink:'#1e3530', route:'#c4392d'},
  {name:'Dunkel',bg:'#1b2b2a', ink:'#e6ebe3', route:'#ff6b4a'},
  {name:'Sand',  bg:'#efe6d8', ink:'#3b2f26', route:'#b4532a'},
  {name:'Nacht', bg:'#14213d', ink:'#f1ede4', route:'#fca311'},
  {name:'Wald',  bg:'#1f3a2e', ink:'#f0efe4', route:'#f2b134'},
  {name:'Print', bg:'#fafafa', ink:'#111111', route:'#e63946'}
];
function hexToRgb(h){var n=parseInt(h.slice(1),16);return [n>>16&255,n>>8&255,n&255];}
function mixHex(a,b,t){
  var x=hexToRgb(a), y=hexToRgb(b);
  return '#'+[0,1,2].map(function(i){return Math.round(x[i]+(y[i]-x[i])*t).toString(16).padStart(2,'0');}).join('');
}
function lum(h){
  var c=hexToRgb(h).map(function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
  return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];
}
function contrast(a,b){var l1=lum(a), l2=lum(b);return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);}
// secondary text is the ink colour mixed towards the background
function palette(){
  var c=state.colors;
  return {bg:c.bg, ink:c.ink, route:c.route, profile:c.profile||c.ink,
    highlight:c.highlight||c.ink, statValue:c.statValue||c.ink,
    statLabel:c.statLabel||mixHex(c.bg,c.ink,0.68), date:c.date||mixHex(c.bg,c.ink,0.68), subtitle:c.subtitle||mixHex(c.bg,c.ink,0.68), muted:mixHex(c.bg,c.ink,0.68)};
}

var $=function(s){return document.querySelector(s);};
var svg=$('#poster');
svg.setAttribute('font-family',FF);

var today=new Date();
var isoToday=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');

var state={
  track:null, posterMode:'route', vacationTracks:[], nextVacationId:1, vacationStats:{tours:true,ascent:true,days:true,longest:true,highest:true,average:true,elapsed:true,moving:true}, vacationStatOrder:['tours','ascent','longest','moving','days','highest','average','elapsed'], title:'Brocken-Runde', region:'Harz', date:isoToday,
  fmt:'c150', customWidth:100, customHeight:100, printBleedMm:0, safe:true, colors:{bg:'#ffffff',ink:'#1e3530',route:'#c4392d',startFlag:'#c4392d',stageLegend:'#1e3530',profile:'#1e3530',highlight:'#1e3530',statValue:'#1e3530',statLabel:'#60736c',date:'#60736c',subtitle:'#60736c'}, showStageFlags:true, stageLegendPosition:'none', stageLegendFontSize:100, stageLegendBackground:true, stageLegendOpacity:85, showEle:true, showStats:true, stats:{distance:true,ascent:true,max:true,min:true,elapsed:true,moving:true}, statsFontSize:130, plates:true, plateOpacity:94,
  hl:[], nextId:1, addMode:false, posMode:false, mapPosMode:false, bg:null, map:{style:'none',op:70,gray:false,ext:'box',attr:true,url:'',attrText:'',maxZ:17,view:{scale:1,x:0,y:0}}, labelGap:9, labelMode:'profile', hlFontSize:100, titleFontSize:100, subtitleFontSize:100, metaFontSize:100, activityLogo:'none', showTitle:true, showSubtitle:true, showRegion:true, showDate:true, profilePlate:false, vacTextSize:100, vacLabelSize:100, vacValueSize:100, mapB:LAY.mapB
};

// ---------- Formats ----------
// print formats are square (mm), social formats are defined in pixels; H is the poster height in units (width is always 100)
var FORMATS={
  c100: {print:true, mm:100, H:100,    K:1.2, T:7,    B:94.6,  profH:11, name:'100 × 100 mm'},
  c150: {print:true, mm:150, H:100,    K:1,   T:7,    B:94.6,  profH:11, name:'150 × 150 mm'},
  c200: {print:true, mm:200, H:100,    K:1,   T:7,    B:94.6,  profH:11, name:'200 × 200 mm'},
  story:{px:[1080,1920], H:177.78, K:1.3, T:25.5, B:142.4, profH:20, name:'Story 9:16',   tag:'story',
         hint:'WhatsApp-Status, Instagram- und Facebook-Story, Reels. 1080 × 1920 px.'},
  feed: {px:[1080,1350], H:125,    K:1.3, T:8,    B:119,   profH:15, name:'Feed 4:5',     tag:'feed',
         hint:'Instagram- und Facebook-Feed im Hochformat. 1080 × 1350 px.'},
  sq:   {px:[1080,1080], H:100,    K:1.3, T:7,    B:94.6,  profH:11, name:'Quadrat 1:1',  tag:'quadrat',
         hint:'Quadratischer Feed-Beitrag, Facebook, Chat. 1080 × 1080 px.'}
};
function fmt(){
  var base=FORMATS[state.fmt]||FORMATS.c150, add=state.printBleedMm*2;
  if(state.fmt!=='custom'&&base.print){
    var side=base.mm+add;
    return Object.assign({},base,{mm:side,mmW:side,mmH:side});
  }
  if(state.fmt==='custom'){
    var mmW=state.customWidth+add, mmH=state.customHeight+add;
    return {print:true,mm:mmW,mmW:mmW,mmH:mmH,H:100*mmH/mmW,K:1,T:7,B:100*mmH/mmW-5.4,profH:11,name:'Freies Format',tag:'custom'};
  }
  return base;
}
function titleFs(){return (fmt().print?TITLE_FS:TITLE_FS*1.15)*state.titleFontSize/100;}
function titleStartX(){return M+(state.activityLogo&&state.activityLogo!=='none'?Math.max(4.2,titleFs()*.76)+1.2:0);}
function subtitleFs(){return sc(2.2*state.subtitleFontSize/100);}
function metaFs(){return sc(2.8*state.metaFontSize/100);}
function subtitleY(){return state.showTitle?LAY.titleY+titleFs()*.68+sc(.4):LAY.titleY;}
// derive the vertical layout of the current format
function applyFormat(){
  var F=fmt();
  LAY.titleY=f(F.T+titleFs()*0.735);
  LAY.dateY=LAY.titleY;
  LAY.regionY=f(LAY.dateY-metaFs()*1.1);
  var hasSubtitle=state.showSubtitle&&String(state.subtitle||'').trim();
  var contentBottom=LAY.titleY+sc(3.6);
  if(state.showTitle){contentBottom=Math.max(contentBottom,LAY.titleY+titleFs()*.2+sc(2.3));}
  if(hasSubtitle){contentBottom=Math.max(contentBottom,subtitleY()+subtitleFs()*.25+sc(1));}
  if(state.showRegion||state.showDate){contentBottom=Math.max(contentBottom,LAY.dateY+metaFs()*.25+sc(1));}
  LAY.ruleY=f(contentBottom);
  LAY.mapT=f(LAY.ruleY+3.6);
  var B=F.B-(attrOn()?sc(3.3):0);                       // stats move up when a map attribution is shown
  LAY.statY=B;
  LAY.profB=f(B-sc(8.6));
  LAY.axisY=f(LAY.profB+sc(3.3));
  LAY.profT=f(LAY.profB-F.profH);
  var mapProfileGap=state.posterMode==='stages'?6:19+(F.K-1)*10;
  LAY.mapB=f(LAY.profT-mapProfileGap);
  state.mapB=LAY.mapB;
  svg.setAttribute('viewBox','0 0 100 '+f(F.H));
  $('.poster-wrap').style.setProperty('--ratio',String(100/F.H));
  Array.prototype.forEach.call(document.querySelectorAll('.fmtseg button'),function(b){
    b.setAttribute('aria-pressed',b.getAttribute('data-fmt')===state.fmt?'true':'false');
  });
  $('#fmtHint').textContent=F.print?'':F.hint;
  $('#safeRow').hidden=state.fmt!=='story';
  $('#printOptions').hidden=!F.print;
  $('#customSize').hidden=state.fmt!=='custom';
}

// ---------- Helpers ----------
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function f(n){return +n.toFixed(2);}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
// scale factor for small details; the 100 mm format needs relatively larger text and pins
function sc(v){return +(v*fmt().K).toFixed(2);}
function hlFs(v,hl){return sc(v*state.hlFontSize/100*(hl&&hl.size!=null?hl.size:100)/100);}
function de(n,dec){dec=dec||0;return n.toLocaleString('de-DE',{minimumFractionDigits:dec,maximumFractionDigits:dec});}
function svgEl(tag,attrs,parent,text){
  var e=document.createElementNS(NS,tag);
  for(var k in attrs){e.setAttribute(k,attrs[k]);}
  if(text!=null){e.textContent=text;}
  if(parent){parent.appendChild(e);}
  return e;
}
var msgTimer=null;
function say(text){
  var el=$('#msg'); el.textContent=text;
  clearTimeout(msgTimer); msgTimer=setTimeout(function(){el.textContent='';},7000);
}
function formatDate(iso){
  if(!iso){return '';}
  var p=iso.split('-'); if(p.length!==3){return iso;}
  return new Date(+p[0],+p[1]-1,+p[2]).toLocaleDateString('de-DE',{day:'numeric',month:'long',year:'numeric'});
}
function formatDuration(seconds){
  var mins=Math.round(seconds/60), days=Math.floor(mins/1440), hours=Math.floor((mins-days*1440)/60), rest=mins%60;
  if(days){return days+'T '+hours+'h';}
  return hours+'h '+String(rest).padStart(2,'0')+'m';
}

var MERC_R=6378137;                       // Web-Mercator sphere radius, matches the tile grid
function mercY(latDeg){var p=latDeg*Math.PI/180;return MERC_R*Math.log(Math.tan(Math.PI/4+p/2));}
function latFromMercY(y){return (2*Math.atan(Math.exp(y/MERC_R))-Math.PI/2)*180/Math.PI;}
