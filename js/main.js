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

  /* ---- Parallax layers: [data-parallax-speed] drift against scroll ---- */
  var layers = [];
  if (!reduceMotion) {
    document.querySelectorAll("[data-parallax-speed]").forEach(function (el) {
      layers.push({ el: el, speed: parseFloat(el.getAttribute("data-parallax-speed")) || 0.1 });
    });
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
    for (var i = 0; i < layers.length; i++) {
      var r = layers[i].el.getBoundingClientRect();
      var mid = r.top + r.height / 2 - vh / 2;
      layers[i].el.style.transform = "translateY(" + (-mid * layers[i].speed).toFixed(1) + "px)";
    }
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

  /* ---- Contact form (front-end only) ---- */
  var form = document.querySelector("[data-appointment]");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      form.classList.add("is-hidden");
      var success = document.querySelector(".form-success");
      if (success) {
        success.classList.add("is-shown");
        success.focus();
      }
    });
  }
})();
