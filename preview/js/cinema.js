/* FROZI FINE GEMS — scroll choreography (scrubbed, native scroll only).
   Three pinned moments, all driven 1:1 by scroll position and fully
   reversible:
     0. The stone: a 120-frame pre-rendered turntable of the maison emerald
        spinning on a diagonal, globe-tilted axis, scrubbed by scroll. A
        critically-damped follower chases the scroll target so fast flicks
        settle smoothly instead of snapping frame to frame; frames lazy-load
        and pre-decode as the section approaches.
     1. The manifesto: one serif sentence whose words ink in from dim sage
        to ivory as the reader scrolls its runway.
     2. The method cinema: three full-bleed photographs wipe open in
        sequence while the step copy crossfades (--mc-f1/--mc-f2 wipe
        progress, --mc-drift parallax, .is-current on the active step).
   Everything visual is opacity / clip-path / transform in main.css — no
   layout, no paint. Without JS (or with reduced motion) both sections read
   as static: sentence fully lit, one photograph, steps stacked. */
(function () {
  "use strict";

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }
  /* zero 1st+2nd derivative at both ends — motion starts and lands silkily */
  function smootherstep(x) {
    x = clamp01(x);
    return x * x * x * (x * (x * 6 - 15) + 10);
  }

  /* ---- the manifesto: words ink in with scroll ---- */
  var manifesto = document.querySelector("[data-manifesto]");
  var words = [];
  var lastAct = -1;
  if (manifesto) {
    var line = manifesto.querySelector(".mf-line");
    /* split into word spans once; em stays a styled word like any other */
    var frag = document.createDocumentFragment();
    Array.prototype.forEach.call(line.childNodes, function (node) {
      var isEm = node.nodeType === 1 && node.tagName === "EM";
      var text = node.textContent;
      text.split(/\s+/).forEach(function (w) {
        if (!w) return;
        var span = document.createElement("span");
        span.className = "mf-w";
        if (isEm) {
          var em = document.createElement("em");
          em.textContent = w;
          span.appendChild(em);
        } else {
          span.textContent = w;
        }
        frag.appendChild(span);
        frag.appendChild(document.createTextNode(" "));
        words.push(span);
      });
    });
    line.textContent = "";
    line.appendChild(frag);
    manifesto.classList.add("mf-live");
  }

  function updateManifesto() {
    if (!manifesto || !words.length) return;
    var rect = manifesto.getBoundingClientRect();
    var span = rect.height - window.innerHeight;
    if (span <= 0) return;
    var p = clamp01(-rect.top / span);
    /* each word owns a staggered window across the first 85% of the runway;
       the tail holds the finished sentence for a quiet beat */
    var n = words.length;
    for (var i = 0; i < n; i++) {
      var w = smootherstep((p - (i / n) * 0.72) / 0.22);
      words[i].style.opacity = (0.16 + 0.84 * w).toFixed(3);
    }
  }

  /* ---- the stone: scroll-turned 360 ---- */
  var rotator = document.querySelector("[data-rotator]");
  var rtFrames = [];
  var RT_N = 120;
  var rtLoaded = false;
  var rtLoadStarted = false;
  var rtLast = -1;   /* frame index currently on the canvas */
  var rtPos = -1;    /* eased frame position (float) */
  var rtTarget = 0;  /* frame position the scroll is asking for */
  var rtAnimating = false;
  var rtPrev = 0;
  var rtCanvas = null;
  var rtCtx = null;
  if (rotator) {
    rtCanvas = rotator.querySelector(".rt-canvas");
    rtCtx = rtCanvas ? rtCanvas.getContext("2d") : null;
    if (rtCtx) {
      rotator.classList.add("rt-live");
    } else {
      rotator = null;
    }
  }

  function rtSize() {
    if (!rtCanvas) return;
    var rect = rtCanvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(2, Math.round(rect.width * dpr));
    if (rtCanvas.width !== w) {
      rtCanvas.width = w;
      rtCanvas.height = w;
      /* resizing resets context state */
      rtCtx.imageSmoothingEnabled = true;
      rtCtx.imageSmoothingQuality = "high";
      rtLast = -1; /* force a redraw at the new backing size */
    }
  }

  function rtLoad() {
    if (rtLoadStarted || !rotator) return;
    rtLoadStarted = true;
    var done = 0;
    for (var i = 0; i < RT_N; i++) {
      (function (i) {
        var im = new Image();
        im.decoding = "async";
        im.src = "assets/rotation/emerald-" + ("00" + i).slice(-3) + ".webp";
        /* decode ahead of time so first drawImage of each frame never janks */
        var ready = function () {
          rtFrames[i] = im;
          if (++done === RT_N) {
            rtLoaded = true;
            rotator.classList.add("rt-ready");
            rtSize();
            rtLast = -1;
            updateRotator(true);
          }
        };
        if (im.decode) {
          im.decode().then(ready, ready);
        } else {
          im.onload = ready;
        }
      })(i);
    }
  }

  if (rotator && "IntersectionObserver" in window) {
    var rtIo = new IntersectionObserver(
      function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) {
          rtLoad();
          rtIo.disconnect();
        }
      },
      { rootMargin: "160% 0%" }
    );
    rtIo.observe(rotator);
  } else if (rotator) {
    rtLoad();
  }

  function rtDraw(idx) {
    if (idx === rtLast || !rtFrames[idx]) return;
    rtLast = idx;
    rtCtx.drawImage(rtFrames[idx], 0, 0, rtCanvas.width, rtCanvas.height);
  }

  /* critically-damped chase toward the scroll target — frame-rate
     independent, so a fast flick glides to rest instead of snapping */
  function rtTick(now) {
    var dt = Math.min(64, now - rtPrev) / 1000;
    rtPrev = now;
    rtPos += (rtTarget - rtPos) * (1 - Math.exp(-dt * 11));
    if (Math.abs(rtTarget - rtPos) < 0.1) {
      rtPos = rtTarget;
      rtAnimating = false;
    } else {
      requestAnimationFrame(rtTick);
    }
    rtDraw(Math.round(rtPos));
  }

  function updateRotator(snap) {
    if (!rotator || !rtLoaded) return;
    var rect = rotator.getBoundingClientRect();
    var span = rect.height - window.innerHeight;
    if (span <= 0) return;
    var p = clamp01(-rect.top / span);
    rtTarget = p * (RT_N - 1);
    /* tiny deltas (slow scrub) draw 1:1; big jumps ease in */
    if (snap || rtPos < 0 || Math.abs(rtTarget - rtPos) < 1.5) {
      rtPos = rtTarget;
      rtDraw(Math.round(rtPos));
      return;
    }
    if (!rtAnimating) {
      rtAnimating = true;
      rtPrev = performance.now();
      requestAnimationFrame(rtTick);
    }
  }

  /* ---- the method cinema ---- */
  var section = document.querySelector("[data-cinema]");
  var steps = section ? section.querySelectorAll("[data-mc-step]") : [];
  var counter = section ? section.querySelector("[data-mc-counter]") : null;
  if (section && steps.length === 3) {
    section.classList.add("mc-live");
  } else {
    section = null;
  }

  var ticking = false;
  var current = -1;
  var lastF1 = -1;
  var lastF2 = -1;

  function updateCinema() {
    if (!section) return;
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

  function update() {
    ticking = false;
    updateManifesto();
    updateRotator();
    updateCinema();
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", function () {
    rtSize();
    onScroll();
  });
  rtSize();
  update();
})();
