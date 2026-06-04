/* =========================================================
   EI&Co. — theme-panel.js
   ========================================================= */

(function () {
  "use strict";

  /* ---------- Dev-only gate ----------
     The theme panel is an authoring tool, not a visitor-facing feature.
     It only mounts when one of the following is true:
       1. URL has `?dev=1` (also persisted to localStorage for subsequent visits)
       2. localStorage has `ei-dev=1`
     To disable on a browser: visit any page with `?dev=0`.
  */
  try {
    const params = new URLSearchParams(window.location.search);
    const devParam = params.get("dev");
    if (devParam === "1") localStorage.setItem("ei-dev", "1");
    if (devParam === "0") localStorage.removeItem("ei-dev");
    if (localStorage.getItem("ei-dev") !== "1") return;
  } catch (e) {
    return; // If storage access fails, treat as visitor and bail.
  }

  const STORAGE_MODE = "ei-theme-mode";
  const STORAGE_ACCENT = "ei-theme-accent";
  const STORAGE_COLLAPSED = "ei-theme-collapsed";

  const DEFAULT_ACCENT = "#E868A1";
  const PRESETS = [
    { name: "Pink",    value: "#E868A1" },
    { name: "Mono",    value: "#0A0A0A" },
    { name: "Indigo",  value: "#3522C7" },
    { name: "Orange",  value: "#FF5A1F" },
    { name: "Emerald", value: "#00875A" }
  ];

  /* ---------- Helpers ---------- */

  const root = document.documentElement;

  const getSystemMode = () =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

  const applyMode = (mode) => {
    root.setAttribute("data-theme", mode);
  };

  const applyAccent = (hex) => {
    root.style.setProperty("--color-accent", hex);
    root.style.setProperty("--color-accent-hover", shade(hex, -10));
  };

  // Simple hex shade helper (percent: negative = darker, positive = lighter)
  function shade(hex, percent) {
    const h = hex.replace("#", "");
    const num = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    let r = (num >> 16) & 0xff;
    let g = (num >> 8) & 0xff;
    let b = num & 0xff;
    const amt = Math.round(2.55 * percent);
    r = Math.max(0, Math.min(255, r + amt));
    g = Math.max(0, Math.min(255, g + amt));
    b = Math.max(0, Math.min(255, b + amt));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
  }

  /* ---------- Init from storage / OS ---------- */

  const storedMode = localStorage.getItem(STORAGE_MODE);
  const storedAccent = localStorage.getItem(STORAGE_ACCENT);
  const initialMode = storedMode || getSystemMode();
  const initialAccent = storedAccent || DEFAULT_ACCENT;

  applyMode(initialMode);
  applyAccent(initialAccent);

  // Respond to OS changes if user hasn't set a preference
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!localStorage.getItem(STORAGE_MODE)) {
      applyMode(e.matches ? "dark" : "light");
      syncModeSwitch();
    }
  });

  /* ---------- Build panel ---------- */

  const panel = document.createElement("aside");
  panel.className = "theme-panel";
  panel.setAttribute("aria-label", "Theme settings");

  panel.innerHTML = `
    <div class="theme-panel__header">
      <span class="theme-panel__heading">Theme</span>
      <button class="theme-panel__toggle" type="button" aria-label="Toggle theme panel">
        <span class="theme-panel__toggle-icon">\u2212</span>
      </button>
    </div>
    <div class="theme-panel__body">
      <div class="theme-panel__row">
        <span class="theme-panel__title">Dark mode</span>
        <label class="theme-panel__switch" aria-label="Toggle dark mode">
          <input type="checkbox" class="theme-panel__switch-input" />
        </label>
      </div>
      <div class="theme-panel__row theme-panel__row--column">
        <span class="theme-panel__title">Accent</span>
        <div class="theme-panel__swatches">
          ${PRESETS.map(
            (p) =>
              `<button class="theme-panel__swatch" type="button" data-color="${p.value}" style="background:${p.value}" aria-label="${p.name}"></button>`
          ).join("")}
        </div>
      </div>
      <div class="theme-panel__row">
        <span class="theme-panel__picker-label">Custom</span>
        <div class="theme-panel__picker">
          <input type="color" class="theme-panel__picker-input" value="${initialAccent}" aria-label="Custom accent color" />
        </div>
      </div>
      <button class="theme-panel__reset" type="button">Reset</button>
    </div>
  `;

  document.body.appendChild(panel);

  const toggleBtn = panel.querySelector(".theme-panel__toggle");
  const toggleIcon = panel.querySelector(".theme-panel__toggle-icon");
  const switchEl = panel.querySelector(".theme-panel__switch");
  const switchInput = panel.querySelector(".theme-panel__switch-input");
  const swatchEls = panel.querySelectorAll(".theme-panel__swatch");
  const pickerInput = panel.querySelector(".theme-panel__picker-input");
  const resetBtn = panel.querySelector(".theme-panel__reset");

  /* ---------- Mode switch sync ---------- */

  function syncModeSwitch() {
    const isDark = root.getAttribute("data-theme") === "dark";
    switchInput.checked = isDark;
    switchEl.classList.toggle("is-on", isDark);
  }

  syncModeSwitch();

  switchInput.addEventListener("change", () => {
    const mode = switchInput.checked ? "dark" : "light";
    applyMode(mode);
    localStorage.setItem(STORAGE_MODE, mode);
    switchEl.classList.toggle("is-on", switchInput.checked);
  });

  /* ---------- Swatches / picker ---------- */

  function markActiveSwatch(hex) {
    swatchEls.forEach((sw) => {
      sw.classList.toggle("is-active", sw.dataset.color.toLowerCase() === hex.toLowerCase());
    });
  }

  markActiveSwatch(initialAccent);

  swatchEls.forEach((sw) => {
    sw.addEventListener("click", () => {
      const hex = sw.dataset.color;
      applyAccent(hex);
      localStorage.setItem(STORAGE_ACCENT, hex);
      pickerInput.value = hex;
      markActiveSwatch(hex);
    });
  });

  pickerInput.addEventListener("input", (e) => {
    const hex = e.target.value;
    applyAccent(hex);
    localStorage.setItem(STORAGE_ACCENT, hex);
    markActiveSwatch(hex);
  });

  /* ---------- Reset ---------- */

  resetBtn.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_MODE);
    localStorage.removeItem(STORAGE_ACCENT);
    const sysMode = getSystemMode();
    applyMode(sysMode);
    applyAccent(DEFAULT_ACCENT);
    pickerInput.value = DEFAULT_ACCENT;
    markActiveSwatch(DEFAULT_ACCENT);
    syncModeSwitch();
  });

  /* ---------- Collapse ---------- */

  const setCollapsed = (collapsed) => {
    panel.classList.toggle("is-collapsed", collapsed);
    toggleIcon.textContent = collapsed ? "\u002B" : "\u2212";
    toggleBtn.setAttribute("aria-label", collapsed ? "Open theme panel" : "Collapse theme panel");
    localStorage.setItem(STORAGE_COLLAPSED, collapsed ? "1" : "0");
  };

  const initialCollapsed = localStorage.getItem(STORAGE_COLLAPSED) === "1";
  setCollapsed(initialCollapsed);

  toggleBtn.addEventListener("click", () => {
    setCollapsed(!panel.classList.contains("is-collapsed"));
  });
})();

/* =========================================================
   Palette switcher — 4 bold variants accented with black to anchor the design.
     1. Vivid Orange   #E85D2A
     2. Forest Green   #3A5F3A
     3. Sakura Pink    #E8A6B8
     4. Wine Bold      #4B2139

   Public-facing: visible to all visitors as a floating pill bottom-left.
   Click cycles 1 → 2 → 3 → 4 → 1. Keyboard 1/2/3/4 also switches.
   ========================================================= */
(function () {
  const STORAGE = "ei-palette";
  const root = document.documentElement;

  // Each palette ships its own bg / bg-alt / border / text-sub so the entire
  // page changes mood (not just the accent). Black is used as the body text
  // color in every variant to "anchor" the design per the brief.
  const PALETTES = {
    orange: {
      label: "Vivid Orange",
      accent: "#E85D2A",  hover: "#C24618",
      bg:     "#FFF8F3",  bgAlt: "#FBE6D6",
      border: "#F2D2BD",
      text:   "#111111",  textSub: "#4A3328"
    },
    green: {
      label: "Forest Green",
      accent: "#3A5F3A",  hover: "#284428",
      bg:     "#F4F6F2",  bgAlt: "#E2EAE0",
      border: "#CFD9CC",
      text:   "#111111",  textSub: "#3A4A3A"
    },
    pink: {
      label: "Sakura Pink",
      accent: "#E8A6B8",  hover: "#D08398",
      bg:     "#FCF6F7",  bgAlt: "#F4E1E6",
      border: "#E8D0D5",
      text:   "#111111",  textSub: "#5A4248"
    },
    wine: {
      label: "Wine Bold",
      accent: "#AF3E47",  hover: "#7E1F2A",
      bg:     "#FAF4F4",  bgAlt: "#EAD6D8",
      border: "#D8B8BC",
      text:   "#111111",  textSub: "#4B2139"
    }
  };

  const ORDER = ["orange", "green", "pink", "wine"];

  let pill = null;
  const apply = (mode) => {
    const p = PALETTES[mode] || PALETTES[ORDER[0]];
    root.style.setProperty("--color-accent", p.accent);
    root.style.setProperty("--color-accent-hover", p.hover);
    root.style.setProperty("--color-bg", p.bg);
    root.style.setProperty("--color-bg-alt", p.bgAlt);
    root.style.setProperty("--color-border", p.border);
    root.style.setProperty("--color-text", p.text);
    root.style.setProperty("--color-text-sub", p.textSub);
    root.setAttribute("data-palette", mode);
    localStorage.setItem(STORAGE, mode);
    if (pill) pill.textContent = "Palette · " + p.label;
  };

  pill = document.createElement("button");
  pill.type = "button";
  pill.setAttribute("aria-label", "Switch color palette");
  pill.style.cssText = [
    "position:fixed",
    "left:16px",
    "bottom:16px",
    "z-index:200",
    "padding:10px 16px",
    "border:1px solid rgba(0,0,0,.2)",
    "background:rgba(255,255,255,.85)",
    "backdrop-filter:blur(8px)",
    "-webkit-backdrop-filter:blur(8px)",
    "border-radius:999px",
    "font:500 11px/1 Inter,Avenir,sans-serif",
    "letter-spacing:.14em",
    "text-transform:uppercase",
    "color:#111",
    "cursor:pointer",
    "box-shadow:0 2px 8px rgba(0,0,0,.08)"
  ].join(";");
  document.body.appendChild(pill);

  pill.addEventListener("click", () => {
    const current = localStorage.getItem(STORAGE) || ORDER[0];
    const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
    apply(next);
  });

  document.addEventListener("keydown", (e) => {
    if (e.target && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
    if (e.key === "1") apply("orange");
    if (e.key === "2") apply("green");
    if (e.key === "3") apply("pink");
    if (e.key === "4") apply("wine");
  });

  const stored = localStorage.getItem(STORAGE);
  const initial = (stored && PALETTES[stored]) ? stored : ORDER[0];
  apply(initial);
})();
