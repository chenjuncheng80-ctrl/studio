/* Lightweight EN / 繁中 switcher for the studio site.
   Any element carrying data-i18n="English copy" is swapped to the
   Chinese string in DICT (and back). Values that have no entry stay
   in English. */
(function () {
  "use strict";

  var STORAGE = "ccs-studio-lang";

  var DICT = {
    "Works": "作品",
    "About": "關於",
    "Files": "檔案",
    "Contact": "聯絡",
    "Admin": "管理",
    "All": "全部",
    "Skills": "技能",
    "Languages": "語言",
    "Interests": "興趣",
    "Email": "電郵",
    "Phone": "電話",
    "See the work": "看看作品",
    "Download resume": "下載履歷",
    "Say hello": "打個招呼",
    "Manage this site": "管理本站",
    "Open link": "開啟連結",
    "Loading…": "載入中…",
    "No work in this category yet.": "這個分類還沒有作品。",
    "Anything I upload here — briefs, CV, source files.": "我放在這裡的檔案 — 履歷、簡報、原始檔。",
    "Digital Media & Street Photography": "數碼媒體與街頭攝影",
    "Photography": "攝影",
    "Video Editing": "影片剪輯",
    "Motion": "動態設計",
    "VFX": "視覺特效"
  };

  function nodes(root) {
    return (root || document).querySelectorAll("[data-i18n]");
  }

  function apply(lang) {
    document.documentElement.lang = lang === "zh" ? "zh-Hant" : "en";
    var list = nodes(document);
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var key = el.getAttribute("data-i18n");
      if (lang === "zh") {
        if (!el.hasAttribute("data-i18n-en")) el.setAttribute("data-i18n-en", key);
        el.textContent = DICT[key] || key;
      } else {
        var en = el.getAttribute("data-i18n-en") || key;
        el.textContent = en;
      }
    }
    var btns = document.querySelectorAll(".lang__opt");
    for (var j = 0; j < btns.length; j++) {
      btns[j].classList.toggle("is-on", btns[j].getAttribute("data-lang") === lang);
    }
  }

  function current() {
    try { return localStorage.getItem(STORAGE) === "zh" ? "zh" : "en"; } catch (e) { return "en"; }
  }

  function set(lang) {
    lang = lang === "zh" ? "zh" : "en";
    try { localStorage.setItem(STORAGE, lang); } catch (e) {}
    apply(lang);
    document.dispatchEvent(new CustomEvent("i18n:change", { detail: { lang: lang } }));
  }

  function t(key, lang) {
    return lang === "zh" ? (DICT[key] || key) : key;
  }

  document.addEventListener("click", function (e) {
    var opt = e.target.closest && e.target.closest(".lang__opt");
    if (opt) set(opt.getAttribute("data-lang"));
  });

  // First paint: no localStorage yet means follow the browser.
  var start = "en";
  try {
    var saved = localStorage.getItem(STORAGE);
    if (saved) start = saved === "zh" ? "zh" : "en";
    else if (/^zh/i.test(navigator.language || "")) start = "zh";
  } catch (e) {}
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { apply(start); });
  } else {
    apply(start);
  }

  window.CCSi18n = { set: set, get: current, t: t, dict: DICT };
})();
