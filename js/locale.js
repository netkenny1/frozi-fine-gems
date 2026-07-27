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
    GBP: { rate: 0.2153, symbol: "GBP", step: 25, pegged: false }
  };
  var ORDER = ["AED", "USD", "EUR", "GBP", "SAR"];
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

  function control() {
    var host = document.querySelector("[data-locale]");
    if (!host) return;
    var cur = currency(), lang = language();

    function select(kind, options, value, onPick, label) {
      var wrap = document.createElement("label");
      wrap.className = "locale-field";
      var name = document.createElement("span");
      name.className = "u-hidden";
      name.textContent = label;
      var sel = document.createElement("select");
      sel.className = "locale-select";
      options.forEach(function (opt) {
        var o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.text;
        if (opt.value === value) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener("change", function () { onPick(sel.value); });
      wrap.appendChild(name);
      wrap.appendChild(sel);
      host.appendChild(wrap);
      return sel;
    }

    select("currency", ORDER.map(function (c) { return { value: c, text: c }; }), cur,
      function (v) { window.FroziMoney.set(v); }, "Currency");
    /* the language control only appears once translated copy is loaded —
       a toggle that flips direction but leaves English behind is worse than
       no toggle at all */
    if (window.FROZI_AR) {
      select("lang", Object.keys(LANGS).map(function (l) {
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
