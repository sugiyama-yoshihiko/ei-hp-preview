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
    // Constant pixel-per-second scroll speed.
    // 55px/sec matches the original PC feel (30s for a ~3300px-wide 3-copy track).
    const SPEED_PX_PER_SEC = 55;

    const ensureFilled = () => {
      // Reset to one group so we always recompute from a known baseline
      while (marqueeTrack.children.length > 1) marqueeTrack.removeChild(marqueeTrack.lastChild);
      // Stop any running animation so re-setting it starts a fresh t=0
      marqueeTrack.style.animation = "none";
      // Force a reflow so the browser commits the `animation: none` before we re-apply
      // eslint-disable-next-line no-unused-expressions
      marqueeTrack.offsetWidth;

      const viewport = window.innerWidth;
      // Clone until total content is at least 2× viewport (needed for seamless -50% translate loop)
      let safety = 20;
      while (marqueeTrack.scrollWidth < viewport * 2 && safety-- > 0) {
        marqueeTrack.appendChild(marqueeFirstGroup.cloneNode(true));
      }
      // animation moves the track by -50% of its width in `duration` seconds → speed = halfWidth / duration
      const duration = Math.max(20, marqueeTrack.scrollWidth / 2 / SPEED_PX_PER_SEC);
      const finalDuration = prefersReducedMotion ? duration * 3 : duration;
      marqueeTrack.style.animation = `marquee-scroll ${finalDuration}s linear infinite`;
    };

    // Run once initially so the marquee animates immediately, then once more after
    // fonts settle so the final scrollWidth is accurate. Only TWO calls total to
    // avoid visible duration-shift glitches mid-animation.
    ensureFilled();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(ensureFilled);
    }

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(ensureFilled, 200);
    });
  }
})();
