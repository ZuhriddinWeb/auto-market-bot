// =====================================================================
// 🖼 KANAL POSTI RASMI — ko'rinishlar va holat belgilari
//   • cardSlots(n)          — «E'lon kartochkasi» uchun rasmlar joylashuvi (yuqorida 1200×880 maydon)
//   • cardOverlaySvg(o)     — kartochkaning pastki ma'lumot paneli + holat belgilari (1200×1200)
//   • classicOverlaySvg(o)  — hozirgi (kollaj) ko'rinish uchun holat belgilari: SOTILDI muhri, lentalar, ramka
// Matnlar Inter shriftida (fonts/ papkasida), bo'lmasa — DejaVu Sans.
// =====================================================================
const F = "Inter, Onest, DejaVu Sans, Arial, sans-serif";
const C = { ink: "#0f1a2b", ink2: "#5a687d", ink3: "#8a95a7", brand: "#1667d9", deal: "#0a8754", dealSoft: "#dcf2e7", drop: "#0a6fe0", dropSoft: "#e2eefd", gray: "#eef1f5", red: "#d92d20", gold: "#c8961e", vip: "#7b3fe4" };
const REGION_CODES = { "Toshkent sh.": "01", "Toshkent vil.": "10", "Sirdaryo": "20", "Jizzax": "25", "Samarqand": "30", "Farg'ona": "40", "Namangan": "50", "Andijon": "60", "Qashqadaryo": "70", "Surxondaryo": "75", "Buxoro": "80", "Navoiy": "85", "Xorazm": "90", "Qoraqalpog'iston": "95" };
const CARD = { W: 1200, H: 1200, PH: 880 };

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tw = (s, size, w = 800) => String(s).length * size * (w >= 700 ? 0.6 : 0.53);
const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-family="${F}" font-size="${o.size || 28}" font-weight="${o.w || 400}" fill="${o.fill || C.ink}" text-anchor="${o.a || "start"}"${o.ls ? ` letter-spacing="${o.ls}"` : ""}${o.deco ? ` text-decoration="${o.deco}"` : ""}>${esc(s)}</text>`;
function fit(s, maxW, size, min, w = 800) {
  let sz = size;
  while (sz > min && tw(s, sz, w) > maxW) sz -= 1;
  let t = String(s);
  while (t.length > 4 && tw(t, sz, w) > maxW) t = t.slice(0, -2).trimEnd() + "…";
  return { t, sz };
}
function mark(x, y, s) {
  const k = s / 64;
  return `<g transform="translate(${x},${y}) scale(${k})"><rect width="64" height="64" rx="17" fill="${C.brand}"/>
    <path d="M15 37 L20 25.5 Q21.5 22 25.5 22 L38.5 22 Q42.5 22 44 25.5 L49 37 Z" fill="#fff"/><rect x="10" y="33" width="44" height="13" rx="5" fill="#fff"/>
    <path d="M22.5 26 Q23.2 24.6 25 24.6 L31 24.6 L31 33 L19.8 33 Z M33 24.6 L39 24.6 Q40.8 24.6 41.5 26 L44.2 33 L33 33 Z" fill="${C.brand}"/>
    <circle cx="20" cy="46" r="5.5" fill="${C.brand}" stroke="#fff" stroke-width="3"/><circle cx="44" cy="46" r="5.5" fill="${C.brand}" stroke="#fff" stroke-width="3"/></g>`;
}
// Davlat raqami uslubidagi viloyat belgisi: [40 | Farg'ona 🇺🇿]
function plate(x, y, region) {
  const code = REGION_CODES[region] || "";
  const name = fit(region, 300, 30, 22, 600);
  const h = 64, cw = code ? 74 : 0, rw = name.t.length * name.sz * 0.6 + 44, fw = 52, w = cw + rw + fw;
  let s = `<g transform="translate(${x},${y})"><rect width="${w}" height="${h}" rx="12" fill="#fff" stroke="${C.ink}" stroke-width="4"/>`;
  if (code) s += `<line x1="${cw}" x2="${cw}" y1="2" y2="${h - 2}" stroke="${C.ink}" stroke-width="4"/>${T(cw / 2, 44, code, { size: 32, w: 800, a: "middle" })}`;
  s += T(cw + 20, 43, name.t, { size: name.sz, w: 600 });
  s += `<g transform="translate(${cw + rw + 4},16)"><rect width="30" height="18" rx="2" fill="#fff" stroke="rgba(0,0,0,.25)"/><rect width="30" height="6" fill="#0099b5"/><rect y="12" width="30" height="6" fill="#1eb53a"/><rect y="5.5" width="30" height="1" fill="#ce1126"/><rect y="11.5" width="30" height="1" fill="#ce1126"/></g>`;
  return s + T(cw + rw + 19, 52, "UZ", { size: 14, w: 700, a: "middle" }) + "</g>";
}
const TONES = { cheap: [C.dealSoft, C.deal], market: [C.gray, C.ink2], drop: [C.dropSoft, C.drop], sold: [C.gray, C.ink2] };
function pillEnd(xEnd, y, text, tone) {
  const [bg, fg] = TONES[tone] || TONES.market, w = tw(text, 26) + 60;
  return `<rect x="${xEnd - w}" y="${y}" width="${w}" height="50" rx="25" fill="${bg}"/>${T(xEnd - w / 2, y + 34, text, { size: 26, w: 800, fill: fg, a: "middle", ls: 0.3 })}`;
}
// Chap yuqoridagi lentalar: [{ text, bg }]
function ribbons(list, x = 32, y = 32) {
  let s = "", yy = y;
  for (const r of list) {
    const w = tw(r.text, 28) + 48;
    s += `<rect x="${x}" y="${yy + 3}" width="${w}" height="58" rx="29" fill="#000" opacity="0.18"/><rect x="${x}" y="${yy}" width="${w}" height="58" rx="29" fill="${r.bg}"/>${T(x + w / 2, yy + 39, r.text, { size: 28, w: 800, fill: "#fff", a: "middle", ls: 1 })}`;
    yy += 70;
  }
  return s;
}
function stamp(cx, cy, scale = 1) {
  return `<g transform="translate(${cx},${cy}) rotate(-14) scale(${scale})"><rect x="-300" y="-82" width="600" height="164" rx="22" fill="#fff" fill-opacity="0.12" stroke="${C.red}" stroke-width="12"/>${T(0, 40, "SOTILDI", { size: 118, w: 800, fill: C.red, a: "middle", ls: 8 })}</g>`;
}
const frameRect = (w, h, color) => `<rect x="6" y="6" width="${w - 12}" height="${h - 12}" rx="6" fill="none" stroke="${color}" stroke-width="12"/>`;

// «E'lon kartochkasi»: rasmlar joylashuvi (maksimal 4 ta ko'rsatiladi)
function cardSlots(n) {
  const W = CARD.W, H = CARD.PH;
  if (n <= 1) return [{ left: 0, top: 0, width: W, height: H }];
  if (n === 2) return [{ left: 0, top: 0, width: 598, height: H }, { left: 602, top: 0, width: 598, height: H }];
  if (n === 3) return [{ left: 0, top: 0, width: 796, height: H }, { left: 800, top: 0, width: 400, height: 438 }, { left: 800, top: 442, width: 400, height: 438 }];
  return [{ left: 0, top: 0, width: 598, height: 438 }, { left: 602, top: 0, width: 598, height: 438 }, { left: 0, top: 442, width: 598, height: 438 }, { left: 602, top: 442, width: 598, height: 438 }];
}
// o: { title, specs, price, oldPrice, badge: { text, tone }, region, extra (yashirin rasmlar soni), sold, ribbons, frame, channel }
function cardOverlaySvg(o) {
  const { W, H, PH } = CARD;
  let s = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  if (o.extra > 0) { const sl = cardSlots(4)[3]; s += `<rect x="${sl.left}" y="${sl.top}" width="${sl.width}" height="${sl.height}" fill="#091019" opacity="0.45"/>${T(sl.left + sl.width / 2, sl.top + sl.height / 2 + 26, `+${o.extra}`, { size: 76, w: 800, fill: "#fff", a: "middle" })}`; }
  if (o.sold) s += stamp(W / 2, PH / 2);
  if (o.ribbons && o.ribbons.length) s += ribbons(o.ribbons);
  // Pastki panel
  s += `<rect x="0" y="${PH}" width="${W}" height="${H - PH}" fill="#fff"/><rect x="0" y="${PH}" width="${W}" height="1" fill="#000" opacity="0.08"/>`;
  const priceSz = o.oldPrice ? 66 : 72;
  const priceW = tw(o.price, priceSz) + (o.oldPrice ? tw(o.oldPrice, 34, 600) + 22 : 0);
  const title = fit(o.title, W - 96 - priceW - 40, 52, 34);
  s += T(48, PH + 82, title.t, { size: title.sz, w: 800 });
  const specs = fit(o.specs, W - 96 - 330, 30, 22, 400);
  s += T(48, PH + 132, specs.t, { size: specs.sz, fill: C.ink2 });
  if (o.oldPrice) {
    s += T(W - 48, PH + 76, o.price, { size: priceSz, w: 800, a: "end", fill: C.drop });
    s += T(W - 48 - tw(o.price, priceSz) - 22, PH + 76, o.oldPrice, { size: 34, w: 600, a: "end", fill: C.ink3, deco: "line-through" });
  } else s += T(W - 48, PH + 82, o.price, { size: priceSz, w: 800, a: "end", fill: o.sold ? C.ink3 : C.ink });
  if (o.badge && o.badge.text) s += pillEnd(W - 48, PH + 104, o.badge.text, o.badge.tone);
  if (o.region) s += plate(48, PH + 172, o.region);
  s += mark(W - 48 - 290, PH + 184, 40) + `<text x="${W - 48 - 238}" y="${PH + 215}" font-family="${F}" font-size="28" font-weight="800"><tspan fill="${C.ink}">Avto</tspan><tspan fill="${C.brand}">Bozor</tspan></text>`;
  s += T(W - 48, PH + 252, `t.me/${o.channel}`, { size: 21, w: 600, fill: C.ink3, a: "end" });
  if (o.frame) s += frameRect(W, H, o.frame);
  return s + "</svg>";
}
// Hozirgi (kollaj) ko'rinish uchun: o: { sold, ribbons, frame }
function classicOverlaySvg(cw, ch, o) {
  let s = `<svg width="${cw}" height="${ch}" xmlns="http://www.w3.org/2000/svg">`;
  if (o.sold) s += stamp(cw / 2, Math.min(ch / 2, 450));
  if (o.ribbons && o.ribbons.length) s += ribbons(o.ribbons);
  if (o.frame) s += frameRect(cw, ch, o.frame);
  return s + "</svg>";
}

module.exports = { CARD, REGION_CODES, cardSlots, cardOverlaySvg, classicOverlaySvg, COLORS: C };
