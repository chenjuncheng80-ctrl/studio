/* End-to-end smoke test for the studio (jsdom, GitHub API mocked).
   Run: node tools/smoke_studio.mjs */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire("C:/Users/chenj/.workbuddy/binaries/node/workspace/package.json");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const json = (p) => JSON.parse(read(p));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  → " + extra : "")); }
}

function res(body, status = 200) {
  const txt = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status < 400, status, statusText: "OK",
    text: () => Promise.resolve(txt),
    json: () => Promise.resolve(JSON.parse(txt))
  };
}

function shell(window) {
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
  window.URL.createObjectURL = () => "blob:mock";
  window.confirm = () => true;
  // jsdom throws on localStorage for opaque (file://) origins.
  const store = {};
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
    }
  });
}

function quietConsole(label) {
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => { if (process.env.VERBOSE) console.log("  [" + label + "] " + (e.detail || e.message)); });
  vc.on("error", () => {});
  return vc;
}

/* ============================ FRONT ============================ */
async function testSite() {
  console.log("\n— front end (index.html) —");
  const data = {
    "data/profile.json": json("data/profile.json"),
    "data/works.json": json("data/works.json"),
    "data/files.json": json("data/files.json")
  };
  const dom = await JSDOM.fromFile(path.join(ROOT, "index.html"), {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole: quietConsole("site"),
    beforeParse(window) {
      shell(window);
      window.fetch = (url) => {
        const key = String(url).split("?")[0];
        if (data[key]) return Promise.resolve(res(data[key]));
        return Promise.resolve(res({ error: "missing " + key }, 404));
      };
    }
  });
  const { window } = dom;
  await new Promise((r) => window.addEventListener("load", r));
  await new Promise((r) => setTimeout(r, 60));

  const d = window.document;
  check("profile name rendered in hero", d.querySelector('[data-profile="name"]').textContent === "Chan Chun Shing");
  check("role rendered", d.querySelector('[data-profile="role"]').textContent.indexOf("Street Photographer") >= 0);
  check("about paragraphs = 3", d.querySelectorAll("#aboutText p").length === 3);
  check("skill groups rendered", d.querySelectorAll("#skills .skill").length === json("data/profile.json").skills.length);
  check("languages rendered", d.querySelectorAll("#langs li").length === 3);

  const cards = d.querySelectorAll("#grid .card");
  check("work cards = " + json("data/works.json").works.length + " (got " + cards.length + ")",
    cards.length === json("data/works.json").works.length);
  check("first card title", d.querySelector(".card__title").textContent === "The Rhythm of Life in the Alley");
  check("video card has play badge", !!d.querySelector(".card__play"));
  check("poster set on video", d.querySelector("#grid video").getAttribute("poster") === "assets/works/showreel.jpg");

  const filters = d.querySelectorAll("#filters .filter");
  check("filters = All + categories (got " + filters.length + ")", filters.length === json("data/works.json").categories.length + 1);
  filters[1].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  const shown = d.querySelectorAll("#grid .card").length;
  const photoCount = json("data/works.json").works.filter((w) => w.category === "photography").length;
  check("filter narrows to photography (" + shown + "/" + photoCount + ")", shown === photoCount);
  d.querySelectorAll("#filters .filter")[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));

  check("files list rendered", d.querySelectorAll("#filesList li").length === 1);
  check("resume button points at the pdf",
    d.getElementById("heroResume").getAttribute("href") === "assets/files/Chan-Chun-Shing-Resume.pdf");
  check("email link", d.getElementById("cEmail").getAttribute("href") === "mailto:chenjuncheng80@gmail.com");
  check("phone link strips formatting", d.getElementById("cPhone").getAttribute("href") === "tel:+85294316413");

  // lightbox
  d.querySelector("#grid .card").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  check("lightbox opens", d.getElementById("lightbox").hidden === false);
  check("lightbox title", d.getElementById("lbTitle").textContent === "The Rhythm of Life in the Alley");
  d.getElementById("lbNext").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  check("lightbox next advances", d.getElementById("lbTitle").textContent === "Edit Showreel 2026");
  d.getElementById("lbClose").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  check("lightbox closes", d.getElementById("lightbox").hidden === true);

  // language switch
  d.querySelector('.lang__opt[data-lang="zh"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  check("nav switches to Chinese", d.querySelector('.nav__links a[href="#works"]').textContent === "作品");
  check("html lang = zh-Hant", d.documentElement.lang === "zh-Hant");
  check("cards still rendered after switch", d.querySelectorAll("#grid .card").length === json("data/works.json").works.length);
  d.querySelector('.lang__opt[data-lang="en"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  check("switches back to English", d.querySelector('.nav__links a[href="#works"]').textContent === "Works");

  dom.window.close();
}

/* ============================ ADMIN ============================ */
async function testAdmin() {
  console.log("\n— admin (admin.html) —");
  const files = {
    "data/profile.json": read("data/profile.json"),
    "data/works.json": read("data/works.json"),
    "data/files.json": read("data/files.json")
  };
  const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
  const calls = [];
  const blobStore = {};

  const dom = await JSDOM.fromFile(path.join(ROOT, "admin.html"), {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole: quietConsole("admin"),
    beforeParse(window) {
      shell(window);
      window.localStorage.setItem("ccs-studio-token", "ghp_test");
      window.fetch = (url, init) => {
        const u = String(url);
        const m = u.match(/^https:\/\/api\.github\.com(.*)$/);
        if (!m) {
          const key = u.split("?")[0];
          return Promise.resolve(res(files[key] ? JSON.parse(files[key]) : { error: key }, files[key] ? 200 : 404));
        }
        const p = m[1];
        calls.push({ method: (init && init.method) || "GET", path: p.split("?")[0], body: init && init.body });
        if (p === "/repos/chenjuncheng80-ctrl/studio" ) return Promise.resolve(res({ full_name: "chenjuncheng80-ctrl/studio" }));
        if (/^\/repos\/.*\/contents\/data\//.test(p)) {
          const name = p.split("/contents/")[1].split("?")[0];
          return Promise.resolve(res({ content: b64(files[name]), sha: "sha-" + name, path: name }));
        }
        if (p === "/repos/chenjuncheng80-ctrl/studio/git/ref/heads/main") return Promise.resolve(res({ object: { sha: "parentsha" } }));
        if (p === "/repos/chenjuncheng80-ctrl/studio/git/commits/parentsha") return Promise.resolve(res({ tree: { sha: "basetree" } }));
        if (p.endsWith("/git/blobs")) {
          const body = JSON.parse(init.body);
          const sha = "blob-" + calls.length;
          blobStore[sha] = body;
          return Promise.resolve(res({ sha }));
        }
        if (p.endsWith("/git/trees")) {
          // Make the commit visible to the pull() that follows a publish.
          JSON.parse(init.body).tree.forEach((e) => {
            if (e.sha === null) { delete files[e.path]; return; }
            const b = blobStore[e.sha];
            if (b && /^data\//.test(e.path)) files[e.path] = Buffer.from(b.content, "base64").toString();
          });
          return Promise.resolve(res({ sha: "newtree" }));
        }
        if (p.endsWith("/git/commits")) return Promise.resolve(res({ sha: "newcommitsha" }));
        if (p.startsWith("/repos/chenjuncheng80-ctrl/studio/git/refs/")) return Promise.resolve(res({ sha: "newcommitsha" }));
        return Promise.resolve(res({ message: "unmocked " + p }, 404));
      };
    }
  });
  const { window } = dom;
  await new Promise((r) => window.addEventListener("load", r));
  await new Promise((r) => setTimeout(r, 120));

  const d = window.document;
  check("connected — app visible", d.getElementById("app").hidden === false);
  check("repo label set", d.getElementById("repoLabel").textContent.indexOf("chenjuncheng80-ctrl/studio") >= 0);
  check("work rows = 4", d.querySelectorAll("#workRows .row").length === 4);
  check("file rows = 1", d.querySelectorAll("#fileRows .row").length === 1);
  check("profile name field filled", d.querySelector('[data-p="name"]').value === "Chan Chun Shing");
  check("about textarea joined by newline", d.querySelector('[data-p="about"]').value.split("\n").length === 3);
  check("resume file field", d.querySelector('[data-p="resumeFile"]').value === "Chan-Chun-Shing-Resume.pdf");

  // profile edit marks dirty
  const nameInput = d.querySelector('[data-p="role"]');
  nameInput.value = "Digital Media Student";
  nameInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  check("editing profile marks dirty", d.getElementById("btnPublish").disabled === false);

  // add a work with an uploaded image
  d.getElementById("btnAddWork").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  check("work modal opens", d.getElementById("workModal").hidden === false);
  d.querySelector('[data-w="title"]').value = "Test Piece";
  d.querySelector('[data-w="year"]').value = "2026";
  const file = new window.File(["fake-bytes"], "My Photo.JPG", { type: "image/jpeg" });
  const input = d.getElementById("mediaPick");
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 80));
  check("picked media gets a repo path", d.getElementById("mediaName").textContent.indexOf("assets/works/") === 0,
    d.getElementById("mediaName").textContent);
  check("path is slugified", /assets\/works\/My-Photo\.jpg$/.test(d.getElementById("mediaName").textContent),
    d.getElementById("mediaName").textContent);
  d.getElementById("btnSaveWork").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  check("work added to list", d.querySelectorAll("#workRows .row").length === 5);
  check("new work title shown", /Test Piece/.test(d.querySelector("#workRows").textContent));

  // publish
  const before = calls.length;
  d.getElementById("btnPublish").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));

  const commitCall = calls.slice(before).find((c) => c.path.endsWith("/git/commits") && c.method === "POST");
  const treeCall = calls.slice(before).find((c) => c.path.endsWith("/git/trees"));
  const blobCalls = calls.slice(before).filter((c) => c.path.endsWith("/git/blobs"));
  const refCall = calls.slice(before).find((c) => c.method === "PATCH");

  check("blobs created (1 upload + 3 json)", blobCalls.length === 4, "got " + blobCalls.length);
  check("tree built on top of base tree", !!treeCall && JSON.parse(treeCall.body).base_tree === "basetree");
  const paths = treeCall ? JSON.parse(treeCall.body).tree.map((t) => t.path) : [];
  check("tree contains the upload", paths.some((p) => p === "assets/works/My-Photo.jpg"), paths.join(", "));
  check("tree contains all three data files",
    ["data/works.json", "data/files.json", "data/profile.json"].every((p) => paths.indexOf(p) >= 0));
  check("commit created", !!commitCall);
  check("ref updated to new commit", !!refCall && JSON.parse(refCall.body).sha === "newcommitsha");

  // the published works.json must carry the new work
  const worksBlob = blobCalls.map((c) => JSON.parse(c.body)).find((b) => b.encoding === "base64" && Buffer.from(b.content, "base64").toString().indexOf('"works"') >= 0);
  const published = JSON.parse(Buffer.from(worksBlob.content, "base64").toString());
  check("published works.json has 5 works", published.works.length === 5, "got " + published.works.length);
  check("published work keeps the uploaded path", published.works[4].src === "assets/works/My-Photo.jpg", published.works[4].src);

  // delete flows
  const delBtn = Array.from(d.querySelectorAll("#workRows .row")).pop().querySelectorAll("button")[1];
  check("delete button present", delBtn.textContent === "Delete");
  delBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 40));
  check("work removed after delete", d.querySelectorAll("#workRows .row").length === 4);

  dom.window.close();
}

await testSite();
await testAdmin();
console.log("\n" + (fail ? "FAILURES: " + fail : "ALL CHECKS PASSED") + "  (" + pass + " passed)");
process.exit(fail ? 1 : 0);
