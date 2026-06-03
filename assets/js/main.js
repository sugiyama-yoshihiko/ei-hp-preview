/* =========================================================
   EI&Co. — main.js
   ========================================================= */

(function () {
  "use strict";

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouchDevice = window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 960;

  /* ---------- 1. Header scroll state ---------- */
  const header = document.querySelector(".header");
  if (header) {
    const onScroll = () => {
      if (window.scrollY > 20) {
        header.classList.add("scrolled");
      } else {
        header.classList.remove("scrolled");
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- 2. Reveal on scroll ---------- */
  const revealEls = document.querySelectorAll(".reveal");
  if (revealEls.length && "IntersectionObserver" in window && !prefersReducedMotion) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px 10% 0px", threshold: 0 }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  /* ---------- 3. Mobile menu toggle ---------- */
  const menuBtn = document.querySelector(".header__menu-btn");
  const menuOverlay = document.querySelector(".header__menu-overlay");
  if (menuBtn && menuOverlay) {
    const header = document.querySelector(".header");
    const closeMenu = () => {
      menuBtn.classList.remove("is-open");
      menuOverlay.classList.remove("is-open");
      menuBtn.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
      if (header) header.classList.remove("is-menu-open");
    };
    const openMenu = () => {
      menuBtn.classList.add("is-open");
      menuOverlay.classList.add("is-open");
      menuBtn.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
      // Lift the header above the overlay's stacking context so the close button
      // (which lives inside the header) is tappable while the overlay is up.
      if (header) header.classList.add("is-menu-open");
    };
    menuBtn.addEventListener("click", () => {
      if (menuBtn.classList.contains("is-open")) closeMenu();
      else openMenu();
    });
    menuOverlay.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", closeMenu);
    });
    // Dedicated close button inside the overlay (sits at z-index 110 above
    // the overlay background, immune to header stacking-context issues).
    const closeBtn = menuOverlay.querySelector(".header__menu-close");
    if (closeBtn) closeBtn.addEventListener("click", closeMenu);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });
  }

  /* ---------- 4. Smooth scroll (anchor) ---------- */
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    const href = a.getAttribute("href");
    if (!href || href === "#") return;
    a.addEventListener("click", (e) => {
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    });
  });

  /* ---------- 5. Custom cursor ---------- */
  if (!isTouchDevice && !prefersReducedMotion) {
    let cursor = document.getElementById("cursor");
    if (!cursor) {
      cursor = document.createElement("div");
      cursor.id = "cursor";
      document.body.appendChild(cursor);
    }
    let x = 0, y = 0, tx = 0, ty = 0;
    window.addEventListener("mousemove", (e) => {
      tx = e.clientX;
      ty = e.clientY;
    });
    const tick = () => {
      x += (tx - x) * 0.2;
      y += (ty - y) * 0.2;
      cursor.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const hoverables = "a, button, .btn, .card, .work-item, .theme-panel__swatch";
    document.querySelectorAll(hoverables).forEach((el) => {
      el.addEventListener("mouseenter", () => cursor.classList.add("is-hover"));
      el.addEventListener("mouseleave", () => cursor.classList.remove("is-hover"));
    });
  }

  /* ---------- 6. Current year ---------- */
  const yearEl = document.getElementById("current-year");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  /* ---------- 7. Marquee: clone content until track ≥ 2× viewport, then animate.
        Ensures seamless looping on every screen size and works even when the
        OS has `prefers-reduced-motion` (we keep a slow movement so users still
        see the brand keywords roll by). ---------- */
  const marqueeTrack = document.querySelector(".marquee__track");
  const marqueeFirstGroup = marqueeTrack && marqueeTrack.querySelector(".marquee__group");
  if (marqueeTrack && marqueeFirstGroup) {
    // Constant pixel-per-second scroll speed (matches original PC feel).
    const SPEED_PX_PER_SEC = prefersReducedMotion ? 18 : 55;

    // We drive the marquee with requestAnimationFrame instead of a CSS animation.
    // Why: iOS Safari (and some other mobile browsers) deprioritize / throttle CSS
    // animations during scroll to save battery, which causes the visible
    // stuttering when the user is mid-scroll. rAF keeps the motion locked to the
    // main loop and renders smoothly regardless of scroll state.

    let position = 0;     // current translateX in px (negative = scrolled left)
    let groupWidth = 0;   // width of ONE content group; we wrap when |position| >= groupWidth
    let lastTime = 0;
    let rafId = null;

    const fillTrack = () => {
      // Reset to one group so we recompute from a known baseline
      while (marqueeTrack.children.length > 1) marqueeTrack.removeChild(marqueeTrack.lastChild);
      const viewport = window.innerWidth;
      // Clone until total content is at least 2× viewport so we can wrap seamlessly
      let safety = 20;
      while (marqueeTrack.scrollWidth < viewport * 2 && safety-- > 0) {
        marqueeTrack.appendChild(marqueeFirstGroup.cloneNode(true));
      }
      groupWidth = marqueeFirstGroup.getBoundingClientRect().width;
    };

    const tick = (now) => {
      if (!lastTime) lastTime = now;
      const dt = now - lastTime;
      lastTime = now;
      // Cap dt at 100ms — if the tab was backgrounded for seconds, don't jump
      const effectiveDt = Math.min(dt, 100);
      position -= (SPEED_PX_PER_SEC * effectiveDt) / 1000;
      if (groupWidth > 0 && position <= -groupWidth) {
        position += groupWidth; // wrap seamlessly
      }
      marqueeTrack.style.transform = "translate3d(" + position + "px, 0, 0)";
      rafId = requestAnimationFrame(tick);
    };

    const start = () => {
      if (rafId) return;
      lastTime = 0;
      rafId = requestAnimationFrame(tick);
    };

    const init = () => {
      fillTrack();
      start();
    };

    let didInit = false;
    const initOnce = () => {
      if (didInit) return;
      didInit = true;
      init();
    };
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(initOnce);
    }
    setTimeout(initOnce, 2000);

    // Re-measure on meaningful resize only (>80px) to avoid jitter from iOS
    // address-bar collapse triggering resize for a few pixels.
    let resizeTimer;
    let lastWidth = window.innerWidth;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (Math.abs(window.innerWidth - lastWidth) > 80) {
          lastWidth = window.innerWidth;
          fillTrack(); // keep position; just adjust clones + groupWidth
        }
      }, 500);
    });

    // Pause when tab is hidden so we don't accumulate "stale" time
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      } else if (didInit) {
        start();
      }
    });
  }
})();
