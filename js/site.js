/* Studio front-end — renders data/profile.json, data/works.json and
   data/files.json. Nothing here is hard-coded except the shell. */
(function () {
  "use strict";

  var state = { profile: null, works: null, files: null, filter: "all", lbIndex: -1 };

  function bust(p) { return p + "?t=" + Date.now(); }

  function load(path) {
    return fetch(bust(path), { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(path + " " + r.status);
      return r.json();
    });
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function t(key) { return window.CCSi18n ? window.CCSi18n.t(key, window.CCSi18n.get()) : key; }
  function lang() { return window.CCSi18n ? window.CCSi18n.get() : "en"; }

  function catLabel(id) {
    var cats = (state.works && state.works.categories) || [];
    for (var i = 0; i < cats.length; i++) if (cats[i].id === id) return t(cats[i].label);
    return id;
  }

  function size(bytes) {
    if (!bytes && bytes !== 0) return "";
    var u = ["B", "KB", "MB", "GB"], i = 0, n = +bytes;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i === 0 ? n : n.toFixed(1)) + " " + u[i];
  }

  /* ---------- profile ---------- */
  function renderProfile() {
    var p = state.profile;
    if (!p) return;
    document.querySelectorAll("[data-profile]").forEach(function (n) {
      var v = p[n.getAttribute("data-profile")];
      if (v != null) n.textContent = v;
    });
    document.title = (p.name || "Studio") + " — Studio";
    var meta = document.querySelector('meta[name="description"]');
    if (meta && p.tagline) meta.setAttribute("content", p.tagline);

    var resume = document.getElementById("heroResume");
    setFileHref(resume, p.resumeFile);
    var mail = document.getElementById("cEmail");
    if (mail && p.email) mail.href = "mailto:" + p.email;
    var tel = document.getElementById("cPhone");
    if (tel && p.phone) tel.href = "tel:+" + p.phone.replace(/[^\d]/g, "");

    var box = document.getElementById("aboutText");
    box.innerHTML = "";
    (p.about || []).forEach(function (para) { box.appendChild(el("p", null, para)); });

    var sk = document.getElementById("skills");
    sk.innerHTML = "";
    (p.skills || []).forEach(function (g) {
      var wrap = el("div", "skill");
      wrap.appendChild(el("div", "skill__group", g.group));
      wrap.appendChild(el("div", "skill__items", (g.items || []).join(" · ")));
      sk.appendChild(wrap);
    });

    var lg = document.getElementById("langs");
    lg.innerHTML = "";
    (p.languages || []).forEach(function (l) {
      var li = el("li");
      li.appendChild(el("span", null, l.name));
      li.appendChild(el("span", null, l.level));
      lg.appendChild(li);
    });

    var it = document.getElementById("interests");
    it.innerHTML = "";
    (p.interests || []).forEach(function (x) { it.appendChild(el("li", null, x)); });

    var cl = document.getElementById("cLinks");
    cl.innerHTML = "";
    (p.links || []).forEach(function (l) {
      if (!l.url || /^mailto:|^tel:/.test(l.url)) return;
      var a = el("a", "contact__row");
      a.href = l.url; a.target = "_blank"; a.rel = "noopener";
      a.appendChild(el("span", "contact__k", l.label));
      a.appendChild(el("span", "contact__v", l.label));
      cl.appendChild(a);
    });
  }

  function setFileHref(node, name) {
    if (!node) return;
    var f = findFile(name);
    if (f) { node.href = f.path; node.removeAttribute("aria-disabled"); }
    else { node.href = "#files"; }
  }

  function findFile(name) {
    if (!name || !state.files) return null;
    var list = state.files.files || [];
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return null;
  }

  /* ---------- works ---------- */
  function renderFilters() {
    var box = document.getElementById("filters");
    if (!box) return;
    box.innerHTML = "";
    var all = el("button", "filter", t("All"));
    all.type = "button";
    all.setAttribute("data-i18n", "All");
    if (state.filter === "all") all.classList.add("is-on");
    all.addEventListener("click", function () { state.filter = "all"; renderWorks(); });
    box.appendChild(all);

    ((state.works && state.works.categories) || []).forEach(function (c) {
      var b = el("button", "filter", t(c.label));
      b.type = "button";
      b.setAttribute("data-i18n", c.label);
      if (state.filter === c.id) b.classList.add("is-on");
      b.addEventListener("click", function () { state.filter = c.id; renderWorks(); });
      box.appendChild(b);
    });
  }

  function visible() {
    return ((state.works && state.works.works) || []).filter(function (w) {
      return state.filter === "all" || w.category === state.filter;
    });
  }

  function renderWorks() {
    var grid = document.getElementById("grid");
    var empty = document.getElementById("worksEmpty");
    grid.innerHTML = "";
    renderFilters();

    var list = visible();
    empty.classList.toggle("is-hidden", list.length > 0);
    if (!list.length) return;

    list.forEach(function (w, i) {
      var card = el("button", "card" + (w.featured ? " card--wide" : ""));
      card.type = "button";

      var media;
      if (w.type === "video") {
        media = document.createElement("video");
        media.className = "card__media";
        media.src = w.src;
        if (w.poster) media.poster = w.poster;
        media.muted = true; media.loop = true; media.playsInline = true; media.preload = "metadata";
        card.appendChild(el("span", "card__play", "▶"));
      } else {
        media = document.createElement("img");
        media.className = "card__media";
        media.src = w.src || "";
        media.alt = w.title || "";
        media.loading = "lazy";
      }
      card.appendChild(media);

      var mask = el("div", "card__mask");
      mask.appendChild(el("span", "card__cat", catLabel(w.category)));
      mask.appendChild(el("h3", "card__title", w.title));
      mask.appendChild(el("span", "card__year", w.year || ""));
      card.appendChild(mask);

      card.addEventListener("mouseenter", function () {
        if (media.play) { var pr = media.play(); if (pr && pr.catch) pr.catch(function () {}); }
      });
      card.addEventListener("mouseleave", function () { if (media.pause) media.pause(); });
      card.addEventListener("click", function () { openLightbox(i); });
      grid.appendChild(card);
    });

    // Re-apply Chinese to the freshly built filter buttons.
    if (window.CCSi18n) window.CCSi18n.set(window.CCSi18n.get());
  }

  /* ---------- files ---------- */
  function renderFiles() {
    var box = document.getElementById("filesList");
    if (!box) return;
    box.innerHTML = "";
    var list = (state.files && state.files.files) || [];
    if (!list.length) {
      box.appendChild(el("li", "empty", t("No files yet.")));
      return;
    }
    list.forEach(function (f) {
      var li = el("li");
      li.appendChild(el("div", "file__ico", (f.kind || "file").toUpperCase().slice(0, 4)));
      var body = el("div", "file__body");
      body.appendChild(el("div", "file__name", f.name));
      var meta = size(f.size) + (f.added ? " · " + f.added : "");
      body.appendChild(el("div", "file__meta", meta));
      if (f.note) body.appendChild(el("div", "file__note", f.note));
      li.appendChild(body);
      var a = el("a", "file__go", t("Download"));
      a.href = f.path; a.target = "_blank"; a.rel = "noopener";
      a.setAttribute("download", f.name);
      li.appendChild(a);
      box.appendChild(li);
    });
  }

  /* ---------- lightbox ---------- */
  var lb = {};
  function openLightbox(i) {
    var list = visible();
    if (!list[i]) return;
    lb = {
      box: document.getElementById("lightbox"),
      stage: document.getElementById("lbStage"),
      title: document.getElementById("lbTitle"),
      meta: document.getElementById("lbMeta"),
      desc: document.getElementById("lbDesc"),
      link: document.getElementById("lbLink")
    };
    state.lbIndex = i;
    var w = list[i];
    lb.stage.innerHTML = "";
    var m;
    if (w.type === "video") {
      m = document.createElement("video");
      m.src = w.src; if (w.poster) m.poster = w.poster;
      m.controls = true; m.autoplay = true; m.loop = true; m.playsInline = true;
    } else {
      m = document.createElement("img");
      m.src = w.src; m.alt = w.title || "";
    }
    lb.stage.appendChild(m);
    lb.title.textContent = w.title || "";
    lb.meta.textContent = catLabel(w.category) + (w.year ? " · " + w.year : "");
    lb.desc.textContent = w.desc || "";
    if (w.link) { lb.link.href = w.link; lb.link.hidden = false; } else { lb.link.hidden = true; }
    lb.box.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeLightbox() {
    var box = document.getElementById("lightbox");
    box.hidden = true;
    document.getElementById("lbStage").innerHTML = "";
    document.body.style.overflow = "";
  }
  function step(d) {
    var list = visible();
    if (!list.length) return;
    openLightbox((state.lbIndex + d + list.length) % list.length);
  }

  function bindLightbox() {
    document.getElementById("lbClose").addEventListener("click", closeLightbox);
    document.getElementById("lbPrev").addEventListener("click", function () { step(-1); });
    document.getElementById("lbNext").addEventListener("click", function () { step(1); });
    document.getElementById("lightbox").addEventListener("click", function (e) {
      if (e.target.id === "lightbox") closeLightbox();
    });
    document.addEventListener("keydown", function (e) {
      if (document.getElementById("lightbox").hidden) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    });
  }

  /* ---------- misc ---------- */
  function bindReveal() {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach(function (n) { io.observe(n); });
  }

  function start() {
    var y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
    bindLightbox();

    Promise.all([load("data/profile.json"), load("data/works.json"), load("data/files.json")])
      .then(function (res) {
        state.profile = res[0]; state.works = res[1]; state.files = res[2];
        renderAll();
      })
      .catch(function (err) {
        var g = document.getElementById("grid");
        if (g) g.innerHTML = '<p class="empty">Could not load content (' + err.message + ').</p>';
      });

    document.addEventListener("i18n:change", function () {
      if (state.works) renderAll();
    });
    bindReveal();
  }

  function renderAll() {
    renderProfile();
    renderWorks();
    renderFiles();
  }

  window.CCSStudio = { state: state, render: renderAll, openLightbox: openLightbox };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
