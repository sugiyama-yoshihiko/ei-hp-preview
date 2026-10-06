/* EI filament. A single immutable spatial route, drawn from its leading end.
   Native scroll is never intercepted. No idle loop or offscreen rendering. */
(function () {
  'use strict';
  var canvas = document.querySelector('.site-thread');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;
  var toggle = document.querySelector('.thread-toggle'), reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var isHome = document.body.dataset.page === 'index';
  var w = 0, h = 0, d = 0, ratio = 1, route = [], phase = 0, target = 0, camera = 0;
  var paused = reduced.matches, ready = false, frameId = null, lastTime = 0;
  var heroHeight = 0, blueRoute=[], crossings=[], knotStart=0, knotEnd=0;
  var tipHold=0;   /* 初期表示で先端を保持する位置（キー） */
  var entrance=window.eiEntrance,entranceStart=null,entranceProgress=0;
  function easing(x){x=clamp(x,0,1);return x*x*x*(x*(x*6-15)+10);}
  function entering(){return isHome&&entrance&&entrance.active;}
  function finishEntrance(){if(entering()){entrance.finish();phase=target;}}
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function createRoute() {
    route=[];blueRoute=[];crossings=[];
    var firstY=-h*.10,lastY=d-h*.30,span=lastY-firstY;
    var lead=Math.min(heroHeight*.68,h*.68),maxKey=d-h;
    var ending=document.querySelector('.thread-ending');
    var knotY=ending?ending.getBoundingClientRect().top+camera+ending.getBoundingClientRect().height*.5:0;
    if(ending){
      lastY=knotY-160;span=lastY-firstY;
      // Short interior pages must also finish tying before their real scroll limit.
      knotEnd=Math.max(0,Math.min(document.documentElement.scrollHeight-h,knotY-h*.38));
      knotStart=Math.min(lastY-lead,knotEnd-Math.min(200,h*.25));
    }
    var firstKey=Math.min(firstY-lead,knotStart-100);
    /* 振れ幅は幅に比例するため、狭い画面では絶対量が小さく、縦に長いページでは
       ほぼ直線に見える（390px で 115px、1440px で 426px）。
       ヒーローが縦積みになる 640px 以下でのみ振れ幅を広げる。
       それ以上の幅では見出しとリード文の通り道が狭く（900px で 124px）、
       広げると本文に食い込むため変更しない。640px で係数 1.0 となり段差も出ない。 */
    var AMP = w>=640 ? 1 : 1+(640-w)/640*2.9;
    var count=Math.ceil(span/3);
    // Selected study 5: the same two gentle, unequal waves about the centre.
    // One analytic curve: no independent handles, corners or moving body segments.
    for(var i=0;i<=count;i++){
      var t=i/count,y=firstY+span*t;
      var x=.5+AMP*(.115*Math.sin(2*Math.PI*t+.3)+.038*Math.sin(5*Math.PI*t-.3));
      // Only the final stretch leaves the centre; cubic onset keeps curvature continuous.
      var exit=Math.max(0,(t-.88)/.12);
      if(ending)x+=(.5-x)*easing(exit);else x+=.64*exit*exit*exit;
      /* 最初の区間だけロゴの位置へ寄せる。以降は従来の曲線に戻る。 */

      route.push({x:x*w,y:y,z:0,key:ending?firstKey+(knotStart-firstKey)*t:(y-lead)/(lastY-lead)*maxKey});
    }
    /* 開いた直後だけ、糸の先端を画面下より先の位置で保持する。
       キーは一切変えないので進む速さは元のまま。本来の進行がこの位置に
       追いついた時点で保持は外れ、以降は完全に従来どおりの挙動に戻る。
       スクロールを始めると先端が画面下から上がって現れる。 */
    tipHold=0;
    for(var si=0;si<route.length;si++){ if(route[si].y>=h*1.12){ tipHold=Math.max(0,route[si].key); break; } }
    if(!ending)return;
    var cx=w*.5,s=Math.min(58,w*.12),redTail=[{x:cx,y:lastY}],blueTail=[];
    // Each cubic shares a tangent with its neighbour. Only the leading ends advance.
    function curve(list,a,b,c){
      var p=list[list.length-1];
      for(var j=1;j<=80;j++){var t=j/80,u=1-t;list.push({x:u*u*u*p.x+3*u*u*t*a[0]+3*u*t*t*b[0]+t*t*t*c[0],y:u*u*u*p.y+3*u*u*t*a[1]+3*u*t*t*b[1]+t*t*t*c[1]});}
    }
    function point(x,y){return [cx+x*s,knotY+y*s];}
    curve(redTail,[cx,lastY+65],point(.65,-.8),point(.48,-.25));
    curve(redTail,point(.31,.30),point(-.75,.65),point(-.5,.9));
    curve(redTail,point(-.25,1.15),point(.85,.5),point(.5,.05));
    curve(redTail,point(.15,-.4),point(-.5,-.75),point(-.9,-.2));
    var blueStart=knotStart-h*.08;
    blueTail.push({x:cx+.12*s,y:knotY+h*.7});
    curve(blueTail,[cx+.12*s,blueTail[0].y-h*.24],point(-.95,1.2),point(-.5,.55));
    curve(blueTail,point(-.05,-.10),point(1,-.7),point(.5,-.9));
    curve(blueTail,point(0,-1.1),point(-.9,-.45),point(-.5,0));
    curve(blueTail,point(-.1,.45),point(.7,.95),point(1.25,.5));
    function keys(list,start,end){
      var lengths=[0],length=0;
      for(var j=1;j<list.length;j++){length+=Math.hypot(list[j].x-list[j-1].x,list[j].y-list[j-1].y);lengths.push(length);}
      list.forEach(function(p,j){p.z=0;p.key=start+(end-start)*lengths[j]/length;});
    }
    keys(redTail,knotStart,knotEnd);keys(blueTail,blueStart,knotEnd);
    route=route.concat(redTail.slice(1));blueRoute=blueTail;
    // Preserve over/under order at real crossings without a thick outline.
    for(var r=1;r<redTail.length;r++)for(var b=1;b<blueTail.length;b++){
      var a=redTail[r-1],z=redTail[r],c=blueTail[b-1],v=blueTail[b];
      var rx=z.x-a.x,ry=z.y-a.y,bx=v.x-c.x,by=v.y-c.y,det=rx*by-ry*bx;
      if(Math.abs(det)<.00001)continue;
      var u=((c.x-a.x)*by-(c.y-a.y)*bx)/det,t=((c.x-a.x)*ry-(c.y-a.y)*rx)/det;
      if(u<0||u>=1||t<0||t>=1)continue;
      var len=Math.hypot(rx,ry),x=a.x+u*rx,y=a.y+u*ry;
      crossings.push({x:x,y:y,dx:rx/len,dy:ry/len,key:Math.max(a.key+u*(z.key-a.key),c.key+t*(v.key-c.key))+5});
    }
  
    /* 本文との距離を保つ。糸の x は幅に比例していたため、画面が狭くなると
       見出しとリード文の“通り道”に対して位置がずれ、900px 以下では
       リード文の左端を越えて本文に入り込んでいた。
       通り道の中での位置（1440px での見え方）を保つよう、経路全体を水平に平行移動する。
       形は変えない（オフセットのみ）ので、1440px での見た目は変わらない。 */
    (function(){
      var lines=document.querySelectorAll('.home-hero h1 .hero-line');
      var aside=document.querySelector('.hero-aside');
      if(!lines.length||!aside) return;
      var hr=0, top=1e9, bot=-1e9;
      for(var i=0;i<lines.length;i++){
        var r=lines[i].getBoundingClientRect();
        if(r.width<=0) continue;
        if(r.right>hr) hr=r.right;
        if(r.top<top) top=r.top;
        if(r.bottom>bot) bot=r.bottom;
      }
      var ab=aside.getBoundingClientRect();
      if(!(hr>0)||!(ab.left>hr)) return;
      var RATIO=.744;                       /* 1440px のときの通り道内の位置 */
      var target=hr+(ab.left-hr)*RATIO;
      var hy=(top+bot)/2+camera;            /* 見出しの縦中心（ページ座標） */
      var cur=null, best=1e9;
      for(var j=0;j<route.length;j++){
        var dd=Math.abs(route[j].y-hy);
        if(dd<best){ best=dd; cur=route[j]; }
      }
      if(!cur) return;
      var off=target-cur.x;
      /* 見出しにもリード文にも寄りすぎないよう制限する */
      off=Math.max(hr+24-cur.x, Math.min(ab.left-24-cur.x, off));
      if(!isFinite(off)||Math.abs(off)<0.5) return;
      for(var k=0;k<route.length;k++) route[k].x+=off;
      for(var m=0;m<blueRoute.length;m++) blueRoute[m].x+=off;
      for(var n=0;n<crossings.length;n++) crossings[n].x+=off;
    })();
  }
  function setDimensions(){
    w=window.innerWidth;h=window.innerHeight;d=Math.max(document.documentElement.scrollHeight,h*2);camera=window.scrollY;
    ratio=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
    var hero=document.querySelector(isHome?'.home-hero':'.page-hero');
    heroHeight=hero?hero.getBoundingClientRect().bottom+camera:Math.min(h,600);
    createRoute();target=clamp(camera,0,d-h);
    if(!ready){phase=target;ready=true;}schedule();
  }
  function partialPath(source){
    source=source||route;
    var key=(reduced.matches&&paused)?d-h:Math.max(phase,tipHold), list=[];
    for(var i=0;i<source.length;i++){
      var p=source[i];
      if(p.key<=key){list.push(p);continue;}
      if(i){var a=source[i-1],t=clamp((key-a.key)/(p.key-a.key),0,1);if(t>0)list.push({x:a.x+(p.x-a.x)*t,y:a.y+(p.y-a.y)*t,z:a.z+(p.z-a.z)*t,key:key});}
      break;
    }
    return list;
  }
  function paintEntrance(path){
    if(path.length<2)return;
    /* 糸はパスの先頭（ヘッダーより上）から現れ、上から下へ伸びる。
       middle=.55 だとパスの中央に点が出て上下へ広がるため、
       「上から下へ進む」という原則から外れていた。 */
    /* middle=0: 糸はパスの先頭（ヘッダーより上）から現れ、上から下へ伸びる。
       成長の開始も早める。元は p>.46（約1.1秒後）からで、それまで起点の点は
       画面外にあり何も見えず、「上から下へ進む」動きの前に空白があった。 */
    var p=entranceProgress,q=easing((p-.28)/.70),middle=0;
    function at(t){var n=clamp(t,0,1)*(path.length-1),i=Math.floor(n),a=path[i],b=path[Math.min(i+1,path.length-1)],f=n-i;return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f-camera};}
    var centre=at(middle),inhale=easing((p-.07)/.16),exhale=easing((p-.23)/.13);
    var radius=1.8+2.4*inhale-2.7*exhale;
    ctx.fillStyle='#AF3E47';ctx.strokeStyle='#AF3E47';
    ctx.globalAlpha=easing(p/.09)*(1-easing((p-.5)/.11));
    ctx.beginPath();ctx.arc(centre.x,centre.y,radius,0,Math.PI*2);ctx.fill();
    var halo=Math.sin(clamp((p-.08)/.31,0,1)*Math.PI);
    if(halo>0){ctx.globalAlpha=.15*halo;ctx.lineWidth=.6;ctx.beginPath();ctx.arc(centre.x,centre.y,5+16*halo,0,Math.PI*2);ctx.stroke();}
    if(q>0){
      var lo=middle*(1-q),hi=middle+(1-middle)*q,a=at(lo);
      ctx.globalAlpha=1;ctx.lineWidth=w<600?.85:1.05;ctx.beginPath();ctx.moveTo(a.x,a.y);
      for(var i=Math.floor(lo*(path.length-1))+1;i<=Math.floor(hi*(path.length-1));i++)ctx.lineTo(path[i].x,path[i].y-camera);
      var b=at(hi);ctx.lineTo(b.x,b.y);ctx.stroke();
    }
    ctx.globalAlpha=1;
  }

  /* 文字に糸を重ねない。paint の最後に、文字の行ボックス位置の糸を消す。
     destination-out で「消す」ので白い矩形を置かない＝背景を汚さない。
     行ボックスは文字幅にぴったり沿うため、ブロック要素の背景のように
     余白まで巻き込むことがない。縦は行送りぶんを少し内側に詰める。 */
  var _tcache=null,_tat=0,_ty=-1;
  function textRects(){
    var now=(window.performance&&performance.now())?performance.now():Date.now();
    var sy=window.scrollY||window.pageYOffset||0;
    if(_tcache&&now-_tat<60&&Math.abs(sy-_ty)<2) return _tcache;
    var out=[],vw=innerWidth,vh=innerHeight;
    var tw=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),n;
    while((n=tw.nextNode())){
      if(!n.nodeValue||!n.nodeValue.trim()) continue;
      var pe=n.parentElement; if(!pe) continue;
      if(/^(SCRIPT|STYLE|NOSCRIPT|TITLE)$/i.test(pe.tagName)) continue;
      var cs=getComputedStyle(pe);
      if(cs.visibility==='hidden'||cs.display==='none'||parseFloat(cs.opacity)<0.05) continue;
      var rg=document.createRange(); rg.selectNodeContents(n);
      var list=rg.getClientRects();
      for(var i=0;i<list.length;i++){
        var b=list[i];
        if(b.width<1||b.height<1) continue;
        if(b.bottom<-4||b.top>vh+4||b.right<-4||b.left>vw+4) continue;
        var inset=b.height*0.10;
        out.push([b.left-1.5,b.top+inset-1,b.width+3,b.height-inset*2+2, !!pe.closest('.nav,.menu')]);
      }
    }
    /* ロゴは画像なので文字走査に乗らない。糸がロゴの文字の後ろから出てくるよう
       ここで明示的に対象へ加える（ヘッダー扱いなのでクリップしない）。 */
    var lg=document.querySelector('.nav__logo img')||document.querySelector('.nav__logo');
    if(lg){ var lb=lg.getBoundingClientRect();
      /* ロゴ全体を対象にすると、糸がロゴの下端から出ているように見えてしまう。
         糸が通る「nee」の範囲だけ薄くして、字形の後ろから出るように見せる。 */
      if(lb.width>0&&lb.bottom>-4&&lb.top<vh+4)
        out.push([lb.left+lb.width*.455,lb.top+lb.height*.10,lb.width*.155,lb.height*.80, true]); }
    _tcache=out;_tat=now;_ty=sy;
    return out;
  }
  /* 文字の行ボックス位置で糸を薄くする（消しきらない）。
     濃さは CSS の --thread-fade で調整: 1 = 完全に消す / 0 = 何もしない。
     ブロック要素の背景ではなく行ボックス単位なので、文字のない余白には及ばない。 */
  function cssNum(name,def){
    var v=parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return isNaN(v)?def:Math.max(0,Math.min(1,v));
  }
  function fadeAmount(){ return cssNum('--thread-fade',0.88); }      /* 文字 */
  function lineFadeAmount(){ return cssNum('--thread-fade-line',0.45); } /* 罫線・円の輪郭 */
  /* 罫線・円の輪郭も同じ半透明にする。円は矩形では沿えないので円弧として扱う。 */
  var _lcache=null,_lat=0,_ly=-1;
  function lineShapes(){
    var now=(window.performance&&performance.now())?performance.now():Date.now();
    var sy=window.scrollY||window.pageYOffset||0;
    if(_lcache&&now-_lat<60&&Math.abs(sy-_ly)<2) return _lcache;
    var out=[],vw=innerWidth,vh=innerHeight;
    var all=document.querySelectorAll('main *, footer *');
    for(var i=0;i<all.length;i++){
      var e=all[i];
      if(e.closest('.nav,.menu,.skip,.thread-toggle')) continue;
      var cs=getComputedStyle(e);
      if(cs.visibility==='hidden'||cs.display==='none') continue;
      var b=e.getBoundingClientRect();
      if(b.width<4||b.height<4) continue;
      if(b.bottom<-8||b.top>vh+8||b.right<-8||b.left>vw+8) continue;
      var tw2=parseFloat(cs.borderTopWidth)||0, bw=parseFloat(cs.borderBottomWidth)||0;
      var lw=parseFloat(cs.borderLeftWidth)||0, rw=parseFloat(cs.borderRightWidth)||0;
      var trans=function(c){var m=String(c).match(/[\d.]+/g);return !m||(m.length>3&&+m[3]<0.02);};
      var radius=parseFloat(cs.borderTopLeftRadius)||0;
      var isCircle = (cs.borderTopLeftRadius.indexOf('%')>=0 || radius>=Math.min(b.width,b.height)/2-2)
                     && tw2>0 && !trans(cs.borderTopColor);
      if(isCircle){
        out.push(['e', b.left+b.width/2, b.top+b.height/2, b.width/2-tw2/2, b.height/2-tw2/2, tw2+1.5, !!e.closest('.nav,.menu')]);
        continue;
      }
      if(tw2>0&&!trans(cs.borderTopColor))    out.push(['r', b.left, b.top-0.75, b.width, tw2+1.5, !!e.closest('.nav,.menu')]);
      if(bw>0&&!trans(cs.borderBottomColor))  out.push(['r', b.left, b.bottom-bw-0.75, b.width, bw+1.5, !!e.closest('.nav,.menu')]);
      if(lw>0&&!trans(cs.borderLeftColor))    out.push(['r', b.left-0.75, b.top, lw+1.5, b.height, !!e.closest('.nav,.menu')]);
      if(rw>0&&!trans(cs.borderRightColor))   out.push(['r', b.right-rw-0.75, b.top, rw+1.5, b.height, !!e.closest('.nav,.menu')]);
    }
    _lcache=out;_lat=now;_ly=sy;
    return out;
  }

  /* 面で塗るUI部品（ボタン・入力欄）は糸を完全に切る。糸を前面に置くため
     CSSの背景では隠せないので、canvas 側で不透明に消す。 */
  var _ucache=null,_uat=0,_uy=-1;
  function uiRects(){
    var now=(window.performance&&performance.now())?performance.now():Date.now();
    var sy=window.scrollY||window.pageYOffset||0;
    if(_ucache&&now-_uat<60&&Math.abs(sy-_uy)<2) return _ucache;
    var out=[],vw=innerWidth,vh=innerHeight;
    var els=document.querySelectorAll('.btn, .form__field input, .form__field textarea, .form__field select, .menu, iframe');
    for(var i=0;i<els.length;i++){
      var e=els[i];
      if(e.type==='checkbox') continue;
      var cs=getComputedStyle(e);
      if(cs.visibility==='hidden'||cs.display==='none') continue;
      var b=e.getBoundingClientRect();
      if(b.width<4||b.height<4) continue;
      if(b.bottom<-4||b.top>vh+4||b.right<-4||b.left>vw+4) continue;
      out.push([b.left,b.top,b.width,b.height, !!e.closest('.nav,.menu')]);
    }
    _ucache=out;_uat=now;_uy=sy;
    return out;
  }

  function clearOverText(){
    try{
      var r=textRects(); if(!r.length) return;
      var a=fadeAmount(), la=lineFadeAmount();
      var op=ctx.globalCompositeOperation, ga=ctx.globalAlpha;
      var L=lineShapes(), U=uiRects();

      /* ヘッダーの裏へスクロールした文字は見えていないので、そこで糸を薄くすると
         薄さだけがヘッダー帯に取り残される。コンテンツ側の処理はヘッダー下端から
         下だけに限定する。ヘッダー自身のナビ文字は見えているので対象のまま。
         navBottom は毎フレーム取り直すので、戻したときも自動で復帰する。 */
      var navEl=document.querySelector('.nav'), navBottom=0;
      if(navEl){
        var nb=navEl.getBoundingClientRect(), np=getComputedStyle(navEl).position;
        if((np==='sticky'||np==='fixed')&&nb.bottom>0) navBottom=Math.min(nb.bottom,h);
      }

      function drawSet(header){
        ctx.globalAlpha=1; ctx.fillStyle='#000';
        for(var k=0;k<U.length;k++) if(!!U[k][4]===header) ctx.fillRect(U[k][0],U[k][1],U[k][2],U[k][3]);
        if(a<=0&&la<=0) return;
        ctx.globalAlpha=a; ctx.fillStyle='#000';
        for(var i2=0;i2<r.length;i2++) if(!!r[i2][4]===header) ctx.fillRect(r[i2][0],r[i2][1],r[i2][2],r[i2][3]);
        ctx.globalAlpha=la;
        for(var j2=0;j2<L.length;j2++){
          var q=L[j2]; if(!!q[q.length-1]!==header) continue;
          if(q[0]==='r'){ ctx.fillRect(q[1],q[2],q[3],q[4]); }
          else{
            ctx.beginPath();
            ctx.ellipse(q[1],q[2],Math.max(0,q[3]),Math.max(0,q[4]),0,0,Math.PI*2);
            ctx.lineWidth=q[5]; ctx.strokeStyle='#000'; ctx.stroke();
          }
        }
      }

      ctx.globalCompositeOperation='destination-out';
      drawSet(true);
      ctx.save();
      ctx.beginPath(); ctx.rect(0,navBottom,w,Math.max(0,h-navBottom)); ctx.clip();
      drawSet(false);
      ctx.restore();
      ctx.globalAlpha=ga;
      ctx.globalCompositeOperation=op;
    }catch(e){}
  }
  function paint(){
    var path=partialPath();ctx.clearRect(0,0,w,h);
    var width=w<600?.85:1.05;
    /* 糸が交差する箇所の白い縁取り。太いと「途切れ」に見えるので控えめにする。
       --thread-halo で調整可（px）。 */
    var halo=(function(){var v=parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue('--thread-halo')); return isNaN(v)?0.6:Math.max(0,v);})();
    ctx.lineCap='round';ctx.lineJoin='round';
    if(entering()&&!paused){paintEntrance(path);clearOverText();return;}
    function stroke(points,color,size){
      ctx.lineWidth=size;ctx.strokeStyle=color;ctx.beginPath();var started=false;
      for(var i=1;i<points.length;i++){
        var a=points[i-1],b=points[i];
        if(Math.max(a.y,b.y)<camera-20||Math.min(a.y,b.y)>camera+h+20){started=false;continue;}
        if(!started){ctx.moveTo(a.x,a.y-camera);started=true;}
        ctx.lineTo(b.x,b.y-camera);
      }
      ctx.stroke();
    }
    stroke(path,'#AF3E47',width);
    var blue=partialPath(blueRoute);
    stroke(blue,'#fff',width+halo);stroke(blue,'#536F91',width);
    var key=(reduced.matches&&paused)?d-h:Math.max(phase,tipHold);
    crossings.forEach(function(c,i){if(i%2||key<c.key)return;var bridge=[{x:c.x-c.dx*3.5,y:c.y-c.dy*3.5},{x:c.x+c.dx*3.5,y:c.y+c.dy*3.5}];stroke(bridge,'#fff',width+halo);stroke(bridge,'#AF3E47',width);});
    clearOverText();
  }
  function schedule(){if(frameId===null&&!document.hidden)frameId=requestAnimationFrame(frame);}
  /* .reveal などスクロール後に現れる文字は、マスクのキャッシュを取った時点では
     まだ非表示で対象から漏れる。その後 paint も止まるため、糸が文字の上に
     濃いまま残っていた。表示が変わる契機でキャッシュを捨てて描き直す。 */
  var maskUntil=0;
  function invalidateMasks(){ _tcache=null; _lcache=null; _ucache=null; }
  function nudge(ms){
    invalidateMasks();
    var now=(window.performance&&performance.now())?performance.now():Date.now();
    maskUntil=Math.max(maskUntil, now+(ms||0));
    schedule();
  }
  document.addEventListener('transitionend', function(){ nudge(180); }, true);
  document.addEventListener('animationend',  function(){ nudge(180); }, true);
  window.addEventListener('scroll',  function(){ nudge(1600); }, {passive:true});
  window.addEventListener('resize',  function(){ nudge(800); });
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) nudge(400); });
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(function(){ nudge(400); });
  /* 地図の iframe や画像が後から読み込まれると、ページ高が変わって文字が移動する。
     スクロールもアニメーションも起きないため上の契機に当たらず、マスクだけが
     古い位置のまま残って糸が文字に重なっていた。レイアウト変化を直接監視する。 */
  if(window.ResizeObserver){
    var ro=new ResizeObserver(function(){ nudge(400); });
    try{ ro.observe(document.body); }catch(e){}
    var mainEl=document.querySelector('main'); if(mainEl){ try{ ro.observe(mainEl); }catch(e){} }
  }
  window.addEventListener('load', function(){ nudge(1200); });
  document.addEventListener('load', function(ev){
    if(ev.target&&/^(IMG|IFRAME|VIDEO)$/.test(ev.target.tagName)) nudge(600);
  }, true);
  /* 念のための保険: 読み込み直後の数秒は、ページ高の変化を定期的に見張る */
  (function(){
    var lastH=document.documentElement.scrollHeight, n=0;
    var iv=setInterval(function(){
      var hh=document.documentElement.scrollHeight;
      if(hh!==lastH){ lastH=hh; nudge(400); }
      if(++n>20) clearInterval(iv);
    },400);
  })();
  function frame(now){
    frameId=null;var dt=lastTime?Math.min(40,now-lastTime):16;lastTime=now;
    if(entering()&&!paused){
      if(entranceStart===null)entranceStart=now;
      var elapsed=now-entranceStart;
      entranceProgress=clamp(elapsed/2400,0,1);
      phase=target;
      /* ベールを先に晴らしてから糸を伸ばす。元は p=.62〜.96（1.5〜2.3秒）で晴れるため、
         糸の成長がベールの裏で終わってしまい「上から下へ伸びる」動きが見えなかった。 */
      document.documentElement.style.setProperty('--entrance-veil',String(1-easing((entranceProgress-.06)/.24)));
      if(elapsed>=2400)finishEntrance();
    }else if(!paused){
      var tau=(knotEnd>knotStart&&phase>=knotStart)?300:95;/* 結びの区間だけ追従を遅くする */phase+=(target-phase)*(1-Math.exp(-dt/tau));
      if(Math.abs(target-phase)<.15)phase=target;
    }
    paint();
    if(!paused&&(entering()||Math.abs(target-phase)>.15||now<maskUntil))schedule();else lastTime=0;
  }
  function scroll(){camera=window.scrollY;target=clamp(camera,0,d-h);if(camera>8)finishEntrance();schedule();}
  function state(){
    document.body.dataset.motion=paused?'paused':'playing';
    if(toggle){toggle.setAttribute('aria-pressed',String(paused));toggle.textContent=paused?'線の動きを再開':'線の動きを止める';}
    document.dispatchEvent(new CustomEvent('ei-motion-change',{detail:{paused:paused}}));
  }
  if(toggle)toggle.addEventListener('click',function(){finishEntrance();paused=!paused;state();schedule();});
  reduced.addEventListener('change',function(){finishEntrance();paused=reduced.matches;state();schedule();});
  document.addEventListener('pointerdown',function(){finishEntrance();schedule();},{passive:true});
  document.addEventListener('keydown',function(){finishEntrance();schedule();});
  window.addEventListener('scroll',scroll,{passive:true});window.addEventListener('resize',setDimensions,{passive:true});window.addEventListener('pageshow',setDimensions);
  document.addEventListener('visibilitychange',function(){if(document.hidden){finishEntrance();if(frameId!==null)cancelAnimationFrame(frameId);frameId=null;lastTime=0;}else setDimensions();});
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(setDimensions);
  window.addEventListener('load',setDimensions);setDimensions();state();
})();
