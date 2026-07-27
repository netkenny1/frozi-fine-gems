/* FROZI FINE GEMS — currency and language.
   -------------------------------------------------------------------------
   Prices are authored once, in AED, as display strings ("AED 12,500"). This
   script is the single place that turns them into any other currency, and
   the single place that swaps the interface language.

   AED is the settlement currency: the atelier invoices in dirhams. Every
   other currency here is a courtesy conversion off the AED peg, rounded to
   something a jeweller would actually quote, and labelled as indicative in
   the bag. Update RATES.asOf whenever the numbers are refreshed.

   Both choices persist in localStorage and are applied before paint where
   possible, so a returning client does not see prices or copy flip.
   Classic script on purpose, like the rest of js/ — no build step. */
(function () {
  "use strict";

  /* ---- currency ---------------------------------------------------------- */

  var RATES = {
    asOf: "2026-07",
    /* per 1 AED. AED and SAR are pegged to USD (3.6725 and 3.75), so those
       three are fixed; EUR and GBP drift and want refreshing. */
    AED: { rate: 1, symbol: "AED", step: 50, pegged: true },
    USD: { rate: 0.2723, symbol: "USD", step: 50, pegged: true },
    SAR: { rate: 1.0211, symbol: "SAR", step: 50, pegged: true },
    EUR: { rate: 0.2532, symbol: "EUR", step: 50, pegged: false },
    GBP: { rate: 0.2153, symbol: "GBP", step: 25, pegged: false },
    RUB: { rate: 23.4, symbol: "RUB", step: 500, pegged: false }
  };
  var ORDER = ["AED", "USD", "EUR", "GBP", "SAR", "RUB"];
  var CUR_KEY = "frozi-currency";

  function currency() {
    var saved;
    try { saved = localStorage.getItem(CUR_KEY); } catch (e) {}
    return RATES[saved] ? saved : "AED";
  }

  /* a jeweller quotes 6,050 — not 6,047. Round to the currency's step. */
  function money(aed, code) {
    var c = RATES[code] || RATES.AED;
    var raw = aed * c.rate;
    var step = raw < 1000 ? 10 : c.step;
    var rounded = Math.max(step, Math.round(raw / step) * step);
    return c.symbol + " " + rounded.toLocaleString("en-US");
  }

  function aedOf(el) {
    if (el.dataset.aed) return parseInt(el.dataset.aed, 10);
    var digits = (el.textContent || "").replace(/[^0-9]/g, "");
    var value = parseInt(digits, 10) || 0;
    el.dataset.aed = String(value);
    /* keep any words around the number ("…, made to order") */
    var tail = (el.textContent || "").replace(/^[^0-9]*[\d,]+/, "");
    if (tail) el.dataset.priceTail = tail;
    return value;
  }

  var PRICE_SELECTOR = ".vitrine-price, [data-p=\"price\"], [data-bag-subtotal], [data-price]";

  function paint(root) {
    var code = currency();
    var nodes = (root || document).querySelectorAll(PRICE_SELECTOR);
    Array.prototype.forEach.call(nodes, function (el) {
      var aed = aedOf(el);
      if (!aed && !el.dataset.aed) return;
      el.textContent = money(aed, code) + (el.dataset.priceTail || "");
    });
  }

  window.FroziMoney = {
    get code() { return currency(); },
    format: function (aed) { return money(aed, currency()); },
    paint: paint,
    rates: RATES,
    order: ORDER,
    settles: function () {
      return currency() === "AED"
        ? null
        : "Converted from AED at an indicative rate. The atelier invoices in AED.";
    },
    set: function (code) {
      if (!RATES[code]) return;
      try { localStorage.setItem(CUR_KEY, code); } catch (e) {}
      paint();
      document.dispatchEvent(new CustomEvent("frozi:currency", { detail: code }));
    }
  };

  /* ---- language ---------------------------------------------------------- */

  var LANG_KEY = "frozi-lang";
  var LANGS = { en: { label: "EN", dir: "ltr", tag: "en-AE" },
                ar: { label: "العربية", dir: "rtl", tag: "ar-AE" } };

  function language() {
    var saved;
    try { saved = localStorage.getItem(LANG_KEY); } catch (e) {}
    return LANGS[saved] ? saved : "en";
  }

  /* Amiri and Tajawal carry the Arabic set the way DM Serif Display and
     Jost carry the Latin one. Loaded only when Arabic is actually chosen;
     the inline head snippet does the same for a returning Arabic client,
     and this guard keeps the link single. */
  function ensureArabicFonts() {
    if (document.querySelector('link[href*="Tajawal"]')) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=Tajawal:wght@300;400;500;700&display=swap";
    document.head.appendChild(link);
  }

  function applyLanguage(code) {
    var lang = LANGS[code] || LANGS.en;
    if (code === "ar") ensureArabicFonts();
    var root = document.documentElement;
    root.setAttribute("lang", lang.tag);
    root.setAttribute("dir", lang.dir);
    root.classList.toggle("is-rtl", lang.dir === "rtl");
    /* innerHTML is deliberate and safe here: the only two sources are the
       authored dictionary in js/i18n-ar.js and the element's own markup
       captured on the way in. Both are first-party static content — no user
       or network input ever reaches this. Copy carries inline <em>, which is
       why it is not textContent. */
    var dict = window.FROZI_AR || {};
    Array.prototype.forEach.call(document.querySelectorAll("[data-t]"), function (el) {
      var key = el.getAttribute("data-t");
      if (code === "ar") {
        if (!("tEn" in el.dataset)) el.dataset.tEn = el.innerHTML;
        if (dict[key]) el.innerHTML = dict[key];
      } else if ("tEn" in el.dataset) {
        el.innerHTML = el.dataset.tEn;
      }
    });
    paint();
  }

  window.FroziLang = {
    get code() { return language(); },
    langs: LANGS,
    set: function (code) {
      if (!LANGS[code]) return;
      try { localStorage.setItem(LANG_KEY, code); } catch (e) {}
      applyLanguage(code);
      document.dispatchEvent(new CustomEvent("frozi:lang", { detail: code }));
    }
  };

  /* ---- the control ------------------------------------------------------- */

  /* The pickers are drawn, not native: a hairline gold button opening a
     small navy panel, the same materials as the rest of the chrome. The
     button carries the listbox pattern (aria-haspopup/expanded, arrow keys,
     Escape, click-away), so a keyboard or screen reader loses nothing. */
  function control() {
    var host = document.querySelector("[data-locale]");
    if (!host) return;
    var cur = currency(), lang = language();
    var openMenu = null;

    function closeOpen() {
      if (!openMenu) return;
      openMenu.btn.setAttribute("aria-expanded", "false");
      openMenu.wrap.classList.remove("is-open");
      openMenu = null;
    }
    document.addEventListener("click", function (e) {
      if (openMenu && !openMenu.wrap.contains(e.target)) closeOpen();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && openMenu) {
        var btn = openMenu.btn;
        closeOpen();
        btn.focus();
      }
    });

    function picker(kind, options, value, onPick, label) {
      var wrap = document.createElement("div");
      wrap.className = "locale-field locale-field--" + kind;

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "locale-btn";
      btn.setAttribute("aria-haspopup", "listbox");
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-label", label);

      var current = options.filter(function (o) { return o.value === value; })[0];
      var valueSpan = document.createElement("span");
      valueSpan.className = "locale-value";
      valueSpan.textContent = current ? current.text : value;
      var SVG = "http://www.w3.org/2000/svg";
      var chev = document.createElementNS(SVG, "svg");
      chev.setAttribute("class", "locale-chev");
      chev.setAttribute("viewBox", "0 0 10 6");
      chev.setAttribute("aria-hidden", "true");
      chev.setAttribute("focusable", "false");
      var path = document.createElementNS(SVG, "path");
      path.setAttribute("d", "M1 1l4 4 4-4");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      chev.appendChild(path);
      btn.appendChild(valueSpan);
      btn.appendChild(chev);

      var menu = document.createElement("ul");
      menu.className = "locale-menu";
      menu.setAttribute("role", "listbox");
      menu.setAttribute("aria-label", label);
      menu.tabIndex = -1;

      var items = options.map(function (opt) {
        var li = document.createElement("li");
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", opt.value === value ? "true" : "false");
        li.tabIndex = -1;
        li.dataset.value = opt.value;
        li.textContent = opt.text;
        menu.appendChild(li);
        return li;
      });

      function pick(li) {
        items.forEach(function (o) {
          o.setAttribute("aria-selected", o === li ? "true" : "false");
        });
        btn.querySelector(".locale-value").textContent = li.textContent;
        closeOpen();
        btn.focus();
        onPick(li.dataset.value);
      }

      btn.addEventListener("click", function () {
        var isOpen = openMenu && openMenu.wrap === wrap;
        closeOpen();
        if (isOpen) return;
        wrap.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
        openMenu = { wrap: wrap, btn: btn };
        var sel = items.filter(function (o) {
          return o.getAttribute("aria-selected") === "true";
        })[0];
        (sel || items[0]).focus();
      });

      menu.addEventListener("click", function (e) {
        var li = e.target.closest("[role='option']");
        if (li) pick(li);
      });
      menu.addEventListener("keydown", function (e) {
        var i = items.indexOf(document.activeElement);
        if (e.key === "ArrowDown") { e.preventDefault(); items[Math.min(i + 1, items.length - 1)].focus(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); items[Math.max(i - 1, 0)].focus(); }
        else if (e.key === "Home") { e.preventDefault(); items[0].focus(); }
        else if (e.key === "End") { e.preventDefault(); items[items.length - 1].focus(); }
        else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (i >= 0) pick(items[i]);
        }
      });

      wrap.appendChild(btn);
      wrap.appendChild(menu);
      host.appendChild(wrap);
    }

    picker("currency", ORDER.map(function (c) { return { value: c, text: c }; }), cur,
      function (v) { window.FroziMoney.set(v); }, "Currency");
    /* the language control only appears once translated copy is loaded —
       a toggle that flips direction but leaves English behind is worse than
       no toggle at all */
    if (window.FROZI_AR) {
      picker("lang", Object.keys(LANGS).map(function (l) {
        return { value: l, text: LANGS[l].label };
      }), lang, function (v) { window.FroziLang.set(v); }, "Language");
    }
  }

  /* ---- boot -------------------------------------------------------------- */

  function boot() {
    control();
    applyLanguage(language());          /* also paints prices */
    /* grids, related pieces and bag rows are rendered after this script runs,
       so re-price whatever appears later */
    if (window.MutationObserver) {
      var pending = 0;
      new MutationObserver(function (records) {
        var touched = records.some(function (r) { return r.addedNodes.length; });
        if (!touched || pending) return;
        pending = requestAnimationFrame(function () { pending = 0; paint(); });
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
