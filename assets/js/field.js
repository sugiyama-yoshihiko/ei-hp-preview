/* =============================================================================
   field.js — the 縁 motif
   -----------------------------------------------------------------------------
   A fixed, full-viewport canvas holding a chain of interlocked rings made of
   points — 縁 — that condenses into being on load and gains links as the page
   is read.

   It sits above each section's background and below its copy, and reads the
   sections' colours so a point changes colour the instant it crosses a
   section edge. It paints nothing but points: the grounds belong to CSS, so
   that a slow or failed frame here can never leave the page unpainted.
   ============================================================================= */

(function () {
  'use strict';

  var cv = document.querySelector('canvas.field');
  if (!cv) return;
  var ctx = cv.getContext('2d', { alpha: true });
  if (!ctx) return;

  var reduced = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- geometry */

  var R        = 1.00;   // ring radius
  var TR       = 0.31;   // tube radius
  var LINK     = 1.52;   // centre-to-centre along X; < 2R, so links interlock
  var CHAIN_MAX = 4;
  /* Many small points rather than fewer large ones: the ring should read as a
     fine mist that happens to hold a shape, not as a scatter of dots. */
  var PER_RING = 2400;   // lattice points per ring
  var DUST     = 1000;
  var CAM      = 4.6;    // camera distance, in ring radii
  var NEAR     = 2.6;    // near clip; see the note where f is computed

  /* How far the chain actually reaches from its centre, in screen units per
     unit of scale, indexed by link count — the worst case over a full turn.
     The fit used to use the chain's flat span times a hand-set 1.18 as
     headroom for perspective, which is wrong twice over: the tube adds to the
     silhouette as the chain turns, and the near edge magnifies by up to ~1.4.
     On a phone the two compounded and put the ring's edge at x≈396 on a 375px
     screen. These are measured off the real particles instead, once, at boot.
     See measureExtents(). */
  var EXT_X = [], EXT_Y = [];

  /* Entry: particles arrive from a scattered cloud and settle onto the ring.
     Slow on purpose — this was tuned down twice; fast reads as "slid into
     place" rather than "formed". */
  var FORM_DUR    = 3600;
  var FORM_LAG    = 1000;
  var FORM_STAG   = 0.58;
  var FORM_SPREAD = 1.7;

  /* Cursor: particles are drawn *toward* the pointer and gather on a small
     ring around it. Attraction, not repulsion — the motif is about ties.

     Hold still and the gathering tightens and brightens: a ring is being made
     under your hand. Move, and it lets go. The rule is not stated anywhere,
     which is the point — you find it.

     The pointer the field follows is NOT the real one. It eases toward it over
     PTR_TAU, and no single point is ever displaced further than MAX_PULL.
     Without both of those the field answered every twitch of the mouse at full
     strength and read as nervous rather than as weight. */
  var LINK_R    = 130;
  var CURSOR_R  = 22;
  var LINK_AMT  = 0.62;   // was 0.92 — the cap below now carries the near field
  var MAX_PULL  = 26;     // px; hard ceiling on one point's displacement
  var PTR_TAU   = 190;    // ms the followed pointer lags the real one
  var GRIP_TAU  = 220;    // ms the hold fades in on enter and out on leave
  var CHARGE_MS = 620;    // stillness needed for a full charge
  var TILT_X    = 0.38;   // rad across the full width  (≈22°, was 66°)
  var TILT_Y    = 0.30;   // rad across the full height (≈17°, was 52°)
  var CHARGE_TIGHTEN = 0.46;   // how far the ring closes in
  var CHARGE_GLOW    = 1.70;   // how much brighter the caught points get

  /* ------------------------------------------------------------------ colour */

  /* On a dark ground the points are drawn additively, so where the ring is
     dense they accumulate into light instead of just stacking opacity —
     that is where the glow comes from. On paper the dots are dark, and
     adding dark to a light ground would erase them, so that world composites
     normally. Boosts are much lower than they were: additive accumulation
     does the work that per-point alpha used to. */
  var WORLDS = {};
  function readWorlds() {
    var cs = getComputedStyle(document.documentElement);
    [['paper', 1.55, false], ['deep', 2.20, true],
     ['wine', 2.00, true], ['ink', 2.20, true]]
      .forEach(function (w) {
        var name = w[0];
        WORLDS[name] = {
          dot:    (cs.getPropertyValue('--' + name + '-dot') || '23,15,18').trim(),
          boost:  w[1],
          add:    w[2]
        };
      });
  }

  /* ------------------------------------------------------------------- bands */
  /* One entry per [data-world] element, in document order, measured in
     viewport pixels. Recomputed on scroll and resize — cheap, and correct
     through sticky headers, lazy images and font swaps alike. */

  var bandEls = [];
  var bands = [];

  /* [data-world-ui] marks chrome (the header, the rail) that only wants the
     world's *variables* for its own colour — it is not a panel to paint. */
  function collectBands() {
    bandEls = [].slice.call(document.querySelectorAll('[data-world]:not([data-world-ui])'));
  }

  function measureBands() {
    bands.length = 0;
    for (var i = 0; i < bandEls.length; i++) {
      var r = bandEls[i].getBoundingClientRect();
      if (r.bottom < -40 || r.top > H + 40) continue;
      var name = bandEls[i].getAttribute('data-world');
      var w = WORLDS[name] || WORLDS.paper;
      /* Sections that exist to be read say so, and the field goes quiet over
         them. See QUIET. */
      var q = bandEls[i].getAttribute('data-field') === 'quiet';
      bands.push({ top: r.top, bottom: r.bottom, w: w, quiet: q });
    }
  }

  function bandAt(y) {
    for (var i = 0; i < bands.length; i++) {
      if (y >= bands[i].top && y < bands[i].bottom) return bands[i];
    }
    return null;
  }

  /* --------------------------------------------------------------- particles */

  var N = CHAIN_MAX * PER_RING + DUST;
  var px = new Float32Array(N);   // settled position
  var py = new Float32Array(N);
  var pz = new Float32Array(N);
  var ox_ = new Float32Array(N);  // scattered origin
  var oy_ = new Float32Array(N);
  var oz_ = new Float32Array(N);
  var pr  = new Float32Array(N);  // size 0..1
  var pl  = new Int16Array(N);    // which link, or -1 for dust
  var pt  = new Float32Array(N);  // birth offset 0..1

  function build() {
    var i = 0, k, u, v, cu, su, cv2, sv, cx, x, y, z;
    for (k = 0; k < CHAIN_MAX; k++) {
      var odd = (k % 2) === 0;              // odd links lie in XY, even in XZ
      cx = k * LINK;
      for (var j = 0; j < PER_RING; j++, i++) {
        u = Math.random() * Math.PI * 2;
        v = Math.random() * Math.PI * 2;
        cu = Math.cos(u); su = Math.sin(u);
        cv2 = Math.cos(v); sv = Math.sin(v);
        if (odd) {
          x = (R + TR * cv2) * cu;
          y = (R + TR * cv2) * su;
          z = TR * sv;
        } else {
          x = (R + TR * cv2) * cu;
          z = (R + TR * cv2) * su;
          y = TR * sv;
        }
        px[i] = x + cx; py[i] = y; pz[i] = z;
        pr[i] = 0.34 + Math.random() * 0.50;
        pl[i] = k;
        pt[i] = Math.random();
        scatter(i);
      }
    }
    for (; i < N; i++) {                    // dust: a loose haze around it all
      var a = Math.random() * Math.PI * 2;
      var rad = 1.5 + Math.random() * 3.4;
      px[i] = Math.cos(a) * rad + (CHAIN_MAX - 1) * LINK * 0.5;
      py[i] = (Math.random() - 0.5) * 3.0;
      pz[i] = Math.sin(a) * rad * 0.7;
      pr[i] = 0.26 + Math.random() * 0.34;
      pl[i] = -1;
      pt[i] = Math.random();
      scatter(i);
    }
  }

  function scatter(i) {
    var a = Math.random() * Math.PI * 2;
    var b = Math.acos(2 * Math.random() - 1);
    var d = FORM_SPREAD * (0.6 + Math.random() * 1.5);
    ox_[i] = px[i] + Math.sin(b) * Math.cos(a) * d;
    oy_[i] = py[i] + Math.sin(b) * Math.sin(a) * d;
    oz_[i] = pz[i] + Math.cos(b) * d;
  }

  build();

  /* The silhouette of a settled chain of L links, swept over every rotation
     the idle turn passes through, sampled off the particles themselves. Every
     fourth point is enough: neighbours on a 2,400-point torus differ by far
     less than the pixel this feeds. Runs once, in about ten milliseconds. */
  function measureExtents() {
    var RY_STEPS = 48;
    var RX_LIST = [0.245, 0.30, 0.355];   // the idle nod, at its extremes
    for (var L = 1; L <= CHAIN_MAX; L++) {
      var offX = (L - 1) * LINK * 0.5;
      var mx = 0, my = 0;
      for (var a = 0; a < RY_STEPS; a++) {
        var ry = a / RY_STEPS * Math.PI * 2;
        var cry = Math.cos(ry), sry = Math.sin(ry);
        for (var b = 0; b < RX_LIST.length; b++) {
          var crx = Math.cos(RX_LIST[b]), srx = Math.sin(RX_LIST[b]);
          for (var i = 0; i < L * PER_RING; i += 4) {
            var x = px[i] - offX, y = py[i], z = pz[i];
            var x1 = x * cry + z * sry;
            var z1 = -x * sry + z * cry;
            var y1 = y * crx - z1 * srx;
            var z2 = y * srx + z1 * crx;
            if (z2 > NEAR) continue;
            var f = CAM / (CAM - z2);
            if (f <= 0.05) continue;
            var ax = Math.abs(x1 * f); if (ax > mx) mx = ax;
            var ay = Math.abs(y1 * f); if (ay > my) my = ay;
          }
        }
      }
      EXT_X[L] = mx;
      EXT_Y[L] = my;
    }
  }

  measureExtents();

  /* ------------------------------------------------------------------ canvas */

  var W = 0, H = 0, dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width  = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    measureBands();
    /* Assigning width/height clears the canvas, so a resize would otherwise
       show one unpainted frame the same way a navigation did. */
    if (running) render(performance.now());
  }

  /* ------------------------------------------------------------------- state */

  var started = 0;            // timestamp the entry animation may begin
  var running = false;
  var ptrRX = -1e4, ptrRY = -1e4;      // where the pointer actually is
  var ptrX  = -1e4, ptrY  = -1e4;      // where the field believes it is
  var ptrGrip = 0, hasPtr = false;
  var lastNow = 0;
  var tiltX = 0, tiltY = 0, tiltTX = 0, tiltTY = 0;
  var pulse = 0, lastLinks = 2;
  var charge = 0, lastMove = 0;
  var lastRing = null;
  var lockRY = null, lockRX = null;   // test-only rotation pins; see render()
  var fitL = 0;                       // eased chain length the fit follows
  var FIT_TAU = 420;                  // ms for the camera to finish pulling back

  function smooth(a, b, x) {
    if (b === a) return x < a ? 0 : 1;
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  }

  /* -------------------------------------------------------------------- draw */

  /* Alpha is quantised into buckets so the whole field is drawn in a few dozen
     fillStyle changes rather than one per particle. */
  var STEPS = 12;

  /* Depth of field. Only a slice of the chain near the focal plane is sharp;
     everything in front of and behind it spreads and dims, which is what
     stops the ring reading as one flat outline you can take in at a glance. */
  var FOCUS_K   = 0.55;   // how fast sharpness falls off with depth
  var FOCUS_MAX = 1.70;   // cap, so the nearest points stay a shape not a smear
  var BLUR_SIZE = 1.10;   // how much out-of-focus points spread
  var BLUR_DIM  = 1.70;   // how much they dim as they spread
  var FOG_BACK  = 0.45;   // extra fade on the far side of the chain
  var FADE_BASE = 0.80;   // light at the top of the page
  var FADE_DROP = 0.62;   // how much of it is given up to the copy on scroll

  /* What is left of a point's light over a section marked data-field="quiet".
     Fading on scroll alone was not enough: the chain gains links as the page
     is read, so by the time the reader reaches the prose there are more
     points on screen at a lower alpha than there were behind the headline,
     and measured coverage over the body copy came out three times what it
     was over the hero. The scroll fade sets the overall level; this is what
     makes the difference between a section that is the field's subject and
     one that merely has the field behind it. */
  var QUIET = 0.34;
  var DUST_FOCUS = 0.40;  // the ambient haze is diffuse already; defocusing it
                          // as hard as the ring just empties the frame

  /* Points are discs, not squares. A disc of side s covers π/4 of the area the
     square did, so the side is opened up by 1/√(π/4) to keep the field's total
     light where it was tuned. */
  var TAU     = Math.PI * 2;
  var ROUND_K = 1.128;

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    render(now);
  }

  function render(now) {
    /* Frame time, clamped so a stalled tab does not resume with one enormous
       step that teleports the pointer and snaps the whole field. Everything
       eased below is framed in milliseconds against this rather than in
       per-frame fractions, so the feel does not change with the refresh rate.
       Read before anything uses it: both the fit and the pointer do. */
    var dt = lastNow ? Math.min(now - lastNow, 64) : 16.7;
    lastNow = now;

    measureBands();
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);

    /* The grounds are painted by CSS now (see [data-world] in ei.css); the
       bands are still measured because they decide each point's colour, so a
       point still changes colour the instant it crosses a section edge. */
    var sy0 = window.pageYOffset || document.documentElement.scrollTop || 0;
    var p = sy0 / Math.max(H, 1);

    var links = 2 + smooth(0.45, 1.30, p) + smooth(1.55, 2.45, p);
    var doneLinks = Math.floor(links + 0.01);
    if (doneLinks > lastLinks) { pulse = 1; lastLinks = doneLinks; }
    else if (doneLinks < lastLinks) { lastLinks = doneLinks; }
    pulse *= 0.955;

    /* Lower than it looks: with ~7,000 points on screen the mist reads at a
       much lower per-point alpha, and the headline sitting inside the ring
       has to stay the first thing you see. */
    var fade = FADE_BASE - FADE_DROP * smooth(0.05, 1.20, p);
    fade *= 1 + pulse * 2.4;

    /* The chain is scaled to fit the viewport at its *current* length, so
       adding a link reads as the camera pulling back rather than the chain
       walking off the edge of the screen.

       fillW and fillH are now literal: the fraction of the viewport the chain
       is allowed to span, measured to its true silhouette. On desktop it is
       meant to bleed past the edges — the copy sits inside the ring and the
       ring is the backdrop — so those stay above 1. A phone has no room for
       that, so there it stays inside the screen with a margin. */
    /* The chain is fitted to the links that are *there*, not to the fractional
       scroll value. A link begins condensing the moment `links` passes the
       integer below it, and most of its points are settled long before `links`
       reaches the next one — so fitting to the fraction left the finished
       chain scaled for a shorter one, and parking the scroll mid-transition
       parked that overflow permanently. Fitting to the ceiling instead, and
       easing toward it on a clock, makes the camera pull back once, smoothly,
       and leaves the resting state always correct. */
    var Lfit = Math.ceil(links - 1e-4);
    if (Lfit < 1) Lfit = 1;
    if (Lfit > CHAIN_MAX) Lfit = CHAIN_MAX;
    if (!fitL) fitL = Lfit;
    fitL += (Lfit - fitL) * (1 - Math.exp(-dt / FIT_TAU));

    var li = Math.floor(fitL); if (li < 1) li = 1;
    if (li > CHAIN_MAX) li = CHAIN_MAX;
    var ln = li + 1 > CHAIN_MAX ? CHAIN_MAX : li + 1;
    var lf = fitL - li; if (lf < 0) lf = 0; if (lf > 1) lf = 1;
    var extX = EXT_X[li] + (EXT_X[ln] - EXT_X[li]) * lf;
    var extY = EXT_Y[li] + (EXT_Y[ln] - EXT_Y[li]) * lf;

    var sub = document.body.getAttribute('data-page') !== 'home';
    var mob = W < 744;
    var fillW, fillH, cx0, cy0;
    /* Desktop and the sub-page corner are calibrated to land on exactly the
       size they had before the fit was corrected — the bleed there was wanted.
       The phone is the one that changes: fillW is now literally how much of
       the width the chain may take, so 0.92 leaves 4% clear on each side at
       every link count, which is what it never had. */
    if (sub)      { fillW = 0.528; fillH = 0.698; cx0 = W * 0.72; cy0 = H * 0.34; fade *= 0.52; }
    else if (mob) { fillW = 0.920; fillH = 0.620; cx0 = W * 0.50; cy0 = H * 0.60; }
    else          { fillW = 0.895; fillH = 1.111; cx0 = W * 0.56; cy0 = H * 0.50; }
    var scale = Math.min(W * fillW / (2 * extX), H * fillH / (2 * extY));
    cy0 -= Math.min(p, 1.0) * H * 0.09;

    /* Entry progress, counted from the moment the field came up. */
    var elapsed = started ? (now - started) : 0;

    /* The followed pointer trails the real one, and the grip fades rather than
       switching, so leaving the window releases the points instead of dropping
       them all at once. Both are framed in milliseconds, not in per-frame
       fractions, so the feel does not change with the refresh rate. */
    if (hasPtr) {
      var kp = 1 - Math.exp(-dt / PTR_TAU);
      ptrX += (ptrRX - ptrX) * kp;
      ptrY += (ptrRY - ptrY) * kp;
    }
    ptrGrip += ((hasPtr ? 1 : 0) - ptrGrip) * (1 - Math.exp(-dt / GRIP_TAU));
    var gripping = ptrGrip > 0.004;

    /* Cursor charge: eases toward 1 while the pointer holds still. */
    var still = hasPtr ? Math.min((now - lastMove) / CHARGE_MS, 1) : 0;
    charge += (still - charge) * (still > charge ? 0.045 : 0.16);
    var capR = CURSOR_R * (1 - charge * CHARGE_TIGHTEN);
    var capAmt = Math.min(LINK_AMT * (1 + charge * 0.5), 1) * ptrGrip;
    var capLim = MAX_PULL * (1 + charge * 0.8);

    /* Slow idle rotation plus the cursor tilt. */
    tiltX += (tiltTX - tiltX) * 0.055;
    tiltY += (tiltTY - tiltY) * 0.055;
    /* The idle turn is driven by the wall clock, so the only way to inspect a
       chosen angle — checking the chain clears the viewport at *every* angle,
       not just the one on screen — is to pin it. Null in normal running. */
    var ry = (lockRY === null) ? now * 0.000085 + tiltY * 0.5 : lockRY;
    var rx = (lockRX === null)
      ? 0.30 + tiltX * 0.34 + Math.sin(now * 0.00016) * 0.055
      : lockRX;

    var cry = Math.cos(ry), sry = Math.sin(ry);
    var crx = Math.cos(rx), srx = Math.sin(rx);

    /* Re-centre: the chain grows to the +X side, so shift it back by half.
       Tied to the same eased length as the fit, so the chain never sits
       off-centre from the box it was scaled into. */
    var offX = (fitL - 1) * LINK * 0.5;

    var buckets = {};

    /* Where the chain itself (not the haze around it) actually landed this
       frame, recorded before the off-screen cull. This is the only honest way
       to tell "the ring is bleeding off the side" from "the haze is", which
       the pixels alone cannot distinguish. Read it back via eiField.ring(). */
    var ringL = 1e9, ringR = -1e9, ringT = 1e9, ringB = -1e9;

    for (var i2 = 0; i2 < N; i2++) {
      var link = pl[i2];

      /* born — the opening condensation, on a clock */
      var born = 1;
      if (elapsed < FORM_DUR + FORM_LAG) {
        born = (elapsed - pt[i2] * FORM_LAG * FORM_STAG - link * 90) / FORM_DUR;
        born = born < 0 ? 0 : born > 1 ? 1 : born;
        born = born * born * (3 - 2 * born);
      }

      /* arrive — the same condensation, but on the scroll position. A link
         being added gathers out of the cloud exactly the way the first two
         did on load, instead of fading in as a finished ring. The per-particle
         offset staggers the gathering so it reads as dust converging. */
      if (link >= 0) {
        var arrive = (links - link - pt[i2] * 0.42) / 0.58;
        if (arrive <= 0) continue;
        if (arrive < 1) {
          arrive = arrive * arrive * (3 - 2 * arrive);
          if (arrive < born) born = arrive;
        }
      }
      if (born <= 0) continue;

      var x = px[i2] + (ox_[i2] - px[i2]) * (1 - born) - offX;
      var y = py[i2] + (oy_[i2] - py[i2]) * (1 - born);
      var z = pz[i2] + (oz_[i2] - pz[i2]) * (1 - born);

      /* rotate Y then X */
      var x1 = x * cry + z * sry;
      var z1 = -x * sry + z * cry;
      var y1 = y * crx - z1 * srx;
      var z2 = y * srx + z1 * crx;

      /* Near plane. Without it a point that drifts close to the camera makes
         CAM - z2 approach zero, f explodes, and the point lands as a huge
         bright square in the middle of the frame. The haze reaches far enough
         out that a few points do get there at some rotations. */
      if (z2 > NEAR) continue;
      var f = CAM / (CAM - z2);
      if (f <= 0.05) continue;

      var sx = cx0 + x1 * scale * f;
      var sy = cy0 - y1 * scale * f;

      /* Settled chain points only. A point still condensing is by design out
         where the cloud was, so counting those would report the gathering as
         overflow every time a link arrives. */
      if (link >= 0 && born >= 0.999) {
        if (sx < ringL) ringL = sx;
        if (sx > ringR) ringR = sx;
        if (sy < ringT) ringT = sy;
        if (sy > ringB) ringB = sy;
      }

      /* cursor attraction */
      var caught = 0;
      if (gripping) {
        var dx = ptrX - sx, dy = ptrY - sy;
        var d2 = dx * dx + dy * dy;
        if (d2 < LINK_R * LINK_R) {
          /* Slide the point along the line to the pointer until it sits on a
             small ring around it — near points gather, far points barely move.
             Smoothstep rather than a straight ramp, so there is no visible
             seam where the influence ends; and the move is capped, so a point
             far from the pointer bends toward it instead of being flung onto
             the ring. Inside roughly 50px the cap is not reached and the
             gathering behaves exactly as before. */
          var d = Math.sqrt(d2) || 0.001;
          var pullT = 1 - d / LINK_R;
          pullT = pullT * pullT * (3 - 2 * pullT);
          var target = capR + (d / LINK_R) * 10 * (1 - charge * 0.6);
          var move = (d - target) * pullT * capAmt;
          if (move >  capLim) move =  capLim;
          if (move < -capLim) move = -capLim;
          sx += (dx / d) * move;
          sy += (dy / d) * move;
          caught = pullT;
        }
      }

      if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) continue;

      var band = bandAt(sy);
      if (!band) continue;

      var a = fade * born * (0.35 + 0.65 * f * 0.55) * band.w.boost;
      if (band.quiet) a *= QUIET;
      var sz = pr[i2] * f * (dpr > 1 ? 1.0 : 1.35) * ROUND_K;
      if (caught && charge > 0.01) a *= 1 + caught * charge * CHARGE_GLOW;

      /* Depth of field: distance from the focal plane (the chain's centre)
         spreads the point and dims it by the same measure, so the total light
         it contributes stays roughly constant and it reads as defocus rather
         than as fading out. */
      var foc = Math.abs(z2) * FOCUS_K;
      if (link < 0) foc *= DUST_FOCUS;
      if (foc > FOCUS_MAX) foc = FOCUS_MAX;
      if (foc > 0.001) {
        sz *= 1 + foc * BLUR_SIZE;
        a  /= 1 + foc * BLUR_DIM;
      }

      /* Fog: the far half of the chain sits deeper in it than the near half,
         so the ring never shows you its whole outline at once. */
      if (z2 < 0) {
        a *= 1 + (z2 / (R + TR)) * FOG_BACK;
        if (a <= 0) continue;
      }

      if (a <= 0.006) continue;
      if (a > 1) a = 1;

      var step = (a * STEPS) | 0;
      if (step >= STEPS) step = STEPS - 1;
      var key = band.w.dot + '|' + step + '|' + (band.w.add ? 1 : 0);
      var arr = buckets[key];
      if (!arr) { arr = buckets[key] = []; }
      arr.push(sx, sy, sz);
    }

    /* Two passes so the composite mode is set twice per frame rather than
       once per bucket: the normally-composited worlds first, then the
       additive ones.

       Each bucket is one path holding every disc in it, so the cost stays one
       fill per bucket — a few dozen a frame — the way it did when these were
       fillRects. moveTo before each arc is what keeps the arcs from being
       chained together by a connecting line. */
    var pass, key2, parts, alpha, a2, q, rad;
    for (pass = 0; pass < 2; pass++) {
      ctx.globalCompositeOperation = pass ? 'lighter' : 'source-over';
      for (key2 in buckets) {
        parts = key2.split('|');
        if ((parts[2] === '1') !== (pass === 1)) continue;
        alpha = ((+parts[1]) + 0.5) / STEPS;
        ctx.fillStyle = 'rgba(' + parts[0] + ',' + alpha.toFixed(3) + ')';
        a2 = buckets[key2];
        ctx.beginPath();
        for (q = 0; q < a2.length; q += 3) {
          rad = a2[q + 2] * 0.5;
          ctx.moveTo(a2[q] + rad, a2[q + 1]);
          ctx.arc(a2[q], a2[q + 1], rad, 0, TAU);
        }
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    lastRing = (ringR > ringL)
      ? { left: ringL, right: ringR, top: ringT, bottom: ringB, W: W, H: H,
          scale: scale, links: links }
      : null;
  }

  /* ------------------------------------------------------------------ events */

  var tick = null;
  function onScroll() {
    if (tick) return;
    tick = requestAnimationFrame(function () { tick = null; measureBands(); });
  }

  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });

  if (!reduced) {
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      if (Math.abs(e.clientX - ptrRX) > 1.5 || Math.abs(e.clientY - ptrRY) > 1.5) {
        lastMove = performance.now();
      }
      ptrRX = e.clientX; ptrRY = e.clientY;
      /* First sighting: place the follower on the pointer rather than letting
         it sweep in from the parked position off-canvas. */
      if (!hasPtr) { ptrX = ptrRX; ptrY = ptrRY; }
      hasPtr = true;
      /* Amplitude, in radians across the whole viewport. These were 1.15 and
         0.9 — 66° left to right and 52° top to bottom, which turned the chain
         into something that lurched after the mouse. A third of that still
         reads as the field answering you; more reads as motion sickness. */
      tiltTY = (e.clientX / W - 0.5) * TILT_X;
      tiltTX = (e.clientY / H - 0.5) * TILT_Y;
    }, { passive: true });
    document.addEventListener('pointerleave', function () {
      hasPtr = false; tiltTX = 0; tiltTY = 0;
    });
  }

  /* Stop the loop while the tab is hidden; resume without replaying the entry. */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { running = false; }
    else if (!running) { running = true; requestAnimationFrame(frame); }
  });

  /* -------------------------------------------------------------------- boot */

  function start() {
    readWorlds();
    collectBands();
    resize();
    /* The condensation starts here, with nothing to wait for. There is no
       curtain any more: the ring forming *is* the opening, and the rest of
       the site arrives on top of it once it has. */
    started = performance.now();

    /* Paint once before anything reads field-ready, so no frame can show a
       half-started field. The grounds themselves are CSS and are never this
       script's responsibility. */
    render(performance.now());
    document.documentElement.classList.add('field-ready');

    running = true;
    requestAnimationFrame(frame);
  }

  if (reduced) {
    /* No condensation, no idle motion beyond what one frame shows: draw the
       finished chain and the grounds, and repaint only on scroll/resize. */
    readWorlds(); collectBands(); resize();
    document.documentElement.classList.add('field-ready');
    started = performance.now() - (FORM_DUR + FORM_LAG + 1);
    var paint = function () { render(performance.now()); };
    paint();
    window.addEventListener('scroll', paint, { passive: true });
    window.addEventListener('resize', paint, { passive: true });
  } else {
    start();
  }

  /* Debug hook: force one frame at a chosen timeline position. */
  window.eiField = {
    render: function (ms, scrollPx, px2, py2) {
      if (typeof px2 === 'number') {
        ptrRX = ptrX = px2; ptrRY = ptrY = py2; hasPtr = true; ptrGrip = 1;
      }
      if (typeof scrollPx === 'number') window.scrollTo({ top: scrollPx, behavior: 'instant' });
      /* Seed the eased fit straight to its target: a forced frame is asking
         about the resting state, not about the pull-back on the way there. */
      fitL = 0;
      started = performance.now() - ms;
      render(performance.now());
    },
    bands: function () { measureBands(); return bands.slice(); },
    /* The chain's own extent in the last frame — see the note where it is
       gathered. Use this, not the painted pixels, to check for clipping. */
    ring: function () { return lastRing; },
    extents: function () { return { x: EXT_X.slice(), y: EXT_Y.slice() }; },
    /* Pin the idle rotation so a given angle can be inspected; pass null or
       nothing to hand it back to the clock. */
    lock: function (ryv, rxv) {
      lockRY = (typeof ryv === 'number') ? ryv : null;
      lockRX = (typeof rxv === 'number') ? rxv : null;
    },
    count: N,
    /* Live tuning handle for the depth-of-field constants, so they can be
       dialled in against the rendered pixels instead of by guesswork. */
    tune: function (o) {
      if (o.FOCUS_K   != null) FOCUS_K   = o.FOCUS_K;
      if (o.FOCUS_MAX != null) FOCUS_MAX = o.FOCUS_MAX;
      if (o.BLUR_SIZE != null) BLUR_SIZE = o.BLUR_SIZE;
      if (o.BLUR_DIM  != null) BLUR_DIM  = o.BLUR_DIM;
      if (o.FOG_BACK  != null) FOG_BACK  = o.FOG_BACK;
      if (o.FADE_BASE != null) FADE_BASE = o.FADE_BASE;
      if (o.FADE_DROP != null) FADE_DROP = o.FADE_DROP;
      if (o.LINK_R    != null) LINK_R    = o.LINK_R;
      if (o.LINK_AMT  != null) LINK_AMT  = o.LINK_AMT;
      if (o.MAX_PULL  != null) MAX_PULL  = o.MAX_PULL;
      if (o.PTR_TAU   != null) PTR_TAU   = o.PTR_TAU;
      if (o.boost) {
        for (var k in o.boost) { if (WORLDS[k]) WORLDS[k].boost = o.boost[k]; }
      }
      return { FOCUS_K: FOCUS_K, FOCUS_MAX: FOCUS_MAX, BLUR_SIZE: BLUR_SIZE,
               BLUR_DIM: BLUR_DIM, FOG_BACK: FOG_BACK,
               FADE_BASE: FADE_BASE, FADE_DROP: FADE_DROP,
               LINK_R: LINK_R, LINK_AMT: LINK_AMT,
               MAX_PULL: MAX_PULL, PTR_TAU: PTR_TAU };
    }
  };
})();
