/* FROZI FINE GEMS — shared behaviour. Zero dependencies. */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---- Intro curtain: every home load, unless reduced motion ---- */
  var intro = document.querySelector(".intro");
  if (intro) {
    if (reduceMotion) {
      document.body.classList.add("no-intro");
    } else {
      intro.classList.add("is-done"); /* transition-delay paces the exit */
    }
  }

  /* ---- Header: condense after scroll ---- */
  var header = document.querySelector(".site-header");

  /* ---- Scroll progress hairline ---- */
  var progress = document.querySelector(".progress");

  /* ---- Scroll choreography ----------------------------------------------
     One rAF frame drives every scroll-linked layer: parallax drift,
     deep-zoom settles, the hero's cinematic exit, photographs drifting
     inside their frames, the scroll-scrubbed ledger plate, and the ref-code
     ticker. Everything writes
     transform / translate / scale / opacity only — no layout work. The
     independent translate/scale properties are used wherever a class
     already owns transform (hover zooms, reveal settles), so the two
     compose instead of fighting. */
  var layers = [];
  var pxImgs = [];
  var scrub = null;
  var ticker = null;
  var heroGrid = null, heroCue = null, heroBg = null;
  var hasParts = "scale" in document.documentElement.style;

  if (!reduceMotion) {
    document.querySelectorAll("[data-parallax-speed]").forEach(function (el) {
      layers.push({
        el: el,
        speed: parseFloat(el.getAttribute("data-parallax-speed")) || 0.1,
        zoom: hasParts && el.hasAttribute("data-parallax-zoom")
      });
    });
    if (hasParts) {
      /* photographs drift inside their clipped frames; the slight
         over-scale provides the bleed the drift moves through */
      document.querySelectorAll(".img-frame:not(.stage-photo) img, .category-tile img")
        .forEach(function (img) {
          img.style.scale = "1.12";
          pxImgs.push({ img: img, frame: img.parentElement, active: false });
        });
      heroGrid = document.querySelector(".hero-grid");
      heroCue = document.querySelector(".scroll-cue");
      heroBg = document.querySelector(".hero-bg");
    }
    var plate = document.querySelector(".scrub-plate");
    if (plate) scrub = { section: plate.closest("section"), paths: plate.querySelectorAll(".sd") };
    ticker = document.querySelector("[data-ticker]");
  }

  if (pxImgs.length && "IntersectionObserver" in window) {
    var pxFor = new Map();
    pxImgs.forEach(function (item) {
      pxFor.set(item.frame, item);
    });
    var pxIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var item = pxFor.get(entry.target);
        if (item) item.active = entry.isIntersecting;
      });
    }, { rootMargin: "25% 0%" });
    pxImgs.forEach(function (item) { pxIo.observe(item.frame); });
  } else {
    pxImgs.forEach(function (item) { item.active = true; });
  }

  var vh = window.innerHeight;
  window.addEventListener("resize", function () { vh = window.innerHeight; }, { passive: true });

  var ticking = false;
  function onScrollFrame() {
    var y = window.scrollY;

    if (header) header.classList.toggle("is-scrolled", y > 24);
    if (progress) {
      var max = document.documentElement.scrollHeight - vh;
      progress.style.transform = "scaleX(" + (max > 0 ? Math.min(y / max, 1) : 0) + ")";
    }

    var i, r, t;
    for (i = 0; i < layers.length; i++) {
      r = layers[i].el.getBoundingClientRect();
      var mid = r.top + r.height / 2 - vh / 2;
      layers[i].el.style.transform = "translateY(" + (-mid * layers[i].speed).toFixed(1) + "px)";
      if (layers[i].zoom) {
        t = Math.min(Math.max((vh - r.top) / (vh + r.height), 0), 1);
        layers[i].el.style.scale = (1.12 - 0.12 * t).toFixed(4);
      }
    }

    for (i = 0; i < pxImgs.length; i++) {
      if (!pxImgs[i].active) continue;
      r = pxImgs[i].frame.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      t = (vh - r.top) / (vh + r.height);
      pxImgs[i].img.style.translate = "0 " + ((0.5 - t) * r.height * 0.1).toFixed(1) + "px";
    }

    /* hero: the copy rises and dissolves, the photograph leans in */
    if (heroGrid && y < vh * 1.2) {
      var hp = Math.min(y / (vh * 0.72), 1);
      heroGrid.style.translate = "0 " + (y * 0.38).toFixed(1) + "px";
      heroGrid.style.opacity = (1 - hp * hp).toFixed(3);
      if (heroCue) heroCue.style.opacity = (1 - Math.min(y / (vh * 0.22), 1)).toFixed(3);
      if (heroBg) heroBg.style.scale = (1 + hp * 0.1).toFixed(4);
    }

    /* the ledger plate draws at the pace of the reader's own scroll */
    if (scrub) {
      r = scrub.section.getBoundingClientRect();
      if (r.bottom >= 0 && r.top <= vh) {
        var sp = Math.min(Math.max(((vh - r.top) / (vh + r.height) - 0.1) / 0.55, 0), 1);
        for (i = 0; i < scrub.paths.length; i++) {
          scrub.paths[i].style.strokeDashoffset =
            1 - Math.min(Math.max(sp * 1.7 - i * 0.09, 0), 1);
        }
      }
    }

    if (ticker) ticker.style.transform = "translate3d(" + (-y * 0.3).toFixed(1) + "px,0,0)";

    ticking = false;
  }
  window.addEventListener("scroll", function () {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(onScrollFrame);
    }
  }, { passive: true });
  onScrollFrame();

  /* ---- Mobile nav ---- */
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("is-open");
      toggle.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        links.classList.remove("is-open");
        toggle.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---- Reveal + draw + image-wipe choreography ----
     If the intro curtain is playing, hold the first reveals until it lifts. */
  var targets = document.querySelectorAll(".reveal, .observe, .img-frame, .masked");
  function startObserving() {
    if ("IntersectionObserver" in window && !reduceMotion) {
      /* A fully clipped .img-frame has zero visible area, so it can never
         intersect. Observe its parent instead and proxy the class down. */
      var frameFor = new Map();
      var observed = new Set();
      targets.forEach(function (el) {
        if (el.classList.contains("img-frame") && el.parentElement) {
          frameFor.set(el.parentElement, el);
          observed.add(el.parentElement);
        } else {
          observed.add(el);
        }
      });
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              var frame = frameFor.get(entry.target);
              if (frame) frame.classList.add("is-visible");
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
      );
      observed.forEach(function (el) {
        io.observe(el);
      });
    } else {
      targets.forEach(function (el) {
        el.classList.add("is-visible");
      });
    }
  }
  var introPlaying = intro && !document.body.classList.contains("no-intro") && !reduceMotion;
  if (introPlaying) {
    setTimeout(startObserving, 1450);
  } else {
    startObserving();
  }

  /* ---- Custom cursor: dot leads, ring follows ---- */
  if (finePointer && !reduceMotion) {
    var dot = document.createElement("div");
    var ring = document.createElement("div");
    dot.className = "cursor-dot";
    ring.className = "cursor-ring";
    dot.setAttribute("aria-hidden", "true");
    ring.setAttribute("aria-hidden", "true");
    document.body.appendChild(dot);
    document.body.appendChild(ring);

    var mx = -100, my = -100, rx = -100, ry = -100;
    var shown = false;

    document.addEventListener("mousemove", function (e) {
      mx = e.clientX;
      my = e.clientY;
      if (!shown) {
        shown = true;
        rx = mx;
        ry = my;
        document.body.classList.add("has-cursor");
      }
    }, { passive: true });

    document.addEventListener("mouseleave", function () {
      shown = false;
      document.body.classList.remove("has-cursor");
    });

    var HOT = "a, button, summary, input, select, textarea, label, [role='button']";
    document.addEventListener("mouseover", function (e) {
      document.body.classList.toggle("cursor-on-link", !!e.target.closest(HOT));
    }, { passive: true });

    var cursorRaf = 0;
    function paintCursor() {
      cursorRaf = 0;
      if (!shown) return;
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      if (Math.abs(mx - rx) < 0.1) rx = mx;
      if (Math.abs(my - ry) < 0.1) ry = my;
      dot.style.transform = "translate3d(" + mx + "px," + my + "px,0)";
      ring.style.transform = "translate3d(" + rx + "px," + ry + "px,0)";
      if (rx !== mx || ry !== my) cursorRaf = requestAnimationFrame(paintCursor);
    }

    function requestCursorFrame() {
      if (!cursorRaf) cursorRaf = requestAnimationFrame(paintCursor);
    }

    document.addEventListener("mousemove", requestCursorFrame, { passive: true });
    document.addEventListener("mouseleave", function () {
      if (cursorRaf) cancelAnimationFrame(cursorRaf);
      cursorRaf = 0;
    });
  }

  /* ---- 3D tilt: vitrines lean toward the pointer ---- */
  if (finePointer && !reduceMotion) {
    document.querySelectorAll("[data-tilt]").forEach(function (card) {
      var raf = null;
      card.addEventListener("mousemove", function (e) {
        if (raf) return;
        raf = requestAnimationFrame(function () {
          var r = card.getBoundingClientRect();
          var px = (e.clientX - r.left) / r.width - 0.5;
          var py = (e.clientY - r.top) / r.height - 0.5;
          card.style.setProperty("--ry", (px * 3.5).toFixed(2) + "deg");
          card.style.setProperty("--rx", (-py * 3.5).toFixed(2) + "deg");
          raf = null;
        });
      });
      card.addEventListener("mouseleave", function () {
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
      });
    });
  }

  /* ---- Magnetic buttons: drift a few px toward the pointer ---- */
  if (finePointer && !reduceMotion) {
    document.querySelectorAll(".btn").forEach(function (btn) {
      var raf = null;
      btn.addEventListener("mousemove", function (e) {
        if (raf) return;
        raf = requestAnimationFrame(function () {
          var r = btn.getBoundingClientRect();
          var x = ((e.clientX - r.left) / r.width - 0.5) * 8;
          var y = ((e.clientY - r.top) / r.height - 0.5) * 6;
          btn.style.translate = x.toFixed(1) + "px " + y.toFixed(1) + "px";
          raf = null;
        });
      });
      btn.addEventListener("mouseleave", function () {
        btn.style.translate = "0px 0px";
      });
    });
  }

  /* ---- Product stage: photograph <-> plate toggle ---- */
  var stage = document.querySelector(".product-stage");
  var stageToggle = document.querySelector(".stage-toggle");
  if (stage && stageToggle) {
    stageToggle.addEventListener("click", function () {
      var plate = stage.classList.toggle("show-plate");
      stageToggle.querySelector("span").textContent = plate
        ? "View the photograph"
        : "View the plate";
      stageToggle.setAttribute("aria-pressed", plate ? "true" : "false");
    });
  }

  /* ---- Lightbox: click the product photograph to enlarge ---- */
  var lightbox = document.querySelector(".lightbox");
  var stagePhoto = document.querySelector(".stage-photo");
  if (lightbox && stagePhoto) {
    var lbImg = lightbox.querySelector("img");
    var closeBtn = lightbox.querySelector(".lightbox-close");
    var openLightbox = function () {
      var img = stagePhoto.querySelector("img");
      lbImg.src = img.currentSrc || img.src;
      lbImg.alt = img.alt;
      lightbox.classList.add("is-open");
      if (closeBtn) closeBtn.focus();
    };
    var closeLightbox = function () {
      lightbox.classList.remove("is-open");
    };
    stagePhoto.addEventListener("click", openLightbox);
    lightbox.addEventListener("click", closeLightbox);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeLightbox();
    });
  }

  /* ---- Collection filter ---- */
  var chipRow = document.querySelector("[data-filter]");
  if (chipRow) {
    var chips = chipRow.querySelectorAll(".chip");
    var items = document.querySelectorAll("[data-category]");
    chipRow.addEventListener("click", function (e) {
      var chip = e.target.closest(".chip");
      if (!chip) return;
      chips.forEach(function (c) {
        c.setAttribute("aria-pressed", c === chip ? "true" : "false");
      });
      var want = chip.getAttribute("data-value");
      var shown = 0;
      items.forEach(function (item) {
        var hide = want !== "all" && item.getAttribute("data-category") !== want;
        item.classList.toggle("is-filtered", hide);
        item.classList.remove("is-dealt");
        if (!hide) item.style.setProperty("--d", shown++);
      });
      if (!reduceMotion) {
        void chipRow.offsetWidth; /* flush styles so the deal restarts */
        items.forEach(function (item) {
          if (!item.classList.contains("is-filtered")) {
            item.classList.add("is-dealt");
          }
        });
      }
    });
  }

  /* ---- Size selector (product page) ---- */
  var sizeRow = document.querySelector(".size-row");
  if (sizeRow) {
    sizeRow.addEventListener("click", function (e) {
      var size = e.target.closest(".size");
      if (!size) return;
      sizeRow.querySelectorAll(".size").forEach(function (s) {
        s.setAttribute("aria-pressed", s === size ? "true" : "false");
      });
    });
  }

  /* ---- Page-to-page morph ----
     Cross-document view transitions carry the clicked vitrine photograph
     onto the product stage. Only one element per page may hold the name,
     so it is assigned at click time and cleared on bfcache restores. */
  if (!reduceMotion && "startViewTransition" in document) {
    document.addEventListener("click", function (e) {
      /* Either anchor inside a vitrine names the image: the caption link
         (.vitrine-name a) AND the image-wrapping link in .vitrine-media. This
         way the cross-document morph fires from every entry point — the
         stacked fallback cards AND the immersive-mode screen-anchored labels,
         whichever <a> the click resolves to. */
      var link = e.target.closest('.vitrine a[href*="product.html"]');
      if (!link) return;
      var vitrine = link.closest(".vitrine");
      var img = vitrine && vitrine.querySelector(".vitrine-media img");
      if (img) img.style.viewTransitionName = "piece";
    });

    window.addEventListener("pageshow", function (e) {
      if (!e.persisted) return;
      document.querySelectorAll(".vitrine-media img").forEach(function (img) {
        img.style.viewTransitionName = "";
      });
    });

    /* arriving mid-transition, the stage photograph skips its own
       clip-wipe entrance — the travelling image is the only motion */
    window.addEventListener("pagereveal", function (e) {
      if (!e.viewTransition) return;
      var frame = document.querySelector(".stage-photo");
      if (frame) frame.classList.add("vt-arrival", "is-visible");
    });
  }

  /* Forms are handled in store.js, which owns bag state and transport. */
})();
