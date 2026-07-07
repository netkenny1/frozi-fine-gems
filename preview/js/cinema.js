/* FROZI FINE GEMS — the method cinema.
   Scroll-scrubbed editorial triptych: three full-bleed photographs wipe open
   in sequence as the reader scrolls the tall .method-cinema section, while
   the matching step copy crossfades. Native scroll only — this file just
   converts scroll position into CSS custom properties on the section
   (--mc-f1/--mc-f2 wipe progress, --mc-drift parallax) and swaps an
   .is-current class between steps. Everything visual lives in main.css, all
   of it transform/clip-path/opacity, so nothing here causes layout or paint.
   Without JS (or with reduced motion) the section reads as one full-bleed
   photograph with the three steps stacked — see the .mc-live gate in CSS. */
(function () {
  "use strict";

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var section = document.querySelector("[data-cinema]");
  if (!section) return;

  var steps = section.querySelectorAll("[data-mc-step]");
  var counter = section.querySelector("[data-mc-counter]");
  if (steps.length !== 3) return;

  section.classList.add("mc-live");

  var ticking = false;
  var current = -1;
  var lastF1 = -1;
  var lastF2 = -1;

  function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }
  /* zero 1st+2nd derivative at both ends — wipes start and land silkily */
  function smootherstep(x) {
    x = clamp01(x);
    return x * x * x * (x * (x * 6 - 15) + 10);
  }

  function update() {
    ticking = false;
    var rect = section.getBoundingClientRect();
    var vh = window.innerHeight;
    var span = rect.height - vh;
    if (span <= 0) return;
    var p = clamp01(-rect.top / span);

    /* Three equal acts. Frame n+1 wipes over frame n across the middle of
       each act boundary, so every photograph gets a held, quiet beat. */
    var f1 = smootherstep((p - 0.28) / 0.17);
    var f2 = smootherstep((p - 0.61) / 0.17);
    if (f1 !== lastF1 || f2 !== lastF2) {
      section.style.setProperty("--mc-f1", f1.toFixed(4));
      section.style.setProperty("--mc-f2", f2.toFixed(4));
      /* one slow shared drift keeps the held frame breathing */
      section.style.setProperty("--mc-drift", (p * -3.2).toFixed(3) + "%");
      lastF1 = f1;
      lastF2 = f2;
    }

    var act = p < 0.365 ? 0 : p < 0.695 ? 1 : 2;
    if (act !== current) {
      current = act;
      for (var i = 0; i < steps.length; i++) {
        steps[i].classList.toggle("is-current", i === act);
      }
      if (counter) counter.textContent = "0" + (act + 1);
    }
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();
})();
