/* FROZI FINE GEMS — shared behaviour. Zero dependencies. */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---- Intro curtain: once per session, home only ---- */
  var intro = document.querySelector(".intro");
  if (intro) {
    var seen = false;
    try { seen = sessionStorage.getItem("frozi-intro") === "1"; } catch (e) {}
    if (seen || reduceMotion) {
      document.body.classList.add("no-intro");
    } else {
      try { sessionStorage.setItem("frozi-intro", "1"); } catch (e) {}
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
     inside their frames, the scroll-scrubbed ledger plate, the ref-code
     ticker, and a velocity shear on the vitrines. Everything writes
     transform / translate / scale / opacity only — no layout work. The
     independent translate/scale properties are used wherever a class
     already owns transform (hover zooms, reveal settles), so the two
     compose instead of fighting. */
  var layers = [];
  var pxImgs = [];
  var shearEls = [];
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
          pxImgs.push({ img: img, frame: img.parentElement });
        });
      heroGrid = document.querySelector(".hero-grid");
      heroCue = document.querySelector(".scroll-cue");
      heroBg = document.querySelector(".hero-bg");
    }
    var plate = document.querySelector(".scrub-plate");
    if (plate) scrub = { section: plate.closest("section"), paths: plate.querySelectorAll(".sd") };
    ticker = document.querySelector("[data-ticker]");
    if (finePointer) shearEls = document.querySelectorAll(".vitrine-media");
  }

  var vh = window.innerHeight;
  window.addEventListener("resize", function () { vh = window.innerHeight; }, { passive: true });

  var lastY = window.scrollY;
  var shear = 0;
  var shearOn = false;

  var ticking = false;
  function onScrollFrame() {
    var y = window.scrollY;
    var velocity = y - lastY;
    lastY = y;

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

    /* velocity shear: fast scrolling shears the vitrine glass by a
       fraction of a degree; it settles over the following frames */
    var settling = false;
    if (shearEls.length) {
      var target = Math.min(Math.max(velocity * 0.045, -1.8), 1.8);
      shear += (target - shear) * 0.14;
      if (Math.abs(shear) < 0.02 && Math.abs(target) < 0.02) {
        if (shearOn) {
          for (i = 0; i < shearEls.length; i++) shearEls[i].style.transform = "";
          shearOn = false;
        }
      } else {
        var sk = "skewY(" + shear.toFixed(3) + "deg)";
        for (i = 0; i < shearEls.length; i++) shearEls[i].style.transform = sk;
        shearOn = true;
        settling = true;
      }
    }

    ticking = false;
    if (settling) {
      ticking = true;
      requestAnimationFrame(onScrollFrame);
    }
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

    /* translate3d keeps both layers on the compositor; snap the ring to
       its target when close so it doesn't shimmer on sub-pixel deltas */
    (function loop() {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      if (Math.abs(mx - rx) < 0.1) rx = mx;
      if (Math.abs(my - ry) < 0.1) ry = my;
      dot.style.transform = "translate3d(" + mx + "px," + my + "px,0)";
      ring.style.transform = "translate3d(" + rx + "px," + ry + "px,0)";
      requestAnimationFrame(loop);
    })();
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
      items.forEach(function (item) {
        var hide = want !== "all" && item.getAttribute("data-category") !== want;
        item.classList.toggle("is-filtered", hide);
      });
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

  /* Forms are handled in store.js, which owns bag state and transport. */
})();
