'use strict';
// ---------- Start ----------
syncMapUi();
applyFormat();
render();
$('#demo').click();
if(document.fonts&&document.fonts.load){
  Promise.all([document.fonts.load('600 10px BarlowC'),document.fonts.load('500 10px BarlowC')]).then(function(){render();}).catch(function(){});
}
