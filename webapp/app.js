/* Avto Bozor — Telegram Mini App
 * Botdagi barcha foydalanuvchi bo'limlari: Bozor (qidiruv), E'lon berish, Mening e'lonlarim,
 * Saqlanganlar, Obunalar, Baholash, Kredit kalkulyatori, Referal, Avtosalon, Salon reklamasi.
 * Har bir amal serverda bot bilan bir xil funksiyani chaqiradi (index.js).
 */
(function () {
  "use strict";
  var tg = window.Telegram && window.Telegram.WebApp;
  var inTelegram = !!(tg && tg.initData);
  var app = document.getElementById("app");
  var tabbar = document.getElementById("tabbar");

  // Mavzu: o'zimizning ranglar (yorug' / qorong'i — Telegramdagi tanlovga qarab)
  function applyTheme() {
    var dark = tg && tg.colorScheme ? tg.colorScheme === "dark" : !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    if (!tg) return;
    var bg = dark ? "#0b1119" : "#edf0f4", surface = dark ? "#151d29" : "#ffffff";
    try { tg.setHeaderColor(bg); } catch (e) { try { tg.setHeaderColor("secondary_bg_color"); } catch (e2) {} }
    try { tg.setBackgroundColor(bg); } catch (e) {}
    try { if (tg.setBottomBarColor) tg.setBottomBarColor(surface); } catch (e) {}
  }
  applyTheme();
  if (tg) {
    tg.ready();
    tg.expand();
    try { if (tg.onEvent) tg.onEvent("themeChanged", applyTheme); } catch (e) {}
  }
  function brandColor() { return (getComputedStyle(document.documentElement).getPropertyValue("--brand") || "#1667d9").trim(); }

  // =====================================================================
  // Yordamchilar
  // =====================================================================
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else if (v !== false && v != null) el.setAttribute(k, v);
    });
    (children || []).forEach(function (c) { if (c != null && c !== false) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }
  var ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
    heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    send: '<path d="M21 4L3 11l6 2 2 6 3-4 5 4z"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2"/>',
    gift: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M12 9v11M4 13h16M12 9c-2-4-6-4-6-1s6 1 6 1zm0 0c2-4 6-4 6-1s-6 1-6 1z"/>',
    building: '<path d="M4 21V5l8-2v18M12 9h8v12M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2"/>',
    megaphone: '<path d="M4 10v4h3l8 4V6L7 10z"/><path d="M18 9a4 4 0 0 1 0 6"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    share: '<path d="M12 4v11M7 9l5-5 5 5"/><path d="M5 14v5h14v-5"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/>',
    gear: '<circle cx="6" cy="6" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="12" cy="18" r="2"/><path d="M6 8v8M12 8v8M18 8v4H6"/>',
    fuel: '<path d="M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M4 20h11M8 8h3"/><path d="M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    shield: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h3"/>',
    car: '<path d="M5 16v-4l2-5h10l2 5v4"/><path d="M3 16h18v3H3z"/><path d="M5 12h14"/>',
  };
  function icon(name, filled) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", filled ? "currentColor" : "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "2");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true");
    s.innerHTML = ICONS[name] || "";
    return s;
  }
  function haptic(kind) {
    try {
      if (!tg || !tg.HapticFeedback) return;
      if (kind === "select") tg.HapticFeedback.selectionChanged();
      else tg.HapticFeedback.notificationOccurred(kind);
    } catch (e) {}
  }
  var toastTimer;
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2800);
  }
  function digits(s) { return String(s == null ? "" : s).replace(/\D/g, ""); }
  function fmtNum(s) { var d = digits(s); return d ? Number(d).toLocaleString("en-US").replace(/,/g, " ") : ""; }
  function fmtPrice(s) { var n = fmtNum(s); return n ? n + " $" : ""; }
  function fmtKm(p) { return p === "Salon" ? "Yangi, 0 km" : (fmtNum(p) ? fmtNum(p) + " km" : ""); }
  function fmtPhone(raw) {
    var d = digits(raw).replace(/^(998)+/, "");
    if (d.length > 9) d = d.slice(-9);
    if (!d) return "";
    return "+998 " + [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(" ");
  }
  function openLink(url) {
    if (!url) return;
    if (tg && /^https:\/\/t\.me\//.test(url) && tg.openTelegramLink) tg.openTelegramLink(url);
    else if (tg && tg.openLink) tg.openLink(url);
    else window.open(url, "_blank");
  }
  function copyText(text, okMsg) {
    function done() { toast(okMsg || "Nusxa olindi"); haptic("success"); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
    function fallback() {
      var ta = h("textarea", { style: "position:fixed;opacity:0" }); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { toast("Nusxa olib bo'lmadi"); }
      ta.remove();
    }
  }
  function confirmBox(text) {
    return new Promise(function (resolve) {
      if (tg && tg.showConfirm && inTelegram) { try { tg.showConfirm(text, function (ok) { resolve(!!ok); }); return; } catch (e) {} }
      resolve(window.confirm(text));
    });
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = { "X-Telegram-Init-Data": tg ? tg.initData : "" };
    var body;
    if (opts.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.json); }
    return fetch(path, { method: opts.method || (opts.json !== undefined ? "POST" : "GET"), headers: headers, body: body })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: "Server javobi noto'g'ri." }; }); })
      .catch(function () { return { ok: false, error: "Internet aloqasini tekshiring va qayta urinib ko'ring." }; });
  }
  // Admin uchun log: faqat serverga bosilgan tugma haqida qisqa belgi yuboriladi (javob kutilmaydi)
  function logEvent(event, data) {
    try {
      fetch("/api/track", {
        method: "POST", keepalive: true,
        headers: { "X-Telegram-Init-Data": tg ? tg.initData : "", "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ event: event }, data || {})),
      }).catch(function () {});
    } catch (e) {}
  }
  function upload(kind, blob, onProgress) {
    return new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload?kind=" + kind);
      xhr.setRequestHeader("X-Telegram-Init-Data", tg ? tg.initData : "");
      xhr.setRequestHeader("Content-Type", blob.type || (kind === "photo" ? "image/jpeg" : "video/mp4"));
      xhr.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = function () { try { resolve(JSON.parse(xhr.responseText)); } catch (e) { resolve({ ok: false, error: "Yuklab bo'lmadi." }); } };
      xhr.onerror = function () { resolve({ ok: false, error: "Internet aloqasi uzildi." }); };
      xhr.send(blob);
    });
  }
  // Rasmni telefonda kichraytiramiz (1600px, JPEG) — mobil internetda tez yuklanadi
  function compressImage(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var max = 1600, w = img.naturalWidth, hgt = img.naturalHeight;
        var scale = Math.min(1, max / Math.max(w, hgt));
        var c = document.createElement("canvas");
        c.width = Math.round(w * scale); c.height = Math.round(hgt * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { resolve(b || file); }, "image/jpeg", 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  // =====================================================================
  // Telegram asosiy tugmasi (pastdagi ko'k tugma) va orqaga tugmasi
  // =====================================================================
  var mainHandler = null, mainText = "";
  function setMain(text, handler) {
    mainText = text || "";
    if (inTelegram && tg.MainButton) {
      if (mainHandler) tg.MainButton.offClick(mainHandler);
      mainHandler = handler || null;
      if (handler) {
        try { tg.MainButton.hideProgress(); } catch (e) {}
        tg.MainButton.setParams({ text: text, is_visible: true, is_active: true, color: brandColor(), text_color: "#ffffff" });
        tg.MainButton.onClick(handler);
      } else tg.MainButton.hide();
    } else {
      var old = document.getElementById("fallback-main"); if (old) old.remove();
      mainHandler = handler || null;
      if (handler) document.body.appendChild(h("button", { id: "fallback-main", class: "btn fallback-main", type: "button", text: text, onclick: handler }));
    }
  }
  function mainBusy(on, text) {
    if (inTelegram && tg.MainButton) {
      if (on) { tg.MainButton.showProgress(false); tg.MainButton.disable(); tg.MainButton.setText(text || "Yuborilmoqda..."); }
      else { tg.MainButton.hideProgress(); tg.MainButton.enable(); tg.MainButton.setText(mainText); }
    } else {
      var b = document.getElementById("fallback-main");
      if (b) { b.disabled = on; b.textContent = on ? (text || "Yuborilmoqda...") : mainText; }
    }
  }
  var currentParent = "/";
  var navDepth = 0;
  function go(path) { navDepth++; location.hash = path; }
  function replaceTo(path) { location.replace("#" + path); }
  function back() { if (navDepth > 0) { navDepth--; history.back(); } else replaceTo(currentParent || "/"); }
  if (inTelegram && tg.BackButton) tg.BackButton.onClick(back);

  var closingConfirm = false;
  function setClosingConfirm(on) {
    if (!tg || !tg.isVersionAtLeast || !tg.isVersionAtLeast("6.2") || closingConfirm === on) return;
    closingConfirm = on;
    try { on ? tg.enableClosingConfirmation() : tg.disableClosingConfirmation(); } catch (e) {}
  }

  // =====================================================================
  // Pastdan chiquvchi oyna
  // =====================================================================
  var sheetEl = null;
  function closeSheet() { if (sheetEl) { sheetEl.remove(); sheetEl = null; } }
  function openSheet(title, children) {
    closeSheet();
    var sheet = h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": title }, [h("div", { class: "grab" }), h("h2", { text: title })].concat(children));
    sheetEl = h("div", { class: "sheet-back", onclick: function (e) { if (e.target === sheetEl) closeSheet(); } }, [sheet]);
    document.body.appendChild(sheetEl);
    var first = sheet.querySelector("input, select, textarea");
    if (first) setTimeout(function () { first.focus(); }, 60);
    return closeSheet;
  }

  // =====================================================================
  // Umumiy holat
  // =====================================================================
  var catalog = null, me = null;
  function brandById(id) { return catalog.brands.find(function (b) { return b.id === Number(id); }) || null; }
  function modelById(id) {
    for (var i = 0; i < catalog.brands.length; i++) {
      var m = catalog.brands[i].models.find(function (x) { return x.id === Number(id); });
      if (m) return { id: m.id, name: m.name, brand: catalog.brands[i] };
    }
    return null;
  }
  function refreshMe() { return api("/api/me").then(function (m) { if (m.ok) me = m; return m; }); }

  // ---------- Kichik UI qismlari ----------
  function field(refs, key, label, body, help) {
    var f = h("div", { class: "field", "data-field": key }, [
      label ? h("span", { class: "label", id: "lbl-" + key, text: label }) : null,
      body,
      help ? h("p", { class: "help", text: help }) : null,
      h("p", { class: "error", id: "err-" + key }),
    ]);
    refs["f_" + key] = f;
    return f;
  }
  function setError(refs, key, msg) {
    var f = refs["f_" + key];
    if (!f) return;
    f.classList.toggle("invalid", !!msg);
    var e = f.querySelector(".error");
    if (e) e.textContent = msg || "";
  }
  // opts.collapse = N — uzun ro'yxatda dastlab N tasi (+ tanlangani) ko'rinadi, qolgani «Yana N ta» ortida
  function chipGroup(labelId, items, isActive, onPick, opts) {
    opts = opts || {};
    var expanded = false;
    var wrap = h("div", { class: "chips" + (opts.scroll ? " scroll" : ""), role: "group", "aria-labelledby": labelId, "aria-label": opts.ariaLabel || null });
    function chip(it) {
      return h("button", {
        type: "button", class: "chip" + (it.dashed ? " dashed" : "") + (opts.onSection ? " on-section" : ""), "aria-pressed": isActive(it) ? "true" : "false",
        onclick: function () { onPick(it); haptic("select"); render(); },
      }, [it.name]);
    }
    function render() {
      wrap.innerHTML = "";
      var list = items();
      var limit = opts.collapse && !expanded && list.length > opts.collapse + 2 ? opts.collapse : 0;
      var hidden = 0, moreAdded = false;
      function addMore() {
        if (moreAdded || !hidden) return;
        moreAdded = true;
        wrap.appendChild(h("button", { type: "button", class: "chip chip-more", "aria-expanded": "false", onclick: function () { expanded = true; render(); } }, ["Yana " + hidden + " ta"]));
      }
      if (limit) hidden = list.filter(function (it, i) { return i >= limit && !it.dashed && !isActive(it); }).length;
      list.forEach(function (it, i) {
        if (limit && i >= limit && !it.dashed && !isActive(it)) return;
        if (limit && it.dashed) addMore(); // «Yana N ta» — «Boshqa» dan oldin
        wrap.appendChild(chip(it));
      });
      if (limit) addMore();
    }
    render();
    wrap.rerender = render;
    return wrap;
  }
  function textInput(state, key, attrs, onChange) {
    var el = h("input", Object.assign({ class: "input", id: "in-" + key, "aria-labelledby": "lbl-" + key }, attrs));
    el.value = state[key] == null ? "" : state[key];
    el.addEventListener("input", function () { state[key] = el.value; if (onChange) onChange(el.value); });
    return el;
  }
  function textArea(state, key, attrs, onChange) {
    var el = h("textarea", Object.assign({ class: "input", id: "in-" + key, "aria-labelledby": "lbl-" + key }, attrs));
    el.value = state[key] || "";
    el.addEventListener("input", function () { state[key] = el.value; if (onChange) onChange(el.value); });
    return el;
  }
  function selectBox(state, key, options, placeholder, onChange) {
    var el = h("select", { class: "input", id: "in-" + key, "aria-labelledby": "lbl-" + key }, [h("option", { value: "", text: placeholder || "Tanlang" })]);
    options.forEach(function (o) { var v = typeof o === "object" ? o : { value: o, text: o }; el.appendChild(h("option", { value: String(v.value), text: v.text })); });
    el.value = state[key] == null ? "" : String(state[key]);
    el.addEventListener("change", function () { state[key] = el.value; if (onChange) onChange(el.value); });
    return el;
  }
  function switchRow(state, key, title, sub, onChange) {
    var cb = h("input", { type: "checkbox", role: "switch", "aria-label": title });
    cb.checked = !!state[key];
    cb.addEventListener("change", function () { state[key] = cb.checked; haptic("select"); if (onChange) onChange(cb.checked); });
    return h("label", { class: "switch-row" }, [
      h("span", null, [h("span", { class: "txt", text: title }), sub ? h("span", { class: "sub", text: sub }) : null]),
      h("span", { class: "switch" }, [cb, h("span", { class: "track" })]),
    ]);
  }
  function yearOptions() { var out = []; for (var y = catalog.years.max; y >= catalog.years.min; y--) out.push(String(y)); return out; }
  function listItem(o) {
    return h("button", { type: "button", class: "item" + (o.danger ? " danger" : ""), onclick: o.onclick, disabled: o.disabled || false }, [
      o.icon ? h("span", { class: "ico", style: "--ico:" + (o.color || "var(--brand)") + ";background:" + (o.color || "var(--brand)") }, [icon(o.icon)]) : null,
      h("span", { class: "body" }, [h("span", { class: "t", text: o.title }), o.sub ? h("span", { class: "s", text: o.sub }) : null]),
      o.end ? h("span", { class: "end", text: o.end }) : null,
      o.chev === false ? null : h("span", { class: "chev" }, [icon("chev")]),
    ]);
  }
  function emptyState(title, text, btnText, onBtn, iconName) {
    return h("div", { class: "empty" }, [h("span", { class: "em-ico" }, [icon(iconName || "search")]), h("b", { text: title }), text, btnText ? h("button", { type: "button", class: "btn", text: btnText, onclick: onBtn }) : null]);
  }
  function messageScreen(title, text, actions, stamp) {
    return h("div", { class: "screen" }, [stamp ? h("span", { class: "stamp", text: stamp }) : null, h("h1", { text: title }), text ? h("p", { text: text }) : null].concat(actions || []));
  }
  function skeleton() { return h("div", { class: "skeleton", "aria-hidden": "true" }); }
  function skeletonCards(n) { return h("div", { class: "skeleton-cards", "aria-hidden": "true" }, Array.apply(null, Array(n || 4)).map(function () { return h("div", { class: "sk" }); })); }

  // Viloyat — O'zbekiston davlat raqami uslubida: [60 | Andijon]
  var REGION_CODES = { "Toshkent sh.": "01", "Toshkent vil.": "10", "Sirdaryo": "20", "Jizzax": "25", "Samarqand": "30", "Farg'ona": "40", "Namangan": "50", "Andijon": "60", "Qashqadaryo": "70", "Surxondaryo": "75", "Buxoro": "80", "Navoiy": "85", "Xorazm": "90", "Qoraqalpog'iston": "95" };
  function plate(region, large) {
    if (!region) return null;
    var code = REGION_CODES[region];
    return h("span", { class: "plate" + (large ? " lg" : ""), title: "Viloyat: " + region }, [code ? h("b", { text: code }) : null, h("span", { text: region }), large ? h("i", { text: "UZ" }) : null]);
  }
  function relDay(iso) {
    var t = Date.parse(iso || "");
    if (!t) return "";
    var d = Math.floor((Date.now() - t) / 86400000);
    if (d <= 0) return "Bugun";
    if (d === 1) return "Kecha";
    if (d < 30) return d + " kun oldin";
    var mo = Math.floor(d / 30);
    return mo < 12 ? mo + " oy oldin" : "1 yildan ko'proq oldin";
  }

  // Kartochka (bozor, saqlanganlar)
  function adCard(it, onFavChange, mini) {
    var heart = h("button", { type: "button", class: "heart", "aria-label": "Saqlash", "aria-pressed": it.isFav ? "true" : "false" }, [icon("heart", it.isFav)]);
    heart.addEventListener("click", function (e) {
      e.stopPropagation();
      var on = !it.isFav;
      it.isFav = on;
      heart.setAttribute("aria-pressed", on ? "true" : "false");
      heart.innerHTML = ""; heart.appendChild(icon("heart", on));
      haptic("select");
      api("/api/favorites/" + it.id, { json: { on: on } }).then(function (r) {
        if (!r.ok) { it.isFav = !on; toast(r.error || "Saqlab bo'lmadi"); heart.setAttribute("aria-pressed", it.isFav ? "true" : "false"); heart.innerHTML = ""; heart.appendChild(icon("heart", it.isFav)); return; }
        toast(on ? "Saqlandi. Narxi tushsa, bot xabar beradi." : "Saqlanganlardan olib tashlandi");
        if (onFavChange) onFavChange(it, on);
      });
    });
    var ph = h("div", { class: "ph" }, [
      it.photo ? h("img", { src: it.photo, alt: it.title, loading: "lazy" }) : null,
      it.badge && it.badge.type === "cheap" ? h("span", { class: "deal", text: it.badge.pct + "% arzon" }) : null,
      it.photosCount > 1 ? h("span", { class: "cnt", "aria-label": it.photosCount + " ta rasm" }, [icon("camera"), String(it.photosCount)]) : null,
      it.status === "sold" ? h("div", { class: "sold-veil" }, [h("span", { text: "SOTILDI" })]) : null,
      it.status === "active" ? heart : null,
    ]);
    var meta = [it.year, fmtKm(it.probeg)].filter(Boolean).join(", ");
    return h("div", { class: "card" + (mini ? " mini" : ""), role: "link", tabindex: "0", onclick: function () { go("/ad/" + it.id); }, onkeydown: function (e) { if (e.key === "Enter") go("/ad/" + it.id); } }, [
      ph,
      h("div", { class: "info" }, [
        h("div", { class: "price", text: fmtPrice(it.status === "sold" && it.soldPrice ? it.soldPrice : it.price) }),
        h("div", { class: "title", text: it.title }),
        h("div", { class: "meta", text: meta }),
        mini ? null : h("div", { class: "foot" }, [plate(it.region), it.hasNasiya ? h("span", { class: "tagline", text: "Nasiya" }) : null]),
      ]),
    ]);
  }

  // =====================================================================
  // 1. BOZOR (qidiruv)
  // =====================================================================
  var market = {
    f: { q: "", brandId: null, modelId: null, minPrice: "", maxPrice: "", yearFrom: "", yearTo: "", region: "", trans: "", fuel: "", nasiya: false, sort: "new" },
    items: [], page: 0, pages: 1, total: 0, loading: false, loaded: false, scrollY: 0,
  };
  function marketParams(page) {
    var f = market.f, p = new URLSearchParams();
    ["q", "brandId", "modelId", "minPrice", "maxPrice", "yearFrom", "yearTo", "region", "trans", "fuel", "sort"].forEach(function (k) { if (f[k]) p.set(k, f[k]); });
    if (f.nasiya) p.set("nasiya", "1");
    p.set("page", page);
    return p.toString();
  }
  function activeFilterCount() {
    var f = market.f, n = 0;
    if (f.minPrice || f.maxPrice) n++;
    if (f.yearFrom || f.yearTo) n++;
    if (f.region) n++; if (f.trans) n++; if (f.fuel) n++; if (f.nasiya) n++;
    return n;
  }

  function screenMarket() {
    var refs = {};
    var head = h("div", { class: "search-head" });
    var grid = h("div", { class: "cards" });
    var footer = h("div");
    app.appendChild(head); app.appendChild(grid); app.appendChild(footer);

    function renderHead() {
      head.innerHTML = "";
      // Qidiruv: yozilgan so'z bo'yicha (e'lon nomida) + katalogdan aniq model takliflari
      var search = h("input", { class: "input", type: "search", id: "in-q", placeholder: "Marka yoki model", "aria-label": "Qidiruv", enterkeyhint: "search", autocomplete: "off", spellcheck: "false" });
      search.value = market.f.q || "";
      var clearBtn = h("button", { type: "button", class: "clear", "aria-label": "Qidiruvni tozalash", text: "×", hidden: !search.value, onclick: function () {
        search.value = ""; clearBtn.hidden = true; renderSuggest(""); if (market.f.q) { market.f.q = ""; reload(); } search.focus();
      } });
      var sugBox = h("div", { class: "suggest", hidden: true });
      var timer = null;
      search.addEventListener("input", function () {
        clearBtn.hidden = !search.value;
        renderSuggest(search.value);
        clearTimeout(timer);
        timer = setTimeout(function () { var v = search.value.trim(); if (v !== (market.f.q || "")) { market.f.q = v; reload(); } }, 450);
      });
      search.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        clearTimeout(timer); search.blur();
        var v = search.value.trim(); if (v !== (market.f.q || "")) { market.f.q = v; reload(); }
      });
      function renderSuggest(v) {
        sugBox.innerHTML = "";
        var q = String(v || "").trim().toLowerCase();
        var out = [];
        if (q.length >= 2) catalog.brands.forEach(function (b) {
          if (b.name.toLowerCase().indexOf(q) === 0) out.push({ brand: b, model: null, name: b.name });
          b.models.forEach(function (m) {
            if (m.name.toLowerCase().indexOf(q) === 0 || (b.name + " " + m.name).toLowerCase().indexOf(q) === 0) out.push({ brand: b, model: m, name: b.name + " " + m.name });
          });
        });
        out = out.slice(0, 8);
        sugBox.hidden = !out.length;
        out.forEach(function (sg) {
          sugBox.appendChild(h("button", { type: "button", class: "chip", text: sg.name, onclick: function () {
            clearTimeout(timer);
            market.f.brandId = sg.brand.id; market.f.modelId = sg.model ? sg.model.id : null; market.f.q = "";
            haptic("select"); renderHead(); reload();
          } }));
        });
      }
      var n = activeFilterCount();
      head.appendChild(h("div", { class: "search-row" }, [
        h("div", { class: "search-box" }, [icon("search"), search, clearBtn]),
        h("button", { type: "button", class: "tool", "aria-label": "Filtr" + (n ? ", " + n + " ta tanlangan" : ""), onclick: openFilters }, [icon("filter"), n ? h("span", { class: "n", text: String(n) }) : null]),
      ]));
      head.appendChild(sugBox);

      var brands = [{ id: null, name: "Barchasi" }].concat(catalog.brands);
      head.appendChild(chipGroup(null, function () { return brands; }, function (b) { return market.f.brandId === b.id; }, function (b) {
        market.f.brandId = b.id; market.f.modelId = null; renderHead(); reload();
      }, { scroll: true, onSection: true, ariaLabel: "Marka" }));
      var b = market.f.brandId ? brandById(market.f.brandId) : null;
      if (b) {
        var models = [{ id: null, name: "Barcha " + b.name }].concat(b.models);
        head.appendChild(chipGroup(null, function () { return models; }, function (m) { return market.f.modelId === m.id; }, function (m) {
          market.f.modelId = m.id; renderHead(); reload();
        }, { scroll: true, onSection: true, ariaLabel: "Model" }));
      }
      var sortSel = h("select", { class: "sort", "aria-label": "Saralash" }, [
        h("option", { value: "new", text: "Avval yangilari" }), h("option", { value: "price_asc", text: "Avval arzonlari" }), h("option", { value: "price_desc", text: "Avval qimmatlari" }),
      ]);
      sortSel.value = market.f.sort;
      sortSel.addEventListener("change", function () { market.f.sort = sortSel.value; haptic("select"); reload(); });
      refs.count = h("span", { class: "count", text: market.loaded ? (fmtNum(market.total) || "0") + " ta e'lon" : "" });
      head.appendChild(h("div", { class: "toolbar" }, [refs.count, sortSel]));
      // Tanlangan marka/model tugmasi ko'rinib tursin
      head.querySelectorAll(".chips.scroll").forEach(function (row) {
        var on = row.querySelector('[aria-pressed="true"]');
        if (on && on.offsetLeft > row.clientWidth - 60) row.scrollLeft = on.offsetLeft - 40;
      });
    }

    function renderItems(fresh) {
      if (fresh) grid.innerHTML = "";
      var start = fresh ? 0 : grid.children.length;
      market.items.slice(start).forEach(function (it) { grid.appendChild(adCard(it)); });
      footer.innerHTML = "";
      if (market.loaded && market.items.length === 0) {
        footer.appendChild(emptyState("Hech narsa topilmadi", market.f.q ? "«" + market.f.q + "» bo'yicha e'lon yo'q. Boshqacha yozib ko'ring yoki filtrlarni yumshating." : "Filtrlarni yumshating yoki boshqa modelni tanlang.", market.f.modelId ? "Bu moshina chiqsa xabar berish" : null, subscribeAlert, "car"));
      } else if (market.page < market.pages) {
        footer.appendChild(h("button", { type: "button", class: "btn ghost more", id: "more", text: market.loading ? "Yuklanmoqda..." : "Yana ko'rsatish", onclick: function () { load(market.page + 1); } }));
      }
      if (market.loaded && market.f.modelId && market.items.length) {
        footer.appendChild(h("button", { type: "button", class: "btn secondary more", onclick: subscribeAlert }, [icon("bell"), "Yangi e'lon chiqsa xabar berish"]));
      }
      if (refs.count) refs.count.textContent = (fmtNum(market.total) || "0") + " ta e'lon";
    }

    function load(page) {
      if (market.loading && page !== 1) return;
      var seq = market.seq = (market.seq || 0) + 1; // qidiruv tez o'zgarsa — faqat oxirgi so'rov javobi chiqadi
      market.loading = true;
      if (page === 1 && !market.items.length) { footer.innerHTML = ""; footer.appendChild(skeletonCards(4)); }
      api("/api/ads?" + marketParams(page)).then(function (r) {
        if (seq !== market.seq) return;
        market.loading = false;
        if (!r.ok) {
          toast(r.error || "Yuklab bo'lmadi");
          if (page === 1) { footer.innerHTML = ""; footer.appendChild(emptyState("Yuklab bo'lmadi", r.error || "", "Qayta urinish", function () { load(1); }, "search")); }
          return;
        }
        market.loaded = true;
        market.page = r.page; market.pages = r.pages; market.total = r.total;
        market.items = page === 1 ? r.items : market.items.concat(r.items);
        renderItems(page === 1);
      });
    }
    function reload() { market.items = []; market.page = 0; market.loaded = false; window.scrollTo(0, 0); grid.innerHTML = ""; load(1); }

    function subscribeAlert() {
      var m = modelById(market.f.modelId);
      if (!m) return;
      var st = { maxPrice: market.f.maxPrice || "" };
      openSheet("Yangi e'lon chiqsa xabar berish", [
        h("p", { class: "page-sub", text: m.brand.name + " " + m.name + " kanalga chiqishi bilan bot sizga yozadi." }),
        h("div", { class: "group" }, [h("div", { class: "field" }, [h("span", { class: "label", id: "lbl-maxPrice", text: "Narxi ko'pi bilan ($, ixtiyoriy)" }), textInput(st, "maxPrice", { inputmode: "numeric", placeholder: "Masalan: 9000" })])]),
        h("div", { class: "actions" }, [h("button", { type: "button", class: "btn", text: "Obuna bo'lish", onclick: function () {
          api("/api/alerts", { json: { modelId: m.id, maxPrice: digits(st.maxPrice) || 999999 } }).then(function (r) {
            if (!r.ok) return toast(r.error || "Xatolik");
            closeSheet(); haptic("success"); toast("Obuna bo'ldingiz. «Mening → Obunalar» bo'limida ko'rasiz.");
          });
        } })]),
      ]);
    }

    function openFilters() {
      var f = Object.assign({}, market.f);
      var opts = catalog.options;
      var years = yearOptions();
      openSheet("Filtrlar", [
        h("div", { class: "group" }, [
          h("div", { class: "field" }, [h("span", { class: "label", text: "Narxi, $" }), h("div", { class: "row2" }, [
            textInput(f, "minPrice", { inputmode: "numeric", placeholder: "dan", "aria-label": "Narxi dan" }),
            textInput(f, "maxPrice", { inputmode: "numeric", placeholder: "gacha", "aria-label": "Narxi gacha" }),
          ])]),
          h("div", { class: "field" }, [h("span", { class: "label", text: "Yili" }), h("div", { class: "row2" }, [
            selectBox(f, "yearFrom", years, "dan"), selectBox(f, "yearTo", years, "gacha"),
          ])]),
          h("div", { class: "field" }, [h("span", { class: "label", id: "lbl-region", text: "Viloyat" }), selectBox(f, "region", opts.regions, "Hammasi")]),
          h("div", { class: "field" }, [h("span", { class: "label", id: "lbl-ftrans", text: "Korobka" }), chipGroup("lbl-ftrans", function () { return opts.transmissions.map(function (n) { return { name: n }; }); }, function (it) { return f.trans === it.name; }, function (it) { f.trans = f.trans === it.name ? "" : it.name; })]),
          h("div", { class: "field" }, [h("span", { class: "label", id: "lbl-ffuel", text: "Yoqilg'i" }), chipGroup("lbl-ffuel", function () { return opts.fuels.map(function (n) { return { name: n }; }); }, function (it) { return f.fuel === it.name; }, function (it) { f.fuel = f.fuel === it.name ? "" : it.name; })]),
          h("div", { class: "field" }, [switchRow(f, "nasiya", "Faqat nasiyaga beriladiganlar")]),
        ]),
        h("div", { class: "actions" }, [
          h("button", { type: "button", class: "btn", text: "Natijalarni ko'rsatish", onclick: function () {
            f.minPrice = digits(f.minPrice); f.maxPrice = digits(f.maxPrice);
            market.f = f; closeSheet(); renderHead(); reload();
          } }),
          h("button", { type: "button", class: "btn ghost", text: "Tozalash", onclick: function () {
            market.f = Object.assign(market.f, { minPrice: "", maxPrice: "", yearFrom: "", yearTo: "", region: "", trans: "", fuel: "", nasiya: false });
            closeSheet(); renderHead(); reload();
          } }),
        ]),
      ]);
    }

    renderHead();
    if (market.loaded) { renderItems(true); setTimeout(function () { window.scrollTo(0, market.scrollY); }, 0); }
    else load(1);

    var io = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting && market.loaded && !market.loading && market.page < market.pages) load(market.page + 1);
      }, { rootMargin: "400px" });
      io.observe(footer);
    }
    return function () { market.scrollY = window.scrollY; if (io) io.disconnect(); };
  }

  // =====================================================================
  // 2. E'LON SAHIFASI
  // =====================================================================
  // Narx shkalasi: e'lon narxi shu model (±2 yil) o'rtachasiga nisbatan qayerda
  // Zonalar kanaldagi belgi bilan bir xil: -5% dan arzon — «arzon», +10% dan qimmat — «qimmat»
  function priceMeter(price, mk) {
    var diff = (price - mk.avg) / mk.avg;
    var pct = Math.round(Math.abs(diff) * 100);
    var verdict = "Bozor narxida", cls = "";
    if (diff <= -0.05) { verdict = "O'rtachadan " + pct + "% arzon"; cls = "cheap"; }
    else if (diff >= 0.10) { verdict = "O'rtachadan " + pct + "% qimmat"; cls = "high"; }
    var RANGE = 0.3; // shkala: o'rtachadan ±30%
    var left = Math.max(3, Math.min(97, (Math.max(-RANGE, Math.min(RANGE, diff)) + RANGE) / (2 * RANGE) * 100));
    var pin = h("span", { class: "pin" });
    var el = h("section", { class: "meter", "aria-label": "Narx bozorga nisbatan: " + verdict }, [
      h("div", { class: "m-title", text: "Narx bozorga nisbatan" }),
      h("div", { class: "m-verdict " + cls, text: verdict }),
      h("div", { class: "bar", style: "grid-template-columns:25fr 15fr 20fr", "aria-hidden": "true" }, [h("i"), h("i"), h("i"), pin]),
      h("div", { class: "scale", "aria-hidden": "true" }, [h("span", { text: "Arzon" }), h("span", { text: "O'rtacha " + fmtPrice(mk.avg) }), h("span", { text: "Qimmat" })]),
      h("p", { class: "m-foot", text: "Shu model, ±2 yil: " + mk.count + " ta faol e'lon, " + fmtPrice(mk.min) + " dan " + fmtPrice(mk.max) + " gacha." }),
    ]);
    // Yagona animatsiya: ko'rsatkich o'rtadan e'lon narxi turgan joyga siljiydi
    requestAnimationFrame(function () { requestAnimationFrame(function () { pin.style.left = left + "%"; }); });
    return el;
  }

  function screenAd(m) {
    var id = Number(m[1]);
    app.appendChild(skeleton());
    var alive = true;
    api("/api/ads/" + id).then(function (r) {
      if (!alive) return;
      app.innerHTML = "";
      if (!r.ok) { app.appendChild(messageScreen("E'lon topilmadi", r.error || "", [h("button", { type: "button", class: "btn", text: "Bozorga qaytish", onclick: function () { replaceTo("/"); } })])); return; }
      var ad = r.ad;
      var n = ad.photos.length;
      var pos = h("span", { class: "pos", text: "1/" + Math.max(1, n) });
      var dots = n > 1 && n <= 8 ? h("div", { class: "dots", "aria-hidden": "true" }, ad.photos.map(function (_, i) { return h("i", { class: i ? "" : "on" }); })) : null;
      var track = h("div", { class: "track" }, ad.photos.map(function (src, i) { return h("img", { src: src, alt: ad.title + ", rasm " + (i + 1), loading: i ? "lazy" : "eager" }); }));
      track.addEventListener("scroll", function () {
        var i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
        pos.textContent = (i + 1) + "/" + n;
        if (dots) Array.prototype.forEach.call(dots.children, function (d, k) { d.className = k === i ? "on" : ""; });
      }, { passive: true });
      var heart = h("button", { type: "button", class: "heart", "aria-label": "Saqlash", "aria-pressed": ad.isFav ? "true" : "false" }, [icon("heart", ad.isFav)]);
      heart.addEventListener("click", toggleFav);
      var share = ad.channelUrl ? h("button", { type: "button", class: "share", "aria-label": "Ulashish", onclick: function () {
        logEvent("share_ad", { adId: ad.id });
        openLink("https://t.me/share/url?url=" + encodeURIComponent(ad.channelUrl) + "&text=" + encodeURIComponent(ad.title + (ad.year ? ", " + ad.year : "") + " — " + fmtPrice(ad.price)));
      } }, [icon("share")]) : null;
      var canFav = ad.status === "active" && !ad.isOwner;
      if (share && !canFav) share.style.right = "12px";
      app.appendChild(h("div", { class: "gallery" }, [track, n > 8 ? pos : dots, share, canFav ? heart : null,
        ad.status === "sold" ? h("div", { class: "sold-veil" }, [h("span", { text: "SOTILDI" })]) : null]));

      // Narx va nom
      var priceText = ad.status === "sold" && ad.soldPrice ? fmtPrice(ad.soldPrice) : fmtPrice(ad.price);
      var when = relDay(ad.createdAt);
      var badges = [];
      if (ad.dealer) badges.push(h("span", { class: "badge trust" }, [icon("shield"), "Ishonchli sotuvchi: " + ad.dealer]));
      if (ad.nasiya) badges.push(h("span", { class: "badge amber" }, [icon("card"), "Nasiyaga beriladi"]));
      if (ad.badge && !(ad.market && ad.status === "active")) badges.push(h("span", { class: "badge " + ad.badge.type, text: ad.badge.text }));
      app.appendChild(h("div", { class: "ad-head" }, [
        h("div", { class: "ad-price" }, [priceText, ad.status === "sold" && ad.soldPrice && ad.soldPrice !== ad.price ? h("s", { text: fmtPrice(ad.price) }) : null]),
        h("div", { class: "ad-title", text: ad.title + (ad.year ? ", " + ad.year : "") }),
        h("div", { class: "ad-sub" }, [
          when ? h("span", null, [icon("clock"), when]) : null,
          ad.saves > 0 ? h("span", null, [icon("heart"), ad.saves + " kishi saqlagan"]) : null,
          h("span", { text: "E'lon #" + ad.id }),
        ]),
        badges.length ? h("div", { class: "badges" }, badges) : null,
      ]));

      if (ad.market && ad.status === "active") app.appendChild(priceMeter(Number(digits(ad.price)), ad.market));

      // Asosiy ko'rsatkichlar
      var tiles = [["calendar", "Yili", ad.year], ["gauge", "Probeg", fmtKm(ad.probeg)], ["gear", "Korobka", ad.trans], ["fuel", "Yoqilg'i", ad.fuel]]
        .filter(function (t) { return t[2]; });
      app.appendChild(h("div", { class: "spec-tiles" }, tiles.map(function (t) { return h("div", { class: "tile" }, [icon(t[0]), h("span", { class: "k", text: t[1] }), h("span", { class: "v", text: t[2] })]); })));

      var specs = h("dl", { class: "specs" });
      [["Kraska", ad.paint], ["Rangi", ad.color]].forEach(function (row) {
        if (!row[1]) return;
        specs.appendChild(h("dt", { text: row[0] })); specs.appendChild(h("dd", { text: row[1] }));
      });
      if (ad.region) { specs.appendChild(h("dt", { text: "Viloyat" })); specs.appendChild(h("dd", null, [plate(ad.region, true)])); }
      app.appendChild(h("p", { class: "sec-title", text: "Batafsil" }));
      app.appendChild(h("div", { class: "group" }, [h("div", { class: "field" }, [specs])]));
      [["Nasiya (bo'lib to'lash)", ad.nasiya], ["Maxsus taklif", ad.dealerOffer], ["Barter", ad.barter], ["Moshina tarixi", ad.history]].forEach(function (b) {
        if (!b[1]) return;
        app.appendChild(h("p", { class: "sec-title", text: b[0] }));
        app.appendChild(h("div", { class: "group" }, [h("div", { class: "field text-block", text: b[1] })]));
      });

      var links = [];
      if (ad.channelUrl) links.push(listItem({ icon: "send", color: "#2aabee", title: ad.hasVideo ? "Kanalda ko'rish (video bilan)" : "Kanalda ko'rish", sub: "Post, izohlar va baholar", onclick: function () { logEvent("channel", { adId: ad.id }); openLink(ad.channelUrl); } }));
      if (links.length) { app.appendChild(h("div", { class: "list", style: "margin-top:16px" }, links)); }

      if (r.similar && r.similar.length) {
        app.appendChild(h("p", { class: "sec-title", text: "O'xshash e'lonlar" }));
        app.appendChild(h("div", { class: "similar" }, r.similar.map(function (it) { return adCard(it, null, true); })));
      }

      // Pastdagi doimiy panel: qo'ng'iroq (yoki egasi uchun — boshqarish)
      var barKids = null;
      if (ad.isOwner && ad.status !== "sold") {
        barKids = [h("button", { type: "button", class: "btn", onclick: function () { go("/my/ad/" + ad.id); } }, [icon("edit"), "E'lonni boshqarish"])];
      } else if (ad.status === "active" && ad.phone) {
        barKids = [
          h("a", { class: "btn", href: "tel:+" + digits(ad.phone), "aria-label": "Qo'ng'iroq qilish: " + fmtPhone(ad.phone), onclick: function () { logEvent("call", { adId: ad.id }); } }, [icon("phone"), fmtPhone(ad.phone)]),
          h("button", { type: "button", class: "icon-btn", "aria-label": "Raqamdan nusxa olish", onclick: function () { copyText("+" + digits(ad.phone), "Raqam nusxalandi"); logEvent("copy_phone", { adId: ad.id }); } }, [icon("copy")]),
        ];
      }
      if (barKids) showActionBar(barKids);

      function toggleFav() {
        var on = !ad.isFav; ad.isFav = on;
        heart.setAttribute("aria-pressed", on ? "true" : "false"); heart.innerHTML = ""; heart.appendChild(icon("heart", on));
        haptic("select");
        api("/api/favorites/" + ad.id, { json: { on: on } }).then(function (res) {
          if (!res.ok) { toast(res.error || "Xatolik"); return; }
          toast(on ? "Saqlandi. Narxi tushsa, bot xabar beradi." : "Saqlanganlardan olib tashlandi");
          market.items.forEach(function (it) { if (it.id === ad.id) it.isFav = on; });
        });
      }
    });
    return function () { alive = false; hideActionBar(); };
  }
  function showActionBar(kids) {
    hideActionBar();
    document.body.appendChild(h("div", { class: "actionbar", id: "actionbar" }, [h("div", { class: "actionbar-in" }, kids)]));
    document.body.classList.add("has-actionbar");
  }
  function hideActionBar() {
    var b = document.getElementById("actionbar"); if (b) b.remove();
    document.body.classList.remove("has-actionbar");
  }

  // =====================================================================
  // 3. E'LON BERISH / TAHRIRLASH FORMASI
  // =====================================================================
  var DRAFT_KEY = "ad_draft_v1";
  function draftKey() { return DRAFT_KEY + "_" + (me && me.user ? me.user.id : "0"); }

  // "E'lon berish" — har safar holatni serverdan yangilab olamiz:
  // admin tasdiqlagan/rad etgan bo'lsa, ilovani qayta ochmasdan forma ochiladi.
  function screenNew(m, query) {
    app.appendChild(skeleton());
    var alive = true, inner = null;
    refreshMe().catch(function () {}).then(function () {
      if (!alive) return;
      app.innerHTML = "";
      inner = screenSell(m, query) || null;
    });
    return function () { alive = false; if (inner) inner(); };
  }
  function openNewForm() {
    var path = (location.hash.slice(1) || "/").split("?")[0];
    if (path === "/new") render(); else go("/new");
  }

  function screenSell(m, query, editAd) {
    var isEdit = !!editAd;
    if (!isEdit && !me.canPost) {
      var why = {
        pending: ["Oldingi e'loningiz tekshirilmoqda", "Admin uni tasdiqlagach yoki rad etgach, yangi e'lon bera olasiz. Natijani bot sizga yozadi."],
        limit: [(me.adLimit || "") + (me.adLimit ? " ta " : "") + "faol e'lon chegarasi", "Yangi e'lon berish uchun faol e'lonlaringizdan birini «Sotildi» deb belgilang."],
        banned: ["E'lon berish yopilgan", ""],
      }[me.code] || ["Hozircha e'lon berib bo'lmaydi", ""];
      logEvent("form_blocked", { code: me.code });
      app.appendChild(messageScreen(why[0], why[1] || me.message || "", [
        h("button", { type: "button", class: "btn", text: "Mening e'lonlarim", onclick: function () { replaceTo("/my"); } }),
        h("button", { type: "button", class: "btn ghost", text: "Bozorga qaytish", onclick: function () { replaceTo("/"); } }),
      ], me.code === "pending" ? "KUTING" : null));
      return;
    }
    if (!isEdit) logEvent("form_open");
    var refs = {};
    var S = {
      brandId: null, modelId: null, modelText: "", customModel: false, fullName: "",
      year: "", probeg: "", salon: false, paint: "", color: "", colorCustom: "", trans: "", fuel: "",
      price: "", phone: "", region: "", history: "", barter: "", nasiya: false, nasiyaTerms: "", offer: "", urgent: false,
    };
    var photos = []; // { key, file, blob, url, token, ref, status, progress }
    var video = null;
    var keySeq = 0;
    var submitting = false;

    if (isEdit) {
      ["brandId", "modelId", "modelText", "customModel", "fullName", "year", "probeg", "salon", "paint", "color", "colorCustom", "trans", "fuel", "price", "phone", "region", "history", "barter", "nasiya", "nasiyaTerms", "offer"].forEach(function (k) { if (editAd[k] !== undefined && editAd[k] !== null) S[k] = editAd[k]; });
      photos = editAd.photos.map(function (p) { return { key: ++keySeq, ref: p.ref, url: p.url, status: "done", progress: 1 }; });
      if (editAd.hasVideo) video = { key: ++keySeq, old: true, status: "done" };
    } else {
      try { var raw = localStorage.getItem(draftKey()); if (raw) Object.assign(S, JSON.parse(raw)); } catch (e) {}
      if (query.get("brandId")) { S.brandId = Number(query.get("brandId")); S.modelId = query.get("modelId") ? Number(query.get("modelId")) : null; S.customModel = false; }
      if (query.get("year")) S.year = query.get("year");
      if (S.brandId !== null && S.brandId !== 0 && !brandById(S.brandId)) { S.brandId = null; S.modelId = null; }
      if (!S.phone && me.lastPhone) S.phone = String(me.lastPhone).replace(/^998/, "");
    }

    function touched() {
      if (!isEdit) { try { localStorage.setItem(draftKey(), JSON.stringify(S)); } catch (e) {} }
      updateSign();
      updateSections();
      setClosingConfirm(true);
    }
    // Bo'lim sarlavhalari: raqam → to'ldirilgach ✓ (qaysi bo'lim qolganini bir qarashda ko'rish uchun)
    function secTitle(n, text, opt) {
      var el = h("p", { class: "group-title" }, [h("span", { class: "step", text: String(n) }), text, opt ? h("span", { class: "opt", text: opt }) : null]);
      refs["sec" + n] = el;
      return el;
    }
    function updateSections() {
      if (!refs.sec1) return;
      var e = validate();
      var done = {
        1: !e.brand && !e.model && !e.year,
        2: !e.paint && !e.color && !e.trans && !e.fuel,
        3: !e.price && !e.phone && !e.region,
        4: !e.photos && !e.video && photos.length > 0 && !uploading(),
      };
      [1, 2, 3, 4].forEach(function (k) {
        var el = refs["sec" + k];
        if (!el || el.classList.contains("done") === done[k]) return;
        el.classList.toggle("done", done[k]);
        var st = el.querySelector(".step");
        st.innerHTML = "";
        if (done[k]) st.appendChild(icon("check")); else st.textContent = String(k);
      });
    }
    function carName() {
      if (S.brandId === 0) return S.fullName.trim();
      var b = brandById(S.brandId);
      if (!b) return "";
      var mm = S.customModel ? S.modelText.trim() : ((b.models.find(function (x) { return x.id === S.modelId; }) || {}).name || "");
      return (b.name + " " + mm).trim();
    }
    function updateSign() {
      var name = carName();
      refs.signCar.textContent = (name || "Moshinangiz") + (S.year ? ", " + S.year : "");
      refs.signCar.classList.toggle("empty-v", !name);
      var p = fmtNum(S.price);
      refs.signPrice.textContent = p ? p + " $" : "Narxi ... $";
      refs.signPrice.classList.toggle("empty-v", !p);
      var ph = fmtPhone(S.phone);
      refs.signPhone.textContent = ph || "+998 __ ___ __ __";
      refs.signPhone.classList.toggle("empty-v", !ph);
    }
    function inp(key, attrs, errKey) { return textInput(S, key, attrs, function () { setError(refs, errKey || key, ""); touched(); }); }
    function ta(key, attrs) { return textArea(S, key, attrs, touched); }
    function chips(key, items, isActive, onPick, opts) {
      return chipGroup("lbl-" + key, items, isActive, function (it) { onPick(it); setError(refs, key, ""); touched(); }, opts);
    }

    // Qog'oz
    refs.signCar = h("p", { class: "sign-car" });
    refs.signPrice = h("p", { class: "sign-price" });
    refs.signPhone = h("p", { class: "sign-phone" });
    if (isEdit) app.appendChild(h("h1", { class: "page", text: "E'lonni tahrirlash" }));
    app.appendChild(h("div", { class: "sign-wrap" }, [
      h("div", { class: "sign", "aria-label": "E'loningiz ko'rinishi" }, [h("p", { class: "sign-title", text: "SOTILADI" }), refs.signCar, refs.signPrice, refs.signPhone]),
      h("p", { class: "sign-note", text: isEdit ? "O'zgarishlar admin tekshiruvidan so'ng kanaldagi e'longa tushadi." : "Pastdagi ma'lumotlarni to'ldiring — e'loningiz kanalda shu ma'lumotlar bilan chiqadi." }),
    ]));

    // --- Moshina ---
    var modelField = h("div", { class: "slot" });
    function renderModelField() {
      modelField.innerHTML = "";
      if (S.brandId === null) return;
      if (S.brandId === 0) {
        modelField.appendChild(field(refs, "model", "Marka va model", inp("fullName", { placeholder: "Masalan: Changan UNI-V", maxlength: "60", autocomplete: "off", "aria-labelledby": "lbl-model" }, "model")));
        return;
      }
      var b = brandById(S.brandId);
      var custom = h("div", { class: "reveal" });
      function renderCustom() {
        custom.innerHTML = "";
        if (S.customModel) custom.appendChild(inp("modelText", { placeholder: b.name + " modelini yozing", maxlength: "60", autocomplete: "off", "aria-labelledby": "lbl-model" }, "model"));
      }
      modelField.appendChild(field(refs, "model", "Model", h("div", null, [
        chips("model", function () { return b.models.concat([{ id: -1, name: "Ro'yxatda yo'q", dashed: true }]); },
          function (x) { return x.id === -1 ? S.customModel : (!S.customModel && S.modelId === x.id); },
          function (x) {
            if (x.id === -1) { S.customModel = true; S.modelId = null; } else { S.customModel = false; S.modelId = x.id; }
            renderCustom();
            if (S.customModel) setTimeout(function () { var i = document.getElementById("in-modelText"); if (i) i.focus(); }, 30);
          }, { collapse: 12 }),
        custom,
      ])));
      renderCustom();
    }
    var probegInput = inp("probeg", { inputmode: "numeric", placeholder: "85000", maxlength: "9", autocomplete: "off" }, "year");
    function syncSalon() { probegInput.disabled = S.salon; probegInput.placeholder = S.salon ? "0" : "85000"; if (S.salon) { probegInput.value = ""; S.probeg = ""; setError(refs, "year", ""); } }
    syncSalon();
    var yearRow = h("div", { class: "field" }, [h("div", { class: "row2" }, [
      h("div", null, [h("span", { class: "label", id: "lbl-year", text: "Yili" }), selectBox(S, "year", yearOptions(), "Tanlang", function () { setError(refs, "year", ""); touched(); })]),
      h("div", null, [h("span", { class: "label", id: "lbl-probeg", text: "Probeg" }), h("div", { class: "input-suffix" }, [probegInput, h("span", { text: "km" })])]),
    ]), h("p", { class: "error" })]);
    refs.f_year = yearRow;

    app.appendChild(secTitle(1, "Moshina"));
    app.appendChild(h("div", { class: "group" }, [
      field(refs, "brand", "Marka", chips("brand", function () { return catalog.brands.concat([{ id: 0, name: "Boshqa marka", dashed: true }]); },
        function (b) { return S.brandId === b.id; },
        function (b) { if (S.brandId !== b.id) { S.modelId = null; S.customModel = false; S.modelText = ""; } S.brandId = b.id; renderModelField(); }, { collapse: 9 })),
      modelField,
      yearRow,
      h("div", { class: "field" }, [switchRow(S, "salon", "Yangi, salondan", "Probeg 0 km deb yoziladi", function () { syncSalon(); touched(); })]),
    ]));
    renderModelField();

    // --- Holati ---
    var opts = catalog.options;
    function simple(list) { return function () { return list.map(function (n) { return { name: n }; }); }; }
    var colorCustom = h("div", { class: "reveal" });
    function renderColorCustom() {
      colorCustom.innerHTML = "";
      if (S.color === "__other") colorCustom.appendChild(inp("colorCustom", { placeholder: "Rangini yozing", maxlength: "30", "aria-labelledby": "lbl-color" }, "color"));
    }
    app.appendChild(secTitle(2, "Holati"));
    app.appendChild(h("div", { class: "group" }, [
      field(refs, "paint", "Kraska", chips("paint", simple(opts.paints), function (it) { return S.paint === it.name; }, function (it) { S.paint = it.name; })),
      field(refs, "color", "Rangi", h("div", null, [
        chips("color", function () { return opts.colors.map(function (n) { return { name: n }; }).concat([{ name: "Boshqa rang", other: true, dashed: true }]); },
          function (it) { return it.other ? S.color === "__other" : S.color === it.name; },
          function (it) { S.color = it.other ? "__other" : it.name; renderColorCustom(); }),
        colorCustom,
      ])),
      field(refs, "trans", "Korobka", chips("trans", simple(opts.transmissions), function (it) { return S.trans === it.name; }, function (it) { S.trans = it.name; })),
      field(refs, "fuel", "Yoqilg'i", chips("fuel", simple(opts.fuels), function (it) { return S.fuel === it.name; }, function (it) { S.fuel = it.name; })),
    ]));
    renderColorCustom();

    // --- Narx va aloqa ---
    app.appendChild(secTitle(3, "Narx va aloqa"));
    app.appendChild(h("div", { class: "group" }, [
      field(refs, "price", "Narxi", h("div", { class: "input-suffix" }, [inp("price", { inputmode: "numeric", placeholder: "Masalan: 8500", maxlength: "7", autocomplete: "off" }), h("span", { text: "$" })])),
      field(refs, "phone", "Telefon", inp("phone", { type: "tel", inputmode: "tel", placeholder: "90 123 45 67", maxlength: "28", autocomplete: "tel" }), "Xaridorlar shu raqamga qo'ng'iroq qiladi."),
      field(refs, "region", "Viloyat", selectBox(S, "region", opts.regions, "Tanlang", function () { setError(refs, "region", ""); touched(); })),
    ]));

    // --- Rasm va video ---
    refs.photoGrid = h("div", { class: "photos" });
    refs.photoInput = h("input", { type: "file", accept: "image/*", multiple: true, class: "file-input", "aria-label": "Rasm qo'shish" });
    refs.photoInput.addEventListener("change", function () { addPhotos(refs.photoInput.files); refs.photoInput.value = ""; });
    refs.videoBox = h("div", { class: "photos" });
    refs.videoInput = h("input", { type: "file", accept: "video/*", class: "file-input", "aria-label": "Video qo'shish" });
    refs.videoInput.addEventListener("change", function () { if (refs.videoInput.files[0]) setVideo(refs.videoInput.files[0]); refs.videoInput.value = ""; });
    app.appendChild(secTitle(4, "Rasm va video"));
    app.appendChild(h("div", { class: "group" }, [
      field(refs, "photos", "Rasmlar, 1 tadan 6 tagacha", h("div", null, [refs.photoGrid, refs.photoInput]), "Birinchi rasm asosiy bo'ladi. Old, orqa, yon, salon va spidometrni suratga oling."),
      field(refs, "video", "Video (ixtiyoriy)", h("div", null, [refs.videoBox, refs.videoInput]), "30 soniyalik obzor video bo'lsa, moshina tezroq sotiladi. 49 MB gacha."),
    ]));

    // --- Qo'shimcha ---
    var nasiyaReveal = h("div", { class: "reveal" });
    function renderNasiya() {
      nasiyaReveal.innerHTML = "";
      if (S.nasiya) nasiyaReveal.appendChild(ta("nasiyaTerms", { "aria-label": "Nasiya shartlari", "aria-labelledby": null, placeholder: "Masalan: 50% oldindan, qolgani 6 oyga. Bo'sh qoldirsangiz «shartlari kelishiladi» deb yoziladi.", maxlength: "200", rows: "2" }));
    }
    var extras = [
      field(refs, "history", "Moshina tarixi (ixtiyoriy)", ta("history", { placeholder: "Masalan: 2 yil oldin metan o'rnatilgan, moyi har 7500 km da almashtirilgan.", maxlength: "400" })),
      field(refs, "barter", "Barter (ixtiyoriy)", inp("barter", { placeholder: "Masalan: Cobalt ga almashaman", maxlength: "150" }), "Bo'sh qoldirsangiz, faqat naqd deb yoziladi."),
      h("div", { class: "field" }, [switchRow(S, "nasiya", "Nasiyaga beraman", "Bo'lib to'lash xaridorlarni ko'paytiradi", function () { renderNasiya(); touched(); }), nasiyaReveal]),
    ];
    if (me.isDealer) extras.push(field(refs, "offer", "Maxsus taklif (avtosalon)", ta("offer", { placeholder: "Aksiya, kredit, sovg'a. Masalan: 12 oygacha 0% bo'lib to'lash!", maxlength: "300" })));
    extras.push(h("div", { class: "field" }, [switchRow(S, "urgent", "Shoshilinch sotiladi", "Bozor narxidan arzonroq va tez sotmoqchi bo'lsangiz", touched)]));
    app.appendChild(secTitle(5, "Qo'shimcha", "ixtiyoriy"));
    app.appendChild(h("div", { class: "group" }, extras));
    renderNasiya();

    // ---- Rasmlar ----
    function addPhotos(fileList) {
      var files = Array.prototype.slice.call(fileList || []);
      var free = 6 - photos.length;
      if (files.length > free) toast("Ko'pi bilan 6 ta rasm. Ortiqchasi qo'shilmadi.");
      files.slice(0, free).forEach(function (file) {
        if (!/^image\//.test(file.type)) return;
        var p = { key: ++keySeq, file: file, url: URL.createObjectURL(file), status: "uploading", progress: 0 };
        photos.push(p);
        startPhotoUpload(p);
      });
      setError(refs, "photos", ""); touched();
      renderPhotos();
    }
    function startPhotoUpload(p) {
      if (p.ref) return Promise.resolve();
      p.status = "uploading"; p.progress = 0; p.token = null;
      var ready = p.blob ? Promise.resolve(p.blob) : compressImage(p.file).then(function (b) { p.blob = b; return b; });
      return ready.then(function (blob) { return upload("photo", blob, function (f) { p.progress = f; paintThumb(p); }); })
        .then(function (r) {
          if (photos.indexOf(p) === -1) return;
          if (r.ok) { p.status = "done"; p.token = r.token; } else { p.status = "error"; p.error = r.error; }
          renderPhotos();
        });
    }
    function paintThumb(p) { var bar = app.querySelector('[data-key="' + p.key + '"] .bar i'); if (bar) bar.style.width = Math.round(p.progress * 100) + "%"; }
    function renderPhotos() {
      var g = refs.photoGrid; g.innerHTML = "";
      photos.forEach(function (p, i) {
        var kids = [h("img", { src: p.url, alt: "Rasm " + (i + 1) })];
        if (i === 0) kids.push(h("span", { class: "main-tag", text: "Asosiy" }));
        if (p.status === "uploading") kids.push(h("div", { class: "veil" }, ["Yuklanmoqda"]), h("div", { class: "bar" }, [h("i", { style: "width:" + Math.round(p.progress * 100) + "%" })]));
        if (p.status === "error") kids.push(h("button", { type: "button", class: "veil", onclick: function () { startPhotoUpload(p); renderPhotos(); } }, ["Yuklanmadi. Qayta urinish uchun bosing"]));
        kids.push(h("button", { type: "button", class: "remove", "aria-label": "Rasmni o'chirish", text: "×", onclick: function () {
          photos.splice(photos.indexOf(p), 1); if (p.file) URL.revokeObjectURL(p.url); renderPhotos(); haptic("select"); touched();
        } }));
        g.appendChild(h("div", { class: "thumb", "data-key": String(p.key) }, kids));
      });
      if (photos.length < 6) g.appendChild(h("button", { type: "button", class: "add-tile", onclick: function () { refs.photoInput.click(); } }, [h("b", { text: "+" }), photos.length ? "Yana qo'shish" : "Rasm qo'shish"]));
      updateSections();
    }
    function setVideo(file) {
      if (!/^video\//.test(file.type)) return toast("Bu video fayl emas.");
      if (file.size > 49 * 1024 * 1024) return toast("Video 49 MB dan katta. Qisqaroq video tanlang.");
      if (video && video.url) URL.revokeObjectURL(video.url);
      video = { key: ++keySeq, file: file, url: URL.createObjectURL(file), status: "uploading", progress: 0 };
      renderVideo(); startVideoUpload(video); touched();
    }
    function startVideoUpload(v) {
      if (v.old) return Promise.resolve();
      v.status = "uploading"; v.progress = 0; v.token = null;
      return upload("video", v.file, function (f) { v.progress = f; paintThumb(v); }).then(function (r) {
        if (video !== v) return;
        if (r.ok) { v.status = "done"; v.token = r.token; } else { v.status = "error"; v.error = r.error; toast(r.error || "Video yuklanmadi."); }
        renderVideo();
      });
    }
    function renderVideo() {
      var box = refs.videoBox; box.innerHTML = "";
      if (video) {
        var v = video, kids;
        if (v.old) kids = [h("span", { text: "Hozirgi video saqlanadi" })];
        else {
          kids = [h("video", { src: v.url, muted: true, playsinline: true, preload: "metadata" })];
          if (v.status === "uploading") kids.push(h("div", { class: "veil" }, ["Yuklanmoqda"]), h("div", { class: "bar" }, [h("i", { style: "width:" + Math.round(v.progress * 100) + "%" })]));
          if (v.status === "error") kids.push(h("button", { type: "button", class: "veil", onclick: function () { startVideoUpload(v); renderVideo(); } }, ["Yuklanmadi. Qayta urinish uchun bosing"]));
        }
        kids.push(h("button", { type: "button", class: "remove", "aria-label": "Videoni o'chirish", text: "×", onclick: function () { if (v.url) URL.revokeObjectURL(v.url); video = null; renderVideo(); touched(); } }));
        box.appendChild(h("div", { class: "thumb" + (v.old ? " oldvideo" : ""), "data-key": String(v.key) }, kids));
      } else {
        box.appendChild(h("button", { type: "button", class: "add-tile", onclick: function () { refs.videoInput.click(); } }, [h("b", { text: "+" }), "Video qo'shish"]));
      }
    }
    renderPhotos(); renderVideo();

    // ---- Tekshirish va yuborish ----
    function validate() {
      var errs = {};
      if (S.brandId === null) errs.brand = "Markani tanlang.";
      else if (S.brandId === 0 && S.fullName.trim().length < 2) errs.model = "Marka va modelni yozing.";
      else if (S.brandId > 0 && !S.modelId && !(S.customModel && S.modelText.trim())) errs.model = S.customModel ? "Model nomini yozing." : "Modelni tanlang.";
      var yp = [];
      if (!S.year) yp.push("yilini tanlang");
      if (!S.salon && !digits(S.probeg)) yp.push("probegni yozing yoki «Yangi, salondan» ni yoqing");
      if (yp.length) errs.year = yp.join(", ").replace(/^./, function (c) { return c.toUpperCase(); }) + ".";
      if (!S.paint) errs.paint = "Kraska holatini tanlang.";
      if (!S.color || (S.color === "__other" && !S.colorCustom.trim())) errs.color = "Rangini tanlang.";
      if (!S.trans) errs.trans = "Korobka turini tanlang.";
      if (!S.fuel) errs.fuel = "Yoqilg'i turini tanlang.";
      var price = Number(digits(S.price));
      if (!price) errs.price = "Narxni yozing.";
      else if (price < 300) errs.price = "Narx juda past. Dollarda yozing, masalan 8500.";
      else if (price > 500000) errs.price = "Narx juda baland. Real narxni dollarda yozing.";
      var ph = digits(S.phone).replace(/^(998)+/, "");
      if (ph.length > 9) ph = ph.slice(-9);
      if (ph.length !== 9) errs.phone = "Raqamni to'liq yozing, masalan 90 123 45 67.";
      if (!S.region) errs.region = "Viloyatni tanlang.";
      if (photos.length === 0) errs.photos = "Kamida 1 ta rasm qo'shing.";
      else if (photos.some(function (p) { return p.status === "error"; })) errs.photos = "Yuklanmagan rasmni qayta yuklang yoki o'chiring.";
      if (video && video.status === "error") errs.video = "Video yuklanmadi. Qayta urinib ko'ring yoki o'chiring.";
      return errs;
    }
    function showErrors(errs) {
      ["brand", "model", "year", "paint", "color", "trans", "fuel", "price", "phone", "region", "photos", "video"].forEach(function (k) { setError(refs, k, errs[k] || ""); });
      var first = app.querySelector(".field.invalid");
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    function uploading() { return photos.some(function (p) { return p.status === "uploading"; }) || (video && video.status === "uploading"); }
    function waitUploads() {
      if (!uploading()) return Promise.resolve();
      return new Promise(function (resolve) { var t = setInterval(function () { if (!uploading()) { clearInterval(t); resolve(); } }, 300); });
    }
    function payload() {
      return {
        brandId: S.brandId, modelId: S.customModel ? null : S.modelId, modelText: S.customModel ? S.modelText : "",
        fullName: S.fullName, year: S.year, salon: S.salon, probeg: S.probeg,
        paint: S.paint, color: S.color === "__other" ? S.colorCustom : S.color, trans: S.trans, fuel: S.fuel,
        price: S.price, phone: S.phone, region: S.region, history: S.history, barter: S.barter,
        nasiya: S.nasiya, nasiyaTerms: S.nasiyaTerms, offer: S.offer, urgent: S.urgent,
        photos: photos.map(function (p) { return p.ref || p.token; }),
        video: video ? (video.old ? "old" : video.token) : null,
      };
    }
    function submit() {
      if (submitting) return;
      var errs = validate();
      if (Object.keys(errs).length) { showErrors(errs); haptic("error"); return; }
      showErrors({});
      submitting = true;
      mainBusy(true, uploading() ? "Rasmlar yuklanmoqda..." : "Yuborilmoqda...");
      waitUploads().then(function () {
        var errs2 = validate();
        if (Object.keys(errs2).length) { submitting = false; mainBusy(false); showErrors(errs2); haptic("error"); return; }
        mainBusy(true, "Yuborilmoqda...");
        send(true);
      });
    }
    function send(allowRetry) {
      var url = isEdit ? "/api/my/ads/" + editAd.id + "/edit" : "/api/ads";
      return api(url, { json: payload() }).then(function (r) {
        if (r.ok) { done(r.adId); return; }
        if (r.code === "upload_expired" && allowRetry) {
          mainBusy(true, "Rasmlar qayta yuklanmoqda...");
          var jobs = photos.map(startPhotoUpload);
          if (video) jobs.push(startVideoUpload(video));
          return Promise.all(jobs).then(function () { return send(false); });
        }
        submitting = false; mainBusy(false); haptic("error");
        if (r.code && ["pending", "limit", "banned", "not_subscribed"].indexOf(r.code) !== -1) {
          setMain(null); app.innerHTML = "";
          app.appendChild(messageScreen("E'lon berib bo'lmaydi", r.error, [h("button", { type: "button", class: "btn", text: "Mening e'lonlarim", onclick: function () { replaceTo("/my"); } })]));
          return;
        }
        toast(r.error || "Yuborib bo'lmadi. Qayta urinib ko'ring.");
      });
    }
    function done(adId) {
      haptic("success");
      if (!isEdit) { try { localStorage.removeItem(draftKey()); } catch (e) {} }
      setClosingConfirm(false);
      setMain(null);
      // Yana e'lon bera oladimi — serverdan so'raymiz (admin va avtosalonlar uchun cheklov yo'q,
      // oddiy foydalanuvchi esa oldingi e'loni tasdiqlanguncha kutadi — botdagi qoida)
      (isEdit ? Promise.resolve() : refreshMe()).then(function () {
        app.innerHTML = "";
        var actions = [];
        if (!isEdit && me.canPost) actions.push(h("button", { type: "button", class: "btn", onclick: openNewForm }, [icon("plus"), "Yana e'lon berish"]));
        actions.push(h("button", { type: "button", class: "btn" + (actions.length ? " ghost" : ""), text: "Mening e'lonlarim", onclick: function () { replaceTo("/my"); } }));
        actions.push(h("button", { type: "button", class: "btn ghost", text: "Bozorga qaytish", onclick: function () { replaceTo("/"); } }));
        app.appendChild(messageScreen(
          isEdit ? "Tahrir adminga yuborildi" : "E'lon adminga yuborildi",
          isEdit ? "Tekshiruvdan so'ng kanaldagi e'lon yangilanadi." : "Tekshiruvdan so'ng kanalga joylanadi. Natijani bot sizga yozadi." + (adId ? " E'lon ID: " + adId + "." : "") +
            (!me.canPost ? " Admin tasdiqlagach, keyingi e'lonni berishingiz mumkin." : ""),
          actions,
          "YUBORILDI"
        ));
      });
    }
    setMain(isEdit ? "Tahrirni yuborish" : "Adminga yuborish", submit);
    updateSign();
    updateSections();
    return function () { setClosingConfirm(false); };
  }

  function screenEdit(m) {
    var id = Number(m[1]);
    currentParent = "/my/ad/" + id;
    app.appendChild(skeleton());
    var alive = true;
    api("/api/my/ads/" + id).then(function (r) {
      if (!alive) return;
      app.innerHTML = "";
      if (!r.ok) { app.appendChild(messageScreen("E'lon topilmadi", r.error || "")); return; }
      if (r.ad.status !== "active") { app.appendChild(messageScreen("Tahrirlab bo'lmaydi", "Faqat kanalda faol turgan e'lonni tahrirlash mumkin.")); return; }
      inner = screenSell(m, new URLSearchParams(), r.ad);
    });
    var inner = null;
    return function () { alive = false; if (inner) inner(); };
  }

  // =====================================================================
  // 4. MENING (e'lonlarim, saqlanganlar, obunalar)
  // =====================================================================
  function statusPill(it) {
    if (it.status === "pending") return h("span", { class: "pill pending", text: "Tekshirilmoqda" });
    if (it.status === "sold") return h("span", { class: "pill sold", text: "Sotilgan" + (it.soldPrice ? ": " + fmtPrice(it.soldPrice) : "") });
    if (it.editPending) return h("span", { class: "pill pending", text: "Tahrir tekshirilmoqda" });
    return h("span", { class: "pill active", text: "Kanalda faol" });
  }
  // Kanaldagi «Narxga baho» reaksiyalari: 🔥 arzon · 👍 normal · 🤔 qimmat
  function votesLine(it) {
    var v = it.votes;
    if (!v) return null;
    return h("div", { class: "votes", title: "Kanalda narxingizga berilgan baho: 🔥 arzon · 👍 normal · 🤔 qimmat", text: "Kanalda: 🔥 " + v.fire + " · 👍 " + v.ok + " · 🤔 " + v.think });
  }
  function screenMy(m, query) {
    var tab = query.get("tab") || "ads";
    app.appendChild(h("h1", { class: "page", text: "Mening" }));
    var seg = h("div", { class: "seg", role: "tablist" }, [["ads", "E'lonlarim"], ["fav", "Saqlangan"], ["alerts", "Obunalar"]].map(function (t) {
      return h("button", { type: "button", role: "tab", "aria-selected": t[0] === tab ? "true" : "false", text: t[1], onclick: function () { replaceTo("/my?tab=" + t[0]); } });
    }));
    var body = h("div");
    app.appendChild(seg); app.appendChild(body);
    body.appendChild(skeleton());

    if (tab === "ads") {
      api("/api/my/ads").then(function (r) {
        body.innerHTML = "";
        if (!r.ok) return body.appendChild(emptyState("Yuklab bo'lmadi", r.error || ""));
        if (r.freeUps > 0) body.appendChild(h("div", { class: "notice" }, [h("span", { text: "🚀" }), h("div", null, [h("b", { text: r.freeUps + " ta bepul UP bonusingiz bor" }), h("span", { class: "s", text: "Faol e'lonni oching va «Bepul UP» ni bosing — e'lon kanalda yangi qatorga chiqadi." })])]));
        if (!r.items.length) return body.appendChild(emptyState("Hali e'loningiz yo'q", "Moshinangizni bepul joylang — minglab xaridor kutmoqda.", "E'lon berish", function () { go("/new"); }, "car"));
        body.appendChild(h("button", { type: "button", class: "btn new-ad", onclick: function () { go("/new"); } }, [icon("plus"), "Yangi e'lon berish"]));
        var list = h("div", { class: "list" });
        r.items.forEach(function (it) {
          list.appendChild(h("button", { type: "button", class: "my-row", onclick: function () { go(it.status === "active" ? "/my/ad/" + it.id : "/ad/" + it.id); } }, [
            it.photo ? h("img", { src: it.photo, alt: "" }) : h("span", { class: "noimg" }),
            h("span", { class: "body" }, [h("div", { class: "t", text: it.title + (it.year ? ", " + it.year : "") }), h("div", { class: "p", text: fmtPrice(it.price) }), votesLine(it), statusPill(it)]),
            h("span", { class: "chev" }, [icon("chev")]),
          ]));
        });
        body.appendChild(list);
      });
    } else if (tab === "fav") {
      api("/api/favorites").then(function (r) {
        body.innerHTML = "";
        if (!r.ok) return body.appendChild(emptyState("Yuklab bo'lmadi", r.error || ""));
        if (!r.items.length) return body.appendChild(emptyState("Saqlanganlar yo'q", "E'londagi ♡ belgisini bosing — narxi tushsa, bot sizga darhol xabar beradi.", "Bozorga o'tish", function () { replaceTo("/"); }, "heart"));
        var grid = h("div", { class: "cards" });
        r.items.forEach(function (it) { grid.appendChild(adCard(it, function (x, on) { if (!on) grid.removeChild(grid.children[r.items.indexOf(x)]) && r.items.splice(r.items.indexOf(x), 1); })); });
        body.appendChild(grid);
      });
    } else {
      renderAlerts(body);
    }
  }
  function renderAlerts(body) {
    api("/api/alerts").then(function (r) {
      body.innerHTML = "";
      if (!r.ok) return body.appendChild(emptyState("Yuklab bo'lmadi", r.error || ""));
      body.appendChild(h("p", { class: "page-sub", text: "Shu moshinalardan biri kanalga chiqishi bilan bot sizga yozadi." }));
      if (r.items.length) {
        var list = h("div", { class: "list" });
        r.items.forEach(function (a) {
          list.appendChild(listItem({
            icon: "bell", color: "#ff9500", title: a.title, sub: a.maxPrice && a.maxPrice < 999999 ? fmtPrice(a.maxPrice) + " gacha" : "Istalgan narxda", chev: false,
            end: "O'chirish",
            onclick: function () {
              confirmBox("«" + a.title + "» obunasini o'chirasizmi?").then(function (ok) {
                if (!ok) return;
                api("/api/alerts/" + a.id, { method: "DELETE" }).then(function (res) { if (res.ok) { toast("Obuna o'chirildi"); renderAlerts(body); } else toast(res.error || "Xatolik"); });
              });
            },
          }));
        });
        body.appendChild(list);
      } else {
        body.appendChild(emptyState("Obunalar yo'q", "Qidirayotgan moshinangizni qo'shing — bozorga chiqsa birinchi bo'lib bilasiz.", null, null, "bell"));
      }
      body.appendChild(h("div", { class: "actions" }, [h("button", { type: "button", class: "btn secondary", onclick: function () { addAlertSheet(function () { renderAlerts(body); }); } }, [icon("plus"), "Obuna qo'shish"])]));
    });
  }
  function addAlertSheet(onDone) {
    var st = { brandId: null, modelId: null, maxPrice: "" };
    var modelBox = h("div");
    function renderModels() {
      modelBox.innerHTML = "";
      var b = st.brandId ? brandById(st.brandId) : null;
      if (!b) return;
      modelBox.appendChild(h("div", { class: "field" }, [h("span", { class: "label", id: "lbl-amodel", text: "Model" }),
        chipGroup("lbl-amodel", function () { return b.models; }, function (x) { return st.modelId === x.id; }, function (x) { st.modelId = x.id; })]));
    }
    openSheet("Obuna qo'shish", [
      h("div", { class: "group" }, [
        h("div", { class: "field" }, [h("span", { class: "label", id: "lbl-abrand", text: "Marka" }),
          chipGroup("lbl-abrand", function () { return catalog.brands; }, function (b) { return st.brandId === b.id; }, function (b) { st.brandId = b.id; st.modelId = null; renderModels(); })]),
        modelBox,
        h("div", { class: "field" }, [h("span", { class: "label", id: "lbl-maxPrice", text: "Narxi ko'pi bilan ($, ixtiyoriy)" }), textInput(st, "maxPrice", { inputmode: "numeric", placeholder: "Masalan: 9000" })]),
      ]),
      h("div", { class: "actions" }, [h("button", { type: "button", class: "btn", text: "Obuna bo'lish", onclick: function () {
        if (!st.modelId) return toast("Marka va modelni tanlang");
        api("/api/alerts", { json: { modelId: st.modelId, maxPrice: digits(st.maxPrice) || 999999 } }).then(function (r) {
          if (!r.ok) return toast(r.error || "Xatolik");
          closeSheet(); haptic("success"); toast("Obuna qo'shildi"); onDone();
        });
      } })]),
    ]);
  }

  // ---------- Bitta e'lonni boshqarish ----------
  function screenManage(m) {
    var id = Number(m[1]);
    app.appendChild(skeleton());
    var alive = true;
    function load() {
      Promise.all([api("/api/my/ads"), refreshMe()]).then(function (res) {
        if (!alive) return;
        var r = res[0];
        app.innerHTML = "";
        var it = r.ok ? r.items.find(function (x) { return x.id === id; }) : null;
        if (!it) { app.appendChild(messageScreen("E'lon topilmadi", "Bu e'lon o'chirilgan yoki sizga tegishli emas.")); return; }
        app.appendChild(h("div", { class: "list", style: "margin-top:4px" }, [h("button", { type: "button", class: "my-row", onclick: function () { go("/ad/" + id); } }, [
          it.photo ? h("img", { src: it.photo, alt: "" }) : h("span", { class: "noimg" }),
          h("span", { class: "body" }, [h("div", { class: "t", text: it.title + (it.year ? ", " + it.year : "") }), h("div", { class: "p", text: fmtPrice(it.price) }), votesLine(it), statusPill(it)]),
          h("span", { class: "chev" }, [icon("chev")]),
        ])]));
        if (it.status !== "active") { app.appendChild(h("p", { class: "page-sub", style: "margin-top:12px", text: it.status === "pending" ? "E'lon admin tekshiruvida. Tasdiqlangach shu yerdan boshqarasiz." : "E'lon sotilgan deb belgilangan." })); return; }
        if (it.editPending) app.appendChild(h("div", { class: "notice", style: "margin-top:12px" }, [h("span", { text: "⏳" }), h("div", null, [h("b", { text: "Tahriringiz admin tekshiruvida" }), h("span", { class: "s", text: "Tasdiqlangach kanaldagi e'lon yangilanadi." })])]));

        app.appendChild(h("p", { class: "group-title", text: "Amallar" }));
        var items = [
          listItem({ icon: "check", color: "#34c759", title: "Sotildi deb belgilash", sub: "Admin tasdiqlagach kanalda «Sotildi» bo'ladi", onclick: soldSheet }),
          listItem({ icon: "down", color: "#ff9500", title: "Narxni o'zgartirish", sub: "Narx tushsa, saqlaganlarga xabar boradi", onclick: priceSheet }),
          listItem({ icon: "edit", color: "#007aff", title: "To'liq tahrirlash", sub: "Rasm, matn va boshqa ma'lumotlar", onclick: function () { go("/edit/" + id); } }),
          listItem({ icon: "star", color: "#ffb300", title: "VIP qilish", sub: "Kanal tepasiga qadaladi, " + fmtNum(me.vip.price) + " so'm", onclick: function () { go("/vip/" + id); } }),
        ];
        if (me.freeUps > 0) items.push(listItem({ icon: "up", color: "#af52de", title: "Bepul UP", sub: "E'lon kanalda yangi qatorga chiqadi", end: me.freeUps + " ta", onclick: doUp }));
        if (it.channelUrl) items.push(listItem({ icon: "eye", color: "#8e8e93", title: "Kanalda ko'rish", onclick: function () { openLink(it.channelUrl); } }));
        app.appendChild(h("div", { class: "list" }, items));

        function soldSheet() {
          var st = { price: "" };
          function send(withPrice) {
            api("/api/my/ads/" + id + "/sold", { json: { price: withPrice ? digits(st.price) : null } }).then(function (res) {
              if (!res.ok) return toast(res.error || "Xatolik");
              closeSheet(); haptic("success");
              toast("So'rov adminga yuborildi. Tasdiqlangach kanalda belgilanadi.");
            });
          }
          openSheet("Moshina qanchaga sotildi?", [
            h("p", { class: "page-sub", text: "Real sotuv narxi boshqa sotuvchilarga bozor narxini bilishda yordam beradi. Aytish shart emas." }),
            h("div", { class: "group" }, [h("div", { class: "field" }, [h("span", { class: "label", id: "lbl-soldp", text: "Sotilgan narx, $" }), textInput(st, "price", { inputmode: "numeric", placeholder: "Masalan: " + digits(it.price), "aria-labelledby": "lbl-soldp" })])]),
            h("div", { class: "actions" }, [
              h("button", { type: "button", class: "btn", text: "Yuborish", onclick: function () { if (!digits(st.price)) return toast("Narxni yozing yoki «Narxsiz yuborish» ni bosing"); send(true); } }),
              h("button", { type: "button", class: "btn ghost", text: "Narxsiz yuborish", onclick: function () { send(false); } }),
            ]),
          ]);
        }
        function priceSheet() {
          var st = { price: "" };
          openSheet("Yangi narx", [
            h("p", { class: "page-sub", text: "Hozirgi narx: " + fmtPrice(it.price) + ". Kanaldagi e'lon darhol yangilanadi." }),
            h("div", { class: "group" }, [h("div", { class: "field" }, [h("span", { class: "label", id: "lbl-newp", text: "Yangi narx, $" }), textInput(st, "price", { inputmode: "numeric", placeholder: "Masalan: 8200", "aria-labelledby": "lbl-newp" })])]),
            h("div", { class: "actions" }, [h("button", { type: "button", class: "btn", text: "Narxni o'zgartirish", onclick: function (e) {
              var btn = e.currentTarget; btn.disabled = true; btn.textContent = "Kanal yangilanmoqda...";
              api("/api/my/ads/" + id + "/price", { json: { price: st.price } }).then(function (res) {
                btn.disabled = false; btn.textContent = "Narxni o'zgartirish";
                if (!res.ok) return toast(res.error || "Xatolik");
                closeSheet(); haptic("success");
                toast(res.dropped ? "Narx tushirildi. Kanalga «Qaynoq narx» chiqdi, saqlaganlarga xabar ketdi." : "Narx o'zgartirildi.");
                load();
              });
            } })]),
          ]);
        }
        function doUp() {
          confirmBox("E'lonni kanalda yangi qatorga ko'taramizmi? 1 ta bonus ishlatiladi.").then(function (ok) {
            if (!ok) return;
            api("/api/my/ads/" + id + "/up", { json: {} }).then(function (res) {
              if (!res.ok) return toast(res.error || "Xatolik");
              haptic("success"); toast("E'lon kanalda yangi qatorga chiqdi!"); load();
            });
          });
        }
      });
    }
    load();
    return function () { alive = false; };
  }

  // ---------- VIP ----------
  function screenVip(m) {
    var id = Number(m[1]);
    currentParent = "/my/ad/" + id;
    var shot = null; // { url, token, status }
    app.appendChild(h("h1", { class: "page", text: "VIP e'lon" }));
    app.appendChild(h("p", { class: "page-sub", text: "E'loningiz kanal tepasiga qadaladi va «VIP» belgisi bilan ajralib turadi — uni ko'proq xaridor ko'radi." }));
    app.appendChild(h("div", { class: "result" }, [h("div", { class: "lbl", text: "Narxi" }), h("div", { class: "big", text: fmtNum(me.vip.price) + " so'm" })]));
    app.appendChild(h("p", { class: "group-title", text: "To'lov tartibi" }));
    app.appendChild(h("div", { class: "group" }, [h("div", { class: "field" }, [
      h("ol", { class: "steps" }, [
        h("li", { text: "Quyidagi kartaga " + fmtNum(me.vip.price) + " so'm o'tkazing." }),
        h("li", { text: "To'lov chekining skrinshotini oling." }),
        h("li", { text: "Skrinshotni shu yerga yuklab, «Chekni yuborish» ni bosing." }),
      ]),
      h("div", { class: "copy-box", style: "margin-top:12px" }, [h("code", { text: me.vip.card }), h("button", { type: "button", text: "Nusxa", onclick: function () { copyText(me.vip.card.replace(/\s/g, ""), "Karta raqami nusxalandi"); } })]),
      h("p", { class: "help", text: "Karta egasi: " + me.vip.cardName }),
    ])]));
    var box = h("div", { class: "photos" });
    var input = h("input", { type: "file", accept: "image/*", class: "file-input", "aria-label": "Chek rasmi" });
    input.addEventListener("change", function () {
      var file = input.files[0]; input.value = "";
      if (!file) return;
      shot = { url: URL.createObjectURL(file), status: "uploading" };
      render();
      compressImage(file).then(function (b) { return upload("photo", b); }).then(function (r) {
        if (!shot) return;
        if (r.ok) { shot.status = "done"; shot.token = r.token; } else { shot.status = "error"; toast(r.error || "Yuklanmadi"); }
        render();
      });
    });
    function render() {
      box.innerHTML = "";
      if (shot) {
        box.appendChild(h("div", { class: "thumb" }, [h("img", { src: shot.url, alt: "Chek" }),
          shot.status === "uploading" ? h("div", { class: "veil" }, ["Yuklanmoqda"]) : null,
          shot.status === "error" ? h("div", { class: "veil" }, ["Yuklanmadi"]) : null,
          h("button", { type: "button", class: "remove", "aria-label": "O'chirish", text: "×", onclick: function () { shot = null; render(); } })]));
      } else box.appendChild(h("button", { type: "button", class: "add-tile", onclick: function () { input.click(); } }, [h("b", { text: "+" }), "Chek rasmi"]));
    }
    render();
    app.appendChild(h("p", { class: "group-title", text: "To'lov cheki" }));
    app.appendChild(h("div", { class: "group" }, [h("div", { class: "field" }, [box, input])]));
    var busy = false;
    setMain("Chekni yuborish", function () {
      if (busy) return;
      if (!shot || shot.status !== "done") return toast(shot && shot.status === "uploading" ? "Chek yuklanmoqda, biroz kuting" : "Avval chek rasmini yuklang");
      busy = true; mainBusy(true);
      api("/api/my/ads/" + id + "/vip", { json: { token: shot.token } }).then(function (r) {
        busy = false; mainBusy(false);
        if (!r.ok) return toast(r.error || "Xatolik");
        haptic("success"); setMain(null); app.innerHTML = "";
        app.appendChild(messageScreen("Chek adminga yuborildi", "To'lov tekshirilgach, e'loningiz VIP qilinib kanal tepasiga qadaladi. Natijani bot sizga yozadi.",
          [h("button", { type: "button", class: "btn", text: "Mening e'lonlarim", onclick: function () { replaceTo("/my"); } })], "YUBORILDI"));
      });
    });
  }

  // =====================================================================
  // 5. XIZMATLAR
  // =====================================================================
  function screenServices() {
    app.appendChild(h("h1", { class: "page", text: "Xizmatlar" }));
    app.appendChild(h("p", { class: "group-title", text: "Hisob-kitob" }));
    app.appendChild(h("div", { class: "list" }, [
      listItem({ icon: "tag", color: "#34c759", title: "Moshina narxini aniqlash", sub: "Bazadagi real e'lonlar asosida", onclick: function () { go("/evaluate"); } }),
      listItem({ icon: "calc", color: "#5856d6", title: "Bo'lib to'lashni hisoblash", sub: "Oylik to'lov va ustama", onclick: function () { go("/credit"); } }),
    ]));
    app.appendChild(h("p", { class: "group-title", text: "Bonus va hamkorlik" }));
    app.appendChild(h("div", { class: "list" }, [
      listItem({ icon: "gift", color: "#ff2d55", title: "Bepul VIP (UP)", sub: "Do'st taklif qiling — har 5 tasiga 1 ta UP", end: me.freeUps ? me.freeUps + " ta" : null, onclick: function () { go("/referral"); } }),
      listItem({ icon: "building", color: "#007aff", title: me.isDealer ? "Avtosalon: " + me.dealerName : "Avtosalon bo'lish", sub: me.isDealer ? "Cheksiz e'lon va «Ishonchli sotuvchi» belgisi" : "Doimiy sotuvchilar uchun bepul", onclick: function () { go("/dealer"); } }),
      listItem({ icon: "megaphone", color: "#ff9500", title: "Salon reklamasi", sub: "Faqat avtosalonlar, kuniga 2 ta", onclick: function () { go("/salon-ad"); } }),
    ]));
    app.appendChild(h("p", { class: "group-title", text: "Kanal" }));
    app.appendChild(h("div", { class: "list" }, [listItem({ icon: "send", color: "#2aabee", title: "Avto Bozor kanali", sub: "Barcha e'lonlar bir joyda", onclick: function () { openLink(me.channelUrl); } })]));
  }

  // ---------- Baholash ----------
  function screenEvaluate() {
    var st = { brandId: null, modelId: null, text: "", year: "" };
    var refs = {};
    app.appendChild(h("h1", { class: "page", text: "Moshina narxini aniqlash" }));
    app.appendChild(h("p", { class: "page-sub", text: "Kanalimizdagi faol va sotilgan e'lonlar asosida o'rtacha bozor narxini hisoblaymiz." }));
    var modelBox = h("div", { class: "slot" });
    var resultBox = h("div");
    function renderModels() {
      modelBox.innerHTML = "";
      if (st.brandId === null) return;
      if (st.brandId === 0) { modelBox.appendChild(field(refs, "model", "Marka va model", textInput(st, "text", { placeholder: "Masalan: Changan UNI-V", maxlength: "60", "aria-labelledby": "lbl-model" }))); return; }
      var b = brandById(st.brandId);
      modelBox.appendChild(field(refs, "model", "Model", chipGroup("lbl-model", function () { return b.models; }, function (x) { return st.modelId === x.id; }, function (x) { st.modelId = x.id; setError(refs, "model", ""); }, { collapse: 12 })));
    }
    app.appendChild(h("div", { class: "group", style: "margin-top:12px" }, [
      field(refs, "brand", "Marka", chipGroup("lbl-brand", function () { return catalog.brands.concat([{ id: 0, name: "Boshqa marka", dashed: true }]); }, function (b) { return st.brandId === b.id; }, function (b) { st.brandId = b.id; st.modelId = null; setError(refs, "brand", ""); renderModels(); }, { collapse: 9 })),
      modelBox,
      field(refs, "year", "Yili", selectBox(st, "year", yearOptions(), "Tanlang", function () { setError(refs, "year", ""); })),
    ]));
    app.appendChild(resultBox);
    var busy = false;
    setMain("Narxini aniqlash", function () {
      if (busy) return;
      if (st.brandId === null) return setError(refs, "brand", "Markani tanlang.");
      if (st.brandId > 0 && !st.modelId) return setError(refs, "model", "Modelni tanlang.");
      if (st.brandId === 0 && st.text.trim().length < 2) return setError(refs, "model", "Marka va modelni yozing.");
      if (!st.year) return setError(refs, "year", "Yilini tanlang.");
      busy = true; mainBusy(true, "Hisoblanmoqda...");
      api("/api/evaluate", { json: { modelId: st.modelId, text: st.text, year: st.year } }).then(function (r) {
        busy = false; mainBusy(false);
        resultBox.innerHTML = "";
        if (!r.ok) return toast(r.error || "Xatolik");
        if (!r.found) {
          resultBox.appendChild(h("div", { class: "result" }, [h("b", { text: r.year + " yil " + r.title }), h("p", { class: "lbl", text: "Bazamizda bu moshina uchun hali yetarli ma'lumot yo'q. Narx holatiga qarab turlicha bo'lishi mumkin." })]));
        } else {
          resultBox.appendChild(h("div", { class: "result" }, [
            h("div", { class: "lbl", text: r.year + " yil " + r.title + ", bozordagi o'rtacha narx" }),
            h("div", { class: "tag-price", text: fmtNum(r.minPrice) + " – " + fmtNum(r.maxPrice) + " $" }),
            h("p", { class: "lbl", text: r.count + " ta e'lon asosida. Aniq narx kraska, probeg va umumiy holatga qarab o'zgaradi." }),
            st.modelId ? h("button", { type: "button", class: "btn secondary", style: "margin-top:10px", text: "Shu moshinani sotish", onclick: function () {
              var mm = modelById(st.modelId); go("/new?brandId=" + mm.brand.id + "&modelId=" + mm.id + "&year=" + st.year);
            } }) : null,
          ]));
        }
        resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  // ---------- Kredit kalkulyatori (botdagi formulalar bilan bir xil) ----------
  function screenCredit() {
    var st = { cur: "usd", price: "", down: "", months: "12", rate: "0" };
    app.appendChild(h("h1", { class: "page", text: "Bo'lib to'lash kalkulyatori" }));
    var curSeg = h("div", { class: "seg", role: "tablist", "aria-label": "Valyuta" });
    function renderCur() {
      curSeg.innerHTML = "";
      [["usd", "Dollar ($)"], ["uzs", "So'm"]].forEach(function (c) {
        curSeg.appendChild(h("button", { type: "button", role: "tab", "aria-selected": st.cur === c[0] ? "true" : "false", text: c[1], onclick: function () { st.cur = c[0]; renderCur(); calc(); } }));
      });
      if (refs.priceSuffix) { refs.priceSuffix.textContent = sign(); refs.downSuffix.textContent = sign(); }
    }
    var refs = {};
    function sign() { return st.cur === "uzs" ? "so'm" : "$"; }
    app.appendChild(curSeg);
    refs.priceSuffix = h("span", { text: sign() }); refs.downSuffix = h("span", { text: sign() });
    renderCur();
    var monthsChips = chipGroup("lbl-months", function () { return ["6", "12", "18", "24", "36", "48", "60"].map(function (n) { return { name: n + " oy", v: n }; }); }, function (x) { return st.months === x.v; }, function (x) { st.months = x.v; monthsInput.value = x.v; calc(); });
    var monthsInput = textInput(st, "months", { inputmode: "numeric", maxlength: "3", "aria-label": "Oylar soni" }, function () { monthsChips.rerender(); calc(); });
    app.appendChild(h("div", { class: "group" }, [
      h("div", { class: "field" }, [h("span", { class: "label", id: "lbl-price", text: "Moshina narxi" }), h("div", { class: "input-suffix" }, [textInput(st, "price", { inputmode: "numeric", placeholder: "12000" }, calc), refs.priceSuffix])]),
      h("div", { class: "field" }, [h("span", { class: "label", id: "lbl-down", text: "Boshlang'ich to'lov" }), h("div", { class: "input-suffix" }, [textInput(st, "down", { inputmode: "numeric", placeholder: "0" }, calc), refs.downSuffix])]),
      h("div", { class: "field" }, [h("span", { class: "label", id: "lbl-months", text: "Muddat" }), monthsChips, h("div", { class: "reveal" }, [h("div", { class: "input-suffix" }, [monthsInput, h("span", { text: "oy" })])])]),
      h("div", { class: "field" }, [h("span", { class: "label", id: "lbl-rate", text: "Yillik foiz" }), h("div", { class: "input-suffix" }, [textInput(st, "rate", { inputmode: "decimal", placeholder: "0" }, calc), h("span", { text: "%" })]), h("p", { class: "help", text: "Sotuvchi foizsiz bersa 0 qoldiring. Bankdan olsangiz, bank foizini yozing." })]),
    ]));
    var out = h("div", { class: "result", "aria-live": "polite" });
    app.appendChild(out);
    function fmt(n) { var r = Math.round(n); return r.toLocaleString("en-US").replace(/,/g, " "); }
    var lastCalc = null; // sahifadan chiqqanda oxirgi hisob logga yoziladi
    function calc() {
      out.innerHTML = "";
      lastCalc = null;
      var price = Number(digits(st.price)), down = Number(digits(st.down)), months = Number(digits(st.months));
      var rate = parseFloat(String(st.rate).replace(",", ".").replace(/[^\d.]/g, "")) || 0;
      if (!price) { out.appendChild(h("p", { class: "lbl", text: "Narx, boshlang'ich to'lov va muddatni kiriting — natija shu yerda chiqadi." })); return; }
      if (down >= price) { out.appendChild(h("p", { class: "lbl", text: "Boshlang'ich to'lov moshina narxidan kam bo'lishi kerak." })); return; }
      if (!months || months > 120) { out.appendChild(h("p", { class: "lbl", text: "Muddat 1 dan 120 oygacha bo'lishi kerak." })); return; }
      var loan = price - down, monthly, total;
      if (rate === 0) { monthly = loan / months; total = loan; }
      else { var r = rate / 100 / 12; monthly = (loan * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1); total = monthly * months; }
      var s = sign();
      out.appendChild(h("div", { class: "lbl", text: "Oylik to'lov" }));
      out.appendChild(h("div", { class: "big", text: fmt(monthly) + " " + s }));
      var dl = h("dl", { class: "specs" });
      [["Kreditga olinadi", fmt(loan) + " " + s], ["Muddat", months + " oy"], ["Yillik foiz", rate + "%"]].concat(rate > 0
        ? [["Ustama (foiz)", fmt(total - loan) + " " + s], ["Jami to'lanadi", fmt(total + down) + " " + s]]
        : [["Ustama", "Yo'q, foizsiz"]]).forEach(function (row) { dl.appendChild(h("dt", { text: row[0] })); dl.appendChild(h("dd", { text: row[1] })); });
      out.appendChild(dl);
      out.appendChild(h("p", { class: "help", text: "Bu taxminiy hisob. Aniq shartlarni bank yoki sotuvchi bilan aniqlashtiring." }));
      lastCalc = { cur: st.cur, price: price, down: down, months: months, rate: rate };
    }
    calc();
    return function () { if (lastCalc) logEvent("credit", lastCalc); };
  }

  // ---------- Referal ----------
  function screenReferral() {
    app.appendChild(h("h1", { class: "page", text: "Bepul VIP (UP)" }));
    app.appendChild(h("p", { class: "page-sub", text: "Do'stlaringizni botga taklif qiling: har 5 ta do'st uchun e'loningizni kanalda tekinga yangi qatorga ko'tarasiz." }));
    var body = h("div"); body.appendChild(skeleton()); app.appendChild(body);
    api("/api/referral").then(function (r) {
      body.innerHTML = "";
      if (!r.ok) return body.appendChild(emptyState("Yuklab bo'lmadi", r.error || ""));
      var doneInCycle = 5 - r.left;
      body.appendChild(h("div", { class: "stat-row", style: "margin-top:12px" }, [
        h("div", { class: "stat" }, [h("b", { text: String(r.referralCount) }), h("span", { text: "taklif qilgan do'stlar" })]),
        h("div", { class: "stat" }, [h("b", { text: String(r.freeUps) }), h("span", { text: "ishlatilmagan UP bonus" })]),
      ]));
      body.appendChild(h("div", { class: "result" }, [
        h("div", { class: "lbl", text: "Keyingi bonusgacha " + r.left + " ta do'st qoldi" }),
        h("div", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "5", "aria-valuenow": String(doneInCycle) }, [h("i", { style: "width:" + (doneInCycle / 5 * 100) + "%" })]),
        h("p", { class: "help", text: "Taklif havolangiz:" }),
        h("div", { class: "copy-box" }, [h("code", { text: r.refLink }), h("button", { type: "button", text: "Nusxa", onclick: function () { copyText(r.refLink, "Havola nusxalandi"); } })]),
      ]));
      if (r.freeUps > 0) body.appendChild(h("div", { class: "actions" }, [h("button", { type: "button", class: "btn secondary", text: "Bonusni ishlatish: Mening e'lonlarim", onclick: function () { go("/my"); } })]));
      setMain("Do'stlarga yuborish", function () { logEvent("share_ref"); openLink(r.shareUrl); });
    });
  }

  // ---------- Avtosalon bo'lish ----------
  function screenDealer() {
    app.appendChild(h("h1", { class: "page", text: "Avtosalon bo'lish" }));
    if (me.isDealer) {
      app.appendChild(messageScreen("Siz tasdiqlangan avtosalonsiz", (me.dealerName || "") + " nomi e'lonlaringizda «Ishonchli sotuvchi» belgisi bilan chiqadi. Cheksiz e'lon berishingiz va salon reklamasi joylashingiz mumkin.",
        [h("button", { type: "button", class: "btn", text: "Salon reklamasi berish", onclick: function () { go("/salon-ad"); } })]));
      return;
    }
    var refs = {};
    var st = { name: me.dealerName || "", phone: me.dealerPhone ? String(me.dealerPhone).replace(/^998/, "") : (me.lastPhone ? String(me.lastPhone).replace(/^998/, "") : "") };
    if (me.dealerPending) app.appendChild(h("div", { class: "notice" }, [h("span", { text: "⏳" }), h("div", null, [h("b", { text: "Arizangiz ko'rib chiqilmoqda" }), h("span", { class: "s", text: "Tasdiqlangach bot sizga xabar beradi. Ma'lumot o'zgargan bo'lsa, qayta yuborishingiz mumkin." })])]));
    app.appendChild(h("div", { class: "result", style: "margin-top:8px" }, [
      h("b", { text: "Doimiy sotuvchilar uchun bepul imkoniyatlar" }),
      h("ul", { class: "steps" }, [h("li", { text: "E'lonlarda «Ishonchli sotuvchi» belgisi" }), h("li", { text: "Cheksiz e'lon" + (me.adLimit ? " (oddiy foydalanuvchiga " + me.adLimit + " ta)" : "") }), h("li", { text: "Aksiya va kredit takliflari uchun alohida maydon" }), h("li", { text: "Kanalda salon reklamasi, kuniga 2 ta" })]),
    ]));
    app.appendChild(h("div", { class: "group", style: "margin-top:16px" }, [
      field(refs, "name", "Salon yoki biznes nomi", textInput(st, "name", { placeholder: "Masalan: Avto Lider", maxlength: "80" }, function () { setError(refs, "name", ""); })),
      field(refs, "phone", "Bog'lanish uchun telefon", textInput(st, "phone", { type: "tel", inputmode: "tel", placeholder: "90 123 45 67", maxlength: "28" }, function () { setError(refs, "phone", ""); })),
    ]));
    var busy = false;
    setMain("Ariza yuborish", function () {
      if (busy) return;
      if (st.name.trim().length < 2) return setError(refs, "name", "Nomni yozing.");
      var ph = digits(st.phone).replace(/^(998)+/, ""); if (ph.length > 9) ph = ph.slice(-9);
      if (ph.length !== 9) return setError(refs, "phone", "Raqamni to'liq yozing, masalan 90 123 45 67.");
      busy = true; mainBusy(true);
      api("/api/dealer", { json: st }).then(function (r) {
        busy = false; mainBusy(false);
        if (!r.ok) return toast(r.error || "Xatolik");
        haptic("success"); setMain(null); me.dealerPending = true; me.dealerName = st.name;
        app.innerHTML = "";
        app.appendChild(messageScreen("Ariza adminga yuborildi", "Tez orada ko'rib chiqamiz. Tasdiqlangach bot sizga xabar beradi va barcha imkoniyatlar ochiladi.", [h("button", { type: "button", class: "btn", text: "Xizmatlarga qaytish", onclick: function () { replaceTo("/services"); } })], "YUBORILDI"));
      });
    });
  }

  // ---------- Salon reklamasi ----------
  function screenSalonAd() {
    app.appendChild(h("h1", { class: "page", text: "Salon reklamasi" }));
    var body = h("div"); body.appendChild(skeleton()); app.appendChild(body);
    var alive = true;
    api("/api/salon-ad").then(function (r) {
      if (!alive) return;
      body.innerHTML = "";
      if (!r.ok) return body.appendChild(emptyState("Yuklab bo'lmadi", r.error || ""));
      if (!r.allowed) {
        body.appendChild(messageScreen(r.code === "limit" ? "Bugungi limit tugadi" : "Faqat avtosalonlar uchun", r.message,
          r.code === "not_dealer" ? [h("button", { type: "button", class: "btn", text: "Avtosalon bo'lish", onclick: function () { replaceTo("/dealer"); } })] : []));
        return;
      }
      var refs = {};
      var st = { text: "", location: "", phone: r.dealerPhone ? "+" + r.dealerPhone : "" };
      var media = null;
      body.appendChild(h("p", { class: "page-sub", text: (r.dealerName || "Saloningiz") + " — bugun yana " + (2 - r.todayCount) + " ta reklama bera olasiz. Admin tasdiqlagach kanalga chiqadi." }));
      var mediaBox = h("div", { class: "photos" });
      var input = h("input", { type: "file", accept: "image/*,video/*", class: "file-input", "aria-label": "Rasm yoki video" });
      input.addEventListener("change", function () {
        var file = input.files[0]; input.value = "";
        if (!file) return;
        var isVideo = /^video\//.test(file.type);
        if (isVideo && file.size > 49 * 1024 * 1024) return toast("Video 49 MB dan katta.");
        media = { url: URL.createObjectURL(file), isVideo: isVideo, status: "uploading" };
        renderMedia(); setError(refs, "media", "");
        (isVideo ? Promise.resolve(file) : compressImage(file)).then(function (b) { return upload(isVideo ? "video" : "photo", b); }).then(function (res) {
          if (!media) return;
          if (res.ok) { media.status = "done"; media.token = res.token; } else { media.status = "error"; toast(res.error || "Yuklanmadi"); }
          renderMedia();
        });
      });
      function renderMedia() {
        mediaBox.innerHTML = "";
        if (media) {
          mediaBox.appendChild(h("div", { class: "thumb" }, [media.isVideo ? h("video", { src: media.url, muted: true, playsinline: true, preload: "metadata" }) : h("img", { src: media.url, alt: "" }),
            media.status === "uploading" ? h("div", { class: "veil" }, ["Yuklanmoqda"]) : null,
            media.status === "error" ? h("div", { class: "veil" }, ["Yuklanmadi"]) : null,
            h("button", { type: "button", class: "remove", "aria-label": "O'chirish", text: "×", onclick: function () { media = null; renderMedia(); } })]));
        } else mediaBox.appendChild(h("button", { type: "button", class: "add-tile", onclick: function () { input.click(); } }, [h("b", { text: "+" }), "Rasm yoki video"]));
      }
      renderMedia();
      body.appendChild(h("div", { class: "group" }, [
        field(refs, "text", "Reklama matni", textArea(st, "text", { placeholder: "Aksiya, kredit shartlari, bonuslar. Masalan: Kia Sportage 60 oygacha 0% foizli bo'lib to'lash!", maxlength: "900", rows: "5" }, function () { setError(refs, "text", ""); })),
        field(refs, "media", "Video yoki rasm", h("div", null, [mediaBox, input]), "Video ko'proq e'tibor tortadi. 1 ta video yoki 1 ta rasm."),
        field(refs, "location", "Salon manzili", textInput(st, "location", { placeholder: "Masalan: Samarqand, Gazli shossesi", maxlength: "200" })),
        field(refs, "phone", "Telefon", textInput(st, "phone", { placeholder: "+998 90 123 45 67", maxlength: "100" }), "Bir nechta raqamni vergul bilan yozish mumkin."),
      ]));
      var busy = false;
      setMain("Reklamani yuborish", function () {
        if (busy) return;
        if (st.text.trim().length < 10) return setError(refs, "text", "Matn juda qisqa.");
        if (!media) return setError(refs, "media", "Rasm yoki video qo'shing.");
        if (media.status !== "done") return toast(media.status === "uploading" ? "Fayl yuklanmoqda, biroz kuting" : "Faylni qayta yuklang");
        busy = true; mainBusy(true);
        api("/api/salon-ad", { json: { text: st.text, location: st.location, phone: st.phone, media: media.token } }).then(function (res) {
          busy = false; mainBusy(false);
          if (!res.ok) return toast(res.error || "Xatolik");
          haptic("success"); setMain(null); app.innerHTML = "";
          app.appendChild(messageScreen("Reklama adminga yuborildi", "Tekshiruvdan so'ng kanalga joylanadi.", [h("button", { type: "button", class: "btn", text: "Xizmatlarga qaytish", onclick: function () { replaceTo("/services"); } })], "YUBORILDI"));
        });
      });
    });
    return function () { alive = false; };
  }

  // =====================================================================
  // Navigatsiya
  // =====================================================================
  var TABS = [
    { key: "market", path: "/", label: "Bozor", icon: "search" },
    { key: "sell", path: "/new", label: "E'lon berish", icon: "plus", sell: true },
    { key: "my", path: "/my", label: "Mening", icon: "user" },
    { key: "services", path: "/services", label: "Xizmatlar", icon: "grid" },
  ];
  function renderTabbar(activeKey) {
    tabbar.innerHTML = "";
    var inner = h("div", { class: "tabbar-in" });
    TABS.forEach(function (t) {
      inner.appendChild(h("button", { type: "button", class: "tab" + (t.sell ? " sell" : ""), "aria-current": t.key === activeKey ? "page" : null, onclick: function () {
        if (t.key === activeKey) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
        haptic("select");
        if (t.sell) go(t.path); else replaceTo(t.path);
      } }, [t.sell ? h("span", { class: "dot" }, [icon(t.icon)]) : icon(t.icon), t.label]));
    });
    tabbar.appendChild(inner);
  }

  var ROUTES = [
    [/^\/$/, screenMarket, { tab: "market" }],
    [/^\/ad\/(\d+)$/, screenAd, { parent: "/" }],
    [/^\/new$/, screenNew, { parent: "/" }],
    [/^\/my$/, screenMy, { tab: "my" }],
    [/^\/my\/ad\/(\d+)$/, screenManage, { parent: "/my" }],
    [/^\/edit\/(\d+)$/, screenEdit, { parent: "/my" }],
    [/^\/vip\/(\d+)$/, screenVip, { parent: "/my" }],
    [/^\/services$/, screenServices, { tab: "services" }],
    [/^\/evaluate$/, screenEvaluate, { parent: "/services" }],
    [/^\/credit$/, screenCredit, { parent: "/services" }],
    [/^\/referral$/, screenReferral, { parent: "/services" }],
    [/^\/dealer$/, screenDealer, { parent: "/services" }],
    [/^\/salon-ad$/, screenSalonAd, { parent: "/services" }],
  ];
  var cleanup = null;
  function render() {
    var raw = location.hash.slice(1) || "/";
    var qi = raw.indexOf("?");
    var path = qi === -1 ? raw : raw.slice(0, qi);
    var query = new URLSearchParams(qi === -1 ? "" : raw.slice(qi + 1));
    if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
    hideActionBar();
    closeSheet();
    setMain(null);
    var route = null, match = null;
    for (var i = 0; i < ROUTES.length; i++) { match = path.match(ROUTES[i][0]); if (match) { route = ROUTES[i]; break; } }
    if (!route) { replaceTo("/"); return; }
    var meta = route[2];
    currentParent = meta.parent || "/";
    var isTab = !!meta.tab;
    document.body.classList.toggle("has-tabbar", isTab);
    tabbar.hidden = !isTab;
    if (isTab) renderTabbar(meta.tab);
    if (inTelegram && tg.BackButton) { if (isTab) tg.BackButton.hide(); else tg.BackButton.show(); }
    app.innerHTML = "";
    if (route[1] !== screenMarket) window.scrollTo(0, 0);
    cleanup = route[1](match, query) || null;
  }

  // =====================================================================
  // Ishga tushirish
  // =====================================================================
  function gate(title, text, actions) {
    tabbar.hidden = true; document.body.classList.remove("has-tabbar");
    if (inTelegram && tg.BackButton) tg.BackButton.hide();
    setMain(null);
    app.innerHTML = "";
    app.appendChild(messageScreen(title, text, actions));
  }
  var openLogged = false; // "Ilovani ochdi" logga faqat bir marta yozilsin
  // Kanal postidagi havola: t.me/arzonida_bot?startapp=ad_634 → ilova shu e'lonni ochadi
  var startParam = "";
  try { startParam = String((tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || new URLSearchParams(location.search).get("tgWebAppStartParam") || ""); } catch (e) {}
  if (!/^[a-z0-9_]{1,40}$/i.test(startParam)) startParam = "";
  var startApplied = false;
  function startRoute(p) {
    var m = /^ad_(\d+)$/.exec(p);
    if (m) return "/ad/" + m[1];
    return { "new": "/new", evaluate: "/evaluate", my: "/my", services: "/services", credit: "/credit" }[p] || null;
  }
  function boot() {
    app.innerHTML = ""; app.appendChild(skeleton());
    if (!inTelegram) {
      gate("Ilovani Telegramda oching", "Bu sahifa @arzonida_bot ichida ishlaydi. Botga kiring va pastdagi «📱 Ilova» tugmasini bosing.");
      return;
    }
    var mePath = openLogged ? "/api/me" : "/api/me?open=1" + (startParam ? "&src=" + encodeURIComponent(startParam) : "");
    openLogged = true;
    Promise.all([api("/api/catalog"), api(mePath)]).then(function (res) {
      var c = res[0], m = res[1];
      if (!c.ok || !m.ok) { gate("Ma'lumotni yuklab bo'lmadi", (m && m.error) || (c && c.error) || "Qayta urinib ko'ring.", [h("button", { type: "button", class: "btn", text: "Qayta urinish", onclick: boot })]); return; }
      catalog = c; me = m;
      if (!m.subscribed) {
        gate("Avval kanalga obuna bo'ling", "Botdan foydalanish uchun Avto Bozor kanaliga obuna bo'ling — barcha e'lonlar shu yerda chiqadi.", [
          h("button", { type: "button", class: "btn", text: "Kanalga obuna bo'lish", onclick: function () { openLink(m.channelUrl); } }),
          h("button", { type: "button", class: "btn ghost", text: "Obuna bo'ldim, tekshirish", onclick: boot }),
        ]);
        return;
      }
      // Havola orqali ochilgan bo'lsa — kerakli sahifaga (faqat bir marta, bosh sahifada turgan bo'lsa)
      if (!startApplied) {
        startApplied = true;
        var target = startRoute(startParam);
        if (target && (location.hash.slice(1) || "/") === "/") location.replace("#" + target);
      }
      if (!window.__routerOn) { window.__routerOn = true; window.addEventListener("hashchange", render); }
      render();
    });
  }
  boot();
})();
