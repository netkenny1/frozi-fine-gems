/* VIRIDIAN — shared behaviour. Zero dependencies. */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---- Header: condense after scroll ---- */
  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 24);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

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

  /* ---- Reveal + draw choreography ---- */
  var targets = document.querySelectorAll(".reveal, .observe");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
    );
    targets.forEach(function (el) {
      io.observe(el);
    });
  } else {
    targets.forEach(function (el) {
      el.classList.add("is-visible");
    });
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

    (function loop() {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      dot.style.transform = "translate(" + mx + "px," + my + "px)";
      ring.style.transform = "translate(" + rx + "px," + ry + "px)";
      requestAnimationFrame(loop);
    })();
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

  /* ---- Gentle hero parallax ---- */
  var heroArt = document.querySelector("[data-parallax]");
  if (heroArt && !reduceMotion) {
    var ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        heroArt.style.transform =
          "translateY(" + (window.scrollY * 0.08).toFixed(1) + "px)";
        ticking = false;
      });
    }, { passive: true });
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
