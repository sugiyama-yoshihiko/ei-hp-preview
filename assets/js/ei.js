/* =============================================================================
   ei.js — page runtime
   -----------------------------------------------------------------------------
   Boot sequence, text reveals, the world-aware header and rail, the marquee,
   the cursor, and the contact form. Everything degrades: if this file never
   runs, html keeps .no-js / .no-field and the page is a plain, readable,
   fully navigable site.
   ============================================================================= */

(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var reduced = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  root.classList.remove('no-js');
  if (!reduced) root.classList.add('anim');

  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return [].slice.call((c || doc).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ======================================================= 1. the opening = */

  /* The ring begins condensing on its own the moment field.js initialises —
     nothing gates it. What this block decides is only when the *site* shows
     up on top of it.

     Once per session, on the home page: hold everything back until the ring
     has formed, then let the page arrive. Every other arrival skips the hold,
     because sitting through it again on the way back from About would be a
     tax, not an opening. */

  var isHome = doc.body.getAttribute('data-page') === 'home';
  var INTRO_HOLD = 3400;   // ms — by here the ring reads as formed; the last
                           // stragglers settle under the arriving copy

  var fullIntro = false;
  if (isHome && !reduced) {
    var seen = false;
    try { seen = sessionStorage.getItem('ei_intro_seen') === '1'; } catch (e) {}
    /* ?intro=1 replays it on demand — for reviewing the opening without
       having to open a fresh tab each time. */
    fullIntro = !seen || /[?&]intro=1\b/.test(window.location.search);
    try { sessionStorage.setItem('ei_intro_seen', '1'); } catch (e) {}
  }

  if (fullIntro) {
    root.classList.add('intro');
    /* A restored scroll position would put the hold on the wrong section. */
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
  }

  function endIntro() {
    if (!root.classList.contains('intro')) return;
    root.classList.remove('intro');
    root.classList.add('intro-done');
    startObserving();
    window.dispatchEvent(new Event('ei:intro-done'));
  }

  /* ============================================== 1.5 inertial scroll ===== */

  /* The page keeps its real scroll position and its real scrollbar; the wheel
     only moves a target, and each frame the actual position eases toward it.
     Everything downstream — the world switch, the ring's growth, the reveal
     observer — listens to plain scroll events and needs no changes.

     Pointer-based input only. Touch already has momentum, and hijacking it
     costs more than it gives. */

  var scrollTo = function (y) { window.scrollTo(0, y); };

  if (!reduced && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    (function () {
      var target = window.pageYOffset;
      var current = target;
      var running = false;
      var lastFrame = 0;
      var watchdog = null;
      var LERP = 0.11;           // 90% of the distance in ~0.33s; lower is heavier

      function limit() {
        return Math.max(0, doc.documentElement.scrollHeight - window.innerHeight);
      }

      function tick() {
        lastFrame = performance.now();
        var d = target - current;
        if (Math.abs(d) < 0.08) {
          current = target;
          window.scrollTo(0, current);
          running = false;
          return;
        }
        current += d * LERP;
        window.scrollTo(0, current);
        requestAnimationFrame(tick);
      }

      function start() {
        if (!running) {
          running = true;
          lastFrame = performance.now();
          requestAnimationFrame(tick);
        }
        /* This handler cancels the browser's own scrolling, so if rAF is ever
           throttled or suspended — an occluded window, a background tab, a
           browser that pauses animation frames — the page would simply stop
           moving. The watchdog jumps to the target in that case: the easing
           is a nicety, being able to scroll is not. */
        if (watchdog) clearTimeout(watchdog);
        watchdog = setTimeout(function () {
          watchdog = null;
          if (!running) return;
          if (performance.now() - lastFrame > 240) {
            current = target;
            window.scrollTo(0, current);
            running = false;
          }
        }, 300);
      }

      window.addEventListener('wheel', function (e) {
        /* ctrl+wheel is pinch-zoom, and the open menu scrolls on its own. */
        if (e.ctrlKey || doc.hidden || doc.querySelector('.menu.is-open')) return;
        e.preventDefault();
        var d = e.deltaY;
        if (e.deltaMode === 1) d *= 18;                     // lines
        else if (e.deltaMode === 2) d *= window.innerHeight; // pages
        target = clamp(target + d, 0, limit());
        start();
      }, { passive: false });

      /* Keyboard, scrollbar drags and browser restore all move the page
         without going through the wheel handler — adopt their position
         rather than yanking it back. */
      window.addEventListener('scroll', function () {
        if (running) return;
        target = current = window.pageYOffset;
      }, { passive: true });

      window.addEventListener('resize', function () {
        target = clamp(target, 0, limit());
      }, { passive: true });

      scrollTo = function (y) { target = clamp(y, 0, limit()); start(); };
    })();
  }

  function scrollToEl(el) {
    scrollTo(el.getBoundingClientRect().top + window.pageYOffset);
  }

  /* In-page links have to go through the same easing, or they fight it. */
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href').slice(1);
      var t = id ? doc.getElementById(id) : null;
      if (id && !t) return;
      e.preventDefault();
      if (t) {
        scrollToEl(t);
        t.setAttribute('tabindex', '-1');
        t.focus({ preventScroll: true });
      } else {
        scrollTo(0);
      }
    });
  });

  /* =================================================== 2. text splitting == */

  /* Wraps each glyph so it can ride up out of a clipping box. Japanese is
     split per character; Latin is split per character but never across a
     word boundary that would let a word break mid-line. */
  function splitChars(el) {
    if (el.dataset.split === 'done') return;
    var out = doc.createDocumentFragment();
    var idx = 0;
    var nodes = [].slice.call(el.childNodes);

    nodes.forEach(function (node) {
      if (node.nodeType === 3) {
        var text = node.nodeValue;
        for (var i = 0; i < text.length; i++) {
          var c = text[i];
          if (c === ' ') { out.appendChild(doc.createTextNode(' ')); continue; }
          var box = doc.createElement('span');
          box.className = 'ch';
          var inner = doc.createElement('span');
          inner.textContent = c;
          inner.style.setProperty('--d', (idx * 26) + 'ms');
          box.appendChild(inner);
          out.appendChild(box);
          idx++;
        }
      } else if (node.nodeType === 1) {
        if (node.tagName === 'BR') { out.appendChild(node.cloneNode()); return; }
        /* Keep the element (an <em> accent, say) and split inside it. */
        var clone = node.cloneNode(false);
        var inTxt = node.textContent;
        for (var j = 0; j < inTxt.length; j++) {
          var box2 = doc.createElement('span');
          box2.className = 'ch';
          var in2 = doc.createElement('span');
          in2.textContent = inTxt[j];
          in2.style.setProperty('--d', (idx * 26) + 'ms');
          box2.appendChild(in2);
          clone.appendChild(box2);
          idx++;
        }
        out.appendChild(clone);
      }
    });

    el.textContent = '';
    el.appendChild(out);
    el.dataset.split = 'done';
  }

  if (!reduced) $$('[data-split]').forEach(splitChars);

  /* ================================================ 4. reveal observer ==== */

  /* Deliberately not started at load. During the opening hold nothing may
     reveal itself; when the hold ends, observation begins and the copy that
     is already on screen plays its own entrance — which is what makes the
     site look like it is assembling rather than fading up as one sheet. */

  var observing = false;

  function startObserving() {
    if (observing) return;
    observing = true;
    var els = $$('[data-rise], [data-split]');

    if (!('IntersectionObserver' in window) || reduced) {
      els.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

    els.forEach(function (el) { io.observe(el); });
  }

  if (fullIntro) {
    setTimeout(endIntro, INTRO_HOLD);
    /* Anyone who reaches for the page before the ring is done has said what
       they want: give it to them rather than making them wait it out. */
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (ev) {
      window.addEventListener(ev, endIntro, { once: true, passive: true });
    });
  } else {
    startObserving();
  }

  /* ================================================= 5. world-aware chrome */

  var nav = $('.nav');
  var railbar = $('.railbar');
  var railLabel = $('.railbar__label');
  var dialArc = $('.dial__arc');
  var worldEls = $$('[data-world]:not([data-world-ui])');
  var DARK = { deep: 1, wine: 1, ink: 1 };

  function worldAtY(y) {
    for (var i = 0; i < worldEls.length; i++) {
      var r = worldEls[i].getBoundingClientRect();
      if (y >= r.top && y < r.bottom) return worldEls[i].getAttribute('data-world');
    }
    return 'paper';
  }

  /* ------ section index ------ */
  var marks = $$('[data-mark]');
  var ticksWrap = $('.railbar__ticks');
  if (ticksWrap && marks.length) {
    marks.forEach(function (m, i) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.className = 'railbar__tick';
      b.setAttribute('aria-label', m.getAttribute('data-mark'));
      b.addEventListener('click', function () {
        m.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      });
      ticksWrap.appendChild(b);
      m._tick = b;
      if (i === 0) b.setAttribute('aria-current', 'true');
    });
  }

  var lastY = window.pageYOffset, navHidden = false, curWorld = '';
  var curMark = null, rafPending = false;
  var movePins = function () {};      // replaced below when a .pin exists

  function onFrame() {
    rafPending = false;
    var y = window.pageYOffset || 0;
    var docH = doc.documentElement.scrollHeight - window.innerHeight;
    var prog = docH > 0 ? clamp(y / docH, 0, 1) : 0;

    /* dial */
    if (dialArc) dialArc.style.strokeDashoffset = (69.1 * (1 - prog)).toFixed(2);

    /* Safety net: keep the document ground on the world filling the middle of
       the screen. The canvas paints the real panels, but if it is ever a frame
       behind — or never starts — this stops dark ink landing on a dark ground. */
    var mw = worldAtY(window.innerHeight * 0.5);
    if (root.getAttribute('data-ground') !== mw) root.setAttribute('data-ground', mw);

    /* header colour follows the world behind it */
    var w = worldAtY(34);
    if (w !== curWorld) {
      curWorld = w;
      if (nav) {
        nav.setAttribute('data-world', w);
        nav.classList.toggle('on-dark', !!DARK[w]);
      }
      if (railbar) railbar.setAttribute('data-world', w);
    }

    /* hide the header on the way down, bring it back on the way up */
    if (nav) {
      var dy = y - lastY;
      if (y > 220 && dy > 4 && !navHidden) { nav.classList.add('is-hidden'); navHidden = true; }
      else if ((dy < -4 || y < 140) && navHidden) { nav.classList.remove('is-hidden'); navHidden = false; }
    }
    lastY = y;

    movePins();

    /* which section am I in */
    if (marks.length) {
      var mid = window.innerHeight * 0.42, found = marks[0];
      for (var i = 0; i < marks.length; i++) {
        if (marks[i].getBoundingClientRect().top <= mid) found = marks[i];
      }
      if (found !== curMark) {
        if (curMark && curMark._tick) curMark._tick.removeAttribute('aria-current');
        curMark = found;
        if (found._tick) found._tick.setAttribute('aria-current', 'true');
        if (railLabel) railLabel.textContent = found.getAttribute('data-mark');
      }
    }
  }

  function onScroll() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(onFrame);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onFrame();

  /* ===================================================== 6. menu ========== */

  var burger = $('.nav__burger');
  var menu = $('.menu');
  if (burger && menu) {
    var open = false;
    var items = $$('.menu__list a', menu);
    items.forEach(function (a, i) { a.style.transitionDelay = (120 + i * 55) + 'ms'; });

    function setMenu(next) {
      open = next;
      menu.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
      doc.body.style.overflow = open ? 'hidden' : '';
      if (open) menu.removeAttribute('inert'); else menu.setAttribute('inert', '');
    }
    setMenu(false);
    burger.addEventListener('click', function () { setMenu(!open); });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) setMenu(false); });
    items.forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
  }

  /* ==================================================== 7. marquee ======== */

  var strip = $('.strip');
  if (strip && !reduced) {
    var track = $('.strip__track', strip);
    var grp = $('.strip__grp', track);
    if (track && grp) {
      var unit = grp.offsetWidth;
      var need = Math.ceil((window.innerWidth * 2) / Math.max(unit, 1)) + 1;
      for (var i = 1; i < need; i++) track.appendChild(grp.cloneNode(true));

      var off = 0, base = 0.42, vel = 0, prevY = window.pageYOffset, last = 0;
      window.addEventListener('scroll', function () {
        var y = window.pageYOffset;
        vel += (y - prevY) * 0.12;
        prevY = y;
      }, { passive: true });

      (function loop(now) {
        requestAnimationFrame(loop);
        var dt = last ? Math.min(now - last, 50) : 16;
        last = now;
        vel *= 0.92;
        off -= (base + vel * 0.06) * dt * 0.06;
        if (unit > 0) {
          while (off <= -unit) off += unit;
          while (off > 0) off -= unit;
        }
        track.style.transform = 'translate3d(' + off.toFixed(2) + 'px,0,0)';
      })(0);
    }
  }

  /* ==================================================== 8. cursor ========= */

  var cur = $('.cursor');
  if (cur && !reduced && window.matchMedia('(hover: hover)').matches) {
    var cx = window.innerWidth / 2, cy = window.innerHeight / 2, tx = cx, ty = cy;
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      tx = e.clientX; ty = e.clientY;
      cur.classList.add('is-on');
      var t = e.target.closest && e.target.closest('a, button, .row, .card');
      cur.classList.toggle('is-link', !!t);
    }, { passive: true });
    doc.addEventListener('pointerleave', function () { cur.classList.remove('is-on'); });

    (function ride() {
      requestAnimationFrame(ride);
      cx += (tx - cx) * 0.19;
      cy += (ty - cy) * 0.19;
      cur.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)';
    })();
  }

  /* ------ magnetic buttons ------ */
  if (!reduced && window.matchMedia('(hover: hover)').matches) {
    $$('.btn').forEach(function (el) {
      var mx = 0, my = 0, rx = 0, ry = 0, live = false;
      el.addEventListener('pointerenter', function () { live = true; run(); });
      el.addEventListener('pointerleave', function () { mx = 0; my = 0; });
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        mx = (e.clientX - (r.left + r.width / 2)) * 0.26;
        my = (e.clientY - (r.top + r.height / 2)) * 0.34;
      });
      function run() {
        if (!live) return;
        rx += (mx - rx) * 0.16;
        ry += (my - ry) * 0.16;
        el.style.transform = 'translate3d(' + rx.toFixed(2) + 'px,' + ry.toFixed(2) + 'px,0)';
        if (Math.abs(mx - rx) > 0.05 || Math.abs(my - ry) > 0.05 || mx || my) requestAnimationFrame(run);
        else { live = false; el.style.transform = ''; }
      }
    });
  }

  /* ============================================ 8.5 pinned horizontal ===== */

  /* The section is made as tall as the sideways distance to travel; its stage
     sticks to the viewport and the track slides across as you scroll down.
     Driven from the same scroll frame as everything else, so it inherits the
     inertial easing rather than competing with it. */

  /* How much vertical scroll it costs to move the track one pixel sideways.
     1.0 pins the section for its full sideways length, which is a long time
     to spend with vertical input producing only horizontal motion — the
     reliable way to make a reader queasy. Half that: the run is over in
     about a screen and a half. */
  var PIN_SPEED = 0.5;

  var pins = reduced ? [] : $$('.pin');
  if (pins.length) {
    var wide = window.matchMedia('(min-width: 900px)');
    var pinState = [];

    var layoutPins = function () {
      pinState.length = 0;
      pins.forEach(function (pin) {
        var track = $('.pin__track', pin);
        if (!track) return;
        if (!wide.matches) {
          pin.style.height = '';
          track.style.transform = '';
          return;
        }
        var travel = Math.max(0, track.scrollWidth - window.innerWidth);
        var scrolled = travel * PIN_SPEED;
        pin.style.height = (window.innerHeight + scrolled) + 'px';
        pinState.push({ pin: pin, track: track, travel: travel, scrolled: scrolled });
      });
    };

    movePins = function () {
      for (var i = 0; i < pinState.length; i++) {
        var st = pinState[i];
        if (!st.travel || !st.scrolled) continue;
        var t = clamp(-st.pin.getBoundingClientRect().top / st.scrolled, 0, 1);
        st.track.style.transform = 'translate3d(' + (-t * st.travel).toFixed(1) + 'px,0,0)';
      }
    };

    layoutPins();
    movePins();          /* onFrame ran before this assignment existed */
    window.addEventListener('resize', function () { layoutPins(); movePins(); }, { passive: true });
    if (wide.addEventListener) {
      wide.addEventListener('change', function () { layoutPins(); movePins(); });
    }
    /* Web fonts change the track's width after first layout. */
    if (doc.fonts && doc.fonts.ready) {
      doc.fonts.ready.then(function () { layoutPins(); movePins(); });
    }
  }

  /* ============================================== 8.6 page transition ===== */

  /* A circle closes over the page you are leaving. The matching open on the
     next page is a pure CSS animation (html.navin, stamped by the inline
     script in <head>), so nothing here can leave a page stranded behind it —
     and if this handler never runs, links navigate the ordinary way. */

  var veil = $('.veil');
  if (veil && !reduced) {
    var leaving = false;

    doc.addEventListener('click', function (e) {
      if (leaving || e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a');
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#') return;
      if (a.target && a.target !== '_self') return;
      if (a.hasAttribute('download')) return;

      var dest;
      try { dest = new URL(href, location.href); } catch (err) { return; }
      if (dest.origin !== location.origin) return;                 // offsite, mailto, tel
      if (dest.pathname === location.pathname) return;             // same page

      e.preventDefault();
      leaving = true;
      veil.style.setProperty('--vx', (e.clientX || window.innerWidth / 2) + 'px');
      veil.style.setProperty('--vy', (e.clientY || window.innerHeight / 2) + 'px');
      try { sessionStorage.setItem('ei_nav', '1'); } catch (err) {}
      requestAnimationFrame(function () { veil.classList.add('is-closing'); });
      setTimeout(function () { window.location.href = dest.href; }, 430);
    });

    /* Coming back through history restores this document with the circle
       still closed unless it is cleared. */
    window.addEventListener('pageshow', function (ev) {
      if (!ev.persisted) return;
      leaving = false;
      veil.classList.remove('is-closing');
    });
  }

  /* ================================================= 9. footer clock ====== */

  var yr = $('#year');
  if (yr) yr.textContent = String(new Date().getFullYear());

  var clock = $('.foot__clock');
  if (clock) {
    var tick = function () {
      /* Tokyo time — the office the address points at. */
      var s = new Date().toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      clock.textContent = 'TOKYO ' + s;
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ================================================ 10. contact form ====== */

  var form = $('#contact-form');
  if (form) {
    /* Prefill from ?subject=&position= so the recruit cards can deep-link. */
    var q = new URLSearchParams(window.location.search);
    var sub = q.get('subject');
    if (sub) {
      var sel = form.querySelector('[name="subject"]');
      if (sel) {
        var ok = [].slice.call(sel.options).some(function (o) { return o.value === sub; });
        if (ok) sel.value = sub;
      }
    }
    var pos = q.get('position');
    if (pos) {
      var msg = form.querySelector('[name="message"]');
      if (msg && !msg.value) msg.value = '応募ポジション：' + pos + '\n\n';
    }

    form.addEventListener('submit', function (e) {
      if (!window.fetch) return;                 // let the browser POST normally
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = '送信中…'; }

      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      }).then(function (r) {
        if (!r.ok) throw new Error('send failed');
        var thanks = $('#contact-thanks');
        var lead = $('#contact-lead');
        form.hidden = true;
        if (lead) lead.hidden = true;
        if (thanks) { thanks.hidden = false; thanks.scrollIntoView({ block: 'center' }); }
      }).catch(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = '送信する <i aria-hidden="true">→</i>'; }
        alert('送信に失敗しました。お手数ですが info@ei-and.co.jp まで直接ご連絡ください。');
      });
    });
  }

  /* ================================================ 11. language menu ===== */

  var langBtn = $('.lang');
  var langMenu = $('.lang__menu');
  if (langBtn && langMenu) {
    doc.addEventListener('click', function (e) {
      if (e.target.closest('.lang')) {
        var on = langMenu.classList.toggle('is-open');
        langBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
      } else if (!e.target.closest('.lang__menu')) {
        langMenu.classList.remove('is-open');
        langBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }
})();
