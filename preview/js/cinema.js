/* FROZI FINE GEMS — scroll choreography (scrubbed, native scroll only).
   Three pinned moments, all driven 1:1 by scroll position and fully
   reversible:
     0. The stone: a 120-frame pre-rendered tumble of the maison emerald on a
        wandering, nodding axis, scrubbed 1:1 by scroll (no follower — the
        frame tracks the finger with zero lag). Title, stone and note form one
        centered column; the stone lifts gently and swells toward the camera
        mid-runway while the type parallaxes and fades at the seams, so the
        moment flows in and out. Frames lazy-load and pre-decode as the
        section approaches.
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
  var RT_TURNS = 2; /* full tumbles across the section's whole viewport pass */
  var rtLoaded = false;
  var rtLoadStarted = false;
  var rtLast = -1;   /* frame index currently on the canvas */
  var rtLastP = -1;  /* last progress we wrote transforms for */
  var rtCanvas = null;
  var rtCtx = null;
  var rtStage = null;
  var rtHead = null;
  var rtNote = null;
  if (rotator) {
    rtCanvas = rotator.querySelector(".rt-canvas");
    rtStage = rotator.querySelector(".rt-stage");
    rtHead = rotator.querySelector(".rt-head");
    rtNote = rotator.querySelector(".rt-note");
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
            updateRotator();
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

  /* Two scroll progressions, no follower or easing loop (1:1, zero lag):
       p  — pinned progress (0 at pin start, 1 at pin end) drives the rise/zoom
            and the type, so the composition centres during the held beat.
       t  — full-travel progress across the section's WHOLE pass through the
            viewport (top entering the bottom edge -> bottom leaving the top).
            The frame is driven by t, so the stone keeps tumbling as it scrolls
            IN, through the pin, and OUT — never frozen at the seams. Frames are
            one seamless loop, so t wraps via modulo for a continuous multi-turn
            spin. Title, stone and note read as one centered column. */
  function updateRotator() {
    if (!rotator) return;
    var rect = rotator.getBoundingClientRect();
    var vh = window.innerHeight;
    var span = rect.height - vh;
    if (span <= 0) return;
    var p = clamp01(-rect.top / span);
    if (Math.abs(p - rtLastP) > 0.0015) {
      rtLastP = p;
      var e = smootherstep(p);
      /* gentle lift that stays framed; swell peaks mid then eases back */
      var ty = 6 - 12 * e;                          /* +6vh -> -6vh */
      var s = 0.92 + 0.14 * Math.sin(Math.PI * p);  /* 0.92 -> 1.06 -> 0.92 */
      if (rtStage) {
        rtStage.style.transform =
          "translate3d(0," + ty.toFixed(2) + "vh,0) scale(" + s.toFixed(4) + ")";
      }
      /* the type is fully present on arrival and only softens as the section
         leaves, smoothing the seam into the manifesto; a slight opposing
         parallax gives it some depth */
      var edge = smootherstep((1 - p) / 0.12);
      if (rtHead) {
        rtHead.style.opacity = edge.toFixed(3);
        rtHead.style.transform = "translate3d(0," + (-3.5 * e).toFixed(2) + "vh,0)";
      }
      if (rtNote) {
        rtNote.style.opacity = edge.toFixed(3);
        rtNote.style.transform = "translate3d(0," + (3 * e).toFixed(2) + "vh,0)";
      }
    }

    if (rtLoaded) {
      var t = clamp01((vh - rect.top) / (rect.height + vh));
      var idx = Math.round(t * RT_N * RT_TURNS) % RT_N;
      rtDraw(idx);
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
