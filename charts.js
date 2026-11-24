// =====================================================================
// 📊 KANAL UCHUN DIAGRAMMALAR (1080×1080 rasm)
//   • buildIndex()        — «Bozor indeksi»: eng ko'p sotuvdagi 5 model, narx, 8 haftalik trend
//   • buildDynamics(off)  — «Narx dinamikasi»: bitta model, 8 hafta, mediana + ko'pchilik oralig'i
//   • buildYears(off)     — «Yil bo'yicha narx»: bitta model, har yil avtomat va mexanika
//   • buildWeekNumbers()  — «Hafta raqamlarda»: yangi / sotildi / narxi tushdi, kunlar, karobka ulushi
// Narxlar oddiy o'rtacha emas — mediana; yili va karobkasi har xil e'lonlar bitta yilga keltiriladi
// (market.js dagi shu modelning o'z qadrsizlanish sur'ati bilan). Ma'lumot kam bo'lsa — diagramma chiqmaydi.
// off — admin «🔄 Boshqa model» bosganda keyingi modelga o'tish uchun.
// =====================================================================
const DAY = 864e5;
const C = { bg: "#f3f5f8", card: "#ffffff", ink: "#0f1a2b", ink2: "#5a687d", ink3: "#8a95a7", line: "#e3e8ef", brand: "#1667d9", brandSoft: "#e3edfc", brandLight: "#a9c4ee", deal: "#0a8754", dealSoft: "#dcf2e7", amber: "#a86500", amberSoft: "#fcefd8", orange: "#e8930c", rail: "#c9d2de" };
const F = "Inter, Onest, DejaVu Sans, Arial, sans-serif";
const W = 1080, H = 1080;
const MON = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"];
const WD = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];
const WD_FULL = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];

const priceNum = (v) => parseInt(String(v == null ? "" : v).replace(/\D/g, ""), 10) || 0;
const yearNum = (v) => { const y = parseInt(v, 10); return y > 1950 && y < 2100 ? y : 0; };
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quantile = (a, q) => { const s = [...a].sort((x, y) => x - y); if (!s.length) return 0; const p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return s[lo] + (s[hi] - s[lo]) * (p - lo); };
const trim = (a) => { const m = median(a); return a.filter((v) => v >= m * 0.5 && v <= m * 2); };
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tz = (d) => new Date(new Date(d).getTime() + 5 * 3600 * 1000); // Toshkent vaqti (UTC+5)
const shortDate = (d) => { const t = tz(d); return `${t.getUTCDate()}-${MON[t.getUTCMonth()]}`; };
function rangeLabel(now = new Date()) {
  const a = tz(new Date(now.getTime() - 6 * DAY)), b = tz(now);
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${b.getUTCDate()}-${MONTHS[b.getUTCMonth()]}` : `${a.getUTCDate()}-${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()}-${MONTHS[b.getUTCMonth()]}`;
}
// Matn kengligi (Inter, taxminan) — uzun nomlarni sig'dirish uchun
const textW = (s, size, w = 700) => String(s).length * size * (w >= 700 ? 0.6 : 0.55);
function fitText(s, maxW, size, minSize = 22, w = 700) {
  let sz = size;
  while (sz > minSize && textW(s, sz, w) > maxW) sz -= 1;
  let t = String(s);
  while (t.length > 4 && textW(t, sz, w) > maxW) t = t.slice(0, -2).trimEnd() + "…";
  return { t, sz };
}
const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-family="${F}" font-size="${o.size || 28}" font-weight="${o.w || 400}" fill="${o.fill || C.ink}" text-anchor="${o.a || "start"}"${o.ls ? ` letter-spacing="${o.ls}"` : ""}${o.op ? ` opacity="${o.op}"` : ""}>${esc(s)}</text>`;

// Umumiy ramka: logotip, sarlavha, pastki izoh va kanal manzili
function frame(channel, title, sub, body, foot, tag = "HAFTALIK HISOBOT") {
  const tt = fitText(title, W - 176, 46, 34, 800);
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="36" fill="${C.card}"/>
  <text x="88" y="112" font-family="${F}" font-size="30" font-weight="800"><tspan fill="${C.ink}">Avto</tspan><tspan fill="${C.brand}">Bozor</tspan></text>
  ${T(W - 88, 112, tag, { size: 22, w: 700, fill: C.ink3, a: "end", ls: 2 })}
  ${T(88, 190, tt.t, { size: tt.sz, w: 800 })}
  ${T(88, 236, fitText(sub, W - 176, 26, 20, 400).t, { size: fitText(sub, W - 176, 26, 20, 400).sz, fill: C.ink2 })}
  ${body}
  <line x1="88" x2="${W - 88}" y1="${H - 132}" y2="${H - 132}" stroke="${C.line}" stroke-width="2"/>
  ${T(88, H - 88, fitText(foot, 600, 21, 17, 400).t, { size: fitText(foot, 600, 21, 17, 400).sz, fill: C.ink3 })}
  ${T(W - 88, H - 88, "@" + channel, { size: 22, w: 700, fill: C.brand, a: "end" })}
  </svg>`;
}
function chip(x, y, text, kind, anchor = "start") {
  const col = { down: [C.dealSoft, C.deal], up: [C.amberSoft, C.amber], flat: ["#eef1f5", C.ink2] }[kind];
  const w = textW(text, 25, 700) + 34, x0 = anchor === "end" ? x - w : x;
  return `<rect x="${x0}" y="${y - 32}" width="${w}" height="46" rx="23" fill="${col[0]}"/>${T(x0 + w / 2, y, text, { size: 25, w: 700, fill: col[1], a: "middle" })}`;
}
const pctText = (d) => `${d < 0 ? "▼" : "▲"} ${String(Math.abs(d)).replace(".", ",")}%`;

function createCharts({ db, market, catalog, sharp, channel }) {
  const modelName = (id) => { const m = catalog.modelById(id); return m ? `${m.brandName || (m.brand && m.brand.name) || ""} ${m.name}`.trim() : null; };
  const modelShort = (id) => { const m = catalog.modelById(id); return m ? m.name : null; };
  const png = (svg) => sharp(Buffer.from(svg), { density: 96 }).png({ compressionLevel: 9 }).toBuffer();
  const weekNo = (d = new Date()) => Math.floor((tz(d).getTime() / DAY + 3) / 7); // dushanbadan boshlanadigan hafta raqami

  // Shu model e'lonlari: narxi bitta yilga va bitta karobkaga keltiriladi
  async function normalizer(modelId, targetYear, targetGroup) {
    const info = await market.modelInfo(modelId, modelShort(modelId));
    return (r) => {
      const y = yearNum(r.year), p = priceNum(r.price);
      if (!y || p < 300 || p > 500000 || Math.abs(y - targetYear) > 4) return 0;
      let v = p * Math.pow(1 + info.rate, targetYear - y);
      const g = market.transGroup(r.transmission);
      if (targetGroup && g && g !== targetGroup) v = targetGroup === "A" ? v * info.ratio : v / info.ratio;
      return v;
    };
  }
  const modeOf = (arr) => { const m = new Map(); arr.forEach((v) => v && m.set(v, (m.get(v) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null; };

  // 8 haftalik qatorlar: [{ end, n, med, lo, hi } | null]
  function weekly(rows, norm, weeks = 8) {
    const now = Date.now(), out = [];
    const all = rows.map(norm).filter(Boolean), m = median(all);
    for (let w = weeks - 1; w >= 0; w--) {
      const from = now - (w + 1) * 7 * DAY, to = now - w * 7 * DAY;
      const v = rows.filter((r) => { const t = new Date(r.created_at).getTime(); return t >= from && t < to; }).map(norm).filter((x) => x && x >= m * 0.5 && x <= m * 2);
      out.push(v.length >= 3 ? { end: new Date(to - 1), n: v.length, med: median(v), lo: quantile(v, 0.25), hi: quantile(v, 0.75) } : { end: new Date(to - 1), n: v.length, med: null });
    }
    return out;
  }
  // Oxirgi 7 kun va oldingi 4 hafta (hisobotdagi bilan bir xil qoida)
  function trend(rows, norm) {
    const now = Date.now();
    const recent = rows.filter((r) => now - new Date(r.created_at).getTime() <= 7 * DAY).map(norm).filter(Boolean);
    const base = rows.filter((r) => { const a = now - new Date(r.created_at).getTime(); return a > 7 * DAY && a <= 35 * DAY; }).map(norm).filter(Boolean);
    if (recent.length < 5 || base.length < 8) return null;
    const m = median(recent.concat(base));
    const R = median(recent.filter((v) => v >= m * 0.5 && v <= m * 2)), B = median(base.filter((v) => v >= m * 0.5 && v <= m * 2));
    return B ? Math.round(((R - B) / B) * 100) : null;
  }
  async function rowsFor(ids, days) {
    if (!ids.length) return [];
    const [rows] = await db.execute(`SELECT model_id, year, price, transmission, status, created_at FROM ads WHERE model_id IN (${ids.map(() => "?").join(",")}) AND status IN ('active', 'sold') AND created_at >= NOW() - INTERVAL ${Number(days)} DAY`, ids);
    return rows;
  }

  // ---------------- B) BOZOR INDEKSI ----------------
  async function buildIndex() {
    const [top] = await db.execute("SELECT model_id, COUNT(*) AS c FROM ads WHERE status = 'active' AND model_id IS NOT NULL GROUP BY model_id HAVING COUNT(*) >= 5 ORDER BY c DESC LIMIT 8");
    const ids = top.map((r) => Number(r.model_id)).filter((id) => catalog.modelById(id));
    const hist = await rowsFor(ids, 56);
    const items = [];
    for (const r of top) {
      if (items.length >= 5) break;
      const id = Number(r.model_id), name = modelName(id);
      if (!name) continue;
      const rows = hist.filter((x) => Number(x.model_id) === id);
      const year = modeOf(rows.filter((x) => x.status === "active").map((x) => yearNum(x.year)));
      if (!year) continue;
      const mp = await market.marketPrice({ modelId: id, model: modelShort(id), year });
      if (!mp.ok || !mp.confident) continue;
      const norm = await normalizer(id, year, "A");
      const spark = weekly(rows, norm).map((w) => w.med);
      items.push({ name, year, count: Number(r.c), price: mp.median, spark, change: trend(rows, norm) });
    }
    if (items.length < 3) return null;
    let b = T(88, 300, "MODEL", { size: 20, w: 700, fill: C.ink3, ls: 1.5 }) + T(560, 300, "8 HAFTA", { size: 20, w: 700, fill: C.ink3, ls: 1.5, a: "middle" }) + T(W - 88, 300, "NARX · HAFTALIK", { size: 20, w: 700, fill: C.ink3, ls: 1.5, a: "end" });
    const step = items.length >= 5 ? 116 : 130;
    items.forEach((it, i) => {
      const y = 360 + i * step;
      if (i) b += `<line x1="88" x2="${W - 88}" y1="${y - 34}" y2="${y - 34}" stroke="${C.line}" stroke-width="2"/>`;
      b += `<circle cx="112" cy="${y + 12}" r="24" fill="${C.brandSoft}"/>${T(112, y + 21, i + 1, { size: 24, w: 800, fill: C.brand, a: "middle" })}`;
      const nm = fitText(it.name, 300, 30, 22, 700);
      b += T(156, y + 6, nm.t, { size: nm.sz, w: 700 }) + T(156, y + 44, `${it.year} · ${it.count} ta e'lon`, { size: 22, fill: C.ink2 });
      // Hamma qatorda bir xil o'lchov (o'z o'rtachasidan ±6%) — barqaror narx tekis ko'rinadi
      const pts = it.spark.map((v, k) => (v ? [k, v] : null)).filter(Boolean);
      if (pts.length >= 3) {
        const avg = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        const sx = (k) => 470 + k * (180 / 7), sy = (v) => y + 9 - Math.max(-1, Math.min(1, (v / avg - 1) / 0.06)) * 26;
        b += `<path d="${pts.map((p, j) => `${j ? "L" : "M"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(" ")}" fill="none" stroke="${C.brand}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`;
        const l = pts[pts.length - 1];
        b += `<circle cx="${sx(l[0])}" cy="${sy(l[1])}" r="6" fill="${C.brand}" stroke="#fff" stroke-width="3"/>`;
      } else b += T(560, y + 18, "ma'lumot kam", { size: 20, fill: C.ink3, a: "middle" });
      b += T(W - 250, y + 26, fmt(it.price) + "$", { size: 32, w: 800, a: "end" });
      if (it.change !== null) b += chip(W - 88, y + 26, Math.abs(it.change) >= 1 ? pctText(it.change) : "barqaror", it.change <= -1 ? "down" : it.change >= 1 ? "up" : "flat", "end");
    });
    const svg = frame(channel, "Bozor indeksi", `Eng ko'p sotuvdagi ${items.length} model · mediana narx`, b, "▼ arzonlashdi · ▲ qimmatladi — o'tgan 4 haftaga nisbatan");
    return { png: await png(svg), items };
  }

  // Ko'p e'lonli modellar (navbatma-navbat chiqarish uchun)
  async function candidates(days, minRows) {
    const [rows] = await db.execute(`SELECT model_id, COUNT(*) AS c FROM ads WHERE model_id IS NOT NULL AND status IN ('active', 'sold') AND created_at >= NOW() - INTERVAL ${Number(days)} DAY GROUP BY model_id HAVING COUNT(*) >= ${Number(minRows)} ORDER BY c DESC LIMIT 10`);
    return rows.map((r) => Number(r.model_id)).filter((id) => catalog.modelById(id));
  }

  // ---------------- A) NARX DINAMIKASI ----------------
  async function dynamicsFor(id) {
    const rows = await rowsFor([id], 56);
    const year = modeOf(rows.map((x) => yearNum(x.year)));
    if (!year) return null;
    const gA = rows.filter((x) => market.transGroup(x.transmission) === "A").length, gM = rows.filter((x) => market.transGroup(x.transmission) === "M").length;
    const g = gM > gA ? "M" : "A";
    const norm = await normalizer(id, year, g);
    const wk = weekly(rows, norm);
    const ok = wk.filter((w) => w.med);
    if (ok.length < 5 || !wk[wk.length - 1].med) return null;
    const first = ok[0], last = ok[ok.length - 1];
    const change = Math.round(((last.med - first.med) / first.med) * 1000) / 10;
    // O'q chegaralari
    const lo = Math.min(...ok.map((w) => w.lo)), hi = Math.max(...ok.map((w) => w.hi));
    const stepV = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000].find((s) => (hi - lo) / s <= 5) || 20000;
    const vmin = Math.floor((lo - stepV * 0.3) / stepV) * stepV, vmax = Math.ceil((hi + stepV * 0.3) / stepV) * stepV;
    const x0 = 140, x1 = W - 150, y0 = 330, y1 = 840;
    const X = (i) => x0 + (i / (wk.length - 1)) * (x1 - x0), Y = (v) => y1 - ((v - vmin) / (vmax - vmin)) * (y1 - y0);
    const kfmt = (v) => (v >= 1000 ? `${String(Math.round(v / 100) / 10).replace(".", ",")}k` : String(v));
    let b = "";
    for (let v = vmin; v <= vmax + 1; v += stepV) b += `<line x1="${x0}" x2="${x1}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.line}" stroke-width="2"/>${T(x0 - 16, Y(v) + 8, kfmt(v), { size: 22, fill: C.ink3, a: "end" })}`;
    const idx = wk.map((w, i) => (w.med ? i : -1)).filter((i) => i >= 0);
    b += `<path d="M${idx.map((i) => `${X(i)},${Y(wk[i].hi)}`).join(" L")} L${idx.slice().reverse().map((i) => `${X(i)},${Y(wk[i].lo)}`).join(" L")} Z" fill="${C.brand}" fill-opacity="0.12"/>`;
    b += `<path d="${idx.map((i, j) => `${j ? "L" : "M"}${X(i)},${Y(wk[i].med)}`).join(" ")}" fill="none" stroke="${C.brand}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>`;
    const fi = idx[0], li = idx[idx.length - 1];
    b += `<circle cx="${X(fi)}" cy="${Y(first.med)}" r="9" fill="${C.brand}" stroke="#fff" stroke-width="5"/>${T(X(fi) + 6, Y(first.med) - 24, fmt(Math.round(first.med / 100) * 100) + "$", { size: 26, w: 600, fill: C.ink2 })}`;
    const lastAbove = Y(last.med) > y1 - 70;
    b += `<circle cx="${X(li)}" cy="${Y(last.med)}" r="13" fill="${C.brand}" stroke="#fff" stroke-width="6"/>${T(X(li) + 6, Y(last.med) + (lastAbove ? -30 : 58), fmt(Math.round(last.med / 100) * 100) + "$", { size: 34, w: 800, a: "end" })}`;
    wk.forEach((w, i) => { if (i % 2 === 1 || i === wk.length - 1) b += T(X(i), y1 + 44, shortDate(w.end), { size: 22, fill: C.ink3, a: "middle" }); });
    b += chip(W - 88, 300, `${Math.abs(change) < 1 ? "barqaror" : pctText(change)} · 8 haftada`, change <= -1 ? "down" : change >= 1 ? "up" : "flat", "end");
    b += `<rect x="${x0}" y="268" width="26" height="14" rx="4" fill="${C.brand}" fill-opacity="0.18"/>${T(x0 + 36, 282, "ko'pchilik e'lonlar oralig'i", { size: 21, fill: C.ink2 })}`;
    const ns = ok.map((w) => w.n), name = modelName(id), tr = g === "M" ? "mexanika" : "avtomat";
    const svg = frame(channel, `${name} narxi`, `${year}-yil · ${tr} · haftalik mediana`, b, `Har hafta ${Math.min(...ns)}–${Math.max(...ns)} ta e'lon · ${year}-yilga keltirilgan`);
    return { png: await png(svg), modelId: id, name, year, trans: tr, price: Math.round(last.med / 100) * 100, change };
  }
  async function buildDynamics(off = 0) {
    const list = await candidates(56, 20);
    if (!list.length) return null;
    const start = (weekNo() + off) % list.length;
    for (let k = 0; k < list.length; k++) {
      const r = await dynamicsFor(list[(start + k) % list.length]).catch(() => null);
      if (r) return { ...r, offset: off + k };
    }
    return null;
  }

  // ---------------- C) YIL BO'YICHA NARX ----------------
  async function yearsFor(id) {
    const [rows] = await db.execute("SELECT year, price, transmission FROM ads WHERE model_id = ? AND (status = 'active' OR (status = 'sold' AND created_at >= NOW() - INTERVAL 120 DAY))", [id]);
    const cell = new Map(); // "y|g" -> prices
    rows.forEach((r) => { const y = yearNum(r.year), p = priceNum(r.price), g = market.transGroup(r.transmission); if (!y || !g || p < 300 || p > 500000) return; const k = `${y}|${g}`; if (!cell.has(k)) cell.set(k, []); cell.get(k).push(p); });
    const val = (y, g) => { const a = cell.get(`${y}|${g}`); if (!a || a.length < 3) return null; return Math.round(median(trim(a)) / 100) * 100; };
    const years = [...new Set(rows.map((r) => yearNum(r.year)).filter(Boolean))].sort((a, b) => b - a).filter((y) => val(y, "A") || val(y, "M")).slice(0, 8);
    if (years.length < 4) return null;
    const data = years.map((y) => ({ y, A: val(y, "A"), M: val(y, "M") }));
    const hasA = data.some((d) => d.A), hasM = data.some((d) => d.M);
    const all = data.flatMap((d) => [d.A, d.M]).filter(Boolean);
    const step = [500, 1000, 2000, 2500, 5000, 10000, 20000].find((s) => (Math.max(...all) - Math.min(...all)) / s <= 4) || 50000;
    const vmin = Math.floor((Math.min(...all) * 0.97) / step) * step, vmax = Math.ceil((Math.max(...all) * 1.03) / step) * step;
    const x0 = 230, x1 = W - 170, X = (v) => x0 + ((v - vmin) / (vmax - vmin)) * (x1 - x0);
    let b = "";
    let lx = 88;
    if (hasA) { b += `<circle cx="${lx + 12}" cy="292" r="10" fill="${C.brand}"/>${T(lx + 32, 300, "Avtomat", { size: 24, w: 600 })}`; lx += 160; }
    if (hasM) b += `<circle cx="${lx + 12}" cy="292" r="10" fill="${C.orange}"/>${T(lx + 32, 300, "Mexanika", { size: 24, w: 600 })}`;
    const rowH = Math.min(70, Math.floor(540 / data.length)), top = 375, bottom = top + rowH * (data.length - 1) + 30;
    for (let v = vmin; v <= vmax + 1; v += step) b += `<line x1="${X(v)}" x2="${X(v)}" y1="340" y2="${bottom}" stroke="${C.line}" stroke-width="2"/>${T(X(v), bottom + 36, fmt(v) + "$", { size: 21, fill: C.ink3, a: "middle" })}`;
    data.forEach((d, i) => {
      const y = top + i * rowH;
      b += T(88, y + 9, d.y, { size: 28, w: 700 });
      if (d.A && d.M) b += `<line x1="${X(Math.min(d.A, d.M))}" x2="${X(Math.max(d.A, d.M))}" y1="${y}" y2="${y}" stroke="${C.rail}" stroke-width="6" stroke-linecap="round"/>`;
      const hiV = Math.max(d.A || 0, d.M || 0), loV = d.A && d.M ? Math.min(d.A, d.M) : null;
      if (d.M) b += `<circle cx="${X(d.M)}" cy="${y}" r="13" fill="${C.orange}" stroke="#fff" stroke-width="5"/>`;
      if (d.A) b += `<circle cx="${X(d.A)}" cy="${y}" r="13" fill="${C.brand}" stroke="#fff" stroke-width="5"/>`;
      b += T(X(hiV) + 26, y + 9, fmt(hiV) + "$", { size: 24, w: 700 });
      if (loV) b += T(X(loV) - 26, y + 9, fmt(loV), { size: 22, fill: C.ink2, a: "end" });
    });
    const pairs = data.filter((d) => d.A && d.M);
    const info = await market.modelInfo(id, modelShort(id));
    const subs = [];
    if (pairs.length >= 3) { const diff = Math.round(median(pairs.map((d) => d.A - d.M)) / 100) * 100; if (diff > 0) subs.push(`Avtomat mexanikadan ~${fmt(diff)}$ qimmat`); }
    if (info.count >= 8) subs.push(`har yili ~${Math.round(info.rate * 100)}% arzonlashadi`);
    const name = modelShort(id) || modelName(id);
    const svg = frame(channel, `${name}: yil bo'yicha narx`, subs.join(" · ") || "Faol e'lonlar medianasi", b, `Faol va oxirgi 4 oyda sotilgan ${rows.length} ta e'lon medianasi`, "BOZOR NARXLARI");
    return { png: await png(svg), modelId: id, name: modelName(id), data };
  }
  async function buildYears(off = 0) {
    const list = await candidates(150, 25);
    if (!list.length) return null;
    const mi = tz(new Date()).getUTCFullYear() * 12 + tz(new Date()).getUTCMonth();
    const start = (mi + off) % list.length;
    for (let k = 0; k < list.length; k++) {
      const r = await yearsFor(list[(start + k) % list.length]).catch(() => null);
      if (r) return { ...r, offset: off + k };
    }
    return null;
  }

  // ---------------- D) HAFTA RAQAMLARDA ----------------
  async function buildWeekNumbers() {
    const num = (sql) => db.execute(sql).then(([[r]]) => Number(r && r.c) || 0).catch(() => 0);
    const [rows] = await db.execute("SELECT created_at, transmission FROM ads WHERE status IN ('active', 'sold') AND created_at >= NOW() - INTERVAL 7 DAY");
    if (!rows.length) return null;
    const [prev, sold, drops] = await Promise.all([
      num("SELECT COUNT(*) AS c FROM ads WHERE status IN ('active', 'sold') AND created_at >= NOW() - INTERVAL 14 DAY AND created_at < NOW() - INTERVAL 7 DAY"),
      num("SELECT COUNT(*) AS c FROM ads WHERE status = 'sold' AND sold_at >= NOW() - INTERVAL 7 DAY"),
      num("SELECT COUNT(*) AS c FROM ads WHERE status = 'active' AND price_dropped_at >= NOW() - INTERVAL 7 DAY"),
    ]);
    const n = rows.length, chg = prev ? Math.round(((n - prev) / prev) * 100) : null;
    // Kunlar (Toshkent sanasi bo'yicha, eskidan bugunga)
    const days = [];
    for (let i = 6; i >= 0; i--) { const d = tz(new Date(Date.now() - i * DAY)); days.push({ key: d.toISOString().slice(0, 10), wd: d.getUTCDay(), c: 0 }); }
    rows.forEach((r) => { const k = tz(r.created_at).toISOString().slice(0, 10); const d = days.find((x) => x.key === k); if (d) d.c++; });
    const gA = rows.filter((r) => market.transGroup(r.transmission) === "A").length, gM = rows.filter((r) => market.transGroup(r.transmission) === "M").length;
    let b = "";
    const tiles = [[fmt(n), "yangi e'lon", chg !== null && Math.abs(chg) >= 3 ? chg : null], [fmt(sold), "sotildi", null], [fmt(drops), "narxi tushdi", null]];
    tiles.forEach((t, i) => {
      const x = 88 + i * 308;
      b += `<rect x="${x}" y="272" width="288" height="150" rx="24" fill="${C.bg}"/>${T(x + 28, 352, t[0], { size: 64, w: 800, fill: i === 0 ? C.brand : C.ink })}${T(x + 28, 396, t[1], { size: 24, fill: C.ink2 })}`;
      if (t[2] !== null) b += T(x + 266, 352, `${t[2] > 0 ? "▲" : "▼"} ${Math.abs(t[2])}%`, { size: 24, w: 700, fill: t[2] > 0 ? C.deal : C.ink2, a: "end" });
    });
    const y0 = 490, y1 = gA + gM ? 760 : 820, bw = 64, gap = (W - 176 - 7 * bw) / 6, mx = Math.max(1, ...days.map((d) => d.c));
    b += T(88, 476, "Kunlar bo'yicha yangi e'lonlar", { size: 26, w: 700 });
    b += `<line x1="88" x2="${W - 88}" y1="${y1}" y2="${y1}" stroke="${C.line}" stroke-width="2"/>`;
    const best = days.reduce((a, d) => (d.c > a.c ? d : a), days[0]);
    days.forEach((d, i) => {
      const x = 88 + i * (bw + gap), h = Math.max(d.c ? 6 : 0, (d.c / mx) * (y1 - y0 - 44)), top = y1 - h, isBest = d === best && d.c > 0;
      if (h > 0) b += `<path d="M${x},${y1} L${x},${top + Math.min(10, h)} Q${x},${top} ${x + 10},${top} L${x + bw - 10},${top} Q${x + bw},${top} ${x + bw},${top + Math.min(10, h)} L${x + bw},${y1} Z" fill="${isBest ? C.brand : C.brandLight}"/>`;
      b += T(x + bw / 2, y1 + 38, i === 6 ? "Bugun" : WD[d.wd], { size: 22, w: 600, fill: C.ink2, a: "middle" });
      if (isBest) b += T(x + bw / 2, top - 14, d.c, { size: 26, w: 800, a: "middle" });
    });
    if (gA + gM) {
      const a = Math.round((gA / (gA + gM)) * 100), sx = 88, sw = W - 176, aw = Math.max(4, Math.min(sw - 4, (sw * a) / 100));
      b += T(88, 858, "Karobka", { size: 26, w: 700 }) + T(W - 88, 858, `Avtomat ${a}%  ·  Mexanika ${100 - a}%`, { size: 24, w: 600, fill: C.ink2, a: "end" });
      b += `<rect x="${sx}" y="878" width="${aw - 2}" height="30" rx="8" fill="${C.brand}"/><rect x="${sx + aw + 2}" y="878" width="${sw - aw - 2}" height="30" rx="8" fill="${C.orange}"/>`;
    }
    const svg = frame(channel, "Hafta raqamlarda", rangeLabel(), b, best.c ? `Eng faol kun — ${WD_FULL[best.wd]} · kanaldagi real e'lonlar` : "Kanaldagi real e'lonlar");
    return { png: await png(svg), n, sold, drops, chg };
  }

  return { buildIndex, buildDynamics, buildYears, buildWeekNumbers, rangeLabel };
}

// =====================================================================
// 🏷 E'LON RASMI USTIDAGI BELGILAR (kollaj uchun, kenglik 1200)
// =====================================================================
const BRAND_BLUE = "#1667d9", BRAND_BLUE2 = "#3f8cf3";
function brandMark(x, y, s) {
  const k = s / 64;
  return `<g transform="translate(${x},${y}) scale(${k})">
    <defs><linearGradient id="abm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${BRAND_BLUE2}"/><stop offset="1" stop-color="${BRAND_BLUE}"/></linearGradient></defs>
    <rect width="64" height="64" rx="17" fill="url(#abm)"/>
    <path d="M15 37 L20 25.5 Q21.5 22 25.5 22 L38.5 22 Q42.5 22 44 25.5 L49 37 Z" fill="#fff"/>
    <rect x="10" y="33" width="44" height="13" rx="5" fill="#fff"/>
    <path d="M22.5 26 Q23.2 24.6 25 24.6 L31 24.6 L31 33 L19.8 33 Z M33 24.6 L39 24.6 Q40.8 24.6 41.5 26 L44.2 33 L33 33 Z" fill="${BRAND_BLUE}"/>
    <circle cx="20" cy="46" r="5.5" fill="${BRAND_BLUE}" stroke="#fff" stroke-width="3"/><circle cx="44" cy="46" r="5.5" fill="${BRAND_BLUE}" stroke="#fff" stroke-width="3"/>
  </g>`;
}
// Pastki lenta: qoraygan fon, chapda belgi + «AvtoBozor», o'ngda kanal manzili
function brandStripSvg(cw, ch, channel) {
  const s = cw / 1200, sh = Math.round(190 * s);
  return `<svg width="${cw}" height="${ch}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="abs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#091019" stop-opacity="0"/><stop offset="1" stop-color="#091019" stop-opacity="0.82"/></linearGradient></defs>
    <rect x="0" y="${ch - sh}" width="${cw}" height="${sh}" fill="url(#abs)"/>
    ${brandMark(36 * s, ch - 96 * s, 64 * s)}
    <text x="${116 * s}" y="${ch - 48 * s}" font-family="${F}" font-size="${46 * s}" font-weight="800" letter-spacing="-0.5"><tspan fill="#ffffff">Avto</tspan><tspan fill="#8cbcff">Bozor</tspan></text>
    <text x="${cw - 36 * s}" y="${ch - 50 * s}" font-family="${F}" font-size="${28 * s}" font-weight="600" fill="#ffffff" opacity="0.85" text-anchor="end">t.me/${esc(channel)}</text>
  </svg>`;
}
// Narx belgisi (o'ng yuqori burchak): yumaloq «tabletka»
function priceBadgeSvg(cw, ch, badge) {
  const color = { "#27ae60": "#0a8754", "#7f8c8d": "#5a687d" }[String(badge.color).toLowerCase()] || badge.color || "#0a8754";
  const t = String(badge.text), fs = 30, w = Math.round(t.length * fs * 0.66 + 64), h = 64, x = cw - w - 28, y = 28;
  return `<svg width="${cw}" height="${ch}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${x}" y="${y + 4}" width="${w}" height="${h}" rx="32" fill="#000" opacity="0.18"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="32" fill="${color}"/>
    <text x="${x + w / 2}" y="${y + 43}" font-family="${F}" font-size="${fs}" font-weight="800" fill="#fff" text-anchor="middle" letter-spacing="0.5">${esc(t)}</text>
  </svg>`;
}

// =====================================================================
// 🏆 KUNNING ENG YAXSHI 3 TA TAKLIFI (1080×1350): rasmli qatorlar, o'rin belgisi, narx, bozor belgisi, viloyat
// items: [{ title, specs, price, pct (yoki null), region, photo (Buffer|null) }]
// =====================================================================
const TOP_REGION = { "Toshkent sh.": "01", "Toshkent vil.": "10", "Sirdaryo": "20", "Jizzax": "25", "Samarqand": "30", "Farg'ona": "40", "Namangan": "50", "Andijon": "60", "Qashqadaryo": "70", "Surxondaryo": "75", "Buxoro": "80", "Navoiy": "85", "Xorazm": "90", "Qoraqalpog'iston": "95" };
async function renderTop3(sharp, { date, items, todayCount, byMarket }) {
  const Wt = 1080, Ht = 1350;
  const n = items.length, rowH = 224, gap = 22, top0 = 382;
  let s = `<defs><linearGradient id="tg" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#0f3f8f"/><stop offset="0.55" stop-color="#1667d9"/><stop offset="1" stop-color="#3f8cf3"/></linearGradient></defs><rect width="${Wt}" height="${Ht}" fill="url(#tg)"/>`;
  // logotip
  s += `<rect x="64" y="60" width="54" height="54" rx="15" fill="#fff"/><g transform="translate(73,69) scale(1.5)" fill="none" stroke="#1667d9" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15l1.6-5A2 2 0 0 1 7.5 8.6h9a2 2 0 0 1 1.9 1.4L20 15v3H4z"/><circle cx="7.5" cy="18" r="1.6"/><circle cx="16.5" cy="18" r="1.6"/></g>`;
  s += `<text x="134" y="100" font-family="${F}" font-size="38" font-weight="800"><tspan fill="#fff">Avto</tspan><tspan fill="#a9ceff">Bozor</tspan></text>`;
  const dw = textW(date, 26, 700) + 48;
  s += `<rect x="${Wt - 64 - dw}" y="60" width="${dw}" height="54" rx="27" fill="#fff" fill-opacity="0.16"/>${T(Wt - 64 - dw / 2, 96, date, { size: 26, w: 700, fill: "#fff", a: "middle" })}`;
  s += T(64, 222, "Kunning eng yaxshi", { size: 70, w: 800, fill: "#fff", ls: -1.5 }) + T(64, 298, `${n} ta taklifi`, { size: 70, w: 800, fill: "#ffd34d", ls: -1.5 });
  s += T(64, 344, byMarket ? "Bozor narxidan eng ko'p arzon e'lonlar" : "Bugungi eng arzon e'lonlar", { size: 28, w: 500, fill: "#dbe8ff" });
  const medal = ["#e8a90c", "#8f9bb0", "#b7743a"];
  const comps = [];
  items.forEach((it, i) => {
    const y = top0 + i * (rowH + gap);
    s += `<rect x="64" y="${y + 6}" width="${Wt - 128}" height="${rowH}" rx="28" fill="#000" opacity="0.12"/><rect x="64" y="${y}" width="${Wt - 128}" height="${rowH}" rx="28" fill="#fff"/>`;
    if (!it.photo) s += `<rect x="80" y="${y + 22}" width="250" height="180" rx="18" fill="#e3e8ef"/><g transform="translate(169,${y + 76}) scale(3)" fill="none" stroke="#a9b4c4" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15l1.6-5A2 2 0 0 1 7.5 8.6h9a2 2 0 0 1 1.9 1.4L20 15v3H4z"/><circle cx="7.5" cy="18" r="1.6"/><circle cx="16.5" cy="18" r="1.6"/></g>`;
    s += `<circle cx="98" cy="${y + 40}" r="31" fill="${medal[i] || medal[2]}" stroke="#fff" stroke-width="4"/>${T(98, y + 51, i + 1, { size: 30, w: 800, fill: "#fff", a: "middle" })}`;
    const tx = 352, tw = Wt - 64 - 24 - tx;
    const tt = fitText(it.title, tw, 36, 26, 800);
    s += T(tx, y + 58, tt.t, { size: tt.sz, w: 800, fill: C.ink });
    s += T(tx, y + 98, fitText(it.specs, tw, 24, 18, 400).t, { size: 24, w: 500, fill: C.ink2 });
    s += T(tx, y + 158, it.price, { size: 46, w: 800, fill: C.ink });
    if (it.pct) { const px = tx + textW(it.price, 46, 800) + 18, pw = textW(`−${it.pct}% bozordan`, 22, 800) + 32; s += `<rect x="${px}" y="${y + 122}" width="${pw}" height="44" rx="22" fill="${C.dealSoft}"/>${T(px + pw / 2, y + 152, `−${it.pct}% bozordan`, { size: 22, w: 800, fill: C.deal, a: "middle" })}`; }
    if (it.region) {
      const code = TOP_REGION[it.region] || "", rw = textW(it.region, 20, 700) + 22, cw = code ? 44 : 0;
      s += `<g transform="translate(${tx},${y + 178})"><rect width="${cw + rw}" height="32" rx="8" fill="#fff" stroke="${C.ink}" stroke-width="3"/>${code ? `<line x1="${cw}" x2="${cw}" y1="1" y2="31" stroke="${C.ink}" stroke-width="3"/>${T(cw / 2, 23, code, { size: 20, w: 800, fill: C.ink, a: "middle" })}` : ""}${T(cw + 11, 23, it.region, { size: 20, w: 700, fill: C.ink })}</g>`;
    }
    if (it.photo) comps.push({ i, y });
  });
  const ft = Ht - 56 - 124;
  s += `<rect x="64" y="${ft}" width="${Wt - 128}" height="124" rx="26" fill="#fff" fill-opacity="0.14"/>`;
  s += T(96, ft + 56, todayCount ? `Bugun +${todayCount} ta yangi e'lon` : "Kanalda yangi e'lonlar", { size: 34, w: 800, fill: "#fff" }) + T(96, ft + 94, "Hammasi kanalda va ilovada", { size: 24, w: 500, fill: "#dbe8ff" });
  s += `<rect x="${Wt - 96 - 190}" y="${ft + 27}" width="190" height="70" rx="20" fill="#ffd34d"/>${T(Wt - 96 - 95, ft + 72, "Ko'rish →", { size: 28, w: 800, fill: C.ink, a: "middle" })}`;
  const base = await sharp(Buffer.from(`<svg width="${Wt}" height="${Ht}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`)).png().toBuffer();
  const mask = Buffer.from(`<svg width="250" height="180"><rect width="250" height="180" rx="18" fill="#fff"/></svg>`);
  const layers = [];
  for (const c of comps) {
    try {
      const ph = await sharp(items[c.i].photo).resize(250, 180, { fit: "cover" }).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
      layers.push({ input: ph, left: 80, top: c.y + 22 });
    } catch (e) { /* rasm buzuq bo'lsa — kulrang joy qoladi */ }
  }
  // o'rin belgilari rasm ustida tursin
  const medals = items.map((_, i) => { const y = top0 + i * (rowH + gap); return `<circle cx="98" cy="${y + 40}" r="31" fill="${medal[i] || medal[2]}" stroke="#fff" stroke-width="4"/>${T(98, y + 51, i + 1, { size: 30, w: 800, fill: "#fff", a: "middle" })}`; }).join("");
  layers.push({ input: Buffer.from(`<svg width="${Wt}" height="${Ht}" xmlns="http://www.w3.org/2000/svg">${medals}</svg>`), left: 0, top: 0 });
  return sharp(base).composite(layers).jpeg({ quality: 90 }).toBuffer();
}

module.exports = { createCharts, brandStripSvg, priceBadgeSvg, renderTop3 };
