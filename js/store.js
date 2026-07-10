/* FROZI FINE GEMS — bag, checkout, and inquiry transport.
   Loads on every page, after products.js (where present), before main.js.

   Transport: if API_BASE is set, orders and notes POST as JSON to the
   deployed worker in backend/worker.js. While it is empty (GitHub Pages
   has no server), submissions compose a structured mail to the atelier
   instead, and the on-page confirmation still shows. Flipping the site
   to a real backend is this one constant. */
(function () {
  "use strict";

  var API_BASE = ""; /* e.g. "https://frozi-api.<account>.workers.dev" */
  var ATELIER = "atelier@frozifinegems.com";
  var KEY = "frozi-bag-v1";

  /* ---- Bag state: [{ref, size, qty}] in localStorage ----
     Stored values are re-normalized on every read (digit-only sizes,
     integer quantities, known refs) so nothing hand-edited into
     localStorage can reach the markup built from them. */
  function read() {
    var bag;
    try {
      bag = JSON.parse(localStorage.getItem(KEY));
    } catch (e) {}
    if (!Array.isArray(bag)) return [];
    return bag
      .map(function (it) {
        return {
          ref: String(it && it.ref || ""),
          size: it && it.size ? String(it.size).replace(/[^0-9]/g, "") || null : null,
          qty: Math.max(1, Math.min(9, parseInt(it && it.qty, 10) || 1))
        };
      })
      .filter(function (it) { return /^FG-\d{3}$/.test(it.ref); });
  }
  function write(bag) {
    try { localStorage.setItem(KEY, JSON.stringify(bag)); } catch (e) {}
    renderBadge(bag);
  }
  function count(bag) {
    return bag.reduce(function (n, it) { return n + it.qty; }, 0);
  }
  function add(ref, size) {
    var bag = read();
    for (var i = 0; i < bag.length; i++) {
      if (bag[i].ref === ref && bag[i].size === size) {
        bag[i].qty += 1;
        write(bag);
        return bag;
      }
    }
    bag.push({ ref: ref, size: size, qty: 1 });
    write(bag);
    return bag;
  }

  /* ---- Money: registry prices are display strings ("AED 12,500") ---- */
  function cents(price) { return parseInt(price.replace(/[^0-9]/g, ""), 10) || 0; }
  function dollars(n) { return "AED " + n.toLocaleString("en-US"); }

  /* ---- Order references: FZ- + time in base 36, ledger-style ---- */
  function orderRef() {
    return "FZ-" + Date.now().toString(36).toUpperCase().slice(-6);
  }

  /* ---- Transport ---- */
  function submit(payload) {
    if (API_BASE) {
      return fetch(API_BASE + "/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (r) {
        if (!r.ok) throw new Error("api");
        return true;
      });
    }
    /* Fallback: hand the structured note to the visitor's mail client */
    var href = "mailto:" + ATELIER +
      "?subject=" + encodeURIComponent(payload.subject) +
      "&body=" + encodeURIComponent(payload.body);
    window.location.href = href;
    return Promise.resolve(true);
  }

  /* ---- Header badge: present on every page ---- */
  function renderBadge(bag) {
    var el = document.querySelector("[data-bag-count]");
    if (!el) return;
    var n = count(bag || read());
    el.textContent = n;
    el.hidden = n === 0;
  }
  renderBadge();

  var registry = (window.FROZI && window.FROZI.products) || null;

  /* ---- Product page: add to the bag ---- */
  var addBtn = document.querySelector("[data-add-to-bag]");
  if (addBtn && registry) {
    var params = new URLSearchParams(window.location.search);
    var ref = (params.get("ref") || "FG-011").toUpperCase();
    if (!registry[ref]) ref = "FG-011";
    addBtn.addEventListener("click", function () {
      var pressed = document.querySelector('.size[aria-pressed="true"]');
      var wantsSize = !document.querySelector('[data-p="sizes"]').hidden;
      var bag = add(ref, wantsSize && pressed ? pressed.textContent.trim() : null);
      var note = document.querySelector("[data-bag-note]");
      if (note) {
        var n = count(bag);
        note.querySelector("strong").textContent =
          n === 1 ? "One piece in your bag" : n + " pieces in your bag";
        note.hidden = false;
      }
      addBtn.classList.add("is-added");
      addBtn.querySelector("span").textContent = "Added — add another";
      var badge = document.querySelector("[data-bag-count]");
      if (badge) {
        badge.classList.remove("is-pulsing");
        void badge.offsetWidth; /* flush styles so the pulse restarts */
        badge.classList.add("is-pulsing");
      }
    });
  }

  /* ---- Bag page ---- */
  var bagRoot = document.querySelector("[data-bag-root]");
  if (bagRoot && registry) {
    var emptyEl = document.querySelector("[data-bag-empty]");
    var layoutEl = document.querySelector("[data-bag-layout]");
    var listEl = document.querySelector("[data-bag-items]");
    var subtotalEl = document.querySelector("[data-bag-subtotal]");

    /* All markup below is built from the hardcoded registry — the bag in
       localStorage stores only refs, sizes, and counts, and refs are
       validated against the registry before rendering. */
    var renderBag = function () {
      var bag = read().filter(function (it) { return registry[it.ref]; });
      var isEmpty = bag.length === 0;
      emptyEl.hidden = !isEmpty;
      layoutEl.hidden = isEmpty;
      if (isEmpty) return;

      var subtotal = 0;
      listEl.innerHTML = bag.map(function (it, i) {
        var p = registry[it.ref];
        var line = cents(p.price) * it.qty;
        subtotal += line;
        return (
          '<li class="bag-row" data-i="' + i + '">' +
          '<a class="bag-thumb" href="' + (p.href || "product.html?ref=" + p.ref) + '">' +
          '<img src="' + p.img + '" alt="" width="180" height="180" loading="lazy" decoding="async">' +
          "</a>" +
          '<div class="bag-row-body">' +
          '<h3 class="bag-row-name"><a href="' + (p.href || "product.html?ref=" + p.ref) + '">' + p.name + "</a></h3>" +
          '<p class="bag-row-meta">Ref. ' + p.ref + (it.size ? " · Size EU " + it.size : "") + " · Made to order</p>" +
          '<div class="bag-row-tools">' +
          '<span class="qty" role="group" aria-label="Quantity">' +
          '<button type="button" data-qty="-1" aria-label="Remove one">&minus;</button>' +
          "<span>" + it.qty + "</span>" +
          '<button type="button" data-qty="1" aria-label="Add one">+</button>' +
          "</span>" +
          '<button class="bag-remove" type="button" data-remove>Remove</button>' +
          "</div></div>" +
          '<span class="bag-row-price">' + dollars(line) + "</span>" +
          "</li>"
        );
      }).join("");
      subtotalEl.textContent = dollars(subtotal);
    };

    listEl.addEventListener("click", function (e) {
      var row = e.target.closest(".bag-row");
      if (!row) return;
      var bag = read().filter(function (it) { return registry[it.ref]; });
      var i = parseInt(row.getAttribute("data-i"), 10);
      var step = e.target.closest("[data-qty]");
      if (step) bag[i].qty += parseInt(step.getAttribute("data-qty"), 10);
      if (e.target.closest("[data-remove]") || bag[i].qty < 1) bag.splice(i, 1);
      write(bag);
      renderBag();
    });

    renderBag();

    /* Checkout: request the invoice */
    var checkout = document.querySelector("[data-checkout]");
    if (checkout) {
      checkout.addEventListener("submit", function (e) {
        e.preventDefault();
        if (checkout.elements.website.value) return; /* honeypot */
        var bag = read().filter(function (it) { return registry[it.ref]; });
        if (!bag.length) return;

        var reference = orderRef();
        var subtotal = 0;
        var lines = bag.map(function (it) {
          var p = registry[it.ref];
          subtotal += cents(p.price) * it.qty;
          return it.qty + " × " + p.name + " (Ref. " + p.ref + ")" +
            (it.size ? ", size EU " + it.size : "") + " — " + p.price;
        });

        var f = checkout.elements;
        submit({
          type: "order",
          subject: "Invoice request — " + reference,
          body: "Order " + reference + "\n\n" + lines.join("\n") +
            "\n\nSubtotal: " + dollars(subtotal) +
            "\n\nName: " + f.name.value + "\nEmail: " + f.email.value +
            (f.phone.value ? "\nTelephone: " + f.phone.value : "") +
            (f.message.value ? "\n\nNote:\n" + f.message.value : ""),
          reference: reference,
          items: bag,
          subtotal: subtotal,
          name: f.name.value,
          email: f.email.value,
          phone: f.phone.value,
          message: f.message.value
        }).catch(function () {}); /* the ledger copy below still confirms */

        write([]);
        bagRoot.hidden = true;
        var done = document.querySelector("[data-order-success]");
        done.querySelector("[data-order-ref]").textContent = reference;
        done.querySelector("[data-order-hint]").textContent = API_BASE
          ? "We reply within two working days to confirm the stone, the size, and the bench date."
          : "Your request has been drafted in your mail application — send it as written, and we reply within two working days.";
        done.classList.add("is-shown");
        done.focus();
      });
    }
  }

  /* ---- Appointment form (contact page) ---- */
  var form = document.querySelector("[data-appointment]");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (form.elements.website && form.elements.website.value) return;
      var f = form.elements;
      submit({
        type: "appointment",
        subject: "Appointment — " + f.interest.value,
        body: "Name: " + f.name.value + "\nEmail: " + f.email.value +
          "\nWriting about: " + f.interest.value +
          (f.message.value ? "\n\nNote:\n" + f.message.value : ""),
        name: f.name.value,
        email: f.email.value,
        interest: f.interest.value,
        message: f.message.value
      }).catch(function () {});
      form.classList.add("is-hidden");
      var success = document.querySelector(".form-success");
      if (success) {
        var hint = success.querySelector("[data-note-hint]");
        if (hint && !API_BASE) {
          hint.textContent = "Your note has been drafted in your mail application — send it as written.";
        }
        success.classList.add("is-shown");
        success.focus();
      }
    });
  }
})();
