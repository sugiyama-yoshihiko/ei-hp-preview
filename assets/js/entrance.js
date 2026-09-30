/* Early, fail-open homepage entrance. No content is hidden without JavaScript. */
(function(){
  'use strict';
  var root=document.documentElement,seen=false;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||window.location.hash||window.scrollY>8)return;
  try{seen=sessionStorage.getItem('ei-entrance-v2')==='seen';}catch(e){}
  var replay=/(?:^\?|&)intro=1(?:&|$)/.test(window.location.search||'');
  if(seen&&!replay)return;
  var intro=window.eiEntrance={active:true};
  root.setAttribute('data-entrance','active');
  intro.finish=function(){
    intro.active=false;
    root.removeAttribute('data-entrance');
    root.style.removeProperty('--entrance-veil');
    try{sessionStorage.setItem('ei-entrance-v2','seen');}catch(e){}
  };
  // A failed or delayed animation script can never leave a blank screen.
  window.setTimeout(intro.finish,3500);
})();
