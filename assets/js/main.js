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
      { rootMargin: "0px 0px -10% 0px", threshold: 0.01 }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  /* ---------- 3. Mobile menu toggle ---------- */
  const menuBtn = document.querySelector(".header__menu-btn");
  const menuOverlay = document.querySelector(".header__menu-overlay");
  if (menuBtn && menuOverlay) {
    const closeMenu = () => {
      menuBtn.classList.remove("is-open");
      menuOverlay.classList.remove("is-open");
      menuBtn.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    };
    const openMenu = () => {
      menuBtn.classList.add("is-open");
      menuOverlay.classList.add("is-open");
      menuBtn.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
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
})();
