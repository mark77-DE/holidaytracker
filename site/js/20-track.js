'use strict';
// ---------- GPX parsing and track preparation ----------
function parseGPX(text){
  var doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.querySelector('parsererror')){throw new Error('Die Datei ist keine gültige GPX-Datei.');}
  var nodes=Array.prototype.slice.call(doc.getElementsByTagName('trkpt'));
  if(!nodes.length){nodes=Array.prototype.slice.call(doc.getElementsByTagName('rtept'));}
  var raw=nodes.map(function(n){
    var eN=n.getElementsByTagName('ele')[0], tN=n.getElementsByTagName('time')[0];
    var ele=eN?parseFloat(eN.textContent):NaN, t=tN?Date.parse(tN.textContent):NaN;
    return {lat:parseFloat(n.getAttribute('lat')), lon:parseFloat(n.getAttribute('lon')),
            ele:isFinite(ele)?ele:null, t:isFinite(t)?t:null};
  }).filter(function(p){return isFinite(p.lat)&&isFinite(p.lon);});
  if(raw.length<2){throw new Error('In der Datei wurden keine Trackpunkte gefunden.');}
  return raw;
}

function buildTrack(raw){
  var R=6371000, rad=Math.PI/180, i, j;
  var cum=[0];
  for(i=1;i<raw.length;i++){
    var a=raw[i-1], b=raw[i];
    var dLat=(b.lat-a.lat)*rad, dLon=(b.lon-a.lon)*rad;
    var h=Math.pow(Math.sin(dLat/2),2)+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.pow(Math.sin(dLon/2),2);
    cum.push(cum[i-1]+2*R*Math.asin(Math.sqrt(h)));
  }
  var total=cum[cum.length-1];
  if(total<50){throw new Error('Die Route ist zu kurz.');}

  // fill missing elevations if most points have one
  var withEle=raw.filter(function(p){return p.ele!=null;}).length;
  var hasEle=withEle>raw.length*0.8;
  if(hasEle){
    var last=null;
    for(i=0;i<raw.length;i++){if(raw[i].ele!=null){last=raw[i].ele;}else if(last!=null){raw[i].ele=last;}}
    var first=raw.filter(function(p){return p.ele!=null;})[0].ele;
    for(i=0;i<raw.length;i++){if(raw[i].ele==null){raw[i].ele=first;}}
  }

  // resample to evenly spaced points along the distance
  var n=Math.max(60,Math.min(1500,Math.round(total/20)));
  var lat0=raw.reduce(function(s,p){return s+p.lat;},0)/raw.length;
  var lon0=raw.reduce(function(s,p){return s+p.lon;},0)/raw.length;
  // Web-Mercator coordinates (metres, relative to the track centre) so tiles and route share one projection
  var y0=mercY(lat0), kcos=Math.cos(lat0*rad);
  function toXY(la,lo){return [(lo-lon0)*rad*MERC_R, mercY(la)-y0];}
  function toLL(px,py){return [latFromMercY(py+y0), lon0+px/(rad*MERC_R)];}
  var s=[]; j=0;
  for(var k=0;k<=n;k++){
    var d=total*k/n;
    while(j<raw.length-2&&cum[j+1]<d){j++;}
    var seg=cum[j+1]-cum[j], fr=seg>0?clamp((d-cum[j])/seg,0,1):0;
    var p0=raw[j], p1=raw[j+1];
    var lat=p0.lat+(p1.lat-p0.lat)*fr, lon=p0.lon+(p1.lon-p0.lon)*fr;
    var xy=toXY(lat,lon);
    s.push({d:d, px:xy[0], py:xy[1], e:hasEle?p0.ele+(p1.ele-p0.ele)*fr:0});
  }

  // smooth elevation with a small moving average
  var ascent=0, descent=0, minE=0, maxE=0;
  if(hasEle){
    var r=Math.max(1,Math.min(5,Math.round(n/200)+1));
    var sm=s.map(function(_,idx){
      var sum=0,cnt=0;
      for(var q=-r;q<=r;q++){var t=idx+q; if(t>=0&&t<=n){sum+=s[t].e;cnt++;}}
      return sum/cnt;
    });
    for(i=0;i<=n;i++){s[i].e=sm[i];}
    var ref=s[0].e;
    for(i=1;i<=n;i++){
      var diff=s[i].e-ref;
      if(diff>=3){ascent+=diff;ref=s[i].e;}
      else if(diff<=-3){descent-=diff;ref=s[i].e;}
    }
    minE=Math.min.apply(null,s.map(function(p){return p.e;}));
    maxE=Math.max.apply(null,s.map(function(p){return p.e;}));
  }

  var timed=raw.filter(function(p){return p.t!=null;}), elapsed=null, movingTime=null;
  if(timed.length>1&&timed[timed.length-1].t>timed[0].t){
    elapsed=(timed[timed.length-1].t-timed[0].t)/1000;
    movingTime=0;
    for(i=1;i<raw.length;i++){
      var a=raw[i-1], b=raw[i], dt=(b.t-a.t)/1000;
      if(a.t==null||b.t==null||dt<=0||dt>300){continue;}
      var speed=(cum[i]-cum[i-1])/dt;
      if(speed>=0.5&&speed<=15){movingTime+=dt;}
    }
  }
  var t0=timed.length?timed[0].t:null, t1=timed.length?timed[timed.length-1].t:null, date='';
  if(t0!=null){var dt=new Date(t0); date=dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');}
  var closed=Math.hypot(s[0].px-s[n].px,s[0].py-s[n].py)*kcos<150;
  return {s:s,total:total,ascent:ascent,descent:descent,minE:minE,maxE:maxE,hasEle:hasEle,elapsed:elapsed,movingTime:movingTime,hasTime:elapsed!=null,startTime:t0,endTime:t1,date:date,closed:closed,lat0:lat0,lon0:lon0,y0:y0,kcos:kcos,toXY:toXY,toLL:toLL};
}

function demoRaw(){
  // synthetic loop for a first preview, no real data
  var pts=[], N=900;
  function g(t,c,w){return Math.exp(-Math.pow((t-c)/w,2));}
  for(var i=0;i<N;i++){
    var t=i/(N-1), a=2*Math.PI*t;
    pts.push({
      lat:51.80+0.022*Math.sin(a)+0.004*Math.sin(3*a),
      lon:10.62+0.034*Math.cos(a)+0.006*Math.cos(5*a),
      ele:540+520*g(t,0.42,0.16)+140*g(t,0.8,0.06)+22*Math.sin(t*60),
      t:null
    });
  }
  return pts;
}
