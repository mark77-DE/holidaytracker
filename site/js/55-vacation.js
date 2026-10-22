'use strict';
// ---------- Multi-track vacation statistics poster ----------
function vacationSelected() { return state.vacationTracks.filter(function (r) { return r.track && r.include; }); }
function stageLegendEntries(rows) {
  var n = Math.min(rows.length, 8), entries = [];
  for (var i = 0; i < n; i++) { entries.push({ index: i, label: String(rows[i].label || '').trim() || 'Etappe ' + (i + 1) }); }
  if (rows.length > n) { entries.push({ index: -1, label: '+' + (rows.length - n) + ' weitere' }); }
  return entries;
}
function stageLegendMetrics(rows) {
  var pos = state.stageLegendPosition || 'none', entries = stageLegendEntries(rows), cols = Math.min(4, entries.length), lines = pos === 'left' || pos === 'right' ? entries.length : Math.ceil(entries.length / Math.max(1, cols));
  return { pos: pos, entries: entries, cols: cols, lines: lines, step: 1.4 + .8 * (state.stageLegendFontSize || 100) / 100, side: pos === 'left' || pos === 'right' };
}
function stageGeometry() {
  var rows = vacationSelected();
  if (!rows.length) { state.stageMapRef = null; return null; }
  var rad = Math.PI / 180, latSum = 0, lonSum = 0, count = 0;
  rows.forEach(function (r) { r.track.s.forEach(function (p) { var ll = r.track.toLL(p.px, p.py); latSum += ll[0]; lonSum += ll[1]; count++; }); });
  var lat0 = latSum / count, lon0 = lonSum / count, y0 = mercY(lat0), kcos = Math.cos(lat0 * rad);
  state.stageMapRef = { lat0: lat0, lon0: lon0, y0: y0, kcos: kcos };
  var stages = [], minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  rows.forEach(function (r) {
    var pts = r.track.s.map(function (p) { var ll = r.track.toLL(p.px, p.py), x = (ll[1] - lon0) * rad * MERC_R, y = mercY(ll[0]) - y0; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); return { x: x, y: y, e: p.e, d: p.d }; });
    stages.push(pts);
  });
  var bw = Math.max(maxX - minX, 1), bh = Math.max(maxY - minY, 1), legend = stageLegendMetrics(rows), plotTop = LAY.mapT + 2, plotBottom = state.mapB, plotLeft = LAY.mapL, plotRight = LAY.mapR;
  if (legend.pos === 'top') { plotTop += legend.lines * legend.step + 1; }
  if (legend.pos === 'bottom') { plotBottom -= legend.lines * legend.step + 1; }
  if (legend.pos === 'left') { plotLeft += 23; }
  if (legend.pos === 'right') { plotRight -= 23; }
  var mh = plotBottom - plotTop, mw = plotRight - plotLeft, pad = mapPad();
  var scale = Math.min((mw - 2 * pad) / bw, (mh - 2 * pad) / bh), ox = plotLeft + (mw - bw * scale) / 2, oy = plotTop + (mh - bh * scale) / 2;
  var endpointTop = Infinity;
  rows.forEach(function (r, i) { var ps = stages[i], a = oy + (maxY - ps[0].y) * scale, b = oy + (maxY - ps[ps.length - 1].y) * scale; endpointTop = Math.min(endpointTop, a, b); });
  if (endpointTop - sc(5.2) < plotTop + 1) {
    var routeH = mh - sc(6.2); scale = Math.min((mw - 2 * pad) / bw, (routeH - 2 * pad) / bh); ox = plotLeft + (mw - bw * scale) / 2; oy = plotTop + sc(6.2) + (routeH - bh * scale) / 2;
  }
  function mapPt(p) { return [ox + (p.x - minX) * scale, oy + (maxY - p.y) * scale]; }
  return applyMapView({
    stages: stages, mapPt: mapPt, minX: minX, maxX: maxX, minY: minY, maxY: maxY, ox: ox, oy: oy, sc: scale,
    profX: function (d, total, offset) { return LAY.profL + (offset + d) / total * (LAY.profR - LAY.profL); }, profY: function (e, e0, e1) { return LAY.profB - (e - e0) / (e1 - e0) * (LAY.profB - LAY.profT); }
  });
}
function vacationDateLabel(iso, options) {
  var p = iso.split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('de-DE', options || { day: '2-digit', month: '2-digit' });
}
function vacationPeriod(rows) {
  var ds = rows.map(function (r) { return r.track.date; }).filter(Boolean).sort();
  if (!ds.length) { return ''; }
  if (ds[0] === ds[ds.length - 1]) { return vacationDateLabel(ds[0], { day: 'numeric', month: 'long', year: 'numeric' }); }
  return vacationDateLabel(ds[0], { day: 'numeric', month: 'short', year: 'numeric' }) + ' – ' + vacationDateLabel(ds[ds.length - 1], { day: 'numeric', month: 'short', year: 'numeric' });
}
function vacationSummary(rows) {
  var total = 0, ascent = 0, eleCount = 0, elapsed = 0, elapsedCount = 0, moving = 0, movingCount = 0, longest = null, highest = null, dates = {}, daily = {}, firstStart = null, lastEnd = null;
  rows.forEach(function (r) {
    var t = r.track; total += t.total;
    if (!longest || t.total > longest.total) { longest = { name: r.name, total: t.total }; }
    if (t.hasEle) { ascent += t.ascent; eleCount++; if (!highest || t.maxE > highest.ele) { highest = { name: r.name, ele: t.maxE }; } }
    if (t.elapsed != null) { elapsed += t.elapsed; elapsedCount++; }
    if (t.startTime != null && (firstStart == null || t.startTime < firstStart)) { firstStart = t.startTime; }
    if (t.endTime != null && (lastEnd == null || t.endTime > lastEnd)) { lastEnd = t.endTime; }
    if (t.movingTime != null) { moving += t.movingTime; movingCount++; }
    if (t.date) { dates[t.date] = true; daily[t.date] = (daily[t.date] || 0) + t.total; }
  });
  return { total: total, ascent: ascent, eleCount: eleCount, elapsed: elapsed, elapsedCount: elapsedCount, tripElapsed: firstStart != null && lastEnd != null && lastEnd >= firstStart ? (lastEnd - firstStart) / 1000 : null, moving: moving, movingCount: movingCount, longest: longest, highest: highest, days: Object.keys(dates).length, daily: daily };
}
function vacationRenderList() {
  var list = $('#vacationList'); list.innerHTML = '';
  var included = vacationSelected().length;
  state.vacationTracks.forEach(function (r, index) {
    var row = document.createElement('div'); row.className = 'vac-item';
    var label = document.createElement('label'); label.className = 'vac-file';
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!r.include; cb.disabled = !r.track; cb.dataset.vacId = r.id;
    var info = document.createElement('span'); info.className = 'vac-file-info';
    var name = document.createElement('b'); name.textContent = (index + 1) + '. ' + r.name; info.appendChild(name);
    var small = document.createElement('small');
    small.textContent = r.track
      ? de(r.track.total / 1000, 1) + ' km' + (r.track.hasEle ? ', ' + de(r.track.ascent) + ' HM' : '') + (r.track.date ? ', ' + vacationDateLabel(r.track.date) : ', ohne Zeitstempel')
      : 'Fehler: ' + r.error;
    info.appendChild(small); label.appendChild(cb); label.appendChild(info); row.appendChild(label);
    if (r.track) { var stageName = document.createElement('input'); stageName.type = 'text'; stageName.className = 'vac-stage-name'; stageName.value = r.label || ''; stageName.placeholder = 'Etappe ' + (index + 1); stageName.maxLength = 20; stageName.title = 'Name der Etappe ' + (index + 1); stageName.setAttribute('aria-label', 'Name der Etappe ' + (index + 1)); stageName.dataset.stageNameId = r.id; stageName.hidden = state.posterMode !== 'stages'; row.appendChild(stageName); }
    if (r.track) { var color = document.createElement('input'); color.type = 'color'; color.className = 'vac-stage-color'; color.value = r.color || stageDefaultColor(index); color.title = 'Farbe der Etappe ' + (index + 1); color.setAttribute('aria-label', 'Farbe der Etappe ' + (index + 1)); color.dataset.stageColorId = r.id; color.hidden = state.posterMode !== 'stages'; row.appendChild(color); }
    var remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn small'; remove.textContent = 'Entfernen'; remove.dataset.removeVac = r.id; row.appendChild(remove);
    list.appendChild(row);
  });
  $('#vacationMsg').textContent = state.vacationTracks.length
    ? included + ' von ' + state.vacationTracks.length + ' Touren fließen in das Poster ein.'
    : 'Noch keine GPX-Dateien geladen.';
}
function vacationReadFile(file) {
  return new Promise(function (resolve) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var raw = parseGPX(String(reader.result)), track = buildTrack(raw);
        resolve({ id: state.nextVacationId++, name: file.name, track: track, include: true, error: '' });
      } catch (err) { resolve({ id: state.nextVacationId++, name: file.name, track: null, include: false, error: err.message || 'Datei konnte nicht gelesen werden.' }); }
    };
    reader.onerror = function () { resolve({ id: state.nextVacationId++, name: file.name, track: null, include: false, error: 'Datei konnte nicht gelesen werden.' }); };
    reader.readAsText(file);
  });
}
function vacationSortStagesByDate(rows) {
  return rows.map(function (row, index) { return { row: row, index: index }; }).sort(function (a, b) {
    var ad = a.row.track && a.row.track.date || '', bd = b.row.track && b.row.track.date || '';
    if (ad && bd && ad !== bd) { return ad < bd ? -1 : 1; }
    if (ad && !bd) { return -1; }
    if (!ad && bd) { return 1; }
    return a.index - b.index;
  }).map(function (item) { return item.row; });
}
$('#vacationFiles').addEventListener('change', async function (e) {
  var files = Array.prototype.slice.call(e.target.files || []); e.target.value = '';
  if (!files.length) { return; }
  $('#vacationMsg').textContent = files.length + ' Datei' + (files.length === 1 ? ' wird' : 'en werden') + ' gelesen …';
  var rows = await Promise.all(files.map(vacationReadFile));
  rows.forEach(function (r, i) { if (r.track) { r.color = stageDefaultColor(state.vacationTracks.length + i); } });
  state.vacationTracks = vacationSortStagesByDate(state.vacationTracks.concat(rows));
  vacationRenderList(); syncStatsUi(); render();
});
$('#vacationList').addEventListener('change', function (e) {
  var colorId = +e.target.dataset.stageColorId;
  if (colorId) { var colored = state.vacationTracks.filter(function (r) { return r.id === colorId; })[0]; if (colored) { colored.color = e.target.value; render(); } return; }
  var id = +e.target.dataset.vacId;
  if (!id) { return; }
  var row = state.vacationTracks.filter(function (r) { return r.id === id; })[0];
  if (row) { row.include = e.target.checked; vacationRenderList(); syncStatsUi(); render(); }
});
$('#vacationList').addEventListener('input', function (e) {
  var id = +e.target.dataset.stageNameId; if (!id) { return; }
  var row = state.vacationTracks.filter(function (r) { return r.id === id; })[0];
  if (row) { row.label = e.target.value; render(); }
});
$('#vacationList').addEventListener('click', function (e) {
  var id = +e.target.dataset.removeVac;
  if (!id) { return; }
  state.vacationTracks = state.vacationTracks.filter(function (r) { return r.id !== id; });
  vacationRenderList(); syncStatsUi(); render();
});
$('#clearVacation').addEventListener('click', function () { state.vacationTracks = []; vacationRenderList(); syncStatsUi(); render(); });
$('#vacationStatOptions').addEventListener('change', function (e) {
  var key = e.target.dataset.vacStat;
  if (!key) { return; }
  state.vacationStats[key] = e.target.checked; render();
});
function vacationSyncStatOptionOrder() {
  var box = $('#vacationStatOptions'), items = Array.prototype.slice.call(box.querySelectorAll('.vac-stat-option'));
  items.forEach(function (item) { var input = item.querySelector('[data-vac-stat]'); if (input) { input.checked = !!state.vacationStats[input.dataset.vacStat]; } });
  state.vacationStatOrder.forEach(function (key) {
    var item = box.querySelector('[data-vac-stat-item="' + key + '"]'); if (item) { box.appendChild(item); }
  });
}
$('#vacationStatOptions').addEventListener('dragstart', function (e) {
  var handle = e.target.closest('.vac-drag'), item = handle && handle.closest('.vac-stat-option');
  if (!item) { e.preventDefault(); return; }
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item.dataset.vacStatItem); item.classList.add('dragging');
});
$('#vacationStatOptions').addEventListener('dragover', function (e) {
  var target = e.target.closest('.vac-stat-option'); if (!target) { return; }
  e.preventDefault(); e.dataTransfer.dropEffect = 'move'; target.classList.add('drag-over');
});
$('#vacationStatOptions').addEventListener('dragleave', function (e) {
  var target = e.target.closest('.vac-stat-option'); if (target && !target.contains(e.relatedTarget)) { target.classList.remove('drag-over'); }
});
$('#vacationStatOptions').addEventListener('drop', function (e) {
  var target = e.target.closest('.vac-stat-option'), source = e.dataTransfer.getData('text/plain');
  if (!target || !source) { return; }
  e.preventDefault();
  var order = state.vacationStatOrder.slice(), from = order.indexOf(source), to = order.indexOf(target.dataset.vacStatItem);
  if (from < 0 || to < 0 || from === to) { return; }
  order.splice(from, 1); order.splice(order.indexOf(target.dataset.vacStatItem), 0, source); state.vacationStatOrder = order;
  vacationSyncStatOptionOrder(); render();
});
$('#vacationStatOptions').addEventListener('dragend', function () {
  $('#vacationStatOptions').querySelectorAll('.dragging,.drag-over').forEach(function (item) { item.classList.remove('dragging', 'drag-over'); });
});
vacationSyncStatOptionOrder();
$('#vacTextSize').addEventListener('input', function (e) { state.vacTextSize = +e.target.value; $('#vacTextSizeOut').textContent = state.vacTextSize + ' %'; render(); });
$('#vacLabelSize').addEventListener('input', function (e) { state.vacLabelSize = +e.target.value; $('#vacLabelSizeOut').textContent = state.vacLabelSize + ' %'; render(); });
$('#vacValueSize').addEventListener('input', function (e) { state.vacValueSize = +e.target.value; $('#vacValueSizeOut').textContent = state.vacValueSize + ' %'; render(); });

var STAGE_COLORS = ['#2364aa', '#2a9d68', '#a23b72', '#d17a00', '#6046a8', '#008b8b', '#6b7280', '#bd3e21', '#3b7a57'];
function stageDefaultColor(i) { return i === 0 ? palette().route : STAGE_COLORS[(i - 1) % STAGE_COLORS.length]; }
function stageColor(i, row) { return row && row.color ? row.color : stageDefaultColor(i); }
function palStartFlagColor() { return state.colors.startFlag || palette().route; }
function renderStagesPoster() {
  var rows = vacationSelected(), sum = vacationSummary(rows), pal = palette(), F = fmt(), H = F.H, h = '', header = '', headerR = M + W, plotW = LAY.mapR - LAY.mapL;
  h += '<rect width="100" height="' + f(H) + '" fill="' + pal.bg + '"/>';
  if (state.showTitle) { header += titleLogoSVG(pal) + '<text id="ptitle" x="' + f(LAY.landscape ? 50 : titleStartX()) + '" y="' + LAY.titleY + '" text-anchor="' + (LAY.landscape ? 'middle' : 'start') + '" font-size="' + titleFs() + '" font-weight="600" fill="' + pal.ink + '">' + esc(state.title || 'Mehrtagestour') + '</text>'; }
  if (state.showSubtitle && String(state.subtitle || '').trim()) { header += '<text id="psubtitle" x="' + (LAY.landscape ? 50 : M) + '" y="' + f(subtitleY()) + '" text-anchor="' + (LAY.landscape ? 'middle' : 'start') + '" font-size="' + subtitleFs() + '" font-weight="500" fill="' + pal.subtitle + '">' + esc(state.subtitle) + '</text>'; }
  if (state.showRegion && String(state.region || '').trim()) { header += '<text x="' + (LAY.landscape ? M : headerR) + '" y="' + LAY.regionY + '" font-size="' + metaFs() + '" font-weight="600" text-anchor="' + (LAY.landscape ? 'start' : 'end') + '" fill="' + pal.ink + '">' + esc(state.region) + '</text>'; }
  if (state.showDate) { header += '<text x="' + headerR + '" y="' + LAY.dateY + '" font-size="' + metaFs() + '" font-weight="500" text-anchor="end" fill="' + pal.date + '">' + esc(vacationPeriod(rows)) + '</text>'; }
  header += '<line x1="' + M + '" x2="' + headerR + '" y1="' + LAY.ruleY + '" y2="' + LAY.ruleY + '" stroke="' + pal.ink + '" stroke-opacity=".3" stroke-width=".2"/>';
  if (!rows.length) {
    h += '<text x="' + f(LAY.landscape ? (LAY.mapL + LAY.mapR) / 2 : 50) + '" y="' + f(LAY.landscape ? (LAY.mapT + state.mapB) / 2 : fmt().H / 2) + '" font-size="' + fs(3.5) + '" text-anchor="middle" fill="' + pal.muted + '">GPX-Etappen laden, um die Touren darzustellen</text>';
  } else {
    // The user can hide the legend or move it around the route map.
    var legend = stageLegendMetrics(rows), legendTop = LAY.mapT + 2;
    if (legend.pos === 'bottom') { legendTop = state.mapB - legend.lines * legend.step + 1; }
    if (legend.side) { legendTop = (LAY.mapT + state.mapB - (legend.lines - 1) * legend.step) / 2; }
    if (legend.pos !== 'none') {
      var legendX = legend.pos === 'left' ? LAY.mapL : legend.pos === 'right' ? LAY.mapR - 22.5 : LAY.mapL;
      var legendY = legendTop - 1.45, legendW = legend.side ? 22.5 : plotW, legendH = (legend.side ? Math.max(1, legend.lines - 1) * legend.step + 1.5 : legend.lines * legend.step + .45);
      if (state.stageLegendBackground) { h += '<rect x="' + f(legendX) + '" y="' + f(legendY) + '" width="' + f(legendW) + '" height="' + f(legendH) + '" rx=".8" fill="' + pal.bg + '" fill-opacity="' + (state.stageLegendOpacity / 100) + '"/>'; }
      legend.entries.forEach(function (entry, li) {
        var row = legend.side ? li : Math.floor(li / Math.max(1, legend.cols)), col = legend.side ? 0 : li % Math.max(1, legend.cols), cell = plotW / Math.max(1, legend.cols);
        var lx = legend.pos === 'left' ? LAY.mapL + 1.2 : legend.pos === 'right' ? LAY.mapR - 21.5 : LAY.mapL + cell * col + 1.4, ly = legendTop + row * legend.step;
        if (entry.index >= 0) { h += '<line x1="' + f(lx) + '" x2="' + f(lx + 2.1) + '" y1="' + f(ly - .55) + '" y2="' + f(ly - .55) + '" stroke="' + stageColor(entry.index, rows[entry.index]) + '" stroke-width=".8"/>'; }
        h += '<text x="' + f(lx + (entry.index >= 0 ? 2.8 : 0)) + '" y="' + f(ly) + '" font-size="' + fs(1.55 * state.stageLegendFontSize / 100) + '" fill="' + (state.colors.stageLegend || pal.ink) + '">' + esc(entry.label) + '</text>';
      });
    }
    var geo = stageGeometry(), points = geo.stages;
    rows.forEach(function (r, ri) {
      var pts = points[ri], mp = pts.map(geo.mapPt), color = stageColor(ri, r), stagePal = Object.assign({}, pal, { route: color });
      h += '<path d="M' + mp.map(function (p) { return f(p[0]) + ' ' + f(p[1]); }).join('L') + '" fill="none" stroke="' + color + '" stroke-width="' + sc(.72) + '" stroke-linecap="round" stroke-linejoin="round"/>';
      if (state.showStageFlags) {
        var first = ri === 0, last = ri === rows.length - 1;
        if (first && last && r.track.closed) { h += flagSVG(mp[0][0], mp[0][1], 'both', stagePal); }
        else {
          if (first) { h += flagSVG(mp[0][0], mp[0][1], 'start', Object.assign({}, stagePal, { route: palStartFlagColor() })); }
          if (last) { h += flagSVG(mp[mp.length - 1][0], mp[mp.length - 1][1], 'finish', stagePal); }
        }
      }
    });
    if (state.profilePlate) { h += '<rect x="' + f(LAY.profL - 1.5) + '" y="' + f(LAY.profT - 1) + '" width="' + f(LAY.profR - LAY.profL + 3) + '" height="' + f(LAY.landscape ? LAY.statsBottom - LAY.profT + 1 : LAY.statY - LAY.profT + 2) + '" rx="1.8" fill="' + pal.statsBg + '" fill-opacity="' + (state.plateOpacity / 100) + '"/>'; }
    var hasEle = rows.some(function (r) { return r.track.hasEle; }), minE = Infinity, maxE = -Infinity;
    if (hasEle) { rows.forEach(function (r) { if (r.track.hasEle) { minE = Math.min(minE, r.track.minE); maxE = Math.max(maxE, r.track.maxE); } }); if (maxE - minE < 60) { var mid = (maxE + minE) / 2; minE = mid - 30; maxE = mid + 30; } }
    var base = LAY.profB, total = Math.max(sum.total, 1), offset = 0;
    rows.forEach(function (r, ri) {
      var t = r.track, color = stageColor(ri, r), end = offset + t.total;
      if (hasEle && t.hasEle) {
        var line = 'M' + t.s.map(function (p) { var x = LAY.profL + (offset + p.d) / total * (LAY.profR - LAY.profL), y = base - (p.e - minE) / (maxE - minE) * (base - LAY.profT); return f(x) + ' ' + f(y); }).join('L');
        h += '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="' + sc(.48) + '" stroke-linejoin="round" stroke-linecap="round"/>';
      }
      offset = end;
    });
    if (hasEle) {
      h += '<line x1="' + LAY.profL + '" x2="' + LAY.profR + '" y1="' + base + '" y2="' + base + '" stroke="' + pal.ink + '" stroke-opacity=".55" stroke-width=".25"/>';
      rows.forEach(function (r, ri) { var x = LAY.profL + rows.slice(0, ri).reduce(function (a, b) { return a + b.track.total; }, 0) / total * (LAY.profR - LAY.profL); h += '<line x1="' + f(x) + '" x2="' + f(x) + '" y1="' + base + '" y2="' + f(base + 1.1) + '" stroke="' + stageColor(ri, r) + '" stroke-width=".45"/>'; });
      h += '<text x="' + LAY.profL + '" y="' + LAY.axisY + '" font-size="' + fs(1.8) + '" fill="' + pal.muted + '">Höhenprofil je Etappe</text>';
    } else { h += '<text x="50" y="' + f((LAY.profT + LAY.profB) / 2) + '" font-size="' + fs(2.4) + '" text-anchor="middle" fill="' + pal.muted + '">Keine Höhendaten in den GPX-Dateien</text>'; }
    var stageStats = [], eleRows = rows.filter(function (r) { return r.track.hasEle; }), elapsedRows = rows.filter(function (r) { return r.track.startTime != null && r.track.endTime != null; }), movingRows = rows.filter(function (r) { return r.track.movingTime != null; });
    if (state.showStats) {
      if (state.stats.distance) { stageStats.push({ v: de(sum.total / 1000, 1) + ' km', l: 'Gesamtstrecke' }); }
      if (eleRows.length && state.stats.ascent) { stageStats.push({ v: de(sum.ascent) + ' m', l: 'Höhenmeter' }); }
      if (eleRows.length && state.stats.max) { stageStats.push({ v: de(Math.max.apply(null, eleRows.map(function (r) { return r.track.maxE; }))) + ' m', l: 'Höchster Punkt' }); }
      if (eleRows.length && state.stats.min) { stageStats.push({ v: de(Math.min.apply(null, eleRows.map(function (r) { return r.track.minE; }))) + ' m', l: 'Tiefster Punkt' }); }
      if (elapsedRows.length && sum.tripElapsed != null && state.stats.elapsed) { stageStats.push({ v: formatDuration(sum.tripElapsed), l: 'Gesamtzeit' }); }
      if (movingRows.length && state.stats.moving) { stageStats.push({ v: formatDuration(movingRows.reduce(function (a, r) { return a + r.track.movingTime; }, 0)), l: 'Bewegungszeit' }); }
      stageStats.push({ v: String(rows.length), l: 'Etappen' });
    }
    if (LAY.landscape && stageStats.length) {
      var statH = LAY.statsBottom - LAY.statsTop, cols = 3, cellW = (LAY.statsR - LAY.statsL) / cols, rowH = statH / Math.ceil(stageStats.length / cols);
      h += '<rect x="' + f(LAY.statsL - 1) + '" y="' + f(LAY.statsTop) + '" width="' + f(LAY.statsR - LAY.statsL + 1.5) + '" height="' + f(statH) + '" rx="1.8" fill="' + pal.statsBg + '" fill-opacity="' + (state.plateOpacity / 100) + '"/>';
      stageStats.forEach(function (s, i) { var row = Math.floor(i / cols), col = i % cols, x = LAY.statsL + cellW * (col + .5), y = LAY.statsTop + row * rowH + rowH * .43; h += '<g class="stage-stat"><text x="' + f(x) + '" y="' + f(y) + '" text-anchor="middle" font-size="' + fs(2.05 * state.statsFontSize / 100) + '" font-weight="600" fill="' + pal.statValue + '">' + esc(s.v) + '</text><text x="' + f(x) + '" y="' + f(y + fs(2.1)) + '" text-anchor="middle" font-size="' + fs(1.28 * state.statsFontSize / 100) + '" fill="' + pal.statLabel + '">' + esc(s.l) + '</text></g>'; });
    } else { stageStats.forEach(function (s, i) { var n = stageStats.length, cellW = W / n, x = M + cellW * (i + .5), valueFs = fs(2.25 * state.statsFontSize / 100), labelFs = fs(1.35 * state.statsFontSize / 100); h += '<g class="stage-stat"><text x="' + f(x) + '" y="' + f(LAY.statY - fs(1.7)) + '" text-anchor="middle" font-size="' + valueFs + '" font-weight="600" fill="' + pal.statValue + '">' + esc(s.v) + '</text><text x="' + f(x) + '" y="' + LAY.statY + '" text-anchor="middle" font-size="' + labelFs + '" fill="' + pal.statLabel + '">' + esc(s.l) + '</text></g>'; }); }
  }
  h += header;
  if (rows.length && attrOn()) { h += '<text x="' + LAY.mapR + '" y="' + f(fmt().B + sc(.4)) + '" font-size="' + fs(1.9) + '" text-anchor="end" fill="' + pal.muted + '">' + esc(attrText()) + '</text>'; }
  svg.innerHTML = h;
  var anchorNode = svg.children[1] || null;
  if (bgEl && state.bg) { bgApply(); svg.insertBefore(bgEl, anchorNode); anchorNode = bgEl.nextSibling; }
  if (mapG && geo && state.map.style !== 'none') { placeMap(geo); svg.insertBefore(mapClip, anchorNode); svg.insertBefore(mapG, anchorNode); }
  var title = svg.querySelector('#ptitle'); if (title) { var tw = title.getComputedTextLength(), mw = W - 4; if (tw > mw) { title.setAttribute('font-size', f(titleFs() * mw / tw)); } }
  var subtitle = svg.querySelector('#psubtitle'); if (subtitle) { var sw = subtitle.getComputedTextLength(), max = W; if (sw > max) { subtitle.setAttribute('font-size', f(subtitleFs() * max / sw)); } }
  var stageStatsEls = Array.prototype.slice.call(svg.querySelectorAll('.stage-stat'));
  if (stageStatsEls.length) { var stageCell = LAY.landscape ? (LAY.statsR - LAY.statsL) / 3 : W / stageStatsEls.length; stageStatsEls.forEach(function (g, i) { Array.prototype.forEach.call(g.children, function (el) { var width = el.getComputedTextLength(), maxW = stageCell - 1; if (width > maxW) { el.setAttribute('font-size', f(+el.getAttribute('font-size') * maxW / width)); } }); }); }
  ensureBackdrop();
}

function setPosterMode(mode) {
  var vacation = mode === 'vacation', stages = mode === 'stages'; state.posterMode = vacation ? 'vacation' : (stages ? 'stages' : 'route');
  if (vacation && state.mapPosMode) { setMapPosMode(false); }
  $('#routeMode').setAttribute('aria-pressed', vacation || stages ? 'false' : 'true');
  $('#stagesMode').setAttribute('aria-pressed', stages ? 'true' : 'false');
  $('#vacationMode').setAttribute('aria-pressed', vacation ? 'true' : 'false');
  $('#stageFlagsRow').hidden = !stages; $('#colorStartFlagRow').hidden = !stages;
  $('#lead').textContent = vacation ? 'Mehrere GPX-Touren als gemeinsame Urlaubsstatistik darstellen.' : stages ? 'Mehrere GPX-Etappen gemeinsam als lange Tour mit farbigen Routen darstellen.' : 'GPX laden, Titel eintragen, Highlights platzieren, als Bild exportieren.';
  $('#tracksHeading').textContent = stages ? 'Etappen' : 'Touren';
  $('#vacationFilesLabel').textContent = stages ? 'Etappen-GPX laden' : 'Touren-GPX laden';
  $('#routeGroup').hidden = vacation || stages; $('#tracksGroup').hidden = !(vacation || stages); $('#vacationGroup').hidden = !vacation;
  $('#tracksHint').textContent = stages ? 'Je Wandertag eine GPX-Datei laden. Die Etappen werden zusammen dargestellt.' : 'GPX-Touren für die Statistik auswählen.';
  $('#statsFont').closest('.slider').hidden = vacation;
  syncColorMode();
  $('#highlightsGroup').hidden = vacation || stages; $('#backgroundGroup').hidden = vacation;
  var mapGroup = $('#mapGroup'); if (mapGroup) { mapGroup.hidden = vacation; }
  $('#dateField').hidden = vacation || stages;
  ['optEleRow', 'optPlatesRow'].forEach(function (id) { $('#' + id).hidden = vacation || stages; });
  $('#profilePlateRow').hidden = vacation;
  $('#plateOpacityRow').hidden = vacation;
  ['optStatsRow', 'statsOptions'].forEach(function (id) { $('#' + id).hidden = vacation; });
  if (vacation && state.title === 'Brocken-Runde') { state.title = 'Urlaubsstatistik'; $('#title').value = state.title; }
  if (stages && state.title === 'Brocken-Runde') { state.title = 'Mehrtagestour'; $('#title').value = state.title; }
  if (stages && state.title === 'Urlaubsstatistik') { state.title = 'Mehrtagestour'; $('#title').value = state.title; }
  if (!vacation && !stages && (state.title === 'Urlaubsstatistik' || state.title === 'Mehrtagestour')) { state.title = 'Brocken-Runde'; $('#title').value = state.title; }
  if ((vacation || stages) && state.title === 'Mehrtagestour' && vacation) { state.title = 'Urlaubsstatistik'; $('#title').value = state.title; }
  $('#stageLegendRow').hidden = !stages; $('#stageFlagsRow').hidden = !stages; $('#colorStartFlagRow').hidden = !stages;
  $('#stageLegendPosition').value = state.stageLegendPosition || 'none';
  ['stageLegendColorRow', 'stageLegendSizeRow', 'stageLegendBackgroundRow'].forEach(function (id) { $('#' + id).hidden = !stages; });
  $('#stageLegendOpacityRow').hidden = !stages || !state.stageLegendBackground;
  mapReset();
  vacationRenderList(); syncStatsUi(); syncMapUi(); applyFormat(); render();
}
$('#routeMode').addEventListener('click', function () { setPosterMode('route'); });
$('#stagesMode').addEventListener('click', function () { setPosterMode('stages'); });
$('#vacationMode').addEventListener('click', function () { setPosterMode('vacation'); });
$('#showStageFlags').addEventListener('change', function (e) { state.showStageFlags = e.target.checked; render(); });
$('#stageLegendPosition').addEventListener('change', function (e) { state.stageLegendPosition = e.target.value; render(); });
$('#stageLegendFontSize').addEventListener('input', function (e) { state.stageLegendFontSize = +e.target.value; $('#stageLegendFontSizeOut').textContent = state.stageLegendFontSize + ' %'; render(); });
$('#stageLegendBackground').addEventListener('change', function (e) { state.stageLegendBackground = e.target.checked; $('#stageLegendOpacityRow').hidden = !state.stageLegendBackground; render(); });
$('#stageLegendOpacity').addEventListener('input', function (e) { state.stageLegendOpacity = +e.target.value; $('#stageLegendOpacityOut').textContent = state.stageLegendOpacity + ' %'; render(); });

function vacationChartBins(daily) {
  var dates = Object.keys(daily).sort(), bins = [];
  if (dates.length <= 14) { return dates.map(function (date) { return { label: vacationDateLabel(date), value: daily[date] }; }); }
  var size = Math.ceil(dates.length / 12);
  for (var i = 0; i < dates.length; i += size) {
    var total = 0; dates.slice(i, i + size).forEach(function (date) { total += daily[date]; });
    bins.push({ label: vacationDateLabel(dates[i]), value: total });
  }
  return bins;
}
function renderVacationPoster() {
  var pal = palette(), rows = vacationSelected(), sum = vacationSummary(rows), F = fmt(), H = F.H, h = '', headerR = M + W, chartL = LAY.landscape ? LAY.mapL : M, chartR = LAY.landscape ? LAY.mapR : M + W, chartW = chartR - chartL, chartCx = (chartL + chartR) / 2;
  var textScale = state.vacTextSize / 100;
  var labelScale = textScale * state.vacLabelSize / 100;
  var valueScale = textScale * state.vacValueSize / 100;
  h += '<rect width="100" height="' + f(H) + '" fill="' + pal.bg + '"/>';
  if (state.showTitle) { h += titleLogoSVG(pal) + '<text id="ptitle" x="' + f(LAY.landscape ? 50 : titleStartX()) + '" y="' + LAY.titleY + '" text-anchor="' + (LAY.landscape ? 'middle' : 'start') + '" font-size="' + titleFs() + '" font-weight="600" fill="' + pal.ink + '">' + esc(state.title || 'Urlaubsstatistik') + '</text>'; }
  if (state.showSubtitle && String(state.subtitle || '').trim()) {
    h += '<text id="psubtitle" x="' + (LAY.landscape ? 50 : M) + '" y="' + f(subtitleY()) + '" text-anchor="' + (LAY.landscape ? 'middle' : 'start') + '" font-size="' + subtitleFs() + '" font-weight="500" fill="' + pal.subtitle + '">' + esc(state.subtitle) + '</text>';
  }
  if (state.showRegion && String(state.region || '').trim()) { h += '<text id="preg" x="' + (LAY.landscape ? M : headerR) + '" y="' + LAY.regionY + '" font-size="' + metaFs() + '" font-weight="600" text-anchor="' + (LAY.landscape ? 'start' : 'end') + '" fill="' + pal.ink + '">' + esc(state.region) + '</text>'; }
  if (state.showDate) { h += '<text id="pdate" x="' + headerR + '" y="' + LAY.dateY + '" font-size="' + metaFs() + '" font-weight="500" text-anchor="end" fill="' + pal.date + '">' + esc(vacationPeriod(rows)) + '</text>'; }
  h += '<line x1="' + M + '" x2="' + headerR + '" y1="' + LAY.ruleY + '" y2="' + LAY.ruleY + '" stroke="' + pal.ink + '" stroke-opacity=".3" stroke-width=".2"/>';
  // The route poster reserves the lower half for elevation data; the vacation
  // poster can use that space for a taller daily-distance chart.
  var km = de(sum.total / 1000, 1) + ' km', chartTop = LAY.landscape ? LAY.mapT + 17 : LAY.mapT + 17, base = LAY.landscape ? LAY.mapB - 2 : F.B - (attrOn() ? 3.3 : 0) - 8.6 - F.profH - 9;
  h += '<text x="' + f(chartCx) + '" y="' + f(LAY.mapT + 2.8) + '" text-anchor="middle" font-size="' + fs(3.1 * labelScale) + '" font-weight="500" fill="' + pal.muted + '">GESAMTSTRECKE</text>';
  h += '<text id="vac-total" x="' + f(chartCx) + '" y="' + f(LAY.mapT + 10) + '" text-anchor="middle" font-size="' + fs(7.2 * textScale) + '" font-weight="600" fill="' + pal.statValue + '">' + esc(km) + '</text>';
  h += '<text x="' + f(chartCx) + '" y="' + f(chartTop) + '" text-anchor="middle" font-size="' + fs(2.8 * labelScale) + '" font-weight="500" fill="' + pal.muted + '">Kilometer je Tour</text>';
  var bins = vacationChartBins(sum.daily), maxBin = Math.max.apply(null, bins.map(function (b) { return b.value; }));
  if (bins.length) {
    h += '<line x1="' + chartL + '" x2="' + chartR + '" y1="' + base + '" y2="' + base + '" stroke="' + pal.ink + '" stroke-opacity=".55" stroke-width=".25"/>';
    var cell = chartW / bins.length, bw = Math.min(5, cell * .58);
    var chartReserve = fs(1.44 * labelScale + 2.7 * valueScale) + sc(1), chartH = Math.max(3, base - chartTop - chartReserve);
    bins.forEach(function (b, i) {
      var bh = maxBin ? Math.max(.5, b.value / maxBin * chartH) : 0, x = chartL + cell * (i + .5) - bw / 2;
      h += '<rect x="' + f(x) + '" y="' + f(base - bh) + '" width="' + f(bw) + '" height="' + f(bh) + '" rx=".35" fill="' + pal.route + '"/>';
      h += '<text x="' + f(chartL + cell * (i + .5)) + '" y="' + f(base - bh - 1.6 * valueScale) + '" text-anchor="middle" font-size="' + fs(2.5 * valueScale) + '" font-weight="600" fill="' + pal.statValue + '">' + de(b.value / 1000, 1) + '</text>';
      h += '<text x="' + f(chartL + cell * (i + .5)) + '" y="' + f(base + 5) + '" text-anchor="middle" font-size="' + fs(2.4 * labelScale) + '" fill="' + pal.muted + '">' + esc(b.label) + '</text>';
    });
  } else {
    h += '<text x="' + f(chartCx) + '" y="' + f(chartTop + 10) + '" text-anchor="middle" font-size="' + fs(2.2 * textScale) + '" fill="' + pal.muted + '">' + (rows.length ? 'Keine Zeitstempel für die Tagesübersicht' : 'GPX-Dateien laden, um die Statistik zu sehen') + '</text>';
  }
  var stats = [
    { key: 'tours', v: String(rows.length), l: 'Touren' },
    { key: 'ascent', v: sum.eleCount ? de(sum.ascent) + ' m' : '—', l: 'Höhenmeter' },
    { key: 'days', v: sum.days ? String(sum.days) : '—', l: 'Tage' },
    { key: 'longest', v: sum.longest ? de(sum.longest.total / 1000, 1) + ' km' : '—', l: 'Längste Tour' },
    { key: 'highest', v: sum.highest ? de(sum.highest.ele) + ' m' : '—', l: 'Höchster Punkt' },
    { key: 'average', v: rows.length ? de(sum.total / rows.length / 1000, 1) + ' km' : '—', l: 'Ø je Tour' },
    { key: 'elapsed', v: sum.elapsedCount ? formatDuration(sum.elapsed) : '—', l: 'Gesamtzeit' },
    { key: 'moving', v: sum.movingCount ? formatDuration(sum.moving) : '—', l: 'Zeit in Bewegung' }
  ].filter(function (s) { return state.vacationStats[s.key]; }).sort(function (a, b) { return state.vacationStatOrder.indexOf(a.key) - state.vacationStatOrder.indexOf(b.key); });

  if (LAY.landscape && stats.length) {
    var statH = LAY.statsBottom - LAY.statsTop, cols = 3, statCell = (LAY.statsR - LAY.statsL) / cols, rowsNeeded = Math.ceil(stats.length / cols), rowH = statH / rowsNeeded;
    h += '<rect x="' + f(LAY.statsL - 1) + '" y="' + f(LAY.statsTop) + '" width="' + f(LAY.statsR - LAY.statsL + 1.5) + '" height="' + f(statH) + '" rx="1.8" fill="' + pal.statsBg + '" fill-opacity="' + (state.plateOpacity / 100) + '"/>';
    stats.forEach(function (s, i) { var row = Math.floor(i / cols), col = i % cols, x = LAY.statsL + statCell * (col + .5), valueY = LAY.statsTop + row * rowH + rowH * .43; h += '<g class="vac-stat"><text x="' + f(x) + '" y="' + f(valueY) + '" text-anchor="middle" font-size="' + fs(2.1 * textScale) + '" font-weight="600" fill="' + pal.statValue + '">' + esc(s.v) + '</text><text x="' + f(x) + '" y="' + f(valueY + fs(2.1)) + '" text-anchor="middle" font-size="' + fs(1.25 * labelScale) + '" fill="' + pal.statLabel + '">' + esc(s.l) + '</text></g>'; });
  } else {
    var statRows = Math.ceil(stats.length / 4), topLabelY = base + 18, lowerLabelY = H - 7;
    var rowGap = statRows > 1 ? (lowerLabelY - topLabelY) / (statRows - 1) : 0;
    if (statRows) { h += '<rect x="' + f(M - 1.5) + '" y="' + f(topLabelY - 6.2) + '" width="' + f(W + 3) + '" height="' + f(H - topLabelY + 1.2) + '" rx="1.8" fill="' + pal.statsBg + '" fill-opacity="' + (state.plateOpacity / 100) + '"/>'; }
    if (statRows) {
      for (var row = 0; row < statRows; row++) {
        var rowLabelY = statRows === 1 ? Math.min(lowerLabelY, topLabelY + 4) : topLabelY + rowGap * row;
        var rowStats = stats.slice(row * 4, row * 4 + 4), rowCenters = rowStats.map(function (s, col) { return M + W * (col + .5) / rowStats.length; });
        rowStats.forEach(function (s, col) {
          var valueY = rowLabelY - fs(2.9 * textScale), valueSize = fs(2.7 * textScale);
          h += '<g class="vac-stat"><text x="' + f(rowCenters[col]) + '" y="' + f(valueY) + '" text-anchor="middle" font-size="' + valueSize + '" font-weight="600" fill="' + pal.statValue + '">' + esc(s.v) + '</text><text x="' + f(rowCenters[col]) + '" y="' + f(rowLabelY) + '" text-anchor="middle" font-size="' + fs(1.35 * labelScale) + '" fill="' + pal.statLabel + '">' + esc(s.l) + '</text></g>';
        });
      }
    }
  }
  svg.innerHTML = h;
  var title = svg.querySelector('#ptitle');
  if (title) { var width = title.getComputedTextLength(), maxW = W - 4; if (width > maxW) { title.setAttribute('font-size', f(titleFs() * maxW / width)); } }
  var subtitle = svg.querySelector('#psubtitle');
  if (subtitle) { var subtitleWidth = subtitle.getComputedTextLength(), subW = W; if (subtitleWidth > subW) { subtitle.setAttribute('font-size', f(subtitleFs() * subW / subtitleWidth)); } }
  var total = svg.querySelector('#vac-total');
  if (total) { var width2 = total.getComputedTextLength(), maxW2 = chartW - 4; if (width2 > maxW2) { total.setAttribute('font-size', f(fs(7.2 * textScale) * maxW2 / width2)); } }
}
