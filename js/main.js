/* FROZI FINE GEMS — shared behaviour. Zero dependencies. */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---- Intro curtain: every home load, unless reduced motion ----
     The lift itself is a CSS animation (see .intro) so it happens with or
     without this script. All that is left here is telling the rest of the
     choreography that a curtain is playing. */
  var intro = document.querySelector(".intro");
  if (intro && reduceMotion) {
    document.body.classList.add("no-intro");
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
      /* category tiles are excluded: their photographs hold still, so the
         row reads instantly instead of drifting */
      document.querySelectorAll(".img-frame:not(.stage-photo) img")
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

    /* read every rect first, then write: interleaving the two forces a
       synchronous re-layout per layer, which is exactly the jank this
       frame exists to avoid */
    var i, r, t;
    var layerRects = [];
    for (i = 0; i < layers.length; i++) {
      layerRects[i] = layers[i].el.getBoundingClientRect();
    }
    var pxRects = [];
    for (i = 0; i < pxImgs.length; i++) {
      pxRects[i] = pxImgs[i].active ? pxImgs[i].frame.getBoundingClientRect() : null;
    }
    var scrubRect = scrub ? scrub.section.getBoundingClientRect() : null;

    for (i = 0; i < layers.length; i++) {
      r = layerRects[i];
      var mid = r.top + r.height / 2 - vh / 2;
      layers[i].el.style.transform = "translateY(" + (-mid * layers[i].speed).toFixed(1) + "px)";
      if (layers[i].zoom) {
        t = Math.min(Math.max((vh - r.top) / (vh + r.height), 0), 1);
        layers[i].el.style.scale = (1.12 - 0.12 * t).toFixed(4);
      }
    }

    for (i = 0; i < pxImgs.length; i++) {
      r = pxRects[i];
      if (!r || r.bottom < 0 || r.top > vh) continue;
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
      r = scrubRect;
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
        /* fire while the element is still 12% below the fold: the reveal
           finishes as the reader arrives instead of after */
        { threshold: 0.01, rootMargin: "0px 0px 12% 0px" }
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
    setTimeout(startObserving, 800);
  } else {
    startObserving();
  }

  /* The cursor is the system cursor. Hover states live in CSS
     (.btn glow, card lift) — nothing chases the pointer. */

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

  /* ---- Hero plates ---------------------------------------------------
     Four featured pieces, one per form, crossfading in the hero. The
     order is curated, not ranked: the house has no sales or review data
     yet, and inventing "most bought" would be a claim we cannot stand
     behind. When real order counts exist, sort PLATES by them here.
     Inactive plates carry `inert`, so they leave the tab order and the
     accessibility tree instead of lurking invisibly behind the top one. */
  var rotator = document.querySelector("[data-hero-rotator]");
  if (rotator) {
    var plates = [].slice.call(rotator.querySelectorAll(".hero-piece"));
    var dots = [].slice.call(rotator.querySelectorAll(".hero-dot"));
    var shownAt = 0;
    var turn = null;
    var HOLD = 5400;

    var showPlate = function (next) {
      shownAt = (next + plates.length) % plates.length;
      plates.forEach(function (plate, i) {
        var on = i === shownAt;
        plate.classList.toggle("is-on", on);
        if (on) plate.removeAttribute("inert");
        else plate.setAttribute("inert", "");
      });
      dots.forEach(function (dot, i) {
        dot.classList.toggle("is-on", i === shownAt);
      });
    };

    var startTurning = function () {
      if (reduceMotion || turn) return;
      turn = setInterval(function () {
        showPlate(shownAt + 1);
      }, HOLD);
    };
    var stopTurning = function () {
      if (turn) {
        clearInterval(turn);
        turn = null;
      }
    };

    /* a deliberate choice wins the moment, then the rotation picks back
       up from there — it never stops for good */
    var restartFrom = function (next) {
      stopTurning();
      showPlate(next);
      startTurning();
    };

    dots.forEach(function (dot, i) {
      dot.addEventListener("click", function () {
        restartFrom(i);
      });
    });

    /* ---- drag the stack ------------------------------------------------
       One pointer path covers mouse, pen and touch. The plate follows the
       hand at a third of its travel (enough to feel connected, not enough
       to leave its frame), and past 40px it hands over to the next piece.
       CSS `touch-action: pan-y` keeps vertical scrolling intact. */
    var grabbedAt = null;
    var travel = 0;
    var isDragging = false;
    var wasDragged = false;
    var DRAG_SLOP = 6;
    var DRAG_THROW = 40;

    /* Each plate is a link wrapped round an image, so the browser starts
       its own native drag as soon as the pointer moves — which fires
       pointercancel and kills the gesture before it begins. Refusing
       dragstart is what makes the whole drag possible. */
    rotator.addEventListener("dragstart", function (e) {
      e.preventDefault();
    });

    rotator.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      grabbedAt = e.clientX;
      travel = 0;
      isDragging = false;
      stopTurning();
    });

    rotator.addEventListener("pointermove", function (e) {
      if (grabbedAt === null) return;
      travel = e.clientX - grabbedAt;
      if (!isDragging && Math.abs(travel) > DRAG_SLOP) {
        isDragging = true;
        rotator.classList.add("is-dragging");
        if (rotator.setPointerCapture) {
          try { rotator.setPointerCapture(e.pointerId); } catch (err) {}
        }
      }
      if (isDragging) {
        plates[shownAt].style.translate = (travel * 0.33).toFixed(1) + "px 0";
      }
    });

    var releaseDrag = function () {
      if (grabbedAt === null) return;
      var thrown = travel;
      plates[shownAt].style.translate = "";
      rotator.classList.remove("is-dragging");
      grabbedAt = null;
      wasDragged = isDragging && Math.abs(thrown) > DRAG_SLOP;
      isDragging = false;

      if (Math.abs(thrown) > DRAG_THROW) {
        /* dragging left reaches for the next plate — mirrored in Arabic */
        var forward = document.documentElement.dir === "rtl" ? thrown > 0 : thrown < 0;
        restartFrom(shownAt + (forward ? 1 : -1));
      } else {
        startTurning();
      }
    };

    rotator.addEventListener("pointerup", releaseDrag);
    rotator.addEventListener("pointercancel", releaseDrag);

    /* a throw must not also follow the link it started on */
    rotator.addEventListener(
      "click",
      function (e) {
        if (wasDragged) {
          e.preventDefault();
          e.stopPropagation();
          wasDragged = false;
        }
      },
      true
    );

    /* hold still while it is being read, and while the tab is in the
       background — a carousel ticking in a hidden tab is wasted work */
    rotator.addEventListener("mouseenter", stopTurning);
    rotator.addEventListener("mouseleave", startTurning);
    rotator.addEventListener("focusin", stopTurning);
    rotator.addEventListener("focusout", startTurning);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stopTurning();
      else startTurning();
    });

    showPlate(0);
    startTurning();
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

    /* the row swipes sideways on a phone under a feathered trailing edge
       (see .chip-row mask); drop the feather once there is nothing left
       to reach, so the last chip is not dimmed for no reason */
    var markScrollEnd = function () {
      var atEnd =
        chipRow.scrollWidth - chipRow.clientWidth - chipRow.scrollLeft <= 1;
      if (atEnd) chipRow.setAttribute("data-scroll-end", "");
      else chipRow.removeAttribute("data-scroll-end");
    };
    chipRow.addEventListener("scroll", markScrollEnd, { passive: true });
    window.addEventListener("resize", markScrollEnd);
    markScrollEnd();
    /* the home page's form strip links here as collections.html?cat=rings:
       arriving with a category pre-applies its chip */
    var wantCat = null;
    try { wantCat = new URLSearchParams(location.search).get("cat"); } catch (e) {}
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
    if (wantCat) {
      var preChip = chipRow.querySelector('.chip[data-value="' + CSS.escape(wantCat) + '"]');
      if (preChip) preChip.click();
    }
  }

  /* ---- A piece travels into its appointment ----
     The product page's viewing link carries the plate reference; the
     appointment form, seeing it arrive, sets the subject and opens the
     note with the reference already written. */
  var refcode = document.querySelector('[data-p="refcode"]');
  if (refcode) {
    var viewingLink = document.querySelector('.product-actions a[href*="contact.html"]');
    if (viewingLink) {
      var ref = (refcode.textContent || "").trim().replace(/[^\w-]/g, "");
      if (ref) viewingLink.href = viewingLink.href.split("?")[0] + "?piece=" + ref;
    }
  }
  var apptForm = document.querySelector("[data-appointment]");
  if (apptForm) {
    var pieceRef = null;
    try { pieceRef = new URLSearchParams(location.search).get("piece"); } catch (e) {}
    if (pieceRef) {
      pieceRef = pieceRef.replace(/[^\w-]/g, "");
      var interest = apptForm.querySelector("#f-interest");
      if (interest) interest.value = "A piece from the collection";
      var note = apptForm.querySelector("#f-message");
      if (note && !note.value && pieceRef) note.value = "About " + pieceRef + " — ";
    }
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
