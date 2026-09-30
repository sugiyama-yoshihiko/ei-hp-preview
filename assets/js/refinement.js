/* Progressive enhancement: all content remains present without motion or JS. */
(function(){
  'use strict';
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)'), animations=[];
  function allowed(){return !reduce.matches&&document.body.dataset.motion!=='paused';}
  function reveal(el,index){
    if(!allowed()||!el.animate)return;
    var animation=el.animate([{transform:'translateY(12px)',opacity:.45},{transform:'translateY(0)',opacity:1}],{duration:820,delay:Math.min(index||0,2)*90,easing:'cubic-bezier(.19,1,.22,1)',fill:'none'});
    animations.push(animation);
    animation.onfinish=function(){animations=animations.filter(function(a){return a!==animation;});};
  }
  // The homepage headline is stationary; its entrance is a single page veil.
  if(document.body.dataset.page!=='index')Array.prototype.forEach.call(document.querySelectorAll('.hero-line'),reveal);
  if('IntersectionObserver' in window){
    var observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){reveal(entry.target,0);observer.unobserve(entry.target);}});},{threshold:.12});
    document.querySelectorAll('.home-section h2,.section-heading h2').forEach(function(el){observer.observe(el);});
  }
  function finish(){if(!allowed())animations.slice().forEach(function(animation){animation.finish();});}
  reduce.addEventListener('change',finish);document.addEventListener('ei-motion-change',finish);
})();
