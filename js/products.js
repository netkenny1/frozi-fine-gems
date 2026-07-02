/* FRUZI FINE GEMS — product registry + product-page hydration.
   One template (product.html) serves every piece via ?ref=FG-0xx.
   Loaded before main.js so reveals and tilt bind to hydrated content. */
(function () {
  "use strict";

  var PLATES = {
    vipera:
      '<g class="fine" opacity=".45">' +
      '<line class="draw" pathLength="1" x1="120" y1="4" x2="120" y2="236"/>' +
      '<line class="draw" pathLength="1" x1="4" y1="140" x2="236" y2="140"/>' +
      '</g>' +
      '<circle class="draw" pathLength="1" style="--i:2" cx="120" cy="140" r="58"/>' +
      '<circle class="draw fine" pathLength="1" style="--i:3" cx="120" cy="140" r="50"/>' +
      '<path class="draw" pathLength="1" style="--i:4" d="M104 46h32l12 12v18l-12 12h-32l-12-12V58z"/>' +
      '<path class="draw" pathLength="1" style="--i:5" d="M110 56h20l7 7v10l-7 7h-20l-7-7V63z"/>' +
      '<g style="--i:6">' +
      '<line class="draw fine" pathLength="1" x1="104" y1="46" x2="110" y2="56"/>' +
      '<line class="draw fine" pathLength="1" x1="136" y1="46" x2="130" y2="56"/>' +
      '<line class="draw fine" pathLength="1" x1="136" y1="88" x2="130" y2="80"/>' +
      '<line class="draw fine" pathLength="1" x1="104" y1="88" x2="110" y2="80"/>' +
      '<line class="draw" pathLength="1" x1="104" y1="88" x2="108" y2="96"/>' +
      '<line class="draw" pathLength="1" x1="136" y1="88" x2="132" y2="96"/>' +
      '</g>',
    meridian:
      '<circle class="draw" pathLength="1" cx="100" cy="100" r="56"/>' +
      '<circle class="draw" pathLength="1" style="--i:1" cx="100" cy="100" r="46"/>' +
      '<circle class="draw fine" pathLength="1" style="--i:2" cx="100" cy="100" r="51"/>',
    lumen:
      '<path class="draw" pathLength="1" d="M40 0C46 64 74 112 106 138"/>' +
      '<path class="draw" pathLength="1" d="M180 0C174 64 146 112 114 138"/>' +
      '<circle class="draw" pathLength="1" style="--i:1" cx="110" cy="148" r="8"/>' +
      '<line class="draw" pathLength="1" style="--i:2" x1="110" y1="156" x2="110" y2="168"/>' +
      '<path class="draw" pathLength="1" style="--i:2" d="M94 170h32l14 14v48l-14 14H94l-14-14v-48z"/>' +
      '<path class="draw" pathLength="1" style="--i:3" d="M102 185h16l9 9v28l-9 9h-16l-9-9v-28z"/>',
    voss:
      '<path class="draw" pathLength="1" d="M18 22C58 122 162 122 202 22"/>' +
      '<path class="draw fine" pathLength="1" style="--i:1" d="M26 22C62 112 158 112 194 22"/>' +
      '<path class="draw" pathLength="1" style="--i:2" d="M78 86l6 8-6 10-6-10z"/>' +
      '<path class="draw" pathLength="1" style="--i:3" d="M110 96l7 9-7 11-7-11z"/>' +
      '<path class="draw" pathLength="1" style="--i:4" d="M142 86l6 8-6 10-6-10z"/>',
    eos:
      '<circle class="dot" cx="70" cy="54" r="2.5"/>' +
      '<line class="draw" pathLength="1" x1="70" y1="58" x2="70" y2="68"/>' +
      '<circle class="draw" pathLength="1" style="--i:1" cx="70" cy="112" r="44"/>' +
      '<circle class="draw fine" pathLength="1" style="--i:2" cx="70" cy="112" r="37"/>' +
      '<circle class="dot" cx="132" cy="46" r="2.5"/>' +
      '<line class="draw" pathLength="1" style="--i:1" x1="132" y1="50" x2="132" y2="60"/>' +
      '<circle class="draw" pathLength="1" style="--i:3" cx="132" cy="104" r="44"/>' +
      '<circle class="draw fine" pathLength="1" style="--i:4" cx="132" cy="104" r="37"/>',
    thalis:
      '<circle class="dot" cx="70" cy="30" r="2.5"/>' +
      '<line class="draw" pathLength="1" x1="70" y1="34" x2="70" y2="52"/>' +
      '<circle class="draw" pathLength="1" style="--i:1" cx="70" cy="61" r="8"/>' +
      '<path class="draw" pathLength="1" style="--i:2" d="M70 74c18 22 22 46 0 64-22-18-18-42 0-64z"/>' +
      '<path class="draw fine" pathLength="1" style="--i:3" d="M70 86c11 15 14 32 0 44-14-12-11-29 0-44z"/>' +
      '<circle class="dot" cx="130" cy="44" r="2.5"/>' +
      '<line class="draw" pathLength="1" style="--i:1" x1="130" y1="48" x2="130" y2="66"/>' +
      '<circle class="draw" pathLength="1" style="--i:2" cx="130" cy="75" r="8"/>' +
      '<path class="draw" pathLength="1" style="--i:3" d="M130 88c18 22 22 46 0 64-22-18-18-42 0-64z"/>' +
      '<path class="draw fine" pathLength="1" style="--i:4" d="M130 100c11 15 14 32 0 44-14-12-11-29 0-44z"/>',
    sable:
      '<path class="draw" pathLength="1" d="M48 72C30 150 170 150 152 72"/>' +
      '<path class="draw fine" pathLength="1" style="--i:1" d="M56 76C42 140 158 140 144 76"/>' +
      '<circle class="draw" pathLength="1" style="--i:2" cx="48" cy="67" r="5"/>' +
      '<circle class="draw" pathLength="1" style="--i:2" cx="152" cy="67" r="5"/>',
    rill:
      '<path class="draw" pathLength="1" d="M16 24C60 100 160 100 204 24"/>' +
      '<path class="draw fine" pathLength="1" style="--i:1" d="M24 24C64 92 156 92 196 24"/>' +
      '<circle class="draw fine" pathLength="1" style="--i:2" cx="52" cy="58" r="3.2"/>' +
      '<circle class="draw fine" pathLength="1" style="--i:2" cx="81" cy="74" r="3.2"/>' +
      '<circle class="draw fine" pathLength="1" style="--i:3" cx="110" cy="80" r="3.2"/>' +
      '<circle class="draw fine" pathLength="1" style="--i:3" cx="139" cy="74" r="3.2"/>' +
      '<circle class="draw fine" pathLength="1" style="--i:4" cx="168" cy="58" r="3.2"/>' +
      '<circle class="draw" pathLength="1" style="--i:4" cx="16" cy="20" r="4.5"/>'
  };

  var PRODUCTS = {
    "FG-011": {
      ref: "FG-011", name: "Vipera Ring", category: "Rings", price: "$3,400",
      sub: "Step-cut emerald, diamond halo", sizes: true,
      img: "assets/img/vipera.jpg", imgW: 1200, imgH: 1600,
      imgAlt: "The Vipera Ring — a step-cut emerald in a diamond halo, photographed on white seamless",
      desc: "A single step-cut emerald held in a halo of brilliants, cut to the original 2026 drawing. The band is round in section — heavier than it looks, quieter than it sounds. Plate FG-011 in the maison ledger.",
      materials: ["Muzo-origin emerald, 1.2 ct, step cut", "Halo of recycled brilliants, 0.4 ct total", "Recycled platinum 950, round-section band"],
      plate: "vipera", plateBox: "0 0 240 240",
      related: ["FG-014", "FG-021", "FG-033"]
    },
    "FG-014": {
      ref: "FG-014", name: "Meridian Band", category: "Rings", price: "$1,850",
      sub: "Pavé-set band, satin platinum", sizes: true,
      img: "assets/img/meridian.jpg", imgW: 1200, imgH: 800,
      imgAlt: "The Meridian Band — a wide pavé-set band photographed on black",
      desc: "A full turn of pavé, set flush so the band reads as one unbroken surface of light. A single hairline groove — the meridian — runs the circumference. Plate FG-014 in the maison ledger.",
      materials: ["Recycled brilliants, 1.1 ct total, flush pavé", "Recycled platinum 950, satin interior", "Engraved meridian groove, hand-cut"],
      plate: "meridian", plateBox: "0 0 200 200",
      related: ["FG-011", "FG-041", "FG-031"]
    },
    "FG-021": {
      ref: "FG-021", name: "Lumen Pendant", category: "Necklaces", price: "$2,900",
      sub: "Emerald drop, hand-drawn chain", sizes: false,
      img: "assets/img/lumen.jpg", imgW: 1200, imgH: 1200,
      imgAlt: "The Lumen Pendant — an emerald drop on a fine chain, resting on deep green cloth",
      desc: "A step-cut emerald hung from a trace chain fine enough to disappear, so the stone appears to rest on the collarbone by agreement rather than engineering. Adjustable 42–45 cm. Plate FG-021 in the maison ledger.",
      materials: ["Muzo-origin emerald, 0.9 ct, step cut", "Recycled platinum trace chain, 42–45 cm", "Clasp engraved with the plate number"],
      plate: "lumen", plateBox: "0 0 220 280",
      related: ["FG-024", "FG-011", "FG-043"]
    },
    "FG-024": {
      ref: "FG-024", name: "Voss Collier", category: "Necklaces", price: "$9,200",
      sub: "Diamond fringe, emerald drops", sizes: false,
      img: "assets/img/voss.jpg", imgW: 1200, imgH: 800,
      imgAlt: "The Voss Collier — a diamond fringe necklace with emerald drops",
      desc: "The largest piece in the ledger: a fringe of baguettes that moves like water, carrying three graduated emerald drops. Made for occasions that don't repeat. Plate FG-024 in the maison ledger.",
      materials: ["Three graduated Muzo emeralds, 3.1 ct total", "Baguette fringe, recycled stones throughout", "Recycled platinum 950, articulated links"],
      plate: "voss", plateBox: "0 0 220 170",
      related: ["FG-021", "FG-033", "FG-041"]
    },
    "FG-031": {
      ref: "FG-031", name: "Eos Earrings", category: "Earrings", price: "$1,150",
      sub: "Chevron pavé, recycled platinum", sizes: false,
      img: "assets/img/eos.jpg", imgW: 1200, imgH: 800,
      imgAlt: "The Eos Earrings — pavé chevron drops photographed on black",
      desc: "Disc drops set with chevron rows of pavé, angled so they catch light on the turn of the head rather than head-on. Worn daily by everyone who has ever tried them. Plate FG-031 in the maison ledger.",
      materials: ["Recycled brilliants in chevron pavé", "Recycled platinum 950 discs and posts", "Butterfly backs, engraved"],
      plate: "eos", plateBox: "0 0 200 200",
      related: ["FG-033", "FG-021", "FG-014"]
    },
    "FG-033": {
      ref: "FG-033", name: "Thalis Drops", category: "Earrings", price: "$1,650",
      sub: "Pear-cut emeralds, articulated", sizes: false,
      img: "assets/img/thalis.jpg", imgW: 1200, imgH: 1200,
      imgAlt: "The Thalis Drops — green teardrop earrings in ornate silver settings",
      desc: "Pear-cut emeralds in openwork settings, articulated at the shoulder so the drops swing a half-beat behind the wearer. The drawing took eleven attempts; the movement was the hard part. Plate FG-033 in the maison ledger.",
      materials: ["Pear-cut emeralds, 2.4 ct total", "Openwork recycled platinum settings", "Articulated at post and shoulder"],
      plate: "thalis", plateBox: "0 0 200 220",
      related: ["FG-031", "FG-024", "FG-011"]
    },
    "FG-041": {
      ref: "FG-041", name: "Sable Cuff", category: "Bracelets", price: "$2,150",
      sub: "Pavé open cuff, blackened platinum", sizes: false,
      img: "assets/img/sable.jpg", imgW: 1200, imgH: 800,
      imgAlt: "The Sable Cuff — an open pavé cuff on a black reflective surface",
      desc: "An open cuff in blackened platinum with a single spine of pavé. The blackening wears at the high points over years — the piece records its owner. Plate FG-041 in the maison ledger.",
      materials: ["Recycled platinum 950, blackened finish", "Pavé spine of recycled brilliants", "Sprung opening, sized to the wrist at fitting"],
      plate: "sable", plateBox: "0 0 200 200",
      related: ["FG-043", "FG-014", "FG-031"]
    },
    "FG-043": {
      ref: "FG-043", name: "Rill Chain", category: "Bracelets", price: "$1,890",
      sub: "Diamond line bracelet, five stations", sizes: false,
      img: "assets/img/rill.jpg", imgW: 1200, imgH: 675,
      imgAlt: "The Rill Chain — a fine diamond line bracelet on black",
      desc: "A line bracelet fine as running water, interrupted five times by set stones — the stations. Fastens with a hidden box clasp that closes with a watchmaker's click. Plate FG-043 in the maison ledger.",
      materials: ["Five station-set recycled brilliants", "Recycled platinum 950 line links", "Hidden box clasp, engraved"],
      plate: "rill", plateBox: "0 0 220 130",
      related: ["FG-041", "FG-021", "FG-031"]
    }
  };

  window.FRUZI = { products: PRODUCTS, plates: PLATES };

  /* ---- Hydrate the product template ---- */
  var stage = document.querySelector(".product-stage");
  if (!stage) return;

  /* The URL param is used only as a lookup key into PRODUCTS — it must
     never be interpolated into markup. All innerHTML below is built from
     the hardcoded registry, so no user-controlled data reaches the DOM. */
  var params = new URLSearchParams(window.location.search);
  var ref = (params.get("ref") || "FG-011").toUpperCase();
  var p = PRODUCTS[ref] || PRODUCTS["FG-011"];

  document.title = p.name + " — Ref. " + p.ref + " — Fruzi Fine Gems";

  function setText(sel, text) {
    var el = document.querySelector(sel);
    if (el) el.textContent = text;
  }

  setText('[data-p="eyebrow"]', "Collection — " + p.category + " · Ref. " + p.ref);
  setText('[data-p="name"]', p.name);
  setText('[data-p="price"]', p.price + " — made to order");
  setText('[data-p="desc"]', p.desc);
  setText('[data-p="refcode"]', p.ref);

  var photo = document.querySelector('[data-p="photo"]');
  if (photo) {
    photo.src = p.img;
    photo.alt = p.imgAlt;
    photo.width = p.imgW;
    photo.height = p.imgH;
  }

  var plate = document.querySelector('[data-p="plate"]');
  if (plate) {
    plate.setAttribute("viewBox", p.plateBox);
    plate.innerHTML = PLATES[p.plate];
  }

  var materials = document.querySelector('[data-p="materials"]');
  if (materials) {
    materials.innerHTML = p.materials
      .map(function (m) { return "<li>" + m + "</li>"; })
      .join("");
  }

  var sizes = document.querySelector('[data-p="sizes"]');
  if (sizes && !p.sizes) sizes.hidden = true;

  /* Related vitrines */
  var relatedGrid = document.querySelector('[data-p="related"]');
  if (relatedGrid) {
    relatedGrid.innerHTML = p.related
      .map(function (r, i) {
        var q = PRODUCTS[r];
        return (
          '<article class="vitrine reveal" data-tilt' + (i ? ' style="--i:' + i + '"' : "") + ">" +
          '<div class="vitrine-top"><span class="ref">Ref. ' + q.ref + '</span><span class="ref">' + q.category.replace(/s$/, "") + "</span></div>" +
          '<div class="vitrine-media">' +
          '<img src="' + q.img + '" alt="' + q.imgAlt + '" width="' + q.imgW + '" height="' + q.imgH + '" loading="lazy" decoding="async">' +
          "</div>" +
          '<h3 class="vitrine-name"><a href="product.html?ref=' + q.ref + '">' + q.name + "</a></h3>" +
          '<p class="vitrine-sub">' + q.sub + "</p>" +
          '<div class="vitrine-meta"><span class="vitrine-price">' + q.price + '</span><span class="vitrine-cta">View piece</span></div>' +
          "</article>"
        );
      })
      .join("");
  }
})();
