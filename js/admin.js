/* Studio admin — edit works / files / profile, publish as one GitHub commit. */
(function () {
  "use strict";

  var LS_TOKEN = "ccs-studio-token";
  var LS_REPO = "ccs-studio-repo";

  var S = {
    owner: "chenjuncheng80-ctrl",
    repo: "studio",
    branch: "main",
    profile: null,
    works: null,
    files: null,
    uploads: [],   // [{ path, content, size }] pending blobs
    deletes: [],   // [path] pending deletions
    dirty: false,
    connected: false
  };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function toast(msg, kind) {
    var t = $("#toast");
    t.textContent = msg;
    t.className = "toast" + (kind ? " is-" + kind : "");
    t.hidden = false;
    clearTimeout(toast._id);
    toast._id = setTimeout(function () { t.hidden = true; }, 4200);
  }

  function markDirty() {
    S.dirty = true;
    var st = $("#status");
    st.textContent = "Unpublished changes";
    st.className = "bar__status is-dirty";
    $("#btnPublish").disabled = false;
  }

  function markClean(msg) {
    S.dirty = false;
    var st = $("#status");
    st.textContent = msg || "Up to date";
    st.className = "bar__status" + (msg ? " is-ok" : "");
    $("#btnPublish").disabled = true;
  }

  function uid(prefix) {
    return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function safeName(name) {
    var dot = name.lastIndexOf(".");
    var base = dot > 0 ? name.slice(0, dot) : name;
    var ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
    base = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
    if (!base) base = "file";
    return ext ? base + "." + ext : base;
  }

  function uniquePath(dir, name) {
    var candidate = dir + "/" + safeName(name);
    var taken = {};
    S.uploads.forEach(function (u) { taken[u.path] = 1; });
    ((S.files && S.files.files) || []).forEach(function (f) { taken[f.path] = 1; });
    ((S.works && S.works.works) || []).forEach(function (w) {
      if (w.src) taken[w.src] = 1;
      if (w.poster) taken[w.poster] = 1;
    });
    if (!taken[candidate]) return candidate;
    var dot = candidate.lastIndexOf(".");
    var base = dot > 0 ? candidate.slice(0, dot) : candidate;
    var ext = dot > 0 ? candidate.slice(dot) : "";
    var i = 2;
    while (taken[base + "-" + i + ext]) i++;
    return base + "-" + i + ext;
  }

  function kindOf(name) {
    var ext = (name.split(".").pop() || "").toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"].indexOf(ext) >= 0) return "image";
    if (["mp4", "webm", "mov", "m4v"].indexOf(ext) >= 0) return "video";
    if (ext === "pdf") return "pdf";
    return ext || "file";
  }

  function size(bytes) {
    var u = ["B", "KB", "MB", "GB"], i = 0, n = +bytes || 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i === 0 ? n : n.toFixed(1)) + " " + u[i];
  }

  /* ================= connect ================= */

  function saveRepoSettings() {
    try {
      localStorage.setItem(LS_REPO, JSON.stringify({ owner: S.owner, repo: S.repo, branch: S.branch }));
    } catch (e) {}
  }

  function loadRepoSettings() {
    try {
      var raw = localStorage.getItem(LS_REPO);
      if (raw) {
        var o = JSON.parse(raw);
        if (o.owner) S.owner = o.owner;
        if (o.repo) S.repo = o.repo;
        if (o.branch) S.branch = o.branch;
      }
    } catch (e) {}
    $("#ownerInput").value = S.owner;
    $("#repoInput").value = S.repo;
    $("#branchInput").value = S.branch;
  }

  function connect(token) {
    var err = $("#authErr");
    err.textContent = "Checking…";
    S.owner = $("#ownerInput").value.trim() || S.owner;
    S.repo = $("#repoInput").value.trim() || S.repo;
    S.branch = $("#branchInput").value.trim() || S.branch;
    GH.setToken(token);
    try { localStorage.setItem(LS_TOKEN, token); } catch (e) {}
    saveRepoSettings();

    return GH.repo(S.owner, S.repo)
      .then(function () { return pull(); })
      .then(function () {
        S.connected = true;
        $("#auth").hidden = true;
        $("#app").hidden = false;
        $("#repoLabel").textContent = S.owner + "/" + S.repo + " · " + S.branch;
        markClean("Connected");
        renderAll();
      })
      .catch(function (e) {
        err.textContent = friendly(e);
        S.connected = false;
      });
  }

  function friendly(e) {
    if (e.status === 401) return "Token rejected (401). Check it is a fine-grained token with Contents: Read and write on this repo.";
    if (e.status === 403) return "Forbidden (403). The token is missing Contents: Read and write, or you hit a rate limit.";
    if (e.status === 404) return "Not found (404). Check owner / repository / branch.";
    return e.message || "Something went wrong.";
  }

  function pull() {
    var base = "/repos/" + S.owner + "/" + S.repo;
    function get(path, fallbackUrl) {
      return GH.getFile(S.owner, S.repo, path, S.branch)
        .then(function (f) { return JSON.parse(f.text); })
        .catch(function (e) {
          if (e.status !== 404) throw e;
          return fetch(fallbackUrl, { cache: "no-store" }).then(function (r) { return r.json(); });
        });
    }
    return Promise.all([
      get("data/profile.json", "data/profile.json"),
      get("data/works.json", "data/works.json"),
      get("data/files.json", "data/files.json")
    ]).then(function (res) {
      S.profile = res[0]; S.works = res[1]; S.files = res[2];
      if (!S.works.categories) S.works.categories = [];
      if (!S.works.works) S.works.works = [];
      if (!S.files.files) S.files.files = [];
    });
  }

  /* ================= works ================= */

  function renderWorks() {
    var box = $("#workRows");
    box.innerHTML = "";
    $("#worksCount").textContent = S.works.works.length ? "(" + S.works.works.length + ")" : "";
    if (!S.works.works.length) {
      var p = el("li", "hint", "No works yet — hit “+ Add work”.");
      box.appendChild(p);
      return;
    }
    S.works.works.forEach(function (w, i) {
      var row = el("li", "row");
      row.draggable = true;
      row.dataset.index = String(i);

      var grip = el("span", "row__grip", "⋮⋮");
      row.appendChild(grip);

      var thumb = document.createElement(kindOf(w.src || "") === "video" ? "video" : "img");
      thumb.className = "row__thumb";
      if (thumb.tagName === "IMG") { thumb.src = w.src || ""; thumb.alt = ""; }
      else { thumb.src = w.src || ""; thumb.muted = true; }
      row.appendChild(thumb);

      var body = el("div", "row__body");
      body.appendChild(el("div", "row__title", w.title || "(untitled)"));
      body.appendChild(el("div", "row__meta", [catLabel(w.category), w.year, w.featured ? "featured" : ""].filter(Boolean).join(" · ")));
      row.appendChild(body);

      var ops = el("div", "row__ops");
      ops.appendChild(miniBtn("Edit", function () { openWork(i); }));
      ops.appendChild(miniBtn("Delete", function () { deleteWork(i); }, true));
      row.appendChild(ops);

      box.appendChild(row);
    });
    bindDrag();
  }

  function miniBtn(label, fn, danger) {
    var b = el("button", "btn btn--mini" + (danger ? " btn--danger" : ""), label);
    b.type = "button";
    b.addEventListener("click", fn);
    return b;
  }

  function catLabel(id) {
    var cats = S.works.categories || [];
    for (var i = 0; i < cats.length; i++) if (cats[i].id === id) return cats[i].label;
    return id || "—";
  }

  function bindDrag() {
    var rows = $$("#workRows .row");
    var from = -1;
    rows.forEach(function (row) {
      row.addEventListener("dragstart", function () {
        from = +row.dataset.index;
        row.style.opacity = "0.4";
      });
      row.addEventListener("dragend", function () { row.style.opacity = ""; });
      row.addEventListener("dragover", function (e) { e.preventDefault(); });
      row.addEventListener("drop", function (e) {
        e.preventDefault();
        var to = +row.dataset.index;
        if (from < 0 || to < 0 || from === to) return;
        var moved = S.works.works.splice(from, 1)[0];
        S.works.works.splice(to, 0, moved);
        markDirty();
        renderWorks();
      });
    });
  }

  var editing = { index: -1, media: null, poster: null };

  function openWork(index) {
    editing = { index: index, media: null, poster: null };
    var w = index >= 0 ? S.works.works[index] : {
      id: uid("w"), title: "", category: (S.works.categories[0] && S.works.categories[0].id) || "photography",
      year: String(new Date().getFullYear()), desc: "", type: "image", src: "", poster: "", link: "", featured: false
    };
    $("#workModalTitle").textContent = index >= 0 ? "Edit work" : "Add work";

    var sel = $('[data-w="category"]');
    sel.innerHTML = "";
    S.works.categories.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c.id; o.textContent = c.label;
      if (c.id === w.category) o.selected = true;
      sel.appendChild(o);
    });

    $$("[data-w]", $("#workModal")).forEach(function (n) {
      var k = n.getAttribute("data-w");
      if (k === "featured") n.checked = !!w.featured;
      else n.value = w[k] || "";
    });

    $("#mediaName").textContent = w.src ? w.src : "No file chosen";
    $("#posterName").textContent = w.poster ? w.poster : "No poster";
    renderPreview(w.src, w.type);
    $("#workModal").hidden = false;
  }

  function renderPreview(src, type) {
    var box = $("#mediaPreview");
    box.innerHTML = "";
    if (!src) { box.textContent = "no media"; return; }
    var m;
    if (type === "video") { m = document.createElement("video"); m.src = src; m.muted = true; }
    else { m = document.createElement("img"); m.src = src; }
    box.appendChild(m);
  }

  function pickMedia(file, which) {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { toast("That file is over 25 MB — try a smaller export.", "err"); return; }
    GH.readFileBase64(file).then(function (b64) {
      var dir = which === "poster" ? "assets/works" : "assets/works";
      var path = uniquePath(dir, file.name);
      var upload = { path: path, content: b64, size: file.size };
      if (which === "poster") editing.poster = upload; else editing.media = upload;
      var url = URL.createObjectURL(file);
      if (which === "poster") { $("#posterName").textContent = path; }
      else {
        $("#mediaName").textContent = path;
        renderPreview(url, file.type.indexOf("video") === 0 ? "video" : "image");
      }
    });
  }

  function saveWork() {
    var index = editing.index;
    var w = index >= 0 ? S.works.works[index] : null;
    var isNew = index < 0;
    if (isNew) w = { id: uid("w") };

    $$("[data-w]", $("#workModal")).forEach(function (n) {
      var k = n.getAttribute("data-w");
      w[k] = k === "featured" ? n.checked : n.value.trim();
    });

    if (editing.media) { S.uploads.push(editing.media); w.src = editing.media.path; }
    if (editing.poster) { S.uploads.push(editing.poster); w.poster = editing.poster.path; }
    if (!w.title) { toast("Give it a title first.", "err"); return; }
    if (!w.src) { toast("Pick an image or video file.", "err"); return; }

    if (isNew) S.works.works.push(w);
    $("#workModal").hidden = true;
    markDirty();
    renderWorks();
    toast(isNew ? "Work added — publish to go live." : "Work updated.", "ok");
  }

  function deleteWork(i) {
    var w = S.works.works[i];
    if (!confirm('Delete “' + (w.title || "untitled") + '”?')) return;
    var dropMedia = confirm("Also delete its media file from the repo (" + (w.src || "—") + ")?");
    S.works.works.splice(i, 1);
    if (dropMedia && w.src && /^assets\//.test(w.src)) S.deletes.push(w.src);
    if (dropMedia && w.poster && /^assets\//.test(w.poster)) S.deletes.push(w.poster);
    markDirty();
    renderWorks();
  }

  /* ---- categories ---- */
  function renderCats() {
    var box = $("#catList");
    box.innerHTML = "";
    S.works.categories.forEach(function (c, i) {
      var li = el("div", "sub__item");
      var a = document.createElement("input"); a.value = c.label;
      var b = document.createElement("input"); b.value = c.id; b.className = "is-wide";
      a.addEventListener("input", function () { c.label = a.value; markDirty(); renderWorks(); });
      b.addEventListener("input", function () { c.id = b.value.trim(); markDirty(); renderWorks(); });
      li.appendChild(a); li.appendChild(b);
      li.appendChild(miniBtn("Remove", function () {
        var used = S.works.works.filter(function (w) { return w.category === c.id; }).length;
        if (used && !confirm(used + " work(s) use this category. Remove anyway?")) return;
        S.works.categories.splice(i, 1);
        markDirty(); renderCats(); renderWorks();
      }, true));
      box.appendChild(li);
    });
  }

  /* ================= files ================= */

  function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    var jobs = files.map(function (f) {
      if (f.size > 25 * 1024 * 1024) return Promise.resolve({ skip: f.name });
      return GH.readFileBase64(f).then(function (b64) {
        var path = uniquePath("assets/files", f.name);
        S.uploads.push({ path: path, content: b64, size: f.size });
        S.files.files.push({
          id: uid("f"), name: safeName(f.name), path: path,
          kind: kindOf(f.name), size: f.size, note: "",
          added: new Date().toISOString().slice(0, 10)
        });
        return { ok: f.name };
      });
    });
    Promise.all(jobs).then(function () {
      markDirty(); renderFiles(); renderProfile();
      var skipped = jobs.length - S.files.files.length;
      toast("Added " + files.length + " file(s). Publish to upload.", "ok");
      if (skipped > 0) toast(skipped + " file(s) skipped (over 25 MB).", "err");
    });
  }

  function renderFiles() {
    var box = $("#fileRows");
    box.innerHTML = "";
    $("#filesCount").textContent = S.files.files.length ? "(" + S.files.files.length + ")" : "";
    if (!S.files.files.length) {
      box.appendChild(el("li", "hint", "No files yet."));
      return;
    }
    S.files.files.forEach(function (f, i) {
      var row = el("li", "row");
      var isResume = S.profile && S.profile.resumeFile === f.name;
      row.appendChild(el("span", "row__grip", kindOf(f.name).toUpperCase().slice(0, 4)));
      var body = el("div", "row__body");
      body.appendChild(el("div", "row__title", f.name + (isResume ? "  ·  resume" : "")));
      body.appendChild(el("div", "row__meta", size(f.size) + " · " + f.path));
      var note = document.createElement("input");
      note.value = f.note || "";
      note.placeholder = "note (optional)";
      note.style.cssText = "font-size:.78rem;padding:.2rem .45rem;border:1px solid var(--line);border-radius:4px;margin-top:.25rem;width:100%";
      note.addEventListener("input", function () { f.note = note.value; markDirty(); });
      body.appendChild(note);
      row.appendChild(body);

      var ops = el("div", "row__ops");
      if (kindOf(f.name) === "pdf" || /resume|cv/i.test(f.name)) {
        ops.appendChild(miniBtn(isResume ? "Resume ✓" : "Set as resume", function () {
          S.profile.resumeFile = f.name;
          markDirty(); renderFiles(); renderProfile();
        }));
      }
      ops.appendChild(miniBtn("Copy link", function () {
        var url = location.origin + location.pathname.replace(/admin\.html$/, "") + f.path;
        if (navigator.clipboard) navigator.clipboard.writeText(url);
        toast("Link copied: " + url, "ok");
      }));
      ops.appendChild(miniBtn("Delete", function () {
        if (!confirm("Delete " + f.name + " from the repo?")) return;
        var pending = S.uploads.filter(function (u) { return u.path === f.path; }).length;
        S.uploads = S.uploads.filter(function (u) { return u.path !== f.path; });
        if (!pending) S.deletes.push(f.path);
        if (S.profile && S.profile.resumeFile === f.name) S.profile.resumeFile = "";
        S.files.files.splice(i, 1);
        markDirty(); renderFiles(); renderProfile();
      }, true));
      row.appendChild(ops);
      box.appendChild(row);
    });
  }

  /* ================= profile ================= */

  function renderProfile() {
    if (!S.profile) return;
    $$("[data-p]").forEach(function (n) {
      var k = n.getAttribute("data-p");
      var v = S.profile[k];
      if (Array.isArray(v)) n.value = v.join("\n");
      else n.value = v == null ? "" : v;
    });

    renderSub("links", S.profile.links || [], [
      { key: "label", ph: "Label" },
      { key: "url", ph: "https://…", wide: true }
    ], function () { if (!S.profile.links) S.profile.links = []; return S.profile.links; });

    renderSub("skills", S.profile.skills || [], [
      { key: "group", ph: "Group" },
      { key: "items", ph: "Comma separated", wide: true, join: true }
    ], function () { if (!S.profile.skills) S.profile.skills = []; return S.profile.skills; });

    renderSub("languages", S.profile.languages || [], [
      { key: "name", ph: "Language" },
      { key: "level", ph: "Level", wide: true }
    ], function () { if (!S.profile.languages) S.profile.languages = []; return S.profile.languages; });
  }

  function renderSub(name, list, fields, ensure) {
    var box = $('[data-list="' + name + '"]');
    if (!box) return;
    box.innerHTML = "";
    list.forEach(function (item, i) {
      var li = el("div", "sub__item");
      fields.forEach(function (f) {
        var input = document.createElement("input");
        input.placeholder = f.ph;
        if (f.wide) input.className = "is-wide";
        var v = item[f.key];
        input.value = Array.isArray(v) ? v.join(", ") : (v || "");
        input.addEventListener("input", function () {
          item[f.key] = f.join ? input.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean) : input.value;
          markDirty();
        });
        li.appendChild(input);
      });
      li.appendChild(miniBtn("Remove", function () {
        ensure().splice(i, 1);
        markDirty(); renderProfile();
      }, true));
      box.appendChild(li);
    });
  }

  function bindProfileInputs() {
    $$("[data-p]").forEach(function (n) {
      var k = n.getAttribute("data-p");
      n.addEventListener("input", function () {
        if (k === "about") S.profile.about = n.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
        else if (k === "interests") S.profile.interests = n.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
        else S.profile[k] = n.value;
        markDirty();
      });
    });
    $$("[data-add]").forEach(function (b) {
      b.addEventListener("click", function () {
        var name = b.getAttribute("data-add");
        if (!S.profile[name]) S.profile[name] = [];
        if (name === "skills") S.profile[name].push({ group: "", items: [] });
        else S.profile[name].push({ label: "", url: "" });
        markDirty(); renderProfile();
      });
    });
  }

  /* ================= publish ================= */

  function publish() {
    var btn = $("#btnPublish");
    btn.disabled = true;
    var st = $("#status");
    st.textContent = "Publishing…";
    st.className = "bar__status";

    var changes = [];
    S.uploads.forEach(function (u) {
      changes.push({ path: u.path, content: u.content, encoding: "base64" });
    });
    S.deletes.forEach(function (p) { changes.push({ path: p, delete: true }); });
    changes.push({ path: "data/works.json", content: GH.b64(JSON.stringify(S.works, null, 2) + "\n"), encoding: "base64" });
    changes.push({ path: "data/files.json", content: GH.b64(JSON.stringify(S.files, null, 2) + "\n"), encoding: "base64" });
    changes.push({ path: "data/profile.json", content: GH.b64(JSON.stringify(S.profile, null, 2) + "\n"), encoding: "base64" });

    var message = "Update studio content — " + new Date().toISOString().slice(0, 16).replace("T", " ");

    GH.commit(S.owner, S.repo, S.branch, message, changes)
      .then(function (res) {
        S.uploads = [];
        S.deletes = [];
        markClean("Published");
        toast("Committed " + (res.sha || "").slice(0, 7) + " — Vercel rebuilds in ~40 s.", "ok");
        return pull();
      })
      .then(function () { renderAll(); })
      .catch(function (e) {
        markDirty();
        toast(friendly(e), "err");
      });
  }

  /* ================= boot ================= */

  function bind() {
    $("#btnConnect").addEventListener("click", function () {
      var t = $("#tokenInput").value.trim();
      if (!t) { $("#authErr").textContent = "Paste a token first."; return; }
      connect(t);
    });
    $("#tokenInput").addEventListener("keydown", function (e) { if (e.key === "Enter") $("#btnConnect").click(); });

    $$("#tabs .tab").forEach(function (b) {
      b.addEventListener("click", function () {
        $$("#tabs .tab").forEach(function (x) { x.classList.remove("is-on"); });
        b.classList.add("is-on");
        var name = b.getAttribute("data-tab");
        $$(".panel").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== name; });
      });
    });

    $("#btnPublish").addEventListener("click", publish);
    $("#btnSettings").addEventListener("click", function () {
      $("#auth").hidden = false;
      $("#app").hidden = true;
      $("#authErr").textContent = "";
    });

    $("#btnAddWork").addEventListener("click", function () { openWork(-1); });
    $("#btnCats").addEventListener("click", function () { renderCats(); $("#catModal").hidden = false; });
    $("#btnAddCat").addEventListener("click", function () {
      S.works.categories.push({ id: "new-" + S.works.categories.length, label: "New category" });
      markDirty(); renderCats();
    });
    $("#btnSaveWork").addEventListener("click", saveWork);
    $("#btnPickMedia").addEventListener("click", function () { $("#mediaPick").click(); });
    $("#btnPickPoster").addEventListener("click", function () { $("#posterPick").click(); });
    $("#mediaPick").addEventListener("change", function (e) { pickMedia(e.target.files[0], "media"); e.target.value = ""; });
    $("#posterPick").addEventListener("change", function (e) { pickMedia(e.target.files[0], "poster"); e.target.value = ""; });

    $$("[data-close]").forEach(function (b) {
      b.addEventListener("click", function () {
        var m = b.closest(".modal");
        if (m) m.hidden = true;
      });
    });
    $$(".modal").forEach(function (m) {
      m.addEventListener("click", function (e) { if (e.target === m) m.hidden = true; });
    });

    $("#btnUpload").addEventListener("click", function () { $("#filePick").click(); });
    $("#filePick").addEventListener("change", function (e) { addFiles(e.target.files); e.target.value = ""; });
    var drop = $("#drop");
    drop.addEventListener("click", function () { $("#filePick").click(); });
    ["dragenter", "dragover"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("is-over"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("is-over"); });
    });
    drop.addEventListener("drop", function (e) { addFiles(e.dataTransfer.files); });

    bindProfileInputs();

    window.addEventListener("beforeunload", function (e) {
      if (S.dirty) { e.preventDefault(); e.returnValue = ""; }
    });
  }

  function renderAll() {
    renderWorks();
    renderFiles();
    renderProfile();
  }

  function boot() {
    loadRepoSettings();
    bind();
    var saved = "";
    try { saved = localStorage.getItem(LS_TOKEN) || ""; } catch (e) {}
    if (saved) { $("#tokenInput").value = saved; connect(saved); }
  }

  window.CCSAdmin = { state: S, render: renderAll, publish: publish };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
