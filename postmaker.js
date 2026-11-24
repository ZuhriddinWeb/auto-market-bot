// =====================================================================
// 🎨 POST KONSTRUKTORI — kanal uchun chiroyli rasmli postlar (bot va Mini App bir xil ishlatadi)
// Shablonlar:
//   news   — «Yangilik»: sarlavha (2-qismi rangli), kichik matn, 6 tagacha punkt, pastda chaqiruv
//   promo  — «Aksiya»: admin rasmi fonda, ustida katta sarlavha va chaqiruv
//   notice — «E'lon / ogohlantirish»: katta belgi, sarlavha va matn
//   own    — admin rasmi o'zgarishsiz (faqat pastki burchakda kichik logotip)
//   text   — rasmsiz, faqat matn
// Rasm 1080×1350 (Telegram'da telefonda eng katta ko'rinadigan o'lcham). Matnlar Inter shriftida.
// Rangli emoji SVG da chizilmaydi — punktlardagi emoji o'xshash chiziqli belgiga aylantiriladi.
// =====================================================================
const W = 1080, H = 1350;
const F = "Inter, Onest, DejaVu Sans, Arial, sans-serif";
const THEMES = {
  blue: { name: "Ko'k", g: ["#0f3f8f", "#1667d9", "#3f8cf3"], accent: "#ffd34d", soft: "#dbe8ff", btn: "#1667d9" },
  green: { name: "Yashil", g: ["#064e3b", "#0a8754", "#2bb673"], accent: "#fff3a3", soft: "#d8f5e6", btn: "#0a8754" },
  orange: { name: "To'q sariq", g: ["#7c2d12", "#e2571a", "#f59e0b"], accent: "#fff1c2", soft: "#ffe8d6", btn: "#e2571a" },
  dark: { name: "Qora", g: ["#0b1220", "#1e293b", "#334155"], accent: "#5eb3ff", soft: "#cbd5e1", btn: "#1667d9" },
};
const TEMPLATES = { news: "📣 Yangilik", promo: "🏷 Aksiya (rasm bilan)", notice: "⚠️ E'lon / ogohlantirish", own: "🖼 O'z rasmim", text: "📝 Faqat matn" };

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cw = (size, w) => size * (w >= 700 ? 0.6 : 0.54); // bitta harfning taxminiy kengligi
// So'zlab qatorlarga bo'lish (maxLines dan oshsa — oxiri «…»)
function wrap(text, maxW, size, w, maxLines = 99) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const per = Math.max(4, Math.floor(maxW / cw(size, w)));
  const lines = [];
  let cur = "";
  for (const word of words) {
    const t = cur ? cur + " " + word : word;
    if (t.length <= per) cur = t;
    else { if (cur) lines.push(cur); cur = word.length > per ? word.slice(0, per - 1) + "…" : word; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const cut = lines.slice(0, maxLines); cut[maxLines - 1] = cut[maxLines - 1].replace(/.{0,2}$/, "") + "…"; return cut; }
  return lines;
}
const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-family="${F}" font-size="${o.size || 28}" font-weight="${o.w || 400}" fill="${o.fill || "#fff"}" text-anchor="${o.a || "start"}"${o.ls ? ` letter-spacing="${o.ls}"` : ""}${o.op ? ` opacity="${o.op}"` : ""}>${esc(s)}</text>`;

// ---- Chiziqli belgilar (24×24) ----
const ICONS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  fire: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.6 2.2-4.8.3 1.6 1.1 2.6 2.3 3C11 9 10.6 6 12 3z"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-8"/>',
  down: '<path d="M4 6l6 6 4-4 6 7"/><path d="M15 15h5v-5"/>',
  car: '<path d="M4 15l1.6-5A2 2 0 0 1 7.5 8.6h9a2 2 0 0 1 1.9 1.4L20 15v3H4z"/><circle cx="7.5" cy="18" r="1.6"/><circle cx="16.5" cy="18" r="1.6"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9c-2-4-6-4-6-1.5S10 9 12 9zm0 0c2-4 6-4 6-1.5S14 9 12 9z"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z"/>',
  tag: '<path d="M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5z"/><circle cx="8" cy="8.5" r="1.4"/>',
  money: '<rect x="3" y="6.5" width="18" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/><path d="M8.8 12.2l2.2 2.2 4.4-4.4"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  hash: '<path d="M9 4L7 20M17 4l-2 16M4.5 9h16M3.5 15h16"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.1"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.3v.1"/>',
};
const EMOJI_ICON = [
  [/✅|✔|☑/, "check"], [/🔥/, "fire"], [/🔔|🛎/, "bell"], [/💬|🗨/, "chat"], [/📊|📈/, "chart"], [/📉/, "down"],
  [/🚗|🚙|🚘|🏎|🚕/, "car"], [/🎁|🎉/, "gift"], [/📞|☎|📱|📲/, "phone"], [/⭐|🌟|✨|🆕|💎/, "star"], [/🏷|🔖/, "tag"],
  [/💰|💵|💸|🤑/, "money"], [/⏰|🕒|⏳|⌛/, "clock"], [/🛡|🔒|🔐/, "shield"], [/❤|💙|💚|🧡/, "heart"], [/#️⃣|#/, "hash"],
  [/ℹ|📌|📍/, "info"], [/⚠|❗|‼|🚨/, "alert"],
];
const LEAD_EMOJI = /^(#️⃣|(?:\p{Extended_Pictographic}|[☀-➿])(?:️|⃣)?(?:‍(?:\p{Extended_Pictographic})️?)*)\s*/u;
function iconFor(emoji) { for (const [re, k] of EMOJI_ICON) if (re.test(emoji || "")) return k; return "check"; }
const icon = (k, x, y, size, color, sw = 2) => `<g transform="translate(${x},${y}) scale(${size / 24})" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICONS[k] || ICONS.check}</g>`;

// Punkt satrini ajratish: «🔥 Sarlavha — izoh» → { icon, title, text }
function parseItem(line) {
  let s = String(line || "").trim();
  if (!s) return null;
  let emoji = "";
  const m = LEAD_EMOJI.exec(s);
  if (m) { emoji = m[1]; s = s.slice(m[0].length); }
  s = s.replace(/^[-•*·]\s*/, "");
  const parts = s.split(/\s+[—–-]\s+|\s*\|\s*/);
  const title = (parts.shift() || "").trim(), text = parts.join(" — ").trim();
  return title ? { icon: iconFor(emoji), title: title.slice(0, 60), text: text.slice(0, 90) } : null;
}
function parseItems(text) { return String(text || "").split(/\n/).map(parseItem).filter(Boolean).slice(0, 6); }

function logo(x, y, scale = 1, dark = false) {
  const k = scale;
  return `<g transform="translate(${x},${y})"><rect width="${56 * k}" height="${56 * k}" rx="${15 * k}" fill="#fff"/>${icon("car", 10 * k, 10 * k, 36 * k, "#1667d9", 2.4)}
    <text x="${72 * k}" y="${40 * k}" font-family="${F}" font-size="${38 * k}" font-weight="800"><tspan fill="${dark ? "#0f1a2b" : "#fff"}">Avto</tspan><tspan fill="${dark ? "#1667d9" : "#a9ceff"}">Bozor</tspan></text></g>`;
}
const bg = (th) => `<defs><linearGradient id="pg" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="${th.g[0]}"/><stop offset="0.55" stop-color="${th.g[1]}"/><stop offset="1" stop-color="${th.g[2]}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#pg)"/>`;
function tagPill(xEnd, y, text, th) {
  if (!text) return "";
  const t = String(text).toUpperCase().slice(0, 18), w = t.length * 26 * 0.66 + 52;
  return `<rect x="${xEnd - w}" y="${y}" width="${w}" height="56" rx="28" fill="${th.accent}"/>${T(xEnd - w / 2, y + 38, t, { size: 26, w: 800, fill: "#0f1a2b", a: "middle", ls: 1 })}`;
}
function footer(spec, th, y = H - 190) {
  const f = spec.footer || {};
  if (f.off) return "";
  const title = f.title || "E'lon berish — bepul", sub = f.sub || `@${spec.bot || "arzonida_bot"}`, btn = f.btn || "Hoziroq sinang →";
  const bw = Math.min(380, btn.length * 28 * 0.6 + 60);
  return `<rect x="72" y="${y}" width="${W - 144}" height="124" rx="28" fill="#fff"/>
    ${T(106, y + 56, wrap(title, W - 144 - bw - 90, 32, 800, 1)[0] || "", { size: 32, w: 800, fill: "#0f1a2b" })}${T(106, y + 92, sub, { size: 24, w: 500, fill: "#5a687d" })}
    <rect x="${W - 106 - bw}" y="${y + 27}" width="${bw}" height="70" rx="20" fill="${th.btn}"/>${T(W - 106 - bw / 2, y + 72, btn, { size: 28, w: 800, a: "middle" })}`;
}
// Sarlavha: 1-qator oq, 2-qator (agar bo'lsa) rangli
function titleBlock(spec, th, x, y, maxW, size = 76) {
  const raw = String(spec.title || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const main = raw[0] || "", acc = raw.slice(1).join(" ");
  let sz = size;
  const total = () => wrap(main, maxW, sz, 800).length + (acc ? wrap(acc, maxW, sz, 800).length : 0);
  while (sz > 48 && total() > 4) sz -= 4;
  let s = "", yy = y;
  for (const l of wrap(main, maxW, sz, 800, 3)) { s += T(x, yy, l, { size: sz, w: 800, ls: -1.5 }); yy += sz * 1.08; }
  for (const l of wrap(acc, maxW, sz, 800, 2)) { s += T(x, yy, l, { size: sz, w: 800, fill: th.accent, ls: -1.5 }); yy += sz * 1.08; }
  return { svg: s, bottom: yy - sz * 1.08 + sz * 0.3 };
}

// Yangilikda rasm bo'lsa: chap tomonda qiyshiq «kartochka», punktlar o'ng ustunda
const NEWS_CARD = { x: 72, w: 430 };
function newsSvg(spec, th, hasPhoto = false) {
  let s = bg(th) + logo(72, 64) + tagPill(W - 72, 64, spec.tag || "Yangilik", th);
  const tb = titleBlock(spec, th, 72, 222, W - 144);
  s += tb.svg;
  let y = tb.bottom + 24;
  if (spec.subtitle) for (const l of wrap(spec.subtitle, W - 144, 30, 500, 2)) { y += 40; s += T(72, y, l, { size: 30, w: 500, fill: th.soft }); }
  const items = (spec.items || []).slice(0, 6);
  const footTop = spec.footer && spec.footer.off ? H - 60 : H - 214;
  if (hasPhoto) spec._cardTop = y + 56;
  const ix = hasPhoto ? NEWS_CARD.x + NEWS_CARD.w + 36 : 72, iw = hasPhoto ? W - 72 - ix : W - 144;
  if (items.length) {
    y += 46;
    const gap = 16, avail = footTop - y - 10, ih = Math.min(items.length <= 3 ? 150 : 118, Math.floor((avail - gap * (items.length - 1)) / items.length));
    items.forEach((it, i) => {
      const yy = y + i * (ih + gap), small = ih < 100, big = ih >= 140;
      s += `<rect x="${ix}" y="${yy}" width="${iw}" height="${ih}" rx="24" fill="#fff" fill-opacity="0.13"/>`;
      const cxI = ix + (hasPhoto ? 40 : 50), rI = hasPhoto ? 24 : small ? 26 : 30, sI = hasPhoto ? 28 : small ? 30 : 34;
      s += `<circle cx="${cxI}" cy="${yy + ih / 2}" r="${rI}" fill="#fff" fill-opacity="0.18"/>` + icon(it.icon, cxI - sI / 2, yy + ih / 2 - sI / 2, sI, th.accent, 2.2);
      const tx = ix + (hasPhoto ? 80 : 104), tw = iw - (hasPhoto ? 96 : 124);
      if (hasPhoto) {
        const ts = it.text ? 26 : 28;
        s += it.text
          ? T(tx, yy + ih / 2 - 4, wrap(it.title, tw, ts, 700, 1)[0], { size: ts, w: 700 }) + T(tx, yy + ih / 2 + 26, wrap(it.text, tw, 20, 400, 1)[0], { size: 20, fill: th.soft })
          : T(tx, yy + ih / 2 + 10, wrap(it.title, tw, ts, 700, 1)[0], { size: ts, w: 700 });
        return;
      }
      if (it.text && big) {
        s += T(tx, yy + ih / 2 - 8, wrap(it.title, tw, 36, 700, 1)[0], { size: 36, w: 700 }) + T(tx, yy + ih / 2 + 34, wrap(it.text, tw, 26, 400, 1)[0], { size: 26, fill: th.soft });
      } else if (it.text && !small) {
        s += T(tx, yy + ih / 2 - 6, wrap(it.title, tw, 30, 700, 1)[0], { size: 30, w: 700 }) + T(tx, yy + ih / 2 + 30, wrap(it.text, tw, 23, 400, 1)[0], { size: 23, fill: th.soft });
      } else if (it.text) {
        s += T(tx, yy + ih / 2 - 4, wrap(it.title, tw, 27, 700, 1)[0], { size: 27, w: 700 }) + T(tx, yy + ih / 2 + 26, wrap(it.text, tw, 21, 400, 1)[0], { size: 21, fill: th.soft });
      } else s += T(tx, yy + ih / 2 + (big ? 13 : 11), wrap(it.title, tw, big ? 36 : 31, 700, 1)[0], { size: big ? 36 : 31, w: 700 });
    });
  }
  return s + footer(spec, th);
}
function promoSvg(spec, th, hasPhoto) {
  let s = hasPhoto ? "" : bg(th);
  s += `<defs><linearGradient id="pd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.35"/><stop offset="0.35" stop-color="#000" stop-opacity="0"/><stop offset="0.55" stop-color="#000" stop-opacity="0.15"/><stop offset="1" stop-color="#000" stop-opacity="0.85"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#pd)"/>`;
  s += logo(72, 64) + tagPill(W - 72, 64, spec.tag || "Aksiya", th);
  const lines = String(spec.title || "").split("\n").filter(Boolean);
  const nMain = wrap(lines[0] || "", W - 144, 84, 800, 3).length + (lines[1] ? wrap(lines.slice(1).join(" "), W - 144, 84, 800, 2).length : 0);
  const subN = spec.subtitle ? wrap(spec.subtitle, W - 144, 32, 500, 3).length : 0;
  const foot = spec.footer && spec.footer.off ? 0 : 160;
  const startY = H - 90 - foot - subN * 44 - nMain * 90 + 84;
  const tb = titleBlock(spec, th, 72, Math.max(400, startY), W - 144, 84);
  s += tb.svg;
  let y = tb.bottom + 10;
  if (spec.subtitle) for (const l of wrap(spec.subtitle, W - 144, 32, 500, 3)) { y += 44; s += T(72, y, l, { size: 32, w: 500, fill: "#fff", op: 0.92 }); }
  return s + footer(spec, th, H - 190);
}
function noticeSvg(spec, th) {
  let s = bg(th) + logo(72, 64) + tagPill(W - 72, 64, spec.tag || "E'lon", th);
  s += `<circle cx="${W / 2}" cy="330" r="92" fill="#fff" fill-opacity="0.16"/>` + icon(spec.icon || "info", W / 2 - 52, 278, 104, th.accent, 2);
  let y = 520;
  const tl = String(spec.title || "").replace(/\n/g, " ");
  for (const l of wrap(tl, W - 160, 62, 800, 3)) { s += T(W / 2, y, l, { size: 62, w: 800, a: "middle", ls: -1 }); y += 70; }
  y += 18;
  const body = String(spec.body || spec.subtitle || "");
  const paras = body.split(/\n+/).filter(Boolean);
  const footTop = spec.footer && spec.footer.off ? H - 80 : H - 230;
  for (const p of paras) {
    for (const l of wrap(p, W - 200, 32, 400, 20)) { if (y + 44 > footTop) break; y += 44; s += T(W / 2, y, l, { size: 32, fill: th.soft, a: "middle" }); }
    y += 14;
  }
  return s + footer(spec, th);
}

// Asosiy: spec → PNG (Buffer). photo — fon rasmi (promo/own uchun)
async function renderPost(sharp, spec, photo = null) {
  const th = THEMES[spec.color] || THEMES.blue;
  const tpl = TEMPLATES[spec.tpl] ? spec.tpl : "news";
  if (tpl === "text") return null;
  const comps = [];
  let base;
  const newsPhoto = tpl === "news" && photo;
  if ((tpl === "promo" || tpl === "own") && photo) {
    base = sharp(photo).resize(W, H, { fit: "cover", position: "attention" });
  } else base = sharp({ create: { width: W, height: H, channels: 3, background: th.g[1] } });
  let svg;
  if (tpl === "own") svg = `<rect x="${W - 330}" y="${H - 110}" width="292" height="76" rx="22" fill="#000" fill-opacity="0.45"/>${logo(W - 316, H - 100, 1)}`;
  else if (tpl === "promo") svg = promoSvg(spec, th, !!photo);
  else if (tpl === "notice") svg = noticeSvg(spec, th);
  else svg = newsSvg(spec, th, !!newsPhoto);
  comps.push({ input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`), left: 0, top: 0 });
  if (newsPhoto) {
    // Rasm: yumaloq burchakli, biroz qiyshiq, soyali kartochka (asl nisbati saqlanadi)
    const cwid = NEWS_CARD.w, meta = await sharp(photo).metadata();
    const ch = Math.max(240, Math.min(560, Math.round(cwid * ((meta.height || 3) / (meta.width || 4)))));
    const mask = Buffer.from(`<svg width="${cwid}" height="${ch}"><rect width="${cwid}" height="${ch}" rx="26" fill="#fff"/></svg>`);
    const card = await sharp(photo).resize(cwid, ch, { fit: "cover" }).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
    const rot = await sharp(card).rotate(-3, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const rm = await sharp(rot).metadata();
    const shadow = Buffer.from(`<svg width="${rm.width + 80}" height="${rm.height + 80}"><rect x="40" y="56" width="${rm.width}" height="${rm.height}" rx="30" fill="#000" opacity="0.35"/></svg>`);
    const sh = await sharp(shadow).blur(18).png().toBuffer();
    const top = Math.round(Math.min(spec._cardTop || 420, H - 230 - rm.height));
    comps.push({ input: sh, left: NEWS_CARD.x - 40 - 8, top: top - 40 });
    comps.push({ input: rot, left: NEWS_CARD.x - 8, top });
  }
  const img = await base.png().toBuffer();
  return sharp(img).composite(comps).jpeg({ quality: 90 }).toBuffer();
}

// Mini App dagi oddiy belgilash → Telegram HTML: **qalin**, __kursiv__, ~~chizilgan~~, `kod`, [matn](https://...)
function liteToHtml(src) {
  let s = esc(String(src || "").slice(0, 4000));
  s = s.replace(/\[([^\]\n]{1,100})\]\((https?:\/\/[^\s)]+)\)/g, (m, t, u) => `<a href="${u.replace(/"/g, "%22")}">${t}</a>`);
  s = s.replace(/\*\*([^*\n][\s\S]*?)\*\*/g, "<b>$1</b>").replace(/__([^_\n][\s\S]*?)__/g, "<i>$1</i>").replace(/~~([^~\n][\s\S]*?)~~/g, "<s>$1</s>").replace(/`([^`\n]+)`/g, "<code>$1</code>");
  return s;
}
// Telegram xabar formatlash (entities) → HTML (botda admin yozgan matnning qalin/kursiv/havolalari saqlanadi)
function entitiesToHtml(text, entities) {
  text = String(text || "");
  if (!entities || !entities.length) return esc(text);
  const cps = Array.from(text); // UTF-16 offsetlarni hisoblash uchun
  const u16 = []; let pos = 0;
  for (let i = 0; i < cps.length; i++) { u16.push(pos); pos += cps[i].length; }
  u16.push(pos);
  const idx = (off) => { const i = u16.indexOf(off); return i >= 0 ? i : u16.findIndex((p) => p >= off); };
  const open = new Map(), close = new Map();
  const tag = (e) => {
    switch (e.type) {
      case "bold": return ["<b>", "</b>"]; case "italic": return ["<i>", "</i>"]; case "underline": return ["<u>", "</u>"];
      case "strikethrough": return ["<s>", "</s>"]; case "spoiler": return ["<tg-spoiler>", "</tg-spoiler>"]; case "code": return ["<code>", "</code>"];
      case "pre": return ["<pre>", "</pre>"]; case "blockquote": return ["<blockquote>", "</blockquote>"]; case "expandable_blockquote": return ["<blockquote expandable>", "</blockquote>"];
      case "text_link": return [`<a href="${esc(e.url)}">`, "</a>"]; case "custom_emoji": return [`<tg-emoji emoji-id="${esc(e.custom_emoji_id)}">`, "</tg-emoji>"];
      default: return null;
    }
  };
  const sorted = [...entities].sort((a, b) => a.offset - b.offset || b.length - a.length);
  for (const e of sorted) {
    const t = tag(e); if (!t) continue;
    const a = idx(e.offset), b = idx(e.offset + e.length);
    if (!open.has(a)) open.set(a, []); open.get(a).push(t[0]);
    if (!close.has(b)) close.set(b, []); close.get(b).unshift(t[1]);
  }
  let out = "";
  for (let i = 0; i <= cps.length; i++) {
    if (close.has(i)) out += close.get(i).join("");
    if (open.has(i)) out += open.get(i).join("");
    if (i < cps.length) out += esc(cps[i]);
  }
  return out;
}
// Tugmalar: tayyorlari + «Matn | https://...» satrlari
function buildButtons(spec, links) {
  const rows = [];
  const pre = spec.presets || [];
  const preset = { sell: ["🚗 E'lon berish — bepul", links.bot], app: links.app ? ["📱 Ilovani ochish", links.app] : null, channel: ["📢 Kanalga obuna", links.channel], deal: links.deal ? ["🔥 Arzon e'lonlar", links.deal] : null };
  const p = pre.map((k) => preset[k]).filter(Boolean);
  for (let i = 0; i < p.length; i += 2) rows.push(p.slice(i, i + 2));
  for (const b of spec.buttons || []) if (b && b.text && /^https?:\/\//.test(b.url || "")) rows.push([[String(b.text).slice(0, 40), b.url]]);
  return rows.slice(0, 6);
}
function parseButtonLines(text) {
  return String(text || "").split(/\n/).map((l) => { const m = /^(.{1,40}?)\s*[|—–-]\s*(https?:\/\/\S+)$/.exec(l.trim()); return m ? { text: m[1].trim(), url: m[2] } : null; }).filter(Boolean).slice(0, 4);
}

module.exports = { renderPost, THEMES, TEMPLATES, parseItems, parseItem, liteToHtml, entitiesToHtml, buildButtons, parseButtonLines, ICONS: Object.keys(ICONS) };
