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
  /* 比較用: ?thread=drag で糸の「引きずり」を有効にする。
     既定（パラメータなし）は従来どおり、糸は本文と完全に同じ速さで動く。
     drag では、スクロール速度に応じて糸だけが少し遅れて追いかけ、
     手を止めると元の位置へ戻る。ずれ幅は上限を設けてあるので、
     見出しの通り道や結び目の位置がずれることはない。 */
  /* 糸の「引きずり」を既定にする。スクロール速度に応じて糸だけが少し遅れて
     追いかけ、手を止めると戻る。本文と完全に同じ速さで動くより自然に見える、
     という判断（2026-10-06 確認）。?thread=plain で従来の等速に戻せる。 */
  var threadTokens=((location.search.match(/[?&]thread=([a-z,]+)/)||[])[1]||'').split(',');
  function threadHas(t){ return threadTokens.indexOf(t)>=0; }
  /* 既定は「引きずりなし」＝糸は文字に対して一切動かない。
     引きずりは向きを縦から横へ変えても、文字に対して動くこと自体は変わらず
     （実測 14.5px）、行間の短い線分の前後で揺れとして見えてしまう。
     ?thread=drag で有効にできる。 */
  var dragOn=threadHas('drag');
  /* ?thread=lock : キャンバスを position:fixed から文書内配置に変える。
     fixed のまま毎フレーム描き直す方式だと、スクロールがコンポジタ側で
     進むモバイルでは、描いた絵が合成される頃にスクロールが先へ進んでおり、
     糸もマスクもそろって文字に対して動く＝「スクロールに連動して動く」。
     文書内に置けば文字と同じ経路でブラウザがスクロールさせるため、
     JS が何フレーム遅れても文字との位置関係は崩れない。
     画面外ぶんの余白(slack)を持たせ、毎フレーム top を更新する。 */
  var lockMode=!threadHas('fixed');
  var origin=0,slack=0,canvasH=0,headOff=0;
  var drag=0,prevCam=0,vel=0;
  /* 引きずりは【横方向】。縦にずらすと、マスク（文字の行ボックス）は動かないのに
     糸だけが縦にずれるため、行と行の隙間に残る濃い線分（実測 9.6px しかない）が
     丸ごと何個ぶんも滑って見える。マスクは横長の帯なので、横にずらしても
     「縦のどこが隠れるか」は変わらない＝線分は滑らない。 */
  var DRAG_MAX=26;   /* 最大のずれ幅(px) */
  var DRAG_GAIN=1;   /* 1フレームのスクロール量に対する比 */
  /* 開いた直後は先端を画面外に置きたいが、Math.max で止めると追いつくまで
     糸がまったく伸びず「止まっている」ように見える。
     保持量をスクロールに応じて減らすことで、最初から常に伸び続ける。
     減り方は (1-t)^2。これだと伸びの速さ d(key)/d(phase) = 1-2(1-t)/K が
     t=0 で最小 1-2/K、t=1 で 1 となり、K=4 なら最低でもスクロールの 0.5 倍は
     必ず進む。smoothstep だと中間で 0.06 倍まで落ちて再び止まって見えた。
     保持が解けたあとは key=phase となり従来どおりの挙動に戻る。 */
  function drawKey(){
    if(reduced.matches&&paused) return d-h;
    if(tipHold<=0) return phase;
    var t=clamp(phase/(tipHold*4),0,1), u=1-t;
    return phase+tipHold*u*u;
  }
  var entrance=window.eiEntrance,entranceStart=null,entranceProgress=0;
  function easing(x){x=clamp(x,0,1);return x*x*x*(x*(x*6-15)+10);}
  function entering(){return isHome&&entrance&&entrance.active;}
  function finishEntrance(){if(entering()){entrance.finish();phase=target;}}
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  /* 本文側で最後に「見えている」ものの下端（ページ座標）。
     セクションの余白まで含めた箱の下端ではなく、実際に目に入る
     文字・画像・下線の位置。結び目の上下の余白はこれを基準に揃える。 */
  function lastInkBottom(){
    var main=document.querySelector('main'); if(!main) return null;
    var m=-1e9;
    try{
      var tw=document.createTreeWalker(main,NodeFilter.SHOW_TEXT),n;
      while((n=tw.nextNode())){
        if(!n.nodeValue||!n.nodeValue.trim())continue;
        var pe=n.parentElement; if(!pe)continue;
        var st=getComputedStyle(pe);
        if(st.display==='none'||st.visibility==='hidden'||parseFloat(st.opacity)<0.05)continue;
        var rg=document.createRange(); rg.selectNodeContents(n);
        var l=rg.getClientRects();
        for(var i=0;i<l.length;i++) if(l[i].height>0&&l[i].bottom>m) m=l[i].bottom;
      }
      main.querySelectorAll('img,iframe,video,svg').forEach(function(e){
        var st=getComputedStyle(e); if(st.display==='none'||st.visibility==='hidden')return;
        var r=e.getBoundingClientRect(); if(r.width>4&&r.height>4&&r.bottom>m) m=r.bottom;
      });
      main.querySelectorAll('.text-link,.btn,a,hr').forEach(function(e){
        var st=getComputedStyle(e); if(st.display==='none'||st.visibility==='hidden')return;
        var bw=parseFloat(st.borderBottomWidth)||0;
        if(bw<=0&&e.tagName!=='HR')return;
        var col=String(st.borderBottomColor).match(/[\d.]+/g);
        if(col&&col.length>3&&+col[3]<0.05)return;
        var r=e.getBoundingClientRect(); if(r.width>20&&r.bottom>m) m=r.bottom;
      });
    }catch(e){}
    return m<-1e8?null:m+camera;
  }
  /* フッター側で最初に「見えている」ものの上端（ページ座標）。
     以前はフッター上端の罫線を下側の基準にしていたが、罫線を外したため、
     目に入る最初の要素（ロゴ）を基準にする。罫線はロゴより
     PC で 54px・スマホで 35px 上にあり、そのまま使うと下側が広く見える。 */
  function footInkTop(){
    var f=document.querySelector('.foot'); if(!f) return null;
    /* マークアップ上の見えないガイドがあれば、それを基準にする。
       位置が明示されるので、あとからガイドを動かすだけで調整できる。 */
    var guide=f.querySelector('.thread-guide');
    if(guide) return guide.getBoundingClientRect().top+camera;
    var m=1e9;
    try{
      f.querySelectorAll('*').forEach(function(e){
        var st=getComputedStyle(e);
        if(st.display==='none'||st.visibility==='hidden'||parseFloat(st.opacity)<0.05)return;
        var r=e.getBoundingClientRect();
        if(r.width<4||r.height<4)return;
        if(r.top<m) m=r.top;
      });
    }catch(e){}
    if(m>1e8) m=f.getBoundingClientRect().top;
    return m+camera;
  }
  function createRoute() {
    route=[];blueRoute=[];crossings=[];
    var firstY=-h*.10,lastY=d-h*.30,span=lastY-firstY;
    var lead=Math.min(heroHeight*.68,h*.68),maxKey=d-h;
    var ending=document.querySelector('.thread-ending');
    var knotY=ending?ending.getBoundingClientRect().top+camera+ending.getBoundingClientRect().height*.5:0;
    if(ending){
      /* 結び目は、本文の下端とフッター上端のちょうど中間に置く
         ＝結び目の上下の余白が等しくなる（定例 2026-10-07 の指示）。
         .thread-ending はその2つの間を占める余白なので、その中心が中間点。
         以前は画面中央に寄せようとして下へ押し下げており、
         上の余白 132px に対して下が 38px（スマホは 108px/35px）と偏っていた。
         念のため、フッターへ食い込まない上限だけ残す。 */
      var pageBtm=Math.max(document.documentElement.scrollHeight,h);
      /* 結び目の縦の半分の広がり＋余白。実測では結び目の高さは
         PC 110px(s=58) / スマホ 91px(s=46.8) で、半分はおよそ s*0.96。
         以前の s*1.3+18 は実態より大きく、「フッターに食い込まない」
         上限が対称位置より 19px 上へ押し上げてしまっていた。 */
      var knotR=Math.min(58,w*.12)*1.0+10;
      var footEl=document.querySelector('.foot');
      var footTop=footInkTop();
      if(footTop===null) footTop=footEl?footEl.getBoundingClientRect().top+camera:pageBtm;
      /* 基準は「実際に見えている最後のもの（本文の下線や地図）」と
         「フッター上端の罫線」。この2本の中間に置くと、結び目の上下の
         余白が目で見て等しくなる。.thread-ending の中心ではセクションの
         余白まで含んでしまい、PC で 35〜48px 下に寄っていた。 */
      var lastInk=lastInkBottom();
      /* 上側の基準は「本文で最後に見えているものの下端」。
         これとフッター上端の罫線の中間に置くと、結び目の上下の余白が
         目で見て等しくなる。
         ただし、最下部まで送った時点で結び目がヘッダーの裏に入って
         しまう場合（スマホのようにフッターが画面の大半を占める場合）は、
         見えている帯＝ヘッダー下端〜フッター罫線の中間へ切り替える。
         以前は「下線が画面外に出たら」という条件で切り替えていたため、
         結び目はヘッダーに届いていないのに切り替わり、ウィンドウの高さが
         900px 未満のとき上の余白が下の 2 倍以上になっていた。 */
      var navEl2=document.querySelector('.nav');
      var navH=navEl2?navEl2.getBoundingClientRect().height:0;
      var maxScr=Math.max(0,document.documentElement.scrollHeight-h);
      var headFloor=maxScr+navH;
      /* 結び目の中心として許される範囲（ヘッダーにもフッターにも食い込まない） */
      var lo=headFloor+knotR, hi=footTop-knotR;
      var symY=(lastInk===null)?null:((lastInk+footTop)/2);  /* 下線との対称位置 */
      var bandY=(headFloor+footTop)/2;                        /* 見えている帯の中央 */
      if(lo<=hi)
        knotY=(symY!==null&&symY>=lo&&symY<=hi)?symY:Math.max(lo,Math.min(hi,bandY));
      else
        knotY=bandY;   /* フッターが画面の大半を占めて入りきらない場合 */
      lastY=knotY-160;span=lastY-firstY;
      // Short interior pages must also finish tying before their real scroll limit.
      /* 結び終えたあと、青い紐が下端へ伸びるぶんのスクロールを必ず残す。
         .thread-ending はフッターの直前にあるため、結びを本来の
         「画面の38%の高さ」で終えると残りが 10px ほどしかなく、
         紐が一瞬で出きってしまう（しかも phase が少し遅れるだけで末尾が欠ける）。
         結びを少し手前で終わらせ、最後の .45 画面ぶんを垂れ下がりに充てる。
         ただし結び終えた瞬間に結び目が画面外へ出ないよう下限も置く。 */
      var maxScroll=Math.max(0,document.documentElement.scrollHeight-h);
      /* 結び終える時点で、結び目が画面のどの高さにいるか。
         .38 だと画面上部で結び終えてしまい、.92 まで下げると今度は
         画面の下端すれすれで結ばれる。指定は画面の中ほど。 */
      var finishAt=h*.56;
      /* 結び終えたあと、青い紐が下端へ伸びるぶんのスクロールは最低限残す。 */
      /* 青い紐が降りるスクロール量。.22 では最後の 5% に詰め込まれ、
         最下部に着いてから降りきるまで約2秒かかっていた。 */
      knotEnd=Math.max(0,Math.min(knotY-finishAt,maxScroll-h*.55));
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
    /* 短いページには 4*tipHold ぶんのスクロールが無く、解放しきる前に下端へ着く。
       そのぶん先端が最後まで先走り、下端に着く前に糸が出きってしまうので、
       ページ長に合わせて保持量を抑える（解放は .88 画面ぶん手前で完了）。 */
    tipHold=Math.min(tipHold,Math.max(0,(document.documentElement.scrollHeight-h)*.22));
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
    /* 青い紐は、結び目を結び終えてから下端へ垂れる。
       以前は下端（knotY+h*.7）を起点に結び目へ向かって描いていたため、
       結びが終わる前に下の紐が現れ、しかも宙の位置で切れて見えていた。
       向きを結び目側→下向きに反転し、区間も
       結び目（knotStart〜knotEnd）／垂れ下がり（knotEnd〜最終スクロール位置）
       の二段に分ける。垂れ下がりの終点はページ下端。 */
    function pt(x,y){var a=point(x,y);return {x:a[0],y:a[1]};}
    /* 終点はページの一番下。d は短いページで h*2 に膨らむため実寸を使う。 */
    var pageBottom=Math.max(document.documentElement.scrollHeight,h);
    var tailEnd=Math.max(knotY+s*2.2,pageBottom-1),dropX=cx+.12*s;
    var blueKnot=[pt(1.25,.5)];
    curve(blueKnot,point(.7,.95),point(-.1,.45),point(-.5,0));
    curve(blueKnot,point(-.9,-.45),point(0,-1.1),point(.5,-.9));
    curve(blueKnot,point(1,-.7),point(-.05,-.10),point(-.5,.55));
    var blueDrop=[pt(-.5,.55)];
    curve(blueDrop,point(-.95,1.2),[dropX,tailEnd-h*.24],[dropX,tailEnd]);
    function keys(list,start,end){
      var lengths=[0],length=0;
      for(var j=1;j<list.length;j++){length+=Math.hypot(list[j].x-list[j-1].x,list[j].y-list[j-1].y);lengths.push(length);}
      list.forEach(function(p,j){p.z=0;p.key=start+(end-start)*lengths[j]/length;});
    }
    keys(redTail,knotStart,knotEnd);
    keys(blueKnot,knotStart,knotEnd);
    /* 終端キーは d-h ではなく実際に到達できるスクロール量。
       1画面半しかないページでは d が h*2 に膨らみ、d-h が実スクロール量を
       超えるため、最後まで送っても紐が数十px 手前で止まっていた。 */
    keys(blueDrop,knotEnd,Math.max(knotEnd+1,maxScroll));
    route=route.concat(redTail.slice(1));
    blueTail=blueKnot.concat(blueDrop.slice(1));blueRoute=blueTail;
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
      /* 結び目は画面の中央で止める。経路全体を一律にずらすと結び目まで
         右へ寄るため、終端に向けてオフセットを 0 に戻す。戻し方は本線の
         中央復帰（exit）と同じカーブなので、形も接線も崩れない。
         結び目（redTail）と青い紐はずらさない＝常に中央。 */
      for(var k=0;k<=count&&k<route.length;k++){
        var tk=k/count, ek=Math.max(0,(tk-.88)/.12);
        route[k].x+=off*(1-easing(ek));
      }
    })();
  }
  var routeW=0,routeH=0,routeSH=0;
  function setDimensions(){
    w=window.innerWidth;h=window.innerHeight;d=Math.max(document.documentElement.scrollHeight,h*2);camera=window.scrollY;
    /* スマホは DPR=3 の端末が多い。2 で丸めると 2倍で描いた絵を 3倍へ
       引き伸ばすことになり、糸も半透明の帯の端も 1.5倍ぼける。
       スクロールのたびに端がにじんで動くため、揺れ・ちらつきに見える。
       狭い画面だけ等倍（最大3）で描く。1170×2532 ＝ 約12MB で収まる。 */
    ratio=Math.min(window.devicePixelRatio||1,w<768?3:2);
    slack=lockMode?Math.round(h*(w<768?.55:.3)):0;
    /* 文書内配置では、キャンバスがページ末尾より下へはみ出すとページ自体が
       伸びてしまい、経路の作り直しを呼んで無限に伸びる。
       キャンバス高がページ高を超えないよう余白を抑える。 */
    slack=Math.min(slack,Math.max(0,Math.floor((document.documentElement.scrollHeight-h)/2)));
    canvasH=h+slack*2;PAD=140+slack;
    canvas.width=Math.round(w*ratio);canvas.height=Math.round(canvasH*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
    if(lockMode){
      canvas.style.position='absolute';
      canvas.style.left='0';canvas.style.width='100%';
      canvas.style.bottom='auto';canvas.style.right='auto';  /* CSS の inset:0 を打ち消す */
      canvas.style.height=canvasH+'px';
    }
    var hero=document.querySelector(isHome?'.home-hero':'.page-hero');
    heroHeight=hero?hero.getBoundingClientRect().bottom+camera:Math.min(h,600);
    /* スマホはスクロール中に URL バーが伸縮し、そのたびに resize が飛んで
       innerHeight が数十px 変わる。経路は innerHeight から組み立てているため、
       作り直すと糸の形そのものが変わり、スクロールのたびに揺れて見えていた。
       幅が変わったとき・ページの高さが変わったとき・画面の高さが大きく
       変わったときだけ作り直す。URL バーぶん（〜140px）では作り直さない。 */
    var sh=document.documentElement.scrollHeight;
    if(!route.length||w!==routeW||sh!==routeSH||Math.abs(h-routeH)>140){
      routeW=w;routeH=h;routeSH=sh;createRoute();
    }
    target=clamp(camera,0,d-h);
    if(!ready){phase=target;ready=true;}schedule();
  }
  function partialPath(source){
    source=source||route;
    var key=drawKey(), list=[];
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
    /* 糸の伸び始め。元は p>.28（約670ms）からで、ベールが晴れきる 750ms より
       後れていたため、画面が見えているのに糸が一本も無い時間が約400ms でき、
       そこから急に現れていた（狭い画面ほど目立つ）。
       ベールが晴れる時点で既に伸び始めているよう前倒しする。 */
    var p=entranceProgress,q=easing((p-.12)/.80),middle=0;
    function at(t){var n=clamp(t,0,1)*(path.length-1),i=Math.floor(n),a=path[i],b=path[Math.min(i+1,path.length-1)],f=n-i;return {x:a.x+(b.x-a.x)*f+drag,y:a.y+(b.y-a.y)*f-origin};}
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
      for(var i=Math.floor(lo*(path.length-1))+1;i<=Math.floor(hi*(path.length-1));i++)ctx.lineTo(path[i].x+drag,path[i].y-origin);
      var b=at(hi);ctx.lineTo(b.x,b.y);ctx.stroke();
    }
    ctx.globalAlpha=1;
  }

  /* 文字に糸を重ねない。paint の最後に、文字の行ボックス位置の糸を消す。
     destination-out で「消す」ので白い矩形を置かない＝背景を汚さない。
     行ボックスは文字幅にぴったり沿うため、ブロック要素の背景のように
     余白まで巻き込むことがない。縦は行送りぶんを少し内側に詰める。 */
  /* マスクはページ座標で持ち、描くときに現在のスクロール量を引く。
     ビューポート座標でキャッシュしていたときは、スクロール 2px 以内なら
     使い回していたため半透明の帯が文字から最大 2px ずれ、キャッシュ更新の
     たびに戻る＝小刻みにスクロールすると揺れて見えていた。
     ヘッダー（sticky）だけは画面に固定なのでビューポート座標のまま。
     画面外の判定も、キャッシュ中に下から入ってくる文字を取りこぼさないよう
     上下に余裕を持たせる。 */
  function scrollNow(){ return window.scrollY||window.pageYOffset||0; }
  var PAD=140;
  var _tcache=null,_tat=0,_ty=-1;
  function textRects(){
    var now=(window.performance&&performance.now())?performance.now():Date.now();
    var sy=camera;   /* 基準は camera に統一。frame で毎回読み直している */
    if(_tcache&&now-_tat<60) return _tcache;
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
        if(b.bottom<-PAD||b.top>vh+PAD||b.right<-4||b.left>vw+4) continue;
        var inset=b.height*0.10, hd=!!pe.closest('.nav,.menu');
        out.push([b.left-1.5,b.top+inset-1+(hd?0:sy),b.width+3,b.height-inset*2+2, hd]);
      }
    }
    /* ロゴは画像なので文字走査に乗らない。マスクは clearOverText 側で
       ロゴ画像そのものを destination-out で描いて字形どおりに抜く。
       以前は「nee」の範囲だけを矩形で抜いていたが、これは糸をロゴから
       出す旧案のためのもの。案が廃止された今は、それ以外の場所を糸が
       通るときにロゴの上へ全面で出てしまう（実測 320px で全スクロール位置の
       58%、最大 44px）。矩形でロゴ全体を抜くと字間の余白まで巻き込むため、
       画像のアルファをそのままマスクに使う。 */
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
    var sy=camera;   /* 基準は camera に統一。frame で毎回読み直している */
    if(_lcache&&now-_lat<60) return _lcache;
    var out=[],vw=innerWidth,vh=innerHeight;
    var all=document.querySelectorAll('main *, footer *');
    for(var i=0;i<all.length;i++){
      var e=all[i];
      if(e.closest('.nav,.menu,.skip,.thread-toggle')) continue;
      var cs=getComputedStyle(e);
      if(cs.visibility==='hidden'||cs.display==='none') continue;
      var b=e.getBoundingClientRect();
      if(b.width<4||b.height<4) continue;
      if(b.bottom<-PAD||b.top>vh+PAD||b.right<-8||b.left>vw+8) continue;
      var hd=!!e.closest('.nav,.menu'), oy=hd?0:sy;
      var tw2=parseFloat(cs.borderTopWidth)||0, bw=parseFloat(cs.borderBottomWidth)||0;
      var lw=parseFloat(cs.borderLeftWidth)||0, rw=parseFloat(cs.borderRightWidth)||0;
      var trans=function(c){var m=String(c).match(/[\d.]+/g);return !m||(m.length>3&&+m[3]<0.02);};
      var radius=parseFloat(cs.borderTopLeftRadius)||0;
      var isCircle = (cs.borderTopLeftRadius.indexOf('%')>=0 || radius>=Math.min(b.width,b.height)/2-2)
                     && tw2>0 && !trans(cs.borderTopColor);
      if(isCircle){
        out.push(['e', b.left+b.width/2, b.top+b.height/2+oy, b.width/2-tw2/2, b.height/2-tw2/2, tw2+1.5, hd]);
        continue;
      }
      if(tw2>0&&!trans(cs.borderTopColor))    out.push(['r', b.left, b.top-0.75+oy, b.width, tw2+1.5, hd]);
      if(bw>0&&!trans(cs.borderBottomColor))  out.push(['r', b.left, b.bottom-bw-0.75+oy, b.width, bw+1.5, hd]);
      if(lw>0&&!trans(cs.borderLeftColor))    out.push(['r', b.left-0.75, b.top+oy, lw+1.5, b.height, hd]);
      if(rw>0&&!trans(cs.borderRightColor))   out.push(['r', b.right-rw-0.75, b.top+oy, rw+1.5, b.height, hd]);
    }
    _lcache=out;_lat=now;_ly=sy;
    return out;
  }

  /* 面で塗るUI部品（ボタン・入力欄）は糸を完全に切る。糸を前面に置くため
     CSSの背景では隠せないので、canvas 側で不透明に消す。 */
  var _ucache=null,_uat=0,_uy=-1;
  function uiRects(){
    var now=(window.performance&&performance.now())?performance.now():Date.now();
    var sy=camera;   /* 基準は camera に統一。frame で毎回読み直している */
    if(_ucache&&now-_uat<60) return _ucache;
    var out=[],vw=innerWidth,vh=innerHeight;
    var els=document.querySelectorAll('.btn, .form__field input, .form__field textarea, .form__field select, .menu, iframe');
    for(var i=0;i<els.length;i++){
      var e=els[i];
      if(e.type==='checkbox') continue;
      var cs=getComputedStyle(e);
      if(cs.visibility==='hidden'||cs.display==='none') continue;
      var b=e.getBoundingClientRect();
      if(b.width<4||b.height<4) continue;
      if(b.bottom<-PAD||b.top>vh+PAD||b.right<-4||b.left>vw+4) continue;
      var uh=!!e.closest('.nav,.menu');
      out.push([b.left,b.top+(uh?0:sy),b.width,b.height, uh]);
    }
    _ucache=out;_uat=now;_uy=sy;
    return out;
  }

  var logoImg=null;
  function clearOverText(){
    try{
      if(!logoImg) logoImg=document.querySelector('.nav__logo img');
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

      /* ページ座標で持っている本文側のマスクは、描く瞬間のスクロール量を引く。
         こうするとキャッシュが何フレーム前のものでも文字と正確に重なるため、
         半透明の帯が揺れない。ヘッダー側は画面固定なので引かない。 */
      function drawSet(header){
        /* 本文はページ座標なので原点を引く。ヘッダーは画面固定なので
           画面座標のまま、キャンバス原点ぶんだけずらす。 */
        var dy=header?headOff:-origin;
        ctx.globalAlpha=1; ctx.fillStyle='#000';
        for(var k=0;k<U.length;k++) if(!!U[k][4]===header) ctx.fillRect(U[k][0],U[k][1]+dy,U[k][2],U[k][3]);
        if(a<=0&&la<=0) return;
        ctx.globalAlpha=a; ctx.fillStyle='#000';
        for(var i2=0;i2<r.length;i2++) if(!!r[i2][4]===header) ctx.fillRect(r[i2][0],r[i2][1]+dy,r[i2][2],r[i2][3]);
        /* 帯の上下端を半分の濃さでなじませる。端が硬い矩形のままだと、
           サブピクセルで動いたときに境界線が這うように見える。 */
        ctx.globalAlpha=a*.5;
        for(var i3=0;i3<r.length;i3++){
          var q3=r[i3]; if(!!q3[4]!==header) continue;
          ctx.fillRect(q3[0],q3[1]+dy-.75,q3[2],.75);
          ctx.fillRect(q3[0],q3[1]+dy+q3[3],q3[2],.75);
        }
        /* ロゴは字形どおりに、少し太らせて完全に抜く。
           社名ロゴなので本文より強く（不透明に）抜き、字形から 1.5px の
           余白をとることで、糸が字画に触れず意図した処理に見える。 */
        if(header&&logoImg&&logoImg.complete&&logoImg.naturalWidth){
          var lb2=logoImg.getBoundingClientRect();
          if(lb2.width>0&&lb2.bottom>-4&&lb2.top<h+4){
            ctx.globalAlpha=1;
            var o=1.5,d2=o*0.72;
            var off=[[0,0],[o,0],[-o,0],[0,o],[0,-o],[d2,d2],[d2,-d2],[-d2,d2],[-d2,-d2]];
            try{ for(var q=0;q<off.length;q++)
                   ctx.drawImage(logoImg,lb2.left+off[q][0],lb2.top+dy+off[q][1],lb2.width,lb2.height); }
            catch(e){ ctx.fillStyle='#000'; ctx.fillRect(lb2.left,lb2.top+dy,lb2.width,lb2.height); }
          }
        }
        ctx.globalAlpha=la;
        for(var j2=0;j2<L.length;j2++){
          var q=L[j2]; if(!!q[q.length-1]!==header) continue;
          if(q[0]==='r'){ ctx.fillRect(q[1],q[2]+dy,q[3],q[4]); }
          else{
            ctx.beginPath();
            ctx.ellipse(q[1],q[2]+dy,Math.max(0,q[3]),Math.max(0,q[4]),0,0,Math.PI*2);
            ctx.lineWidth=q[5]; ctx.strokeStyle='#000'; ctx.stroke();
          }
        }
      }

      ctx.globalCompositeOperation='destination-out';
      drawSet(true);
      ctx.save();
      ctx.beginPath(); ctx.rect(0,navBottom+headOff,w,Math.max(0,canvasH-navBottom-headOff)); ctx.clip();
      drawSet(false);
      ctx.restore();
      ctx.globalAlpha=ga;
      ctx.globalCompositeOperation=op;
    }catch(e){}
  }
  function paint(){
    var path=partialPath();ctx.clearRect(0,0,w,canvasH);
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
        if(Math.max(a.y,b.y)<origin-60||Math.min(a.y,b.y)>origin+canvasH+60){started=false;continue;}
        if(!started){ctx.moveTo(a.x+drag,a.y-origin);started=true;}
        ctx.lineTo(b.x+drag,b.y-origin);
      }
      ctx.stroke();
    }
    stroke(path,'#AF3E47',width);
    var blue=partialPath(blueRoute);
    stroke(blue,'#fff',width+halo);stroke(blue,'#536F91',width);
    var key=drawKey();
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
  /* ページ高が後から変わると、経路の終端（＝青い紐が垂れる先のページ下端）が
     古いままになり、紐がページ下端まで届かず途中で切れる。
     マスクを捨てるだけでなく、高さが変わったときは経路ごと作り直す。 */
  function relayout(ms){
    var nd=Math.max(document.documentElement.scrollHeight,h*2);
    if(h&&Math.abs(nd-d)>=1) setDimensions();
    nudge(ms||400);
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
    var ro=new ResizeObserver(function(){ relayout(400); });
    try{ ro.observe(document.body); }catch(e){}
    var mainEl=document.querySelector('main'); if(mainEl){ try{ ro.observe(mainEl); }catch(e){} }
  }
  window.addEventListener('load', function(){ relayout(1200); });
  document.addEventListener('load', function(ev){
    if(ev.target&&/^(IMG|IFRAME|VIDEO)$/.test(ev.target.tagName)) relayout(600);
  }, true);
  /* 念のための保険: 読み込み直後の数秒は、ページ高の変化を定期的に見張る */
  (function(){
    var lastH=document.documentElement.scrollHeight, n=0;
    var iv=setInterval(function(){
      var hh=document.documentElement.scrollHeight;
      if(hh!==lastH){ lastH=hh; relayout(400); }
      if(++n>20) clearInterval(iv);
    },400);
  })();
  function frame(now){
    frameId=null;var dt=lastTime?Math.min(40,now-lastTime):16;lastTime=now;
    /* スクロール位置は描画する瞬間に読み直す。scroll イベント任せだと、
       イベントが rAF より遅れるモバイルで、糸（camera 基準）とマスク
       （文字基準）が食い違い、半透明の帯だけが糸の上を滑って揺れて見えた。
       以降 camera は paint と clearOverText の両方が使う唯一の基準になる。 */
    if(!entering()){ camera=scrollNow(); target=clamp(camera,0,d-h); }
    /* 描画の原点。lock では文書内のキャンバス位置、既定では camera。
       top の更新と描画は同じタスク内なので必ず同じフレームで反映される。 */
    if(lockMode){
      var topMax=Math.max(0,document.documentElement.scrollHeight-canvasH);
      origin=Math.max(0,Math.min(camera-slack,topMax));
      canvas.style.top=origin+'px';
    }else origin=camera;
    headOff=camera-origin;   /* ヘッダー（画面固定）側の描画オフセット */
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
      var tau=(knotEnd>knotStart&&phase>=knotStart&&phase<knotEnd)?300:95;/* 結びの区間だけ追従を遅くする。降下は通常の速さ */phase+=(target-phase)*(1-Math.exp(-dt/tau));
      if(Math.abs(target-phase)<.15)phase=target;
    }
    /* 引きずり: スクロール速度に追いつくのは速く、戻るのはゆっくり。 */
    if(dragOn&&!paused){
      /* 1フレームのスクロール量をそのまま使うと、慣性スクロール中の速度の
         ばらつきとフレーム間隔のゆらぎを拾って小刻みに揺れる。
         速度を平滑化してから使う。 */
      var raw=(camera-prevCam)/Math.max(1,dt)*16; prevCam=camera;
      vel+=(raw-vel)*(1-Math.exp(-dt/120));
      var want=clamp(vel*DRAG_GAIN,-DRAG_MAX,DRAG_MAX);
      drag+=(want-drag)*(1-Math.exp(-dt/(Math.abs(want)>Math.abs(drag)?70:220)));
      if(Math.abs(drag)<.05)drag=0;
    }else{ drag=0; vel=0; prevCam=camera; }
    paint();
    if(!paused&&(entering()||Math.abs(target-phase)>.15||Math.abs(drag)>.05||now<maskUntil))schedule();else lastTime=0;
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
