// ==============================================================
// 📱 MINI APP SERVERI — botdagi barcha foydalanuvchi bo'limlari
// --------------------------------------------------------------
// Qo'shimcha paket kerak emas: Node.js ichki modullari + loyihadagi axios va sharp.
// Bot bilan bitta jarayonda ishlaydi, bitta bazadan va bitta qoidalar to'plamidan
// foydalanadi: har bir amal (e'lon berish, sotildi, narx, tahrir, VIP, UP, diler...)
// index.js dagi umumiy funksiyani chaqiradi — bot ham aynan shu funksiyani chaqiradi.
//
// Bo'limlar:
//   Bozor (qidiruv)       GET  /api/ads, GET /api/ads/:id
//   E'lon berish          POST /api/upload, POST /api/ads
//   Mening e'lonlarim     GET  /api/my/ads, GET /api/my/ads/:id
//                         POST /api/my/ads/:id/{sold,price,edit,vip,up}
//   Saqlanganlar          GET  /api/favorites, POST /api/favorites/:id
//   Obunalar              GET/POST /api/alerts, DELETE /api/alerts/:id
//   Xizmatlar             POST /api/evaluate, GET /api/referral, POST /api/dealer,
//                         GET/POST /api/salon-ad
//   Rasmlar               GET  /api/photo/:adId/:idx  (imzolangan havola, bot tokeni oshkor qilinmaydi)
//
// Xavfsizlik: har bir so'rovda Telegram yuborgan initData bot tokeni bilan tekshiriladi.
// ==============================================================
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

let axios = null, sharp = null;
try { axios = require("axios"); } catch (e) {}
try { sharp = require("sharp"); } catch (e) {}

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;   // 10 MB (forma rasmlarni oldindan kichraytiradi)
const MAX_VIDEO_BYTES = 49 * 1024 * 1024;   // Telegram Bot API yuklash chegarasi ~50 MB
const MAX_JSON_BYTES = 64 * 1024;
const UPLOAD_TTL_MS = 3 * 60 * 60 * 1000;   // yuklangan fayl 3 soat ichida ishlatilishi kerak
const UPLOADS_PER_WINDOW = 30;              // bitta foydalanuvchi 30 daqiqada eng ko'pi 30 ta fayl
const UPLOAD_WINDOW_MS = 30 * 60 * 1000;
const PAGE_SIZE = 20;
const PHOTO_CACHE_MAX = 400;
const STATIC_FILES = { "/": "index.html", "/index.html": "index.html", "/app.js": "app.js", "/app.css": "app.css" };
const STATIC_TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

// Telegram initData imzosini tekshiradi. To'g'ri bo'lsa foydalanuvchi obyektini qaytaradi.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
function validateInitData(initData, botToken, maxAgeSec = 24 * 60 * 60) {
  if (!initData || !botToken) return null;
  let params;
  try { params = new URLSearchParams(initData); } catch (e) { return null; }
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;

  const pairs = [];
  for (const [k, v] of params.entries()) if (k !== "hash") pairs.push([k, v]);
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calc = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(calc, "hex"), Buffer.from(hash.toLowerCase(), "hex"))) return null;

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;

  try {
    const user = JSON.parse(params.get("user") || "null");
    return user && user.id ? user : null;
  } catch (e) {
    return null;
  }
}

function stripHtml(s) {
  return String(s || "").replace(/<[^>]+>/g, "").replace(/^[❗️❌⏳✅🚫]+\s*/u, "").trim();
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

// So'rov tanasini chegaralangan hajmda o'qiydi
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > limit) { reject(Object.assign(new Error("Fayl juda katta"), { status: 413 })); req.resume(); return; }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("Fayl juda katta"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req, MAX_JSON_BYTES);
  if (!buf.length) return {};
  return JSON.parse(buf.toString("utf8"));
}

const int = (v, def = null) => { const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10); return Number.isFinite(n) ? n : def; };

function startWebApp(deps) {
  const {
    bot, db, catalog, InputFile, mainMenu,
    ADMIN_ID, LOG_CHANNEL_ID, WEBAPP_URL,
    checkCanPostAd, submitNewAdToAdmin, sanitizeText, normalizePhone, parseAdPrice,
    requestSoldToAdmin, changeAdPrice, submitAdEditToAdmin, submitVipRequest, useFreeUp,
    estimateCarPrice, submitDealerApplication, getSalonAdStatus, submitSalonAd, getReferralInfo,
    VIP_PRICE, VIP_CARD, VIP_CARD_NAME,
  } = deps;

  const PORT = Number(process.env.PORT) || 3000;
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const STATIC_DIR = path.join(__dirname, "webapp");
  const CHANNEL_URL = "https://t.me/engarzonidamoshina";
  const PHOTO_KEY = crypto.createHmac("sha256", "photo-links").update(String(BOT_TOKEN)).digest();

  const uploads = new Map();        // token -> { userId, kind, fileId, createdAt }
  const uploadCounters = new Map(); // userId -> [timestamps]
  const busy = new Set();           // bir vaqtda ikki marta yuborilmasligi uchun: "userId:amal"
  const photoCache = new Map();     // "adId:idx:w" -> Buffer (eng eskisi birinchi o'chiriladi)

  setInterval(() => {
    const now = Date.now();
    for (const [token, u] of uploads) if (now - u.createdAt > UPLOAD_TTL_MS) uploads.delete(token);
    for (const [uid, list] of uploadCounters) {
      const fresh = list.filter(t => now - t < UPLOAD_WINDOW_MS);
      if (fresh.length) uploadCounters.set(uid, fresh); else uploadCounters.delete(uid);
    }
  }, 10 * 60 * 1000).unref();

  // ---------- Yordamchilar ----------
  const photoSig = (adId) => crypto.createHmac("sha256", PHOTO_KEY).update(String(adId)).digest("hex").slice(0, 16);
  const photoUrl = (adId, idx, w) => `/api/photo/${adId}/${idx}?w=${w}&s=${photoSig(adId)}`;
  const photoList = (ad) => String(ad.photoId || "").split(",").filter(Boolean);
  const channelLink = (ad) => (ad.channelMsgId ? `${CHANNEL_URL}/${ad.channelMsgId}` : null);
  const digits = (s) => String(s ?? "").replace(/\D/g, "");

  async function once(key, fn) {
    if (busy.has(key)) return { ok: false, error: "Amal bajarilmoqda, biroz kuting..." };
    busy.add(key);
    try { return await fn(); } finally { busy.delete(key); }
  }

  function takeUpload(token, userId, kind) {
    const u = uploads.get(String(token || ""));
    if (!u || u.userId !== userId || (kind && u.kind !== kind)) return null;
    return u;
  }

  // Bozor narxiga solishtirish (kanaldagi belgi bilan bir xil qoida: shu model, ±2 yil, kamida 3 ta)
  async function priceBadges(items) {
    const modelIds = [...new Set(items.map(a => a.model_id).filter(Boolean))];
    const out = new Map();
    if (!modelIds.length) return out;
    const [rows] = await db.execute(
      `SELECT model_id, year, price FROM ads WHERE status = 'active' AND model_id IN (${modelIds.map(() => "?").join(",")}) AND CAST(price AS UNSIGNED) BETWEEN 300 AND 500000`,
      modelIds
    );
    for (const ad of items) {
      if (!ad.model_id) continue;
      const y = int(ad.year, 0);
      const same = rows.filter(r => r.model_id === ad.model_id && Math.abs(int(r.year, 0) - y) <= 2).map(r => int(r.price, 0));
      if (same.length < 3) continue;
      const avg = same.reduce((a, b) => a + b, 0) / same.length;
      const diff = Math.round(((int(ad.price, 0) - avg) / avg) * 100);
      if (diff <= -5) out.set(ad.id, { type: "cheap", pct: Math.abs(diff), text: `Bozordan ${Math.abs(diff)}% arzon` });
      else if (diff < 10) out.set(ad.id, { type: "market", text: "Bozor narxida" });
    }
    return out;
  }

  async function favoriteSet(userId, ids) {
    if (!ids.length) return new Set();
    const [rows] = await db.execute(`SELECT adId FROM favorites WHERE userId = ? AND adId IN (${ids.map(() => "?").join(",")})`, [userId, ...ids]);
    return new Set(rows.map(r => Number(r.adId)));
  }

  function card(ad, badges, favs) {
    const photos = photoList(ad);
    return {
      id: ad.id, title: ad.carDetails, price: digits(ad.price), year: String(ad.year || ""),
      probeg: ad.probeg, region: ad.region, trans: ad.transmission, fuel: ad.fuel,
      photo: photos.length ? photoUrl(ad.id, 0, 480) : null, photosCount: photos.length,
      badge: badges ? badges.get(ad.id) || null : null,
      isFav: favs ? favs.has(Number(ad.id)) : false,
      hasNasiya: !!(ad.nasiya && ad.nasiya !== "Yo'q"),
      status: ad.status, soldPrice: ad.sold_price ? digits(ad.sold_price) : null,
      createdAt: ad.created_at, channelUrl: channelLink(ad),
    };
  }

  // ---------- Bozor: qidiruv ----------
  async function handleSearch(req, res, user, url) {
    const q = url.searchParams;
    const where = ["status = 'active'"];
    const params = [];
    const brandId = int(q.get("brandId"));
    const modelId = int(q.get("modelId"));
    let modelName = null;

    if (modelId) {
      const m = catalog.modelById(modelId);
      if (m) {
        modelName = m.name;
        const f = catalog.modelFilter(m.id, m.name);
        where.push(f.sql); params.push(...f.params);
      }
    } else if (brandId) {
      const b = catalog.brandById(brandId);
      if (b) { where.push("(brand_id = ? OR (brand_id IS NULL AND carDetails LIKE ?))"); params.push(b.id, `${b.name}%`); }
    }
    const text = sanitizeText(q.get("q"), 60);
    if (text) { where.push("carDetails LIKE ?"); params.push(`%${text}%`); }
    const minPrice = int(q.get("minPrice")), maxPrice = int(q.get("maxPrice"));
    if (minPrice) { where.push("CAST(price AS UNSIGNED) >= ?"); params.push(minPrice); }
    if (maxPrice) { where.push("CAST(price AS UNSIGNED) <= ?"); params.push(maxPrice); }
    const yearFrom = int(q.get("yearFrom")), yearTo = int(q.get("yearTo"));
    if (yearFrom) { where.push("CAST(year AS UNSIGNED) >= ?"); params.push(yearFrom); }
    if (yearTo) { where.push("CAST(year AS UNSIGNED) <= ?"); params.push(yearTo); }
    const opts = catalog.AD_OPTIONS;
    const region = q.get("region"); if (region && opts.regions.includes(region)) { where.push("region = ?"); params.push(region); }
    const trans = q.get("trans"); if (trans && opts.transmissions.includes(trans)) { where.push("transmission = ?"); params.push(trans); }
    const fuel = q.get("fuel"); if (fuel && opts.fuels.includes(fuel)) { where.push("fuel = ?"); params.push(fuel); }
    if (q.get("nasiya") === "1") where.push("nasiya IS NOT NULL AND nasiya <> 'Yo''q'");

    const sorts = { new: "created_at DESC, id DESC", price_asc: "CAST(price AS UNSIGNED) ASC, id DESC", price_desc: "CAST(price AS UNSIGNED) DESC, id DESC" };
    const order = sorts[q.get("sort")] || sorts.new;
    const page = Math.max(1, int(q.get("page"), 1));
    const whereSql = where.join(" AND ");

    const [[cnt]] = await db.execute(`SELECT COUNT(*) AS total FROM ads WHERE ${whereSql}`, params);
    const [rows] = await db.execute(
      `SELECT id, carDetails, brand_id, model_id, price, year, probeg, region, transmission, fuel, photoId, nasiya, status, sold_price, created_at, channelMsgId FROM ads WHERE ${whereSql} ORDER BY ${order} LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      params
    );
    const [badges, favs] = await Promise.all([priceBadges(rows), favoriteSet(user.id, rows.map(r => Number(r.id)))]);

    // Qidiruv statistikasi (botdagi kabi): model tanlangan bo'lsa, faqat 1-sahifada
    if (modelId && page === 1 && modelName) {
      db.execute("INSERT INTO search_logs (query, model_id) VALUES (?, ?)", [modelName.toLowerCase(), modelId]).catch(() => {});
    }
    sendJson(res, 200, {
      ok: true, total: Number(cnt.total), page, pages: Math.max(1, Math.ceil(Number(cnt.total) / PAGE_SIZE)),
      items: rows.map(r => card(r, badges, favs)),
    });
  }

  // ---------- Bozor: bitta e'lon ----------
  async function handleAdDetail(req, res, user, adId) {
    const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
    const ad = rows[0];
    const isOwner = ad && (Number(ad.userId) === user.id || user.id === ADMIN_ID);
    if (!ad || (!["active", "sold"].includes(ad.status) && !isOwner)) return sendJson(res, 404, { ok: false, error: "E'lon topilmadi yoki o'chirilgan." });

    const [[dealer]] = await db.execute("SELECT is_dealer, dealer_name, dealer_paused FROM users WHERE id = ?", [ad.userId]);
    const [[saves]] = await db.execute("SELECT COUNT(*) AS cnt FROM favorites WHERE adId = ?", [ad.id]);
    const [badges, favs] = await Promise.all([priceBadges([ad]), favoriteSet(user.id, [Number(ad.id)])]);
    const photos = photoList(ad);
    sendJson(res, 200, {
      ok: true,
      ad: {
        ...card(ad, badges, favs),
        paint: ad.paint, color: ad.color, phone: ad.phone,
        history: ad.history && ad.history !== "Ko'rsatilmagan" ? ad.history : null,
        barter: ad.barter && ad.barter !== "Yo'q" ? ad.barter : null,
        nasiya: ad.nasiya && ad.nasiya !== "Yo'q" ? ad.nasiya : null,
        dealerOffer: ad.dealer_offer || null,
        photos: photos.map((_, i) => photoUrl(ad.id, i, 1080)),
        thumbs: photos.map((_, i) => photoUrl(ad.id, i, 480)),
        hasVideo: !!ad.videoId,
        dealer: dealer && dealer.is_dealer === 1 && dealer.dealer_paused !== 1 ? dealer.dealer_name : null,
        saves: Number(saves.cnt), isOwner: !!isOwner,
      },
    });
  }

  // ---------- Rasm proksi (bot tokeni brauzerga chiqmaydi) ----------
  async function handlePhoto(req, res, adId, idx, url) {
    if (url.searchParams.get("s") !== photoSig(adId)) { res.writeHead(403); return res.end(); }
    const w = [240, 480, 1080].includes(int(url.searchParams.get("w"))) ? int(url.searchParams.get("w")) : 480;
    const key = `${adId}:${idx}:${w}`;
    let buf = photoCache.get(key);
    if (!buf) {
      const [rows] = await db.execute("SELECT photoId FROM ads WHERE id = ?", [adId]);
      const fileId = rows[0] ? photoList(rows[0])[idx] : null;
      if (!fileId || !axios) { res.writeHead(404); return res.end(); }
      const file = await bot.api.getFile(fileId);
      const resp = await axios.get(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`, { responseType: "arraybuffer", timeout: 15000 });
      buf = Buffer.from(resp.data);
      if (sharp) {
        try { buf = await sharp(buf).rotate().resize({ width: w, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer(); } catch (e) {}
      }
      photoCache.set(key, buf);
      if (photoCache.size > PHOTO_CACHE_MAX) photoCache.delete(photoCache.keys().next().value);
    }
    res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400", "Content-Length": buf.length });
    res.end(buf);
  }

  // ---------- Foydalanuvchi holati ----------
  async function handleMe(req, res, user) {
    await db.execute("INSERT IGNORE INTO users (id, first_name, username) VALUES (?, ?, ?)", [
      user.id, String(user.first_name || "").slice(0, 255), user.username ? `@${user.username}` : "",
    ]).catch(() => {});

    let subscribed = user.id === ADMIN_ID;
    if (!subscribed) {
      try {
        const member = await bot.api.getChatMember(deps.CHANNEL_ID, user.id);
        subscribed = ["creator", "administrator", "member"].includes(member.status);
      } catch (e) {}
    }
    const check = subscribed ? await checkCanPostAd(user.id) : { ok: false, code: "not_subscribed", message: "Kanalimizga obuna bo'ling." };
    const [[u]] = await db.execute("SELECT is_dealer, dealer_paused, dealer_name, dealer_phone, free_ups FROM users WHERE id = ?", [user.id]);
    const [lastRows] = await db.execute("SELECT phone FROM ads WHERE userId = ? ORDER BY id DESC LIMIT 1", [user.id]);
    sendJson(res, 200, {
      ok: true,
      user: { id: user.id, first_name: user.first_name || "" },
      subscribed,
      canPost: check.ok,
      code: check.code || null,
      message: check.ok ? null : stripHtml(check.message),
      isDealer: !!(u && u.is_dealer === 1 && u.dealer_paused !== 1),
      dealerName: u?.dealer_name || null,
      dealerPhone: u?.dealer_phone || null,
      dealerPending: !!(u && u.is_dealer !== 1 && u.dealer_name),
      freeUps: u?.free_ups || 0,
      lastPhone: lastRows[0]?.phone || null,
      channelUrl: CHANNEL_URL,
      vip: { price: VIP_PRICE, card: VIP_CARD, cardName: VIP_CARD_NAME },
    });
  }

  // ---------- Fayl yuklash: POST /api/upload?kind=photo|video ----------
  async function handleUpload(req, res, user, url) {
    const kind = url.searchParams.get("kind") === "video" ? "video" : "photo";
    const type = String(req.headers["content-type"] || "");
    if (kind === "photo" && !/^image\//.test(type)) return sendJson(res, 400, { ok: false, error: "Faqat rasm yuklash mumkin." });
    if (kind === "video" && !/^video\//.test(type)) return sendJson(res, 400, { ok: false, error: "Faqat video yuklash mumkin." });

    const now = Date.now();
    const recent = (uploadCounters.get(user.id) || []).filter(t => now - t < UPLOAD_WINDOW_MS);
    if (recent.length >= UPLOADS_PER_WINDOW) return sendJson(res, 429, { ok: false, error: "Juda ko'p fayl yuklandi. Birozdan keyin urinib ko'ring." });

    let buf;
    try {
      buf = await readBody(req, kind === "video" ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES);
    } catch (e) {
      return sendJson(res, e.status || 400, { ok: false, error: kind === "video" ? "Video 49 MB dan katta bo'lmasin." : "Rasm juda katta." });
    }
    if (!buf.length) return sendJson(res, 400, { ok: false, error: "Fayl bo'sh." });
    recent.push(now);
    uploadCounters.set(user.id, recent);

    // Telegram'ga yuklab file_id olamiz, keyin log-kanaldagi xabarni o'chiramiz (file_id o'chmaydi)
    let msg;
    try {
      if (kind === "photo") {
        msg = await bot.api.sendPhoto(LOG_CHANNEL_ID, new InputFile(buf, "photo.jpg"), { disable_notification: true });
      } else {
        const ext = type.includes("quicktime") ? "mov" : "mp4";
        msg = await bot.api.sendVideo(LOG_CHANNEL_ID, new InputFile(buf, `video.${ext}`), { disable_notification: true, supports_streaming: true });
      }
    } catch (e) {
      console.error("Mini App: faylni Telegram'ga yuklashda xato:", e.message);
      return sendJson(res, 502, { ok: false, error: "Faylni yuklab bo'lmadi. Qayta urinib ko'ring." });
    }
    const fileId = kind === "photo" ? msg.photo?.[msg.photo.length - 1]?.file_id : (msg.video?.file_id || msg.document?.file_id);
    bot.api.deleteMessage(LOG_CHANNEL_ID, msg.message_id).catch(() => {});
    if (!fileId) return sendJson(res, 502, { ok: false, error: "Faylni qayta ishlab bo'lmadi." });

    const token = crypto.randomBytes(16).toString("hex");
    uploads.set(token, { userId: user.id, kind, fileId, createdAt: now });
    sendJson(res, 200, { ok: true, token, kind });
  }

  // Formadan kelgan ma'lumotni botdagi bilan bir xil "ad" obyektiga aylantiradi.
  // existing — tahrirlanayotgan e'lon (rasmlar "old:0" kabi eski rasmga ishora qilishi mumkin)
  function buildAd(body, user, isDealer, existing = null) {
    const opts = catalog.AD_OPTIONS;
    const err = (m) => ({ error: m });
    const ad = { urgent: !!body.urgent };

    const brandId = Number(body.brandId);
    if (brandId > 0) {
      const brand = catalog.brandById(brandId);
      if (!brand) return err("Marka topilmadi. Sahifani yangilang.");
      ad.brand = brand.name;
      ad.brand_id = brand.id;
      const modelId = Number(body.modelId);
      if (modelId > 0) {
        const model = catalog.modelById(modelId);
        if (!model || model.brandId !== brand.id) return err("Model topilmadi. Qaytadan tanlang.");
        ad.model = model.name;
        ad.model_id = model.id;
      } else {
        const text = sanitizeText(body.modelText, 60);
        if (text.length < 1) return err("Modelni tanlang yoki yozing.");
        const found = catalog.findModel(brand.id, text);
        ad.model = found ? found.name : text;
        ad.model_id = found ? found.id : null;
      }
    } else {
      const text = sanitizeText(body.fullName, 60);
      if (text.length < 2) return err("Moshina markasi va modelini yozing (masalan: Changan UNI-K).");
      ad.brand = "Boshqa";
      ad.model = text;
      ad.brand_id = null;
      ad.model_id = null; // umumiy funksiya to'liq nomdan aniqlashga harakat qiladi
    }

    const year = parseInt(body.year, 10);
    const maxYear = new Date().getFullYear() + 1;
    if (!year || year < 1985 || year > maxYear) return err("Yilini to'g'ri tanlang.");
    ad.year = String(year);

    if (body.salon) {
      ad.probeg = "Salon";
    } else {
      const km = parseInt(String(body.probeg || "").replace(/\D/g, ""), 10);
      if (isNaN(km) || km < 0 || km > 3000000) return err("Probegni km da kiriting (masalan: 35000) yoki «Salon» ni belgilang.");
      ad.probeg = String(km);
    }

    if (!opts.paints.includes(body.paint)) return err("Kraska holatini tanlang.");
    ad.paint = body.paint;
    const color = opts.colors.includes(body.color) ? body.color : sanitizeText(body.color, 30);
    if (!color) return err("Rangini tanlang yoki yozing.");
    ad.color = color;
    if (!opts.transmissions.includes(body.trans)) return err("Korobka turini tanlang.");
    ad.trans = body.trans;
    if (!opts.fuels.includes(body.fuel)) return err("Yoqilg'i turini tanlang.");
    ad.fuel = body.fuel;

    const price = parseAdPrice(body.price);
    if (price.error) return err(stripHtml(price.error));
    ad.price = price.value;

    const phone = normalizePhone(body.phone);
    if (!phone) return err("Telefon raqamni to'g'ri kiriting (masalan: 90 123 45 67).");
    ad.phone = phone;

    if (!opts.regions.includes(body.region)) return err("Viloyatni tanlang.");
    ad.region = body.region;

    ad.history = sanitizeText(body.history, 400) || "Ko'rsatilmagan";
    ad.barter = sanitizeText(body.barter, 150) || "Yo'q";
    ad.nasiya = body.nasiya ? (sanitizeText(body.nasiyaTerms, 200) || "Bor (shartlari kelishiladi)") : "Yo'q";
    ad.dealer_offer = isDealer ? (sanitizeText(body.offer, 300) || null) : null;

    // Rasm va video: yangi yuklangan (token) yoki tahrirda eski ("old:<raqam>" / "old")
    const oldPhotos = existing ? photoList(existing) : [];
    const refs = Array.isArray(body.photos) ? body.photos.slice(0, 6) : [];
    if (refs.length === 0) return err("Kamida 1 ta rasm yuklang.");
    ad.photos = [];
    const usedTokens = [];
    for (const r of refs) {
      const s = String(r || "");
      if (s.startsWith("old:")) {
        const fid = oldPhotos[int(s.slice(4), -1)];
        if (!fid) return err("Eski rasmlardan biri topilmadi. Sahifani yangilang.");
        ad.photos.push(fid);
        continue;
      }
      const u = takeUpload(s, user.id, "photo");
      if (!u) return { error: "Rasmlardan biri eskirgan, qayta yuklanmoqda...", code: "upload_expired" };
      ad.photos.push(u.fileId);
      usedTokens.push(s);
    }
    ad.videoId = null;
    if (body.video === "old" && existing && existing.videoId) {
      ad.videoId = existing.videoId;
    } else if (body.video) {
      const u = takeUpload(body.video, user.id, "video");
      if (!u) return { error: "Video eskirgan, qayta yuklanmoqda...", code: "upload_expired" };
      ad.videoId = u.fileId;
      usedTokens.push(String(body.video));
    }
    return { ad, tokens: usedTokens };
  }

  function notifyUser(userId, html) {
    bot.api.sendMessage(userId, html, { parse_mode: "HTML", reply_markup: mainMenu }).catch(() => {});
  }
  function logLine(user, text) {
    const uname = user.username ? ` (@${user.username})` : "";
    bot.api.sendMessage(LOG_CHANNEL_ID, `📱 <b>Mini App:</b> <a href="tg://user?id=${user.id}">${sanitizeText(user.first_name, 64) || "User"}</a>${uname} ${text}`, { parse_mode: "HTML" }).catch(() => {});
  }

  // ---------- E'lon berish: POST /api/ads ----------
  async function handleSubmit(req, res, user) {
    const r = await once(`${user.id}:submit`, async () => {
      const body = await readJson(req);
      const check = await checkCanPostAd(user.id);
      if (!check.ok) return { status: 403, ok: false, code: check.code, error: stripHtml(check.message) };
      const built = buildAd(body, user, check.isDealer);
      if (built.error) return { status: 400, ok: false, error: built.error, code: built.code || null };
      const adId = await submitNewAdToAdmin({ ad: built.ad, userId: user.id, firstName: user.first_name, source: "miniapp" });
      built.tokens.forEach(t => uploads.delete(t));
      const carName = catalog.carName(built.ad.brand, built.ad.model);
      notifyUser(user.id, `✅ <b>E'loningiz adminga muvaffaqiyatli yuborildi!</b>\n\n🚗 ${carName}\n🆔 ID: ${adId}\n\nTekshiruvdan so'ng kanalga joylanadi.`);
      logLine(user, `e'lon yubordi — ${carName} (ID: ${adId})`);
      return { ok: true, adId };
    });
    sendJson(res, r.status || (r.ok ? 200 : 400), r);
  }

  // ---------- Mening e'lonlarim ----------
  async function handleMyAds(req, res, user) {
    const [rows] = await db.execute(
      "SELECT * FROM ads WHERE userId = ? AND status IN ('active', 'sold', 'pending') ORDER BY FIELD(status, 'pending', 'active', 'sold'), created_at DESC",
      [user.id]
    );
    const [[u]] = await db.execute("SELECT free_ups FROM users WHERE id = ?", [user.id]);
    const [editRows] = await db.execute("SELECT oldAdId FROM ad_edits WHERE userId = ?", [user.id]);
    const editing = new Set(editRows.map(e => Number(e.oldAdId)));
    const badges = await priceBadges(rows.filter(r => r.status === "active"));
    sendJson(res, 200, {
      ok: true, freeUps: u?.free_ups || 0,
      items: rows.map(r => ({ ...card(r, badges, null), editPending: editing.has(Number(r.id)) })),
    });
  }

  // Tahrirlash uchun e'lonning to'liq ma'lumoti (formani to'ldirish)
  async function handleMyAdGet(req, res, user, adId) {
    const [rows] = await db.execute("SELECT * FROM ads WHERE id = ? AND userId = ?", [adId, user.id]);
    const ad = rows[0];
    if (!ad) return sendJson(res, 404, { ok: false, error: "E'lon topilmadi." });
    const m = ad.model_id ? catalog.modelById(ad.model_id) : null;
    let brandId = 0, modelId = null, modelText = "", fullName = "";
    if (m) { brandId = m.brandId; modelId = m.id; }
    else if (ad.brand_id && catalog.brandById(ad.brand_id) && String(ad.carDetails).toLowerCase().startsWith(catalog.brandById(ad.brand_id).name.toLowerCase() + " ")) {
      brandId = ad.brand_id; modelText = String(ad.carDetails).slice(catalog.brandById(ad.brand_id).name.length + 1);
    } else { fullName = ad.carDetails; }
    const opts = catalog.AD_OPTIONS;
    sendJson(res, 200, {
      ok: true,
      ad: {
        id: ad.id, status: ad.status, brandId, modelId, modelText, customModel: !!modelText, fullName,
        year: String(ad.year || ""), salon: ad.probeg === "Salon", probeg: ad.probeg === "Salon" ? "" : digits(ad.probeg),
        paint: opts.paints.includes(ad.paint) ? ad.paint : "",
        color: opts.colors.includes(ad.color) ? ad.color : (ad.color ? "__other" : ""), colorCustom: opts.colors.includes(ad.color) ? "" : (ad.color || ""),
        trans: ad.transmission, fuel: ad.fuel, price: digits(ad.price), phone: String(ad.phone || "").replace(/^998/, ""),
        region: ad.region, history: ad.history && ad.history !== "Ko'rsatilmagan" ? ad.history : "",
        barter: ad.barter && ad.barter !== "Yo'q" ? ad.barter : "",
        nasiya: !!(ad.nasiya && ad.nasiya !== "Yo'q"), nasiyaTerms: ad.nasiya && !["Yo'q", "Bor (shartlari kelishiladi)"].includes(ad.nasiya) ? ad.nasiya : "",
        offer: ad.dealer_offer || "", urgent: false,
        photos: photoList(ad).map((_, i) => ({ ref: `old:${i}`, url: photoUrl(ad.id, i, 480) })),
        hasVideo: !!ad.videoId,
      },
    });
  }

  async function handleMyAdAction(req, res, user, adId, action) {
    const r = await once(`${user.id}:${action}:${adId}`, async () => {
      const body = await readJson(req);
      if (action === "sold") {
        const out = await requestSoldToAdmin({ adId, userId: user.id, firstName: user.first_name, soldPrice: digits(body.price) || null });
        if (out.ok) logLine(user, `«Sotildi» so'rovi yubordi (ID: ${adId}${out.soldPrice ? `, ${out.soldPrice}$` : ""})`);
        return out.ok ? { ok: true, soldPrice: out.soldPrice } : { ok: false, error: stripHtml(out.error) };
      }
      if (action === "price") {
        const out = await changeAdPrice({ adId, userId: user.id, newPrice: body.price });
        if (out.ok) logLine(user, `narxni o'zgartirdi (ID: ${adId}): ${out.oldPrice}$ → ${out.newPrice}$`);
        return out.ok ? { ok: true, newPrice: out.newPrice, dropped: out.dropped } : { ok: false, error: stripHtml(out.error) };
      }
      if (action === "edit") {
        const [rows] = await db.execute("SELECT * FROM ads WHERE id = ? AND userId = ?", [adId, user.id]);
        if (!rows[0] || rows[0].status !== "active") return { ok: false, error: "Faqat faol e'lonni tahrirlash mumkin." };
        const check = await checkCanPostAd(user.id).catch(() => ({}));
        const built = buildAd(body, user, !!check.isDealer, rows[0]);
        if (built.error) return { ok: false, error: built.error, code: built.code || null };
        const out = await submitAdEditToAdmin({ adId, ad: built.ad, userId: user.id, firstName: user.first_name, source: "miniapp" });
        if (!out.ok) return { ok: false, error: stripHtml(out.error) };
        built.tokens.forEach(t => uploads.delete(t));
        notifyUser(user.id, `✅ <b>Tahrirlangan e'lon adminga yuborildi!</b>\n\nTekshiruvdan so'ng kanaldagi e'lon yangilanadi.`);
        logLine(user, `e'lonni tahrirladi (ID: ${adId})`);
        return { ok: true, editId: out.editId };
      }
      if (action === "vip") {
        const u = takeUpload(body.token, user.id, "photo");
        if (!u) return { ok: false, error: "Chek rasmini qayta yuklang." };
        const out = await submitVipRequest({ adId, userId: user.id, firstName: user.first_name, username: user.username, screenshotFileId: u.fileId });
        if (!out.ok) return { ok: false, error: stripHtml(out.error) };
        uploads.delete(String(body.token));
        logLine(user, `VIP to'lov chekini yubordi (ID: ${adId})`);
        return { ok: true };
      }
      if (action === "up") {
        const out = await useFreeUp({ adId, userId: user.id });
        if (out.ok) logLine(user, `bepul UP ishlatdi (ID: ${adId})`);
        return out.ok ? { ok: true, freeUpsLeft: out.freeUpsLeft } : { ok: false, error: stripHtml(out.error) };
      }
      return { ok: false, error: "Noma'lum amal." };
    });
    sendJson(res, r.ok ? 200 : 400, r);
  }

  // ---------- Saqlanganlar ----------
  async function handleFavorites(req, res, user) {
    const [rows] = await db.execute(
      "SELECT a.* FROM favorites f JOIN ads a ON a.id = f.adId WHERE f.userId = ? AND a.status IN ('active', 'sold') ORDER BY f.created_at DESC",
      [user.id]
    );
    const badges = await priceBadges(rows.filter(r => r.status === "active"));
    const favs = new Set(rows.map(r => Number(r.id)));
    sendJson(res, 200, { ok: true, items: rows.map(r => card(r, badges, favs)) });
  }
  async function handleFavoriteToggle(req, res, user, adId) {
    const body = await readJson(req);
    if (body.on) {
      const [rows] = await db.execute("SELECT id FROM ads WHERE id = ? AND status = 'active'", [adId]);
      if (!rows[0]) return sendJson(res, 404, { ok: false, error: "E'lon faol emas." });
      await db.execute("INSERT IGNORE INTO favorites (userId, adId) VALUES (?, ?)", [user.id, adId]);
    } else {
      await db.execute("DELETE FROM favorites WHERE userId = ? AND adId = ?", [user.id, adId]);
    }
    sendJson(res, 200, { ok: true, isFav: !!body.on });
  }

  // ---------- Obunalar (qidiruv bo'yicha xabarnoma) ----------
  async function handleAlerts(req, res, user) {
    const [rows] = await db.execute("SELECT * FROM alerts WHERE userId = ? ORDER BY id DESC", [user.id]);
    sendJson(res, 200, {
      ok: true,
      items: rows.map(a => {
        const m = a.model_id ? catalog.modelById(a.model_id) : null;
        const title = m ? `${m.brandName} ${m.name}` : String(a.query || "").replace(/^./, c => c.toUpperCase());
        return { id: a.id, title, maxPrice: a.maxPrice, modelId: a.model_id || null };
      }),
    });
  }
  async function handleAlertCreate(req, res, user) {
    const body = await readJson(req);
    const m = int(body.modelId) ? catalog.modelById(int(body.modelId)) : null;
    const query = m ? m.name.toLowerCase() : sanitizeText(body.query, 60).toLowerCase();
    if (!query) return sendJson(res, 400, { ok: false, error: "Avval moshina modelini tanlang." });
    const maxPrice = Math.min(int(body.maxPrice, 999999) || 999999, 999999);
    const [[cnt]] = await db.execute("SELECT COUNT(*) AS c FROM alerts WHERE userId = ?", [user.id]);
    if (Number(cnt.c) >= 20) return sendJson(res, 400, { ok: false, error: "Ko'pi bilan 20 ta obuna bo'lishi mumkin. Keraksizlarini o'chiring." });
    await db.execute("INSERT INTO alerts (userId, query, maxPrice, model_id) VALUES (?, ?, ?, ?)", [user.id, query, maxPrice, m ? m.id : null]);
    sendJson(res, 200, { ok: true });
  }
  async function handleAlertDelete(req, res, user, alertId) {
    await db.execute("DELETE FROM alerts WHERE id = ? AND userId = ?", [alertId, user.id]);
    sendJson(res, 200, { ok: true });
  }

  // ---------- Xizmatlar ----------
  async function handleEvaluate(req, res, user) {
    const body = await readJson(req);
    let modelId = null, model = "", title = "";
    const m = int(body.modelId) ? catalog.modelById(int(body.modelId)) : null;
    if (m) { modelId = m.id; model = m.name; title = `${m.brandName} ${m.name}`; }
    else {
      const text = sanitizeText(body.text, 60);
      if (!text) return sendJson(res, 400, { ok: false, error: "Moshina modelini tanlang yoki yozing." });
      const hit = catalog.matchCarDetails(text);
      modelId = hit.modelId; model = text; title = text;
    }
    const year = int(body.year);
    if (!year) return sendJson(res, 400, { ok: false, error: "Yilini tanlang." });
    const out = await estimateCarPrice({ modelId, model, year });
    sendJson(res, 200, { ok: true, title, year, ...(out.ok ? { found: true, minPrice: out.minPrice, maxPrice: out.maxPrice, count: out.count } : { found: false }) });
  }

  async function handleDealer(req, res, user) {
    const r = await once(`${user.id}:dealer`, async () => {
      const body = await readJson(req);
      const out = await submitDealerApplication({ userId: user.id, firstName: user.first_name, username: user.username, name: body.name, phone: body.phone });
      if (out.ok) logLine(user, `avtosalon arizasi yubordi — ${out.dealerName}`);
      return out.ok ? { ok: true } : { ok: false, code: out.code || null, error: stripHtml(out.error) };
    });
    sendJson(res, r.ok ? 200 : 400, r);
  }

  async function handleSalonStatus(req, res, user) {
    const st = await getSalonAdStatus(user.id);
    sendJson(res, 200, { ok: true, allowed: st.ok, code: st.code, message: st.ok ? null : stripHtml(st.error), todayCount: st.todayCount, dealerName: st.dealerName, dealerPhone: st.dealerPhone });
  }
  async function handleSalonSubmit(req, res, user) {
    const r = await once(`${user.id}:salon`, async () => {
      const body = await readJson(req);
      const u = takeUpload(body.media, user.id, null);
      if (!u) return { ok: false, error: "Rasm yoki videoni qayta yuklang." };
      const out = await submitSalonAd({
        userId: user.id, adText: sanitizeText(body.text, 900), mediaType: u.kind, mediaId: u.fileId,
        location: sanitizeText(body.location, 200), phone: sanitizeText(body.phone, 100),
      });
      if (!out.ok) return { ok: false, code: out.code || null, error: stripHtml(out.error) };
      uploads.delete(String(body.media));
      notifyUser(user.id, "✅ <b>Reklamangiz adminga yuborildi!</b>\n\nTekshiruvdan so'ng kanalga joylanadi.");
      logLine(user, "salon reklamasi yubordi");
      return { ok: true };
    });
    sendJson(res, r.ok ? 200 : 400, r);
  }

  // ---------- Marshrutlar ----------
  const routes = [
    ["GET", /^\/api\/me$/, (q, s, u) => handleMe(q, s, u)],
    ["GET", /^\/api\/ads$/, (q, s, u, m, url) => handleSearch(q, s, u, url)],
    ["POST", /^\/api\/ads$/, (q, s, u) => handleSubmit(q, s, u)],
    ["GET", /^\/api\/ads\/(\d+)$/, (q, s, u, m) => handleAdDetail(q, s, u, int(m[1]))],
    ["POST", /^\/api\/upload$/, (q, s, u, m, url) => handleUpload(q, s, u, url)],
    ["GET", /^\/api\/my\/ads$/, (q, s, u) => handleMyAds(q, s, u)],
    ["GET", /^\/api\/my\/ads\/(\d+)$/, (q, s, u, m) => handleMyAdGet(q, s, u, int(m[1]))],
    ["POST", /^\/api\/my\/ads\/(\d+)\/(sold|price|edit|vip|up)$/, (q, s, u, m) => handleMyAdAction(q, s, u, int(m[1]), m[2])],
    ["GET", /^\/api\/favorites$/, (q, s, u) => handleFavorites(q, s, u)],
    ["POST", /^\/api\/favorites\/(\d+)$/, (q, s, u, m) => handleFavoriteToggle(q, s, u, int(m[1]))],
    ["GET", /^\/api\/alerts$/, (q, s, u) => handleAlerts(q, s, u)],
    ["POST", /^\/api\/alerts$/, (q, s, u) => handleAlertCreate(q, s, u)],
    ["DELETE", /^\/api\/alerts\/(\d+)$/, (q, s, u, m) => handleAlertDelete(q, s, u, int(m[1]))],
    ["POST", /^\/api\/evaluate$/, (q, s, u) => handleEvaluate(q, s, u)],
    ["GET", /^\/api\/referral$/, async (q, s, u) => sendJson(s, 200, await getReferralInfo(u.id))],
    ["POST", /^\/api\/dealer$/, (q, s, u) => handleDealer(q, s, u)],
    ["GET", /^\/api\/salon-ad$/, (q, s, u) => handleSalonStatus(q, s, u)],
    ["POST", /^\/api\/salon-ad$/, (q, s, u) => handleSalonSubmit(q, s, u)],
  ];

  const server = http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, "http://localhost"); } catch (e) { res.writeHead(400); return res.end(); }
    const p = url.pathname;

    try {
      if (req.method === "GET" && STATIC_FILES[p]) {
        const file = path.join(STATIC_DIR, STATIC_FILES[p]);
        const body = fs.readFileSync(file);
        res.writeHead(200, { "Content-Type": STATIC_TYPES[path.extname(file)], "Cache-Control": "no-cache" });
        return res.end(body);
      }
      if (req.method === "GET" && p === "/health") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("ok"); }
      if (req.method === "GET" && p === "/api/catalog") {
        const year = new Date().getFullYear();
        return sendJson(res, 200, { ok: true, brands: catalog.get().brands, options: catalog.AD_OPTIONS, years: { min: 1985, max: year + 1 } });
      }
      const pm = req.method === "GET" && p.match(/^\/api\/photo\/(\d+)\/(\d)$/);
      if (pm) return await handlePhoto(req, res, int(pm[1]), int(pm[2]), url);

      if (p.startsWith("/api/")) {
        const user = validateInitData(req.headers["x-telegram-init-data"], BOT_TOKEN);
        if (!user) return sendJson(res, 401, { ok: false, error: "Ilovani Telegram ichida, bot orqali oching." });
        for (const [method, re, handler] of routes) {
          const m = req.method === method && p.match(re);
          if (m) return await handler(req, res, user, m, url);
        }
      }
      sendJson(res, 404, { ok: false, error: "Topilmadi" });
    } catch (e) {
      if (e instanceof SyntaxError) return sendJson(res, 400, { ok: false, error: "Ma'lumot noto'g'ri yuborildi." });
      console.error("Mini App xatosi:", req.method, p, e);
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: "Serverda xatolik. Birozdan keyin qayta urinib ko'ring." });
    }
  });

  server.listen(PORT, () => {
    console.log(`📱 Mini App serveri ishga tushdi: port ${PORT}${WEBAPP_URL ? ` (${WEBAPP_URL})` : ""}`);
  });
  return server;
}

module.exports = { startWebApp, validateInitData };
