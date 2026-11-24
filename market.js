// =====================================================================
// 📊 BOZOR NARXI — bitta markaziy hisob (kanal belgisi, rasm lentasi, ilova kartalari,
// e'lon sahifasidagi shkala, «Narxni aniqlash» va admin tekshiruvi hammasi shundan foydalanadi)
//
// Qoidalar:
//  • Solishtiriladi: shu model, shu karobka guruhi (avtomat / mexanika), yili yaqin e'lonlar.
//    Yetarli bo'lmasa — pog'onama-pog'ona kengaytiriladi (±1 yil → ±2 yil → boshqa karobka → ±3 yil).
//  • Faol e'lonlar + oxirgi 120 kunda «sotildi» bo'lganlar. E'lonning o'zi hisobga kirmaydi.
//  • Har bir narx maqsad yiliga keltiriladi (yillik qadrsizlanish shu modelning o'z narxlaridan topiladi)
//    va boshqa karobka bo'lsa — karobka farqiga tuzatiladi.
//  • O'rtacha emas — MEDIANA; g'alati narxlar (IQR) tashlab yuboriladi.
//  • 5 tadan kam o'xshash e'lon bo'lsa — natija «taxminiy» (confident: false): kanalda foiz yozilmaydi.
// =====================================================================
const MIN_PRICE = 300, MAX_PRICE = 500000;
const CACHE_MS = 10 * 60 * 1000;

function transGroup(t) {
  const s = String(t || "").toLowerCase();
  if (!s) return null;
  if (/mex|mech|меха|руч/.test(s)) return "M";
  if (/avto|auto|авто|robot|робот|variator|вариатор|cvt|dsg|tiptronic|tiptronik|amt|dct/.test(s)) return "A";
  return null;
}
const TRANS_LABEL = { A: "Avtomat", M: "Mexanika" };

function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function quantile(s, q) { // s — saralangan
  if (!s.length) return 0;
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
const priceNum = (v) => parseInt(String(v == null ? "" : v).replace(/\D/g, ""), 10) || 0;
const yearNum = (v) => { const y = parseInt(v, 10); return y > 1950 && y < 2100 ? y : 0; };

function createMarket({ db, catalog }) {
  const cache = new Map(); // modelKey -> { t, rows, rate, transRatio }

  // Shu modelning yillik qadrsizlanishi (log-chiziqli regressiya), 2%..15% oralig'ida; ma'lumot kam bo'lsa 7%
  function depreciation(rows) {
    const pts = rows.filter((r) => r.y && r.p);
    if (pts.length < 8 || new Set(pts.map((r) => r.y)).size < 3) return 0.07;
    const n = pts.length, mx = pts.reduce((a, r) => a + r.y, 0) / n, my = pts.reduce((a, r) => a + Math.log(r.p), 0) / n;
    let num = 0, den = 0;
    for (const r of pts) { num += (r.y - mx) * (Math.log(r.p) - my); den += (r.y - mx) ** 2; }
    if (!den) return 0.07;
    const r = Math.exp(num / den) - 1; // yangi yil qanchaga qimmat
    return Math.min(0.15, Math.max(0.02, r));
  }
  // Avtomat / mexanika narx nisbati (bir xil yilga keltirilgandan keyin), 1.00..1.35; ma'lumot kam bo'lsa 1.12
  function transRatio(rows, rate) {
    const norm = (r) => r.p * Math.pow(1 + rate, 2020 - r.y);
    const A = rows.filter((r) => r.g === "A" && r.y).map(norm), M = rows.filter((r) => r.g === "M" && r.y).map(norm);
    if (A.length < 3 || M.length < 3) return 1.12;
    return Math.min(1.35, Math.max(1.0, median(A) / median(M)));
  }

  async function modelRows(modelId, modelName) {
    const key = modelId ? `id:${modelId}` : `n:${String(modelName || "").toLowerCase()}`;
    const c = cache.get(key);
    if (c && Date.now() - c.t < CACHE_MS) return c;
    const f = catalog.modelFilter(modelId, modelName);
    const [raw] = await db.execute(
      `SELECT id, year, price, transmission, phone, status FROM ads WHERE ${f.sql} AND (status = 'active' OR (status = 'sold' AND created_at >= NOW() - INTERVAL 120 DAY))`,
      f.params
    );
    // Takrorlar (bir xil raqam + yil + narx) bitta hisoblanadi
    const seen = new Set(), rows = [];
    for (const r of raw) {
      const p = priceNum(r.price), y = yearNum(r.year);
      if (p < MIN_PRICE || p > MAX_PRICE || !y) continue;
      const k = `${String(r.phone || "").slice(-9)}|${y}|${p}`;
      if (r.phone && seen.has(k)) continue;
      seen.add(k);
      rows.push({ id: Number(r.id), y, p, g: transGroup(r.transmission) });
    }
    const rate = depreciation(rows);
    const out = { t: Date.now(), rows, rate, ratio: transRatio(rows, rate) };
    cache.set(key, out);
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return out;
  }

  // Asosiy funksiya. Natija: { ok, median, low, high, min, max, count, confident, years:[a,b], trans, label }
  async function marketPrice({ modelId, model, year, transmission, excludeId }) {
    const y = yearNum(year);
    if (!y || (!modelId && !model)) return { ok: false };
    const M = await modelRows(modelId, model);
    const g = transGroup(transmission);
    const pool = M.rows.filter((r) => r.id !== Number(excludeId));
    const adj = (r) => {
      let p = r.p * Math.pow(1 + M.rate, y - r.y);
      if (g && r.g && r.g !== g) p = g === "A" ? p * M.ratio : p / M.ratio;
      return p;
    };
    const tiers = g
      ? [{ dy: 1, same: true }, { dy: 2, same: true }, { dy: 2, same: false }, { dy: 3, same: false }]
      : [{ dy: 1, same: false }, { dy: 2, same: false }, { dy: 3, same: false }];
    let pick = null, tier = null;
    for (const t of tiers) {
      const set = pool.filter((r) => Math.abs(r.y - y) <= t.dy && (!t.same || r.g === g));
      if (set.length >= 5) { pick = set; tier = t; break; }
      if (!pick || set.length > pick.length) { pick = set; tier = t; }
    }
    if (!pick || pick.length < 3) return { ok: false, count: pick ? pick.length : 0 };
    let prices = pick.map(adj).sort((a, b) => a - b);
    if (prices.length >= 5) { // IQR bo'yicha g'alati narxlarni olib tashlaymiz
      const q1 = quantile(prices, 0.25), q3 = quantile(prices, 0.75), k = (q3 - q1) * 1.5;
      const kept = prices.filter((p) => p >= q1 - k && p <= q3 + k);
      if (kept.length >= 3) prices = kept;
    }
    const med = median(prices);
    const kept = prices.filter((p) => p >= med * 0.5 && p <= med * 2);
    if (kept.length >= 3) prices = kept;
    const r100 = (v) => Math.round(v / 100) * 100;
    const yrs = pick.map((r) => r.y);
    const sameOnly = tier.same && g;
    return {
      ok: true,
      median: r100(median(prices)),
      low: r100(quantile(prices, 0.25)), high: r100(quantile(prices, 0.75)),
      min: r100(prices[0]), max: r100(prices[prices.length - 1]),
      count: prices.length,
      confident: prices.length >= 5,
      years: [Math.min(...yrs), Math.max(...yrs)],
      trans: sameOnly ? TRANS_LABEL[g] : null,
      label: `${prices.length} ta o'xshash e'lon · ${Math.min(...yrs) === Math.max(...yrs) ? Math.min(...yrs) : `${Math.min(...yrs)}–${Math.max(...yrs)}`}${sameOnly ? ` · ${TRANS_LABEL[g]}` : ""}`,
    };
  }

  // E'lon uchun: farq foizi va belgi turi. kind: "cheap" | "market" | "high" | null
  async function compareAd(ad) {
    const price = priceNum(ad.price);
    if (!price) return null;
    let modelId = ad.model_id, model = ad.model;
    if (!modelId && ad.carDetails) {
      try { modelId = catalog.matchCarDetails(ad.carDetails).modelId; } catch (e) {}
      if (!model) { const parts = String(ad.carDetails).trim().split(" "); model = parts.length > 1 ? parts.slice(1).join(" ") : ad.carDetails; }
    }
    const m = await marketPrice({ modelId, model, year: ad.year, transmission: ad.transmission, excludeId: ad.id });
    if (!m.ok) return null;
    const diff = Math.round(((price - m.median) / m.median) * 100);
    const kind = diff <= -5 ? "cheap" : diff < 10 ? "market" : "high";
    return { ...m, diff, kind };
  }

  // Hisobotlar uchun: shu modelning yillik qadrsizlanishi va avtomat/mexanika nisbati
  async function modelInfo(modelId, model) {
    const M = await modelRows(modelId, model);
    return { rate: M.rate, ratio: M.ratio, count: M.rows.length };
  }
  function clear() { cache.clear(); }
  return { marketPrice, compareAd, transGroup, modelInfo, clear };
}

module.exports = { createMarket, transGroup, median };
