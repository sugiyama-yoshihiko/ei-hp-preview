/* =========================================================
   EI&Co. — theme-panel.js
   Palette locked to Wine Bold. Switcher and other variants removed.
   This file remains only to (a) clear any old palette key the user's
   browser may still have in localStorage, and (b) keep the existing
   <script> reference safe (no 404).
   ========================================================= */
(function () {
  try {
    localStorage.removeItem("ei-palette");
    localStorage.removeItem("ei-theme-mode");
    localStorage.removeItem("ei-theme-accent");
    localStorage.removeItem("ei-theme-collapsed");
    localStorage.removeItem("ei-dev");
  } catch (e) { /* ignore */ }
  document.documentElement.removeAttribute("data-palette");
})();
