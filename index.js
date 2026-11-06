require("dotenv").config();
const { Bot, session, InlineKeyboard, Keyboard, InputFile } = require("grammy");
const { conversations, createConversation } = require("@grammyjs/conversations");
const db = require("./database"); // MySQL pool
const sharp = require("sharp");
const axios = require("axios");
const fs = require("fs");
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const path = require("path");
process.env.FONTCONFIG_PATH = path.join(__dirname, "fonts");
process.env.FONTCONFIG_FILE = path.join(__dirname, "fonts", "fonts.conf");
const bot = new Bot(process.env.BOT_TOKEN);

// 🚪 Global tugmalar, menyu matnlari va buyruqlar ro'yxati — «tugallanmagan suhbatdan chiqish» uchun
// (pastdagi bot.use(conversations()) yonidagi izohga qarang). Barcha handlerlar shu yerdan o'tib ro'yxatga tushadi.
const GLOBAL_CB_TRIGGERS = [];
const GLOBAL_MENU_TEXTS = new Set();
const GLOBAL_COMMANDS = new Set();
const ESCAPE_SKIP_CB = new Set(["ignore"]); // «⏳ Kutilmoqda» kabi — suhbatni yopmasin
{
  const origCommand = bot.command.bind(bot);
  bot.command = (cmd, ...mw) => {
    (Array.isArray(cmd) ? cmd : [cmd]).forEach((c) => { if (typeof c === "string") GLOBAL_COMMANDS.add(c.toLowerCase()); });
    return origCommand(cmd, ...mw);
  };
  const origCallbackQuery = bot.callbackQuery.bind(bot);
  bot.callbackQuery = (trigger, ...mw) => {
    (Array.isArray(trigger) ? trigger : [trigger]).forEach((t) => GLOBAL_CB_TRIGGERS.push(t));
    return origCallbackQuery(trigger, ...mw);
  };
  const origHears = bot.hears.bind(bot);
  bot.hears = (trigger, ...mw) => {
    (Array.isArray(trigger) ? trigger : [trigger]).forEach((t) => { if (typeof t === "string") GLOBAL_MENU_TEXTS.add(t); });
    return origHears(trigger, ...mw);
  };
}
function isGlobalAction(ctx) {
  const data = ctx.callbackQuery && ctx.callbackQuery.data;
  if (data) {
    if (ESCAPE_SKIP_CB.has(data)) return false;
    return GLOBAL_CB_TRIGGERS.some((t) => (typeof t === "string" ? t === data : t instanceof RegExp && new RegExp(t.source, t.flags.replace("g", "")).test(data)));
  }
  const text = ctx.message && ctx.message.text;
  if (!text) return false;
  // Faqat bot taniydigan buyruqlar (/start, /admin...). /cancel kabilarni suhbatning o'zi ushlaydi.
  const cmd = /^\/([a-z0-9_]+)(@\w+)?(\s|$)/i.exec(text);
  if (cmd) return GLOBAL_COMMANDS.has(cmd[1].toLowerCase());
  return GLOBAL_MENU_TEXTS.has(text.trim());
}
const ADMIN_ID = Number(process.env.ADMIN_ID);
// VIP xizmat sozlamalari (osongina o'zgartiring)
const VIP_PRICE = "25000"; // so'mda — faqat boshlang'ich qiymat; haqiqiy narx admin panelda: getPrice("vip")
const VIP_CARD = "9860 0466 2632 6469"; // O'z kartangizni yozing
const VIP_CARD_NAME = "Zuhriddin Mustafoyev"; // Karta egasi
const CHANNEL_ID = process.env.CHANNEL_ID.startsWith("@")
  ? process.env.CHANNEL_ID
  : `@${process.env.CHANNEL_ID}`;

// 🚗 Marka/model katalogi (bazada, ID lar bilan) — bot va Mini App uchun bitta
const catalog = require("./catalog");

// 📱 MINI APP manzili. Railway'da "Generate Domain" qilinsa avtomatik aniqlanadi,
// yoki Variables ga WEBAPP_URL=https://... deb qo'lda yozish mumkin.
const WEBAPP_URL = (process.env.WEBAPP_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "")
).replace(/\/+$/, "");

const collagesDir = path.join(__dirname, "collages");
if (!fs.existsSync(collagesDir)) {
  fs.mkdirSync(collagesDir, { recursive: true });
}

// БОТ ИШГА ТУШГАНДА ЖАДВАЛЛАРНИ АВТОМАТИК ЯРАТИШ
// (dbReady — bot faqat jadvallar va katalog tayyor bo'lgach ishga tushadi, faylning oxiriga qarang)
const dbReady = (async () => {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY,
        first_name VARCHAR(255),
        username VARCHAR(255),
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS alerts (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT,
        query VARCHAR(255),
        maxPrice INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS banned_users (
        userId BIGINT PRIMARY KEY,
        banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS channel_stats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        date DATE UNIQUE,
        main_count INT DEFAULT 0,
        second_count INT DEFAULT 0
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS channel_events (
        channel_id VARCHAR(50),
        date DATE,
        joined INT DEFAULT 0,
        left_count INT DEFAULT 0,
        PRIMARY KEY (channel_id, date)
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ad_edits (
        editId BIGINT AUTO_INCREMENT PRIMARY KEY,
        oldAdId BIGINT,
        userId BIGINT,
        carDetails VARCHAR(255),
        year INT,
        probeg VARCHAR(255),
        paint VARCHAR(255),
        color VARCHAR(255),
        transmission VARCHAR(255),
        fuel VARCHAR(255),
        price VARCHAR(255),
        phone VARCHAR(255),
        region VARCHAR(255),
        photoId TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS favorites (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT,
        adId BIGINT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(userId, adId)
      )
    `);
        await db.execute(`
      CREATE TABLE IF NOT EXISTS search_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        query VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await db.execute(`
      CREATE TABLE IF NOT EXISTS salon_ads (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT,
        salonName VARCHAR(255),
        adText TEXT,
        mediaType VARCHAR(20),
        mediaId TEXT,
        location VARCHAR(500),
        phone VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
            await db.execute(`
      CREATE TABLE IF NOT EXISTS vip_requests (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT,
        adId BIGINT,
        screenshotId TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Admin paneldagi sozlamalar (masalan, avto-xabarlarni yoqish/o'chirish)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS bot_settings (
        name VARCHAR(64) PRIMARY KEY,
        value VARCHAR(255)
      )
    `);
    await loadBotSettings();
    // Kanaldagi «Narxga baho» reaksiyalari (🔥 arzon · 👍 normal · 🤔 qimmat) — har bir e'lon uchun soni
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ad_reactions (
        ad_id BIGINT PRIMARY KEY,
        msg_id BIGINT,
        fire INT DEFAULT 0,
        ok INT DEFAULT 0,
        think INT DEFAULT 0,
        total INT DEFAULT 0,
        fire_level INT DEFAULT 0,
        think_level INT DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
  const alterQueries = [
      "ALTER TABLE ads ADD COLUMN history TEXT DEFAULT NULL",
      "ALTER TABLE ads ADD COLUMN barter VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE ads ADD COLUMN videoId VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE ad_edits ADD COLUMN history TEXT DEFAULT NULL",
      "ALTER TABLE ad_edits ADD COLUMN barter VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE ad_edits ADD COLUMN videoId VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE users ADD COLUMN referral_count INT DEFAULT 0",
      "ALTER TABLE users ADD COLUMN free_ups INT DEFAULT 0",

      "ALTER TABLE ads ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP", // <--- ШУ ҚАТОР ҚЎШИЛДИ
      "ALTER TABLE ads ADD COLUMN history TEXT DEFAULT NULL",
      "ALTER TABLE ads ADD COLUMN barter VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE ads ADD COLUMN secondChannelMsgId VARCHAR(50) DEFAULT NULL",
      "ALTER TABLE users ADD COLUMN contest_score INT DEFAULT 0",
      "ALTER TABLE users ADD COLUMN referred_by VARCHAR(50) DEFAULT NULL",
      "ALTER TABLE users ADD COLUMN is_referral_counted INT DEFAULT 0",
      "ALTER TABLE ads ADD COLUMN nasiya VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE ad_edits ADD COLUMN nasiya VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE users ADD COLUMN is_dealer INT DEFAULT 0",
      "ALTER TABLE users ADD COLUMN dealer_name VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE users ADD COLUMN dealer_phone VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE users ADD COLUMN dealer_paused INT DEFAULT 0",
      "ALTER TABLE ads ADD COLUMN dealer_offer TEXT DEFAULT NULL",
      "ALTER TABLE ad_edits ADD COLUMN dealer_offer TEXT DEFAULT NULL",
      "ALTER TABLE salon_ads ADD COLUMN channelMsgId VARCHAR(50) DEFAULT NULL",
      "ALTER TABLE ads ADD COLUMN last_bumped TIMESTAMP DEFAULT NULL",
      "ALTER TABLE ads ADD COLUMN sold_price VARCHAR(255) DEFAULT NULL",
      // Reaksiya kelganda e'lonni kanal xabari ID si bo'yicha tez topish uchun
      "ALTER TABLE ads ADD INDEX idx_ads_channel_msg (channelMsgId)",
      // To'lovlar: pullik e'lon cheki, salon reklamasi tarifi va paket qoldig'i
      "ALTER TABLE ads ADD COLUMN paid_amount INT DEFAULT NULL",
      "ALTER TABLE ads ADD COLUMN receiptId TEXT DEFAULT NULL",
      "ALTER TABLE salon_ads ADD COLUMN plan VARCHAR(20) DEFAULT NULL",
      "ALTER TABLE salon_ads ADD COLUMN price INT DEFAULT NULL",
      "ALTER TABLE salon_ads ADD COLUMN receiptId TEXT DEFAULT NULL",
      "ALTER TABLE salon_ads ADD COLUMN pin_until TIMESTAMP NULL DEFAULT NULL",
      // Ilovada ko'rsatish: qachongacha, video muqovasi, ochilish/qo'ng'iroq statistikasi
      "ALTER TABLE salon_ads ADD COLUMN app_until TIMESTAMP NULL DEFAULT NULL",
      "ALTER TABLE salon_ads ADD COLUMN thumbId TEXT DEFAULT NULL",
      "ALTER TABLE salon_ads ADD COLUMN app_opens INT DEFAULT 0",
      "ALTER TABLE salon_ads ADD COLUMN app_calls INT DEFAULT 0",
      "ALTER TABLE salon_ads ADD COLUMN app_notified INT DEFAULT 0",
      "ALTER TABLE users ADD COLUMN salon_credits INT DEFAULT 0",
      // VIP muddati: qachongacha VIP (kanal tepasida + ilovada birinchi) va «ertaga tugaydi» eslatmasi yuborilganmi
      "ALTER TABLE ads ADD COLUMN vip_until TIMESTAMP NULL DEFAULT NULL",
      "ALTER TABLE ads ADD COLUMN vip_reminded INT DEFAULT 0",
      "ALTER TABLE ads ADD INDEX idx_ads_vip_until (vip_until)",
      // Boshqa pullik statuslar (🚨 Shoshilinch, ⬆️ TOP, 💎 Premium) — VIP bilan bir xil ishlaydi
      "ALTER TABLE ads ADD COLUMN urgent_until TIMESTAMP NULL DEFAULT NULL",
      "ALTER TABLE ads ADD COLUMN urgent_reminded INT DEFAULT 0",
      "ALTER TABLE ads ADD COLUMN top_until TIMESTAMP NULL DEFAULT NULL",
      "ALTER TABLE ads ADD COLUMN top_reminded INT DEFAULT 0",
      "ALTER TABLE ads ADD COLUMN premium_until TIMESTAMP NULL DEFAULT NULL",
      "ALTER TABLE ads ADD COLUMN premium_reminded INT DEFAULT 0",
      "ALTER TABLE vip_requests ADD COLUMN kind VARCHAR(16) DEFAULT 'vip'",
      "ALTER TABLE vip_requests ADD COLUMN amount INT DEFAULT NULL", // to'lov paytidagi narx (hisobot uchun)
      // Bepul belgilar: 🆕 Yangi (kanalga birinchi chiqqan vaqt) va 📉 Narxi tushdi
      "ALTER TABLE ads ADD COLUMN posted_at TIMESTAMP NULL DEFAULT NULL",
      "ALTER TABLE ads ADD COLUMN old_price VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE ads ADD COLUMN price_dropped_at TIMESTAMP NULL DEFAULT NULL",
      "ALTER TABLE ads ADD COLUMN is_hot INT DEFAULT 0",
    ];
    for (const q of alterQueries) {
      try { await db.execute(q); } catch (e) {} // Устун бор бўлса, инкор қилади
    }
    await migrateVipUntil();
    console.log("✅ Жадваллар текширилди (тайёр).");

    // Katalog: car_brands / car_models jadvallari, ads.brand_id / ads.model_id ustunlari
    // va eski e'lonlarni nomi bo'yicha ID ga avtomatik bog'lash
    try {
      await catalog.init(db);
    } catch (e) {
      console.error("❌ Katalogni yuklashda xatolik:", e);
    }
  } catch (error) {
    console.error("❌ Жадвал яратишда хатолик:", error);
  }
})();

bot.catch((err) => console.error(`Хатолик:`, err.error));
bot.use(session({ initial: () => ({}) }));
const LOG_CHANNEL_ID = "-1001742614612";

// ==============================================================
// ⚙️ BOT SOZLAMALARI (bazada saqlanadi — bot qayta ishga tushsa ham o'zgarmaydi)
// ==============================================================
const botSettings = new Map(); // name -> value
async function loadBotSettings() {
  try {
    const [rows] = await db.execute("SELECT name, value FROM bot_settings");
    botSettings.clear();
    rows.forEach((r) => botSettings.set(r.name, r.value));
  } catch (e) {
    console.error("Sozlamalarni yuklab bo'lmadi:", e.message);
  }
}
// Avto-xabar yoqilganmi? (sukut bo'yicha — yoqilgan, ya'ni avvalgidek ishlaydi)
// Sukut bo'yicha O'CHIQ turadiganlari (admin o'zi yoqmaguncha): kanal postidagi qo'shimcha tugmalar
const AUTO_DEFAULT_OFF = new Set(["share_btn", "btn_admin"]);
function isAutoOn(key) {
  const v = botSettings.get(`auto:${key}`);
  if (v === undefined) return !AUTO_DEFAULT_OFF.has(key);
  return v !== "0";
}
async function setBotSetting(name, value) {
  value = String(value);
  await db.execute("INSERT INTO bot_settings (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [name, value]);
  botSettings.set(name, value);
}
async function setAutoOn(key, on) {
  await setBotSetting(`auto:${key}`, on ? "1" : "0");
}
// 📏 Oddiy foydalanuvchi bir vaqtda nechta FAOL e'lon bera oladi (0 = cheksiz). Admin panelda o'zgartiriladi.
const DEFAULT_AD_LIMIT = 3;
// 💰 NARXLAR (so'mda) — admin panel → «💰 Narxlar va to'lovlar» dan o'zgartiriladi
const PRICE_DEFAULTS = { vip: 25000, urgent: 10000, top: 15000, premium: 50000, salon_single: 50000, salon_app: 40000, salon_both: 75000, salon_pack5: 200000, salon_pin: 80000, ad: 20000 };
const PRICE_TITLES = {
  vip: "🌟 VIP e'lon", urgent: "🚨 Shoshilinch", top: "⬆️ TOP (avto-UP)", premium: "💎 Premium", salon_single: "📢 Salon: kanalda 1 ta post", salon_app: "📱 Salon: ilovada", salon_both: "📢📱 Salon: kanal + ilova", salon_pack5: "📦 Salon: 5 ta post paketi",
  salon_pin: "📌 Salon: post + 24 soat qadash", ad: "📝 Oddiy e'lon (pullik rejimda)",
};
function getPrice(key) {
  const v = parseInt(botSettings.get(`price:${key}`), 10);
  return Number.isFinite(v) && v > 0 ? v : PRICE_DEFAULTS[key];
}
// ⭐ PULLIK STATUSLAR — narxi (price:<kind>) va muddati (kun) admin panelda o'zgartiriladi
const VIP_DAYS_DEFAULT = Number(process.env.VIP_TOP_DAYS) || 7;
const PROMO_KINDS = ["urgent", "top", "vip", "premium"];
const PROMOS = {
  urgent: { title: "🚨 Shoshilinch", short: "🚨 Shoshilinch", col: "urgent_until", rem: "urgent_reminded", defDays: 3,
    perks: ["Kanal postida «🚨 SHOSHILINCH SOTILADI!» sarlavhasi", "Ilovada qizil «Shoshilinch» belgisi", "Ilovadagi «Shoshilinch» filtrida chiqadi"],
    done: "Kanal postiga «🚨 SHOSHILINCH SOTILADI!» sarlavhasi qo'yildi.", endsText: "sarlavha va belgi olib tashlanadi" },
  top: { title: "⬆️ TOP", short: "⬆️ TOP", col: "top_until", rem: "top_reminded", defDays: 7, inPremium: true,
    perks: ["Har kuni kanalda o'zi yangi post bo'lib ko'tariladi (avto-UP)", "Ilovada «Avval yangilari» da doim yuqorida", "Sizdan hech narsa talab qilinmaydi"],
    done: "E'lon har kuni kanalda o'zi ko'tariladi.", endsText: "har kungi avto-UP to'xtaydi" },
  vip: { title: "🌟 VIP", short: "🌟 VIP", col: "vip_until", rem: "vip_reminded", defDays: VIP_DAYS_DEFAULT, inPremium: true,
    perks: ["Kanalning eng tepasiga qadaladi (Pin)", "«🌟 VIP» belgisi bilan ajralib turadi", "Ilovada barcha e'lonlardan birinchi chiqadi"],
    done: "E'lon VIP maqomida kanal tepasiga qadaldi! 🌟", endsText: "kanal tepasidan yechiladi va ilovada oddiy tartibda chiqadi" },
  premium: { title: "💎 Premium", short: "💎 Premium", col: "premium_until", rem: "premium_reminded", defDays: 14,
    perks: ["VIP dagi hammasi: kanal tepasida qadalgan, «💎 PREMIUM» sarlavhasi", "Har kuni kanalda o'zi ko'tariladi (avto-UP)", "Ilovada hatto VIP lardan ham oldin turadi", "Eng uzoq muddat"],
    done: "E'lon 💎 Premium maqomida kanal tepasiga qadaldi va har kuni o'zi ko'tariladi.", endsText: "kanal tepasidan yechiladi, avto-UP to'xtaydi" },
};
// ⚙️ Admin paneldagi boshqa sozlamalar (bo'sh bo'lsa — koddagi boshlang'ich qiymat)
const DEFAULT_INVITE = "https://t.me/+einfd7upTxxlZDYy";
const payCard = () => botSettings.get("pay:card") || VIP_CARD;
const payCardName = () => botSettings.get("pay:card_name") || VIP_CARD_NAME;
const inviteLink = () => botSettings.get("link:invite") || DEFAULT_INVITE;
function salonDailyLimit() { const v = parseInt(botSettings.get("limit:salon_daily"), 10); return Number.isFinite(v) && v >= 1 && v <= 20 ? v : 2; }
function topHours() {
  const f = parseInt(botSettings.get("top:from"), 10), t = parseInt(botSettings.get("top:to"), 10);
  return Number.isFinite(f) && Number.isFinite(t) && f >= 0 && t <= 24 && f < t ? { from: f, to: t } : { from: 8, to: 22 };
}
const promoEnabled = (kind) => botSettings.get(`promo_off:${kind}`) !== "1";
const promoDaysKey = (kind) => (kind === "vip" ? "vip:days" : `days:${kind}`);
function promoDays(kind) {
  const v = parseInt(botSettings.get(promoDaysKey(kind)), 10);
  return Number.isFinite(v) && v >= 1 && v <= 90 ? v : PROMOS[kind].defDays;
}
function getVipDays() { return promoDays("vip"); }
const tsActive = (v) => !!(v && new Date(v).getTime() > Date.now());
const isPremiumActive = (ad) => !!ad && tsActive(ad.premium_until);
const isVipActive = (ad) => !!ad && (tsActive(ad.vip_until) || tsActive(ad.premium_until)); // kanal tepasida (VIP yoki Premium)
const isUrgentActive = (ad) => !!ad && tsActive(ad.urgent_until);
const isTopActive = (ad) => !!ad && (tsActive(ad.top_until) || tsActive(ad.premium_until));
// Toshkent vaqti bilan sana: 10.11.2026 14:30
function fmtTash(d) {
  const t = new Date(d); if (isNaN(t)) return "";
  const z = new Date(t.getTime() + 5 * 3600 * 1000), p = (n) => String(n).padStart(2, "0");
  return `${p(z.getUTCDate())}.${p(z.getUTCMonth() + 1)}.${z.getUTCFullYear()} ${p(z.getUTCHours())}:${p(z.getUTCMinutes())}`;
}
// Status muddati tugamaguncha kanal postining boshida turadigan sarlavha (narx/tahrir o'zgarsa ham saqlanadi)
const VIP_HEADER = "🌟 <b>VIP E'LON!</b> 🌟\n\n";
const PREMIUM_HEADER = "💎 <b>PREMIUM E'LON!</b> 💎\n\n";
const URGENT_HEADER = "🚨 <b>SHOSHILINCH SOTILADI!</b>\n\n";
const vipHeader = (ad) => (isPremiumActive(ad) ? PREMIUM_HEADER : isVipActive(ad) ? VIP_HEADER : "") + (isUrgentActive(ad) ? URGENT_HEADER : "");
// Narx oxirgi 7 kunda tushganmi (📉 belgi va kanalda eski narx ustidan chizish uchun)
const recentDrop = (ad) => !!(ad && ad.old_price && ad.price_dropped_at && Date.now() - new Date(ad.price_dropped_at).getTime() < 7 * 86400000 && (parseInt(ad.old_price) || 0) > (parseInt(ad.price) || 0));
// Kanal postining to'liq matni (bazadagi ma'lumotdan) — status yoqilganda / tugaganda shu bilan qayta yoziladi
async function buildChannelCaption(ad) {
  let dealerBadge = "";
  try {
    const [[d]] = await db.execute("SELECT is_dealer, dealer_name, dealer_paused FROM users WHERE id = ?", [ad.userId]);
    if (d && Number(d.is_dealer) === 1 && Number(d.dealer_paused) !== 1 && d.dealer_name) dealerBadge = `✅ <b>Ishonchli sotuvchi: ${d.dealer_name}</b>\n\n`;
  } catch (e) {}
  let c = vipHeader(ad) + dealerBadge + (ad.is_hot ? `🔥 <b>QAYNOQ NARX!</b>\n\n` : "") +
    `🆔 ID: ${ad.id}\n🚗 Moshina: ${ad.carDetails}\n📅 Yili: ${ad.year}\n👣 Probeg: ${kmText(ad.probeg)}\n` +
    `💎 Kraskasi: ${ad.paint}\n🎨 Rangi: ${ad.color}\n✅ Karobka: ${ad.transmission}\n⛽ Yoqilg'i: ${ad.fuel}\n`;
  if (ad.history && ad.history !== "Ko'rsatilmagan" && ad.history !== "Кўрсатилмаган") c += `🛠 Tarixi: ${ad.history}\n`;
  if (ad.barter && ad.barter !== "Yo'q" && ad.barter !== "Йўқ") c += `🔄 Barter: ${ad.barter}\n`;
  if (ad.nasiya && ad.nasiya !== "Yo'q") c += `💳 Nasiya (bo'lib to'lash): ${ad.nasiya}\n`;
  if (ad.dealer_offer) c += `\n🎁 <b>MAXSUS TAKLIF:</b>\n${ad.dealer_offer}\n`;
  c += recentDrop(ad)
    ? `💰 Narxi: <s>${formatNum(ad.old_price)} $</s> <b>${formatNum(ad.price)}$ 📉</b>\n`
    : `💰 Narxi: ${formatNum(ad.price)}$\n`;
  c += `☎️ +${ad.phone}\n🚩 #${String(ad.region || "").replace(/\s+/g, "_")}\n\n` +
    `⚠️ Moshina savdosiga admin javobgar emas, oldindan to'lov qilmang. Ogohlik davr talabi ❗\n\n👉 ${inviteLink()}`;
  return addPriceVoteLine(c);
}
// E'lon kanalda qayta joylansa (UP, ko'tarish) — VIP bo'lsa yangi postni yana tepaga qadaymiz
async function repinIfVip(ad, newMsgId) {
  if (!isVipActive(ad) || !newMsgId) return;
  await bot.api.pinChatMessage(CHANNEL_ID, Number(newMsgId), { disable_notification: true }).catch(() => {});
}
// Eski VIP lar (muddat ustuni qo'shilishidan oldin tasdiqlangan) — bir marta: so'rov sanasi + muddat
async function migrateVipUntil() {
  if (botSettings.get("migr:vip_until") === "1") return;
  try {
    const [rows] = await db.execute("SELECT adId, MAX(created_at) AS at FROM vip_requests WHERE status = 'approved' GROUP BY adId");
    for (const r of rows) {
      const until = new Date(new Date(r.at).getTime() + getVipDays() * 86400000);
      // Muddati allaqachon o'tganlarga eslatma yubormaymiz (vip_reminded = 1)
      await db.execute("UPDATE ads SET vip_until = ?, vip_reminded = 1 WHERE id = ? AND vip_until IS NULL", [until, r.adId]);
    }
    await setBotSetting("migr:vip_until", "1");
  } catch (e) { console.error("VIP muddati migratsiyasi:", e.message); }
}
const somFmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " so'm";
// Oddiy e'lonlar pullikmi (sukut: bepul) va salon reklamasi pullikmi (sukut: pullik)
function paidAdsOn() { return botSettings.get("paid:ads") === "1"; }
function paidSalonOn() { return botSettings.get("paid:salon") !== "0"; }
// Salon reklamasi tariflari
// Salon reklamasi tariflari: channel — kanalga post, app — ilovada N kun (bozor tepasi va e'lonlar orasida)
function salonAppDays() { const v = parseInt(botSettings.get("days:salon_app"), 10); return Number.isFinite(v) && v >= 1 && v <= 90 ? v : 7; }
const SALON_PLANS = {
  single: { title: "📢 Kanal: 1 post", priceKey: "salon_single", channel: true },
  app: { get title() { return `📱 Ilova: ${salonAppDays()} kun`; }, priceKey: "salon_app", app: true },
  both: { get title() { return `📢📱 Kanal + ilova ${salonAppDays()} kun`; }, priceKey: "salon_both", channel: true, app: true },
  pack5: { title: "📦 Kanal: 5 post paketi", priceKey: "salon_pack5", channel: true },
  pin: { title: "📌 Kanal + 24 soat qadash", priceKey: "salon_pin", channel: true },
};
const SALON_PLAN_KEYS = Object.keys(SALON_PLANS);
// Tarif bo'yicha joylashuv: credit (paketdan) — kanal; free (bepul rejim) — kanal + ilova
const salonPlacement = (plan) => plan === "credit" ? { channel: true, app: false }
  : plan === "free" || !plan ? { channel: true, app: true }
  : { channel: !!(SALON_PLANS[plan] && SALON_PLANS[plan].channel), app: !!(SALON_PLANS[plan] && SALON_PLANS[plan].app) };
function getAdLimit() {
  const v = botSettings.get("limit:active_ads");
  const n = v === undefined || v === "" ? DEFAULT_AD_LIMIT : parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_AD_LIMIT;
}

// ==============================================================
// 🔥 KANALDAGI «NARXGA BAHO» REAKSIYALARI
// Har bir e'lon ostida: «👇 Narxga baho bering: 🔥 arzon · 👍 normal · 🤔 qimmat».
// Kanal reaksiyalari anonim — Telegram botga faqat SONINI yuboradi (message_reaction_count),
// bir necha daqiqa kechikish bilan, guruhlab. Shart: bot kanalda admin bo'lishi.
// Sotuvchiga 3, 10, 25... kishi baho berganda xabar boradi (har bosqichda bir marta).
// ==============================================================
const VOTE_FIRE = "🔥", VOTE_OK = "👍", VOTE_THINK = "🤔";
const FIRE_STEPS = [3, 10, 25, 50, 100];
const THINK_STEPS = [3, 10, 25];
const stepLevel = (n, steps) => steps.filter((s) => n >= s).pop() || 0;

function isMainChannelChat(chat) {
  if (!chat) return false;
  const want = CHANNEL_ID.replace(/^@/, "").toLowerCase();
  return (!!chat.username && chat.username.toLowerCase() === want) || String(chat.id) === want;
}

function countVotes(reactions) {
  const c = { fire: 0, ok: 0, think: 0, total: 0 };
  for (const r of reactions || []) {
    const n = Number(r.total_count) || 0;
    c.total += n;
    if (r.type && r.type.type === "emoji") {
      if (r.type.emoji === VOTE_FIRE) c.fire += n;
      else if (r.type.emoji === VOTE_OK) c.ok += n;
      else if (r.type.emoji === VOTE_THINK) c.think += n;
    }
  }
  return c;
}

async function handleReactionCount(upd) {
  const msgId = Number(upd.message_id);
  const [[ad]] = await db.execute(
    "SELECT id, userId, carDetails, price, status FROM ads WHERE channelMsgId = ? LIMIT 1",
    [String(msgId)]
  );
  if (!ad) return; // e'lon emas (masalan, «Qaynoq narx» yoki «E'lon bering» posti)
  const c = countVotes(upd.reactions);

  const [[prev]] = await db.execute("SELECT msg_id, fire_level, think_level FROM ad_reactions WHERE ad_id = ?", [ad.id]);
  // E'lon UP qilinsa — kanalda yangi xabar, hisob ham yangidan boshlanadi
  const samePost = prev && Number(prev.msg_id) === msgId;
  let fireLevel = samePost ? Number(prev.fire_level) || 0 : 0;
  let thinkLevel = samePost ? Number(prev.think_level) || 0 : 0;

  let notice = null;
  if (ad.status === "active" && isAutoOn("reaction_notify")) {
    const f = stepLevel(c.fire, FIRE_STEPS);
    const t = stepLevel(c.think, THINK_STEPS);
    if (t > thinkLevel && c.think > c.fire) { notice = "think"; thinkLevel = t; }
    else if (f > fireLevel && c.fire >= c.think) { notice = "fire"; fireLevel = f; }
  }

  // Avval saqlaymiz — xabar yuborilmasa ham (bot bloklangan), qayta-qayta urinmaymiz
  await db.execute(
    `INSERT INTO ad_reactions (ad_id, msg_id, fire, ok, think, total, fire_level, think_level) VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE msg_id = VALUES(msg_id), fire = VALUES(fire), ok = VALUES(ok), think = VALUES(think),
       total = VALUES(total), fire_level = VALUES(fire_level), think_level = VALUES(think_level)`,
    [ad.id, msgId, c.fire, c.ok, c.think, c.total, fireLevel, thinkLevel]
  );
  if (notice) await sendVoteNotice(ad, msgId, c, notice);
}

async function sendVoteNotice(ad, msgId, c, kind) {
  const car = escapeHtml(ad.carDetails);
  const score = `📊 <b>Baholar:</b> 🔥 ${c.fire} · 👍 ${c.ok} · 🤔 ${c.think}`;
  let text, kb;
  if (kind === "fire") {
    text =
      `🔥 <b>Xaridorlar qiziqyapti!</b>\n\n` +
      `🚗 <b>${car}</b> — kanalda <b>${c.fire} kishi</b> narxingizni «🔥 arzon» deb baholadi.\n\n` +
      `${score}\n\n` +
      `📞 Telefoningiz yoqiq tursin — qo'ng'iroqlar ko'payishi mumkin. E'lonni do'stlaringizga ham yuboring:`;
    kb = new InlineKeyboard()
      .url("↗️ Yaqinlarga ulashish", channelShareLink(msgId)).row()
      .url("📢 Kanalda ko'rish", channelPostLink(msgId));
  } else {
    text =
      `🤔 <b>Narxingiz bo'yicha fikr</b>\n\n` +
      `🚗 <b>${car}</b> (${formatNum(ad.price)}$) — kanalda <b>${c.think} kishi</b> narxni «🤔 qimmat» deb baholadi.\n\n` +
      `${score}\n\n` +
      `💡 Narxni biroz tushirsangiz, e'lon tezroq sotiladi: saqlab qo'yganlarga avtomatik xabar boradi` +
      (isAutoOn("hot_price") ? ` va kanalda «🔥 Qaynoq narx» posti chiqadi.` : `.`);
    kb = new InlineKeyboard()
      .text("📉 Narxni tushirish", `edit_price:${ad.id}`).row()
      .url("📢 Kanalda ko'rish", channelPostLink(msgId));
  }
  try {
    await bot.api.sendMessage(ad.userId, text, { parse_mode: "HTML", reply_markup: kb, link_preview_options: { is_disabled: true } });
  } catch (e) {
    console.log(`⚠️ Reaksiya xabari ${ad.userId} ga bormadi:`, e.description || e.message);
  }
}

// Sotuvchining «Mening e'lonlarim» oynasi uchun: shu postdagi baholar (bo'lmasa null)
async function getAdVotes(adId, channelMsgId) {
  if (!channelMsgId) return null;
  try {
    const [[v]] = await db.execute("SELECT fire, ok, think FROM ad_reactions WHERE ad_id = ? AND msg_id = ?", [adId, Number(channelMsgId)]);
    if (!v || Number(v.fire) + Number(v.ok) + Number(v.think) === 0) return null;
    return { fire: Number(v.fire), ok: Number(v.ok), think: Number(v.think) };
  } catch (e) {
    return null;
  }
}

// Kanalda 🔥 👍 🤔 reaksiyalari yoqilganmi? (admin paneldagi ogohlantirish uchun)
let channelVoteWarning = "";
async function checkChannelReactions() {
  try {
    const chat = await bot.api.getChat(CHANNEL_ID);
    const av = chat.available_reactions;
    if (!av) { channelVoteWarning = ""; return; } // ko'rsatilmagan = hamma reaksiyalar ruxsat
    const have = new Set(av.filter((r) => r.type === "emoji").map((r) => r.emoji));
    const missing = [VOTE_FIRE, VOTE_OK, VOTE_THINK].filter((e) => !have.has(e));
    channelVoteWarning = missing.length ? missing.join(" ") : "";
  } catch (e) {
    // tarmoq xatosi — oldingi holat qoladi
  }
}

// 💰 Admin «✏️ ... narxi» ni bosib, yangi narxni yozganda
bot.use(async (ctx, next) => {
  if (!adminPriceEdit || !ctx.from || ctx.from.id !== ADMIN_ID || !ctx.message || !ctx.message.text) return next();
  const key = adminPriceEdit;
  const t = ctx.message.text.trim();
  if (t === "/cancel") { adminPriceEdit = null; return ctx.reply("Bekor qilindi."); }
  const n = parseInt(t.replace(/[\s'.,]/g, ""), 10);
  if (!/^[\d\s'.,]+$/.test(t) || !n) { adminPriceEdit = null; return next(); } // boshqa narsa yozildi — odatdagidek
  if (key === "salon_app_days") {
    if (n < 1 || n > 90) return ctx.reply("❗️ 1 dan 90 kungacha bo'lishi kerak. Qayta yozing yoki /cancel.");
    adminPriceEdit = null;
    try { await setBotSetting("days:salon_app", n); } catch (e) { return ctx.reply("❌ Saqlab bo'lmadi, qayta urinib ko'ring."); }
    const v = pricesView();
    await ctx.reply(`✅ Salon reklamasi ilovada: <b>${n} kun</b>`, { parse_mode: "HTML" });
    return ctx.reply(v.text, { parse_mode: "HTML", reply_markup: v.kb });
  }
  if (/_days$/.test(key) && PROMOS[key.slice(0, -5)]) {
    const kind = key.slice(0, -5);
    if (n < 1 || n > 90) return ctx.reply("❗️ Muddat 1 dan 90 kungacha bo'lishi kerak. Qayta yozing yoki /cancel.");
    adminPriceEdit = null;
    try { await setBotSetting(promoDaysKey(kind), n); }
    catch (e) { return ctx.reply("❌ Saqlab bo'lmadi, qayta urinib ko'ring."); }
    const v = pricesView();
    await ctx.reply(`✅ ${PROMOS[kind].title} muddati: <b>${n} kun</b>`, { parse_mode: "HTML" });
    return ctx.reply(v.text, { parse_mode: "HTML", reply_markup: v.kb });
  }
  if (n < 1000 || n > 100000000) return ctx.reply("❗️ Narx 1 000 dan 100 000 000 so'mgacha bo'lishi kerak. Qayta yozing yoki /cancel.");
  adminPriceEdit = null;
  try { await setBotSetting(`price:${key}`, n); }
  catch (e) { return ctx.reply("❌ Saqlab bo'lmadi, qayta urinib ko'ring."); }
  const { text, kb } = pricesView();
  await ctx.reply(`✅ ${PRICE_TITLES[key]}: <b>${somFmt(n)}</b>`, { parse_mode: "HTML" });
  return ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
});

// ⚙️ Admin sozlama / status berish uchun matn yozganda
bot.use(async (ctx, next) => {
  if (!adminInput || !ctx.from || ctx.from.id !== ADMIN_ID || !ctx.message || !ctx.message.text) return next();
  const inp = adminInput;
  const t = ctx.message.text.trim();
  if (t === "/cancel") { adminInput = null; return ctx.reply("Bekor qilindi."); }
  if (isGlobalAction(ctx) || t.startsWith("/")) { adminInput = null; return next(); } // menyu yoki buyruq bosildi
  try {
    if (inp.type === "setting") {
      const r = await saveSettingInput(inp.field, t);
      if (r.error) return ctx.reply(r.error, { parse_mode: "HTML" });
      adminInput = null;
      const v = settingsView();
      await ctx.reply(`✅ ${SETTING_FIELDS[inp.field].title} saqlandi.`);
      return ctx.reply(v.text, { parse_mode: "HTML", reply_markup: v.kb, disable_web_page_preview: true });
    }
    if (inp.type === "cat_brand") {
      const r = await catalog.addBrand(db, t);
      if (!r.ok && !r.brand) return ctx.reply(`❗️ ${r.error} Qayta yozing yoki /cancel.`);
      adminInput = null;
      const b = catalog.brandById(r.brand.id) || r.brand;
      await ctx.reply(r.ok ? `✅ «${b.name}» markasi qo'shildi. Endi uning modellarini qo'shing.` : `ℹ️ «${b.name}» markasi allaqachon bor.`);
      const v = brandView(b);
      return ctx.reply(v.text, { parse_mode: "HTML", reply_markup: v.kb });
    }
    if (inp.type === "cat_model") {
      const b = catalog.brandById(inp.brandId);
      if (!b) { adminInput = null; return ctx.reply("❗️ Marka topilmadi."); }
      const names = t.split(/[,\n]/).map((x) => x.replace(/[<>|]/g, "").replace(/\s+/g, " ").trim()).filter(Boolean);
      const bad = names.filter((n) => n.length < 1 || n.length > 40);
      if (!names.length || bad.length) return ctx.reply("❗️ Model nomi 1 dan 40 belgigacha bo'lsin. Qayta yozing yoki /cancel.");
      adminInput = null;
      const added = [], had = [];
      for (const n of names.slice(0, 30)) {
        const r = await catalog.addModel(db, b.name, n);
        (r.created ? added : had).push(r.model.name);
      }
      await ctx.reply((added.length ? `✅ Qo'shildi: ${added.join(", ")}` : "") + (had.length ? `${added.length ? "\n" : ""}ℹ️ Avvaldan bor: ${had.join(", ")}` : ""));
      const v = brandView(catalog.brandById(b.id));
      return ctx.reply(v.text, { parse_mode: "HTML", reply_markup: v.kb });
    }
    if (inp.type === "opt_add") {
      const r = await catalog.addOption(db, inp.kind, t);
      if (!r.ok) return ctx.reply(`❗️ ${r.error} Qayta yozing yoki /cancel.`);
      adminInput = null;
      await ctx.reply(`✅ «${r.value}» qo'shildi — bot va ilovadagi e'lon formasida darhol chiqadi.`);
      const v = optionsView(inp.kind);
      return ctx.reply(v.text, { parse_mode: "HTML", reply_markup: v.kb });
    }
    if (inp.type === "grant_id") {
      const id = parseInt(t.replace(/\D/g, ""), 10);
      const [[ad]] = id ? await db.execute("SELECT * FROM ads WHERE id = ?", [id]) : [[null]];
      if (!ad) return ctx.reply("❗️ Bunday ID li e'lon topilmadi. Qayta yozing yoki /cancel.");
      if (ad.status !== "active") return ctx.reply("❗️ Bu e'lon faol emas (sotilgan yoki tekshiruvda). Boshqa ID yozing yoki /cancel.");
      adminInput = null;
      const v = grantView(ad);
      return ctx.reply(v.text, { parse_mode: "HTML", reply_markup: v.kb });
    }
    if (inp.type === "grant_days") {
      const n = parseInt(t, 10);
      if (!/^\d+$/.test(t) || n < 1 || n > 90) return ctx.reply("❗️ 1 dan 90 gacha kun sonini yozing yoki /cancel.");
      const [[ad]] = await db.execute("SELECT * FROM ads WHERE id = ?", [inp.adId]);
      if (!ad || ad.status !== "active") { adminInput = null; return ctx.reply("❗️ E'lon faol emas."); }
      adminInput = null;
      const P = PROMOS[inp.kind];
      const { until, ownActive } = await activatePromo(ad, inp.kind, n);
      await bot.api.sendMessage(ad.userId,
        `🎁 <b>Sizga sovg'a!</b>\n\n<b>${ad.carDetails}</b> e'loningizga admin ${P.title} statusini ${ownActive ? "uzaytirdi" : "berdi"}.\n${P.done}\n\n⏳ Muddati: <b>${fmtTash(until)}</b> gacha.`,
        { parse_mode: "HTML" }).catch(() => {});
      await ctx.reply(`✅ ${P.title} ${ownActive ? "uzaytirildi" : "berildi"}: ${fmtTash(until)} gacha (${n} kun). Sotuvchiga xabar yuborildi.`);
      const v = grantView(ad);
      return ctx.reply(v.text, { parse_mode: "HTML", reply_markup: v.kb });
    }
  } catch (e) {
    console.error("Admin kiritishida xato:", e.message);
    adminInput = null;
    return ctx.reply("❌ Saqlab bo'lmadi, qayta urinib ko'ring.");
  }
  adminInput = null;
  return next();
});

// Reaksiya soni keldi — boshqa middleware'larga o'tkazmaymiz (bu yerda foydalanuvchi yo'q)
bot.use(async (ctx, next) => {
  const upd = ctx.update.message_reaction_count;
  if (!upd) return next();
  if (!isMainChannelChat(upd.chat)) return;
  try {
    await handleReactionCount(upd);
  } catch (e) {
    console.error("Reaksiyani qayta ishlashda xato:", e.message);
  }
});

// ==============================================================
// 🕵️ USERLARNI JONLI KUZATISH (AQLLI TIZIM - SMART LOG)
// Bot ham, Mini App ham shu yerga yozadi: har bir user uchun log-kanalda
// bitta xabar, yangi amallar unga qator bo'lib qo'shiladi.
// 15 daqiqa tanaffusdan keyin yangi xabar boshlanadi.
// ==============================================================
const USER_LOG_GAP_MS = 15 * 60 * 1000;   // shuncha jim tursa — yangi xabar
const USER_LOG_MAX_LEN = 3500;            // Telegram xabar chegarasidan oldin yangisini boshlaymiz
const USER_LOG_DELAY_MS = 2000;           // tez-tez amallarni 2 soniyada bitta tahrirga yig'amiz
const userLogs = new Map();               // userId -> { from, msgId, text, gen, lastTime, timer, sending, dirty }

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function userLogHeader(from) {
  const usernameStr = from.username ? ` (@${escapeHtml(from.username)})` : "";
  return `👤 <b>User:</b> <a href="tg://user?id=${from.id}">${escapeHtml(from.first_name || "User")}</a>${usernameStr} (#u${from.id})`;
}

async function flushUserLog(entry) {
  entry.timer = null;
  entry.dirty = false;
  entry.sending = true;
  const gen = entry.gen;
  const fullText = userLogHeader(entry.from) + entry.text;
  const opts = { parse_mode: "HTML", link_preview_options: { is_disabled: true } };
  let retryAfter = 0;
  try {
    if (entry.msgId) {
      try {
        // Eski xabarga yangi qatorlarni qo'shib tahrirlaymiz
        await bot.api.editMessageText(LOG_CHANNEL_ID, entry.msgId, fullText, opts);
      } catch (error) {
        if (error.error_code === 429) throw error;
        if (!/not modified/i.test(error.description || error.message || "")) {
          // Xabar o'chirilgan bo'lsa — yangisini tashlaymiz
          const msg = await bot.api.sendMessage(LOG_CHANNEL_ID, fullText, opts);
          if (entry.gen === gen) entry.msgId = msg.message_id;
        }
      }
    } else {
      const msg = await bot.api.sendMessage(LOG_CHANNEL_ID, fullText, opts);
      if (entry.gen === gen) entry.msgId = msg.message_id;
    }
  } catch (error) {
    if (error.error_code === 429) {
      // Telegram "sekinroq" desa — keyinroq qayta urinamiz, qatorlar yo'qolmaydi
      retryAfter = ((error.parameters && error.parameters.retry_after) || 5) * 1000;
      entry.dirty = true;
    } else {
      console.error("Log-kanalga yozishda xato:", error.description || error.message);
    }
  } finally {
    entry.sending = false;
    if (entry.dirty && !entry.timer) {
      entry.dirty = false;
      entry.timer = setTimeout(() => flushUserLog(entry), Math.max(USER_LOG_DELAY_MS, retryAfter));
    }
  }
}

// from — ctx.from yoki Mini App foydalanuvchisi ({ id, first_name, username })
function logUserAction(from, action) {
  if (!from || !from.id || Number(from.id) === ADMIN_ID || !action) return;
  const now = Date.now();
  let entry = userLogs.get(from.id);
  if (!entry) {
    entry = { from, msgId: null, text: "", gen: 0, lastTime: 0, timer: null, sending: false, dirty: false };
    userLogs.set(from.id, entry);
  }
  entry.from = from;

  const time = new Date(now).toLocaleTimeString("uz-UZ", { timeZone: "Asia/Tashkent", hour12: false, hour: "2-digit", minute: "2-digit" });
  const logLine = `\n⏱ <code>${time}</code> | ${escapeHtml(String(action).slice(0, 500))}`;

  // Uzoq tanaffus yoki xabar juda uzun bo'lsa — yangi xabar boshlaymiz
  if ((entry.lastTime && now - entry.lastTime > USER_LOG_GAP_MS) || entry.text.length + logLine.length > USER_LOG_MAX_LEN) {
    entry.text = "";
    entry.msgId = null;
    entry.gen++;
  }
  entry.lastTime = now;
  entry.text += logLine;

  if (entry.timer || entry.sending) { entry.dirty = true; return; }
  entry.timer = setTimeout(() => flushUserLog(entry), USER_LOG_DELAY_MS);
}

// Xotirani tozalash: uzoq jim turganlarning yozuvini o'chiramiz
setInterval(() => {
  const now = Date.now();
  for (const [id, e] of userLogs) {
    if (!e.timer && !e.sending && now - e.lastTime > USER_LOG_GAP_MS) userLogs.delete(id);
  }
}, 30 * 60 * 1000).unref();

bot.use(async (ctx, next) => {
  if (ctx.from && ctx.from.id !== ADMIN_ID) {
    let action = "";

    // User qaysi amalni bajarganini aniqlaymiz
    if (ctx.message?.text) {
        action = `📝 Yozdi: "${ctx.message.text}"`;
    } else if (ctx.message?.photo) {
        action = `📸 Rasm yubordi`;
    } else if (ctx.message?.video) {
        action = `🎥 Video yubordi`;
    } else if (ctx.message?.contact) {
        action = `☎️ Kontakt: ${ctx.message.contact.phone_number}`;
    } else if (ctx.message?.successful_payment) {
        action = `⭐️ VIP To'lov qildi!`;
    } else if (ctx.callbackQuery?.data) {
        action = `🔘 Tugma bosdi: [${ctx.callbackQuery.data}]`;
    } else if (ctx.message?.web_app_data) {
        action = `📱 Ilovadan ma'lumot yubordi`;
    }

    if (action) logUserAction(ctx.from, action); // kutmaymiz — bot javobi sekinlashmasin
  }

  await next();
});
// 1. BLOKLANGANLARNI TEKSHIRISH
bot.use(async (ctx, next) => {
  if (ctx.from && ctx.from.id !== ADMIN_ID) {
    try {
      const [banned] = await db.execute("SELECT * FROM banned_users WHERE userId = ?", [ctx.from.id]);
      if (banned.length > 0) {
        if (ctx.callbackQuery) {
           await ctx.answerCallbackQuery({ text: "🚫 Siz qoidabuzarlik sababli botdan bloklangansiz!", show_alert: true });
        } else {
           await ctx.reply("🚫 <b>Kechirasiz, siz botdan bloklangansiz.</b> Endi e'lon bera olmaysiz.", { parse_mode: "HTML", reply_markup: { remove_keyboard: true } });
        }
        return; 
      }
    } catch(e) {}
  }
  await next();
});

// 2. "ЁЗМОҚДА..." СТАТУСИНИ КЎРСАТИШ
bot.use(async (ctx, next) => {
  if (ctx.message || ctx.callbackQuery) {
     ctx.api.sendChatAction(ctx.chat?.id, "typing").catch(() => {});
  }
  await next();
});

// 3. ЖАРАЁНЛАРНИ УЛАШ
bot.use(conversations());

// 🚪 TUGALLANMAGAN SUHBATDAN CHIQISH
// conversations v2 da foydalanuvchi biror jarayonni (qidiruv, baholash, e'lon berish...) yarim yo'lda
// tashlab ketsa, suhbat «faol» bo'lib qoladi va keyingi tugmalarni O'ZI yutib yuboradi. Masalan, eski
// xabardagi «💰 Sotildi» bosilsa, qidiruv uni marka deb o'qirdi, yozilgan narx esa model nomi bo'lib
// ketardi — adminga «Sotildi» so'rovi umuman bormasdi. Endi: global tugma (bot.callbackQuery bilan
// ulangan), menyu tugmasi yoki /buyruq kelsa — faol suhbat yopiladi va so'rov odatdagi handlerga o'tadi.
// MUHIM: bu middleware barcha createConversation(...) lardan OLDIN turishi kerak.
bot.use(async (ctx, next) => {
  if (ctx.conversation && isGlobalAction(ctx)) {
    try {
      const active = await ctx.conversation.active();
      if (active && Object.keys(active).length > 0) await ctx.conversation.exitAll();
    } catch (e) {
      console.error("Suhbatdan chiqishda xato:", e.message);
    }
  }
  await next();
});

const mainMenu = new Keyboard()
  .text("📝 E'lon berish").text("🔍 Mashina qidirish").row()
  .text("📂 Mening e'lonlarim").text("🎁 Bepul VIP (UP)").row()
  .text("🧮 Mashina narxini aniqlash").row()
  .text("💳 Bo'lib to'lashni hisoblash").row()
  .text("🔔 Obunalarim").row()
  .text("🏢 Avtosalon bo'lish").text("📢 Salon reklamasi").row()
  // .text("🏆 150.000 so'm Yutib oling!").resized()
  .placeholder("Tugmalarni ochish uchun shu yerni bosing 🎛🎛👉");
/**
 * ✅ МАЖБУРИЙ ОБУНАНИ ТЕКШИРУВЧИ ФУНКЦИЯЛАР
 */
async function isSubscribed(ctx) {
  if (!ctx.from) return true;
  if (ctx.from.id === ADMIN_ID) return true;
  try {
    const member = await ctx.api.getChatMember(CHANNEL_ID, ctx.from.id);
    return ["creator", "administrator", "member"].includes(member.status);
  } catch (e) {
    return false;
  }
}

async function askForSub(ctx) {
  await ctx.reply("❌ <b>Botdan foydalanish uchun kanalimizga obuna bo'ling!</b>", {
    reply_markup: new InlineKeyboard()
      .url("📢 Kanalga o'tish", "https://t.me/engarzonidamoshina").row()
      .text("✅ Obuna bo'ldim", "check_sub_ad"),
    parse_mode: "HTML"
  });
}

bot.callbackQuery("check_sub_ad", async (ctx) => {
  if (await isSubscribed(ctx)) {
    await ctx.deleteMessage();
    await ctx.reply("✅ <b>Obuna tasdiqlandi!</b> Endi menyudan foydalanishingiz mumkin.", { parse_mode: "HTML", reply_markup: mainMenu });
  } else {
    await ctx.answerCallbackQuery({ text: "❌ Hali obuna bo'lmagansiz!", show_alert: true });
  }
});

async function safeAnswerCbq(ctx) {
  try {
    const id = ctx?.callbackQuery?.id || ctx?.update?.callback_query?.id;
    // Tugma bosilganda ekranining tepasida (Toast) xabar chiqadi
    if (id) await ctx.api.answerCallbackQuery(id, { text: "⏳ Iltimos kuting, so'rovingiz qayta ishlanmoqda..." });
  } catch (_) {}
}

async function deleteMsgs(ctx, msgIds) {
  if (!msgIds || msgIds.length === 0) return;

  const idsToDelete = [...msgIds];
  msgIds.length = 0; 
  const chatId = ctx.chat.id; 

  // 1. Tugmani darhol "Kutilmoqda..." ga o'zgartirish
  try {
    await ctx.api.editMessageReplyMarkup(chatId, idsToDelete[0], {
      reply_markup: new InlineKeyboard().text("⏳ Kutilmoqda...", "ignore")
    });
  } catch (e) {}

  // 2. Oltin o'rtaliq: 1.5 soniya (1500 ms) kutish.
  // Bu vaqt ichida bot pastga yangi savolni tashlashga bemalol ulguradi.
  setTimeout(async () => {
    for (const id of idsToDelete) {
      try {
        await bot.api.deleteMessage(chatId, id);
      } catch (e) {}
    }
  }, 1500); 
}
// Watermark kesh
let cachedWatermarkText = null; 

async function createCollage(photoUrls, badgeInfo = null) {
  const buffers = await Promise.all(
    photoUrls.map((url) => axios.get(url, { responseType: "arraybuffer" }).then((res) => res.data))
  );

  const layoutParams = [];
  const canvasWidth = 1200;
  let canvasHeight = 0;
  const len = buffers.length;

  if (len === 1) {
    layoutParams.push({ width: 1200, height: 900, left: 0, top: 0 });
    canvasHeight = 900;
  } else {
    for (let i = 0; i < len; i++) {
      if (i === len - 1 && len % 2 !== 0) {
        layoutParams.push({ width: 1200, height: 600, left: 0, top: Math.floor(i / 2) * 600 });
        canvasHeight = Math.max(canvasHeight, (Math.floor(i / 2) + 1) * 600);
      } else {
        layoutParams.push({ width: 600, height: 600, left: (i % 2) * 600, top: Math.floor(i / 2) * 600 });
        canvasHeight = Math.max(canvasHeight, (Math.floor(i / 2) + 1) * 600);
      }
    }
  }

  const composites = await Promise.all(
    buffers.map(async (buf, i) => {
      const param = layoutParams[i];
      const resized = await sharp(buf).resize(param.width, param.height, { fit: "cover" }).toBuffer();
      return { input: resized, top: param.top, left: param.left };
    })
  );

  const rectHeight = 120;
  const rectY = Math.floor((canvasHeight / 2) - (rectHeight / 2));
  const blackBandSvg = `<svg width="${canvasWidth}" height="${canvasHeight}"><rect x="0" y="${rectY}" width="${canvasWidth}" height="${rectHeight}" fill="rgba(0, 0, 0, 0.5)" /></svg>`;

  composites.push({ input: Buffer.from(blackBandSvg), top: 0, left: 0 });

  if (!cachedWatermarkText) {
    try {
      const url = `https://placehold.co/${canvasWidth}x${rectHeight}/transparent/ffffff/png?text=%40engarzonidamoshina&font=Montserrat`;
      const response = await axios.get(url, { responseType: "arraybuffer" });
      cachedWatermarkText = Buffer.from(response.data);
    } catch (error) {
      console.error("Watermark xatolik:", error.message);
    }
  }

  if (cachedWatermarkText) {
    composites.push({ input: cachedWatermarkText, top: rectY, left: 0 });
  }
    // ================= NARX LENTASI (BURCHAKKA) =================
  if (badgeInfo && badgeInfo.text) {
    const FONT = "DejaVu Sans, Arial, sans-serif";
    // Matn uzunligiga qarab lenta kengligini hisoblaymiz (har harf ~22px)
    const textLen = badgeInfo.text.length;
    const bandWidth = Math.min(textLen * 22 + 60, canvasWidth); // juda uzun bo'lmasligi uchun cheklaymiz
    const bandHeight = 70;
    const bandTop = 30; // yuqoridan 30px past

    const badgeSvg = `
      <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${canvasWidth - bandWidth}" y="${bandTop}" width="${bandWidth}" height="${bandHeight}" fill="${badgeInfo.color}" rx="8" ry="8"/>
        <text x="${canvasWidth - bandWidth / 2}" y="${bandTop + bandHeight / 2 + 12}" font-family="${FONT}" font-size="34" font-weight="bold" fill="#ffffff" text-anchor="middle">${badgeInfo.text}</text>
      </svg>`;

    composites.push({ input: Buffer.from(badgeSvg), top: 0, left: 0 });
  }
  // ===========================================================
  const collagePath = path.join(__dirname, `collage_${Date.now()}.jpg`);
  
  await sharp({
    create: { width: canvasWidth, height: canvasHeight, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toFile(collagePath);

  return collagePath;
}

let cachedFontBase64 = null;

function getFontBase64() {
  if (cachedFontBase64 !== null) return cachedFontBase64;
  try {
    const fontPath = path.join(__dirname, "fonts", "ChartFont.ttf");
    const fontData = fs.readFileSync(fontPath);
    cachedFontBase64 = fontData.toString("base64");
    console.log("✅ Shrift muvaffaqiyatli o'qildi. Hajmi:", fontData.length, "bayt");
    return cachedFontBase64;
  } catch (e) {
    console.error("⚠️ SHRIFT TOPILMADI! Yo'l:", path.join(__dirname, "fonts", "ChartFont.ttf"));
    console.error("Xato:", e.message);
    cachedFontBase64 = ""; // qayta urinmaslik uchun
    return "";
  }
}

async function createPriceChart(title, labels, values) {
  const width = 1200;
  const height = 675;
  const padding = 90;

  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const range = maxVal - minVal || 1;

  const paddingTop = 150;   // Sarlavha uchun tepada ko'proq joy
  const chartW = width - padding * 2;
  const chartH = height - paddingTop - padding;

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1 || 1)) * chartW;
    const y = paddingTop + chartH - ((v - minVal) / range) * chartH;
    return { x, y, val: v, label: labels[i] };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartH} L ${points[0].x} ${paddingTop + chartH} Z`;

  const FONT = "DejaVu Sans, Arial, sans-serif";

  const dots = points.map(p =>
    `<circle cx="${p.x}" cy="${p.y}" r="8" fill="#00b894" stroke="#fff" stroke-width="3"/>
     <text x="${p.x}" y="${p.y - 20}" font-family="${FONT}" font-size="26" font-weight="bold" fill="#2d3436" text-anchor="middle">$${p.val.toLocaleString("en-US")}</text>`
  ).join("");

  const xLabels = points.map(p =>
    `<text x="${p.x}" y="${height - 30}" font-family="${FONT}" font-size="24" fill="#636e72" text-anchor="middle">${p.label}</text>`
  ).join("");

  const svg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#00b894" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#00b894" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="#ffffff"/>
    <text x="${width / 2}" y="55" font-family="${FONT}" font-size="40" font-weight="bold" fill="#2d3436" text-anchor="middle">${title}</text>
    <text x="${width / 2}" y="95" font-family="${FONT}" font-size="24" fill="#00b894" text-anchor="middle">@engarzonidamoshina | Narx dinamikasi</text>
    <path d="${areaPath}" fill="url(#grad)"/>
    <path d="${linePath}" fill="none" stroke="#00b894" stroke-width="5" stroke-linejoin="round"/>
    ${dots}
    ${xLabels}
  </svg>`;

  const chartPath = path.join(__dirname, `chart_${Date.now()}.jpg`);
  await sharp(Buffer.from(svg), { density: 150 }).jpeg({ quality: 90 }).toFile(chartPath);
  return chartPath;
}
// ==============================================================
// 📊 HAFTALIK GRAFIK POST (Eng ommabop moshina bo'yicha)
// ==============================================================
async function sendPriceChartPost() {
  try {
    // Bu hafta eng ko'p e'lon qo'yilgan modelni topamiz
    const [topRows] = await db.execute(`
      SELECT carDetails, COUNT(*) as cnt FROM ads
      WHERE status IN ('active','sold') AND created_at >= NOW() - INTERVAL 7 DAY
      GROUP BY carDetails ORDER BY cnt DESC LIMIT 1
    `);
    if (topRows.length === 0) return;

    const topCar = topRows[0].carDetails;
    const parts = topCar.trim().split(" ");
    const modelKey = parts.length > 1 ? parts.slice(1).join(" ") : topCar;

    const labels = [];
    const values = [];

    // Oxirgi 4 haftaning har biri uchun o'rtacha narxni olamiz
    for (let w = 3; w >= 0; w--) {
      const [[row]] = await db.execute(`
        SELECT AVG(CAST(price AS UNSIGNED)) as avgPrice FROM ads
        WHERE carDetails LIKE ? AND status IN ('active','sold')
          AND created_at >= NOW() - INTERVAL ? DAY
          AND created_at <  NOW() - INTERVAL ? DAY
      `, [`%${modelKey}%`, (w + 1) * 7, w * 7]);

      if (row.avgPrice) {
        labels.push(w === 0 ? "Bu hafta" : `${w} hafta oldin`);
        values.push(Math.round(row.avgPrice));
      }
    }

    // Grafik uchun kamida 2 ta nuqta kerak
    if (values.length < 2) {
      console.log("📭 Grafik uchun narx tarixi yetarli emas.");
      return;
    }

    const chartPath = await createPriceChart(topCar, labels, values);

    const first = values[0];
    const last = values[values.length - 1];
    const diff = last - first;
    let trend = "barqaror turibdi ⚖️";
    if (diff > 0) trend = `<b>${diff.toLocaleString("en-US")}$ ga oshdi 📈</b>`;
    else if (diff < 0) trend = `<b>${Math.abs(diff).toLocaleString("en-US")}$ ga tushdi 📉</b>`;

    const caption =
      `📊 <b>${topCar.toUpperCase()} — NARX DINAMIKASI</b>\n\n` +
      `Oxirgi haftalarda ${topCar} ning o'rtacha bozor narxi ${trend}\n\n` +
      `<i>Ma'lumot kanalimizdagi real e'lonlar asosida hisoblandi.</i>\n\n` +
      `👉 O'z moshinangiz narxini bilish uchun: @arzonida_bot`;

    const kb = new InlineKeyboard()
      .url("🧮 Moshinamni baholash", "https://t.me/arzonida_bot").row()
      .url("➕ Tekin e'lon berish", "https://t.me/arzonida_bot");

    await bot.api.sendPhoto(CHANNEL_ID, new InputFile(chartPath), {
      caption, parse_mode: "HTML", reply_markup: kb
    });

    if (fs.existsSync(chartPath)) fs.unlinkSync(chartPath);
    console.log("✅ Narx grafigi posti yuborildi!");
  } catch (err) {
    console.error("Grafik post xatosi:", err);
  }
}
// Raqamlarni vergul (yoki probel) bilan ajratib beruvchi funksiya
// Probeg matni: raqam bo'lsa "85,000 km", "Salon" bo'lsa "Salon (0 km)", boshqa variant ("Noma'lum") — o'zi
function kmText(v) {
  const t = String(v == null ? "" : v).trim();
  if (!t) return "—";
  if (t === "Salon") return "Salon (0 km)";
  if (/^\d[\d\s,.]*(km)?$/i.test(t)) return `${formatNum(t)} km`;
  return t;
}
// E'lon formasidagi tanlov tugmalari — admin paneldagi ro'yxatdan (catalog.AD_OPTIONS)
function optionKb(kind, prefix, backCb, labels = {}) {
  const vals = catalog.AD_OPTIONS[kind] || [];
  const perRow = vals.some((v) => String(labels[v] || v).length > 12) ? 2 : 3;
  const kb = new InlineKeyboard();
  vals.forEach((v, i) => { kb.text(labels[v] || v, `${prefix}${v}`); if ((i + 1) % perRow === 0) kb.row(); });
  if (vals.length % perRow) kb.row();
  return kb.text("🔙 Orqaga", backCb).text("❌ Bekor", "cancel_ad");
}
const optValue = (data) => String(data || "").slice(String(data || "").indexOf(":") + 1);
function formatNum(value) {
  if (!value) return "0";
  // Faqat raqamlarni ajratib olamiz
  const num = String(value).replace(/\D/g, ""); 
  // "en-US" mingliklarni vergul bilan (17,600) ajratadi. 
  // Agar probel bilan (17 600) ajratishni xohlasangiz "ru-RU" deb yozing.
  return Number(num).toLocaleString("en-US"); 
}
// ==============================================================
// 📊 BOZOR BAHOSI BELGISINI HISOBLASH (Markaziy funksiya)
// ==============================================================
async function getPriceBadge(carDetails, priceRaw, year = null) {
  try {
    const numericPrice = parseInt(String(priceRaw).replace(/\D/g, "")) || 0;
    if (numericPrice <= 0) return "";

    // Model nomini ajratib olamiz (masalan "Chevrolet Cobalt" -> "Cobalt")
    const parts = carDetails.trim().split(" ");
    const modelKey = parts.length > 1 ? parts.slice(1).join(" ") : carDetails;

    // Shu modeldagi boshqa faol e'lonlar o'rtacha narxini olamiz
    // (model ID bo'yicha — "Lexus RX" va "Exeed RX" aralashmaydi; ID siz eski e'lonlar nomi bo'yicha)
    const { modelId } = catalog.matchCarDetails(carDetails);
    const f = catalog.modelFilter(modelId, modelKey);
    let sql = `SELECT AVG(CAST(price AS UNSIGNED)) as avgPrice, COUNT(*) as cnt FROM ads WHERE ${f.sql} AND status = 'active' AND CAST(price AS UNSIGNED) BETWEEN 300 AND 500000`;
    const params = [...f.params];

    // Agar yil berilgan bo'lsa, aniqroq bo'lishi uchun +/- 2 yil oralig'ini olamiz
    if (year) {
      sql += " AND CAST(year AS UNSIGNED) BETWEEN ? AND ?";
      params.push(parseInt(year) - 2, parseInt(year) + 2);
    }

    const [rows] = await db.execute(sql, params);
    const avgPrice = rows[0].avgPrice;
    const cnt = rows[0].cnt;

    // Ishonchli hisob-kitob uchun kamida 3 ta o'xshash e'lon bo'lishi kerak
    if (!avgPrice || cnt < 3) return "";

    const diffPercent = Math.round(((numericPrice - avgPrice) / avgPrice) * 100);

if (diffPercent <= -5) {
      return `\n🔥 <b>Bozordan ${Math.abs(diffPercent)}% arzon!</b>`;
    } else if (diffPercent >= 10) {
      // Qimmat bo'lsa hech narsa yozilmaydi (sotuvchini xafa qilmaslik uchun)
      return "";
    } else {
      return `\n📊 <b>Bozor narxida (o'rtacha)</b>`;
    }
  } catch (e) {
    console.error("Badge hisoblashda xato:", e.message);
    return "";
  }
}
// ==============================================================
// 🎨 RASM UCHUN NARX LENTASI MA'LUMOTINI HISOBLASH
// ==============================================================
async function getPriceBadgeForImage(carDetails, priceRaw, year = null) {
  try {
    const numericPrice = parseInt(String(priceRaw).replace(/\D/g, "")) || 0;
    if (numericPrice <= 0) return null;

    const parts = carDetails.trim().split(" ");
    const modelKey = parts.length > 1 ? parts.slice(1).join(" ") : carDetails;

    const { modelId } = catalog.matchCarDetails(carDetails);
    const f = catalog.modelFilter(modelId, modelKey);
    let sql = `SELECT AVG(CAST(price AS UNSIGNED)) as avgPrice, COUNT(*) as cnt FROM ads WHERE ${f.sql} AND status = 'active' AND CAST(price AS UNSIGNED) BETWEEN 300 AND 500000`;
    const params = [...f.params];

    if (year) {
      sql += " AND CAST(year AS UNSIGNED) BETWEEN ? AND ?";
      params.push(parseInt(year) - 2, parseInt(year) + 2);
    }

    const [rows] = await db.execute(sql, params);
    const avgPrice = rows[0].avgPrice;
    const cnt = rows[0].cnt;

    // Ishonchli hisob uchun kamida 3 ta o'xshash e'lon kerak
    if (!avgPrice || cnt < 3) return null;

    const diffPercent = Math.round(((numericPrice - avgPrice) / avgPrice) * 100);

    if (diffPercent <= -5) {
      // Yashil lenta — arzon
      return { text: `BOZORDAN ${Math.abs(diffPercent)}% ARZON`, color: "#27ae60" };
    } else if (diffPercent >= 10) {
      // Qimmat bo'lsa lenta ko'rsatilmaydi (sotuvchini xafa qilmaslik uchun)
      return null;
    } else {
      // Kulrang lenta — o'rtacha
      return { text: `BOZOR NARXIDA`, color: "#7f8c8d" };
    }
  } catch (e) {
    console.error("Rasm lentasi hisobida xato:", e.message);
    return null;
  }
}

// ==============================================================
// 🧩 E'LON BERISH — UMUMIY QOIDALAR
// Bot (createAdConversation) ham, Mini App (webapp.js) ham shu
// funksiyalardan foydalanadi: cheklovlar va admin xabari bitta joyda.
// ==============================================================
const AD_MIN_PRICE = 300;
const AD_MAX_PRICE = 500000;

// Telegram HTML ni buzadigan belgilarni almashtiramiz va uzunlikni cheklaymiz
function sanitizeText(value, maxLen = 500) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/</g, "‹").replace(/>/g, "›").replace(/&/g, "＆")
    .trim()
    .slice(0, maxLen);
}

// Matnni baytlar bo'yicha qisqartiradi (Telegram tugma ma'lumoti 64 baytdan oshmasligi kerak)
function cutBytes(str, maxBytes) {
  let out = "";
  for (const ch of String(str || "")) {
    if (Buffer.byteLength(out + ch) > maxBytes) break;
    out += ch;
  }
  return out;
}

// Telefon: 901234567 / +998 90 123 45 67 / 998998901234567 -> 998901234567
function normalizePhone(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  // Faqat bitta «998» olinadi va faqat undan keyin to'liq 9 raqam qolsa. Avval «^(998)+» edi —
  // +998 99 8014140 kabi (operator kodi 99 + 8) raqamlarda «998998» ni yeb, raqamni rad etardi.
  if (digits.length > 12) digits = digits.slice(-12);                       // raqam ikki marta yopishib qolgan bo'lsa
  if (digits.length === 12 && digits.startsWith("998")) digits = digits.slice(3); // 998 XX XXX XX XX
  return digits.length === 9 ? `998${digits}` : null;                       // 9 raqam: XX XXX XX XX
}

// Narx: faqat raqam, 300$ dan 500 000$ gacha
function parseAdPrice(raw) {
  const num = parseInt(String(raw || "").replace(/\D/g, ""), 10);
  if (!num) return { error: "❗️ Iltimos, narxni faqat raqamda kiriting (masalan: 8500)." };
  if (num < AD_MIN_PRICE) return { error: "❗️ Narx juda past! Narxni dollarda kiriting (masalan: 8500)." };
  if (num > AD_MAX_PRICE) return { error: "❗️ Narx juda baland! Iltimos, real narxni dollarda kiriting (masalan: 8500)." };
  return { value: String(num) };
}

// Telegram fayl ID laridan yuklab olish havolalari (kollaj uchun)
async function getPhotoUrls(fileIds) {
  return Promise.all(fileIds.map(async (id) => {
    const file = await bot.api.getFile(id);
    return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
  }));
}

// Ko'rib chiqish va admin uchun e'lon matni (bot va Mini App bir xil ko'rinishda)
function buildAdCaption(ad, priceBadge = "") {
  const fullCarName = catalog.carName(ad.brand, ad.model);
  let caption = "";
  if (ad.urgent) caption += `🔥 <b>QAYNOQ NARX!</b>\n\n`;
  caption +=
    `🚗 <b>Moshina:</b> ${fullCarName}\n` +
    `📅 <b>Yili:</b> ${ad.year}\n👣 <b>Probeg:</b> ${kmText(ad.probeg)}\n` +
    `💎 <b>Kraska:</b> ${ad.paint}\n🎨 <b>Rangi:</b> ${ad.color}\n` +
    `⚙️ <b>Korobka:</b> ${ad.trans}\n⛽ <b>Yoqilg'i:</b> ${ad.fuel}\n`;
  if (ad.history && ad.history !== "Ko'rsatilmagan") caption += `🛠 <b>Tarixi:</b> ${ad.history}\n`;
  if (ad.barter && ad.barter !== "Yo'q") caption += `🔄 <b>Barter:</b> ${ad.barter}\n`;
  if (ad.nasiya && ad.nasiya !== "Yo'q") caption += `💳 <b>Nasiya:</b> ${ad.nasiya}\n`;
  if (ad.dealer_offer) caption += `\n🎁 <b>MAXSUS TAKLIF:</b>\n${ad.dealer_offer}\n`;
  caption += `💰 <b>Narxi:</b> ${formatNum(ad.price)}$${priceBadge}\n☎️ <b>Tel:</b> +${ad.phone}\n🚩 <b>Viloyat:</b> ${ad.region}`;
  if (ad.videoId) caption += `\n🎥 <i>(Ushbu e'londa video-obzor mavjud!)</i>`;
  return caption;
}

// Ko'rib chiqish oynasi uchun narx tahlili (shu modelning o'rtacha narxiga solishtiradi)
async function getPreviewPriceBadge(ad) {
  try {
    const numericPrice = parseInt(ad.price) || 0;
    const f = catalog.modelFilter(ad.model_id, ad.model);
    const [avgRows] = await db.execute(
      `SELECT AVG(CAST(price AS UNSIGNED)) as avgPrice FROM ads WHERE ${f.sql} AND status = 'active' AND CAST(price AS UNSIGNED) BETWEEN 300 AND 500000`,
      f.params
    );
    const avgPrice = avgRows[0].avgPrice;
    if (avgPrice && numericPrice < avgPrice * 0.95) return " 🔥 (Qaynoq narx)";
    if (avgPrice && numericPrice > avgPrice * 1.1) return " 📈 (Bozordan biroz qimmat)";
  } catch (e) {
    console.error("Narx analitikasi xatosi:", e);
  }
  return "";
}

// Foydalanuvchi hozir e'lon bera oladimi? (blok, obuna, kutilayotgan e'lon, 3 ta limit)
async function checkCanPostAd(userId) {
  userId = Number(userId);
  if (userId === ADMIN_ID) return { ok: true, isDealer: true, isAdmin: true };

  const [banned] = await db.execute("SELECT userId FROM banned_users WHERE userId = ?", [userId]);
  if (banned.length > 0) {
    return { ok: false, code: "banned", message: "🚫 <b>Kechirasiz, siz botdan bloklangansiz.</b> Endi e'lon bera olmaysiz." };
  }

  let subscribed = false;
  try {
    const member = await bot.api.getChatMember(CHANNEL_ID, userId);
    subscribed = ["creator", "administrator", "member"].includes(member.status);
  } catch (e) {}
  if (!subscribed) {
    return { ok: false, code: "not_subscribed", message: "❌ <b>E'lon berish uchun kanalimizga obuna bo'ling!</b>" };
  }

  const [[pendingAds]] = await db.execute("SELECT COUNT(*) as count FROM ads WHERE userId = ? AND status = 'pending'", [userId]);
  if (pendingAds.count > 0) {
    return { ok: false, code: "pending", message: "⏳ <b>Sizning oldingi e'loningiz hali adminlar tomonidan ko'rib chiqilmoqda.</b>\n\nIltimos, u tasdiqlanguncha yoki rad etilguncha kutib turing." };
  }

  // Diler bo'lsa limit yo'q
  const [[dealerCheck]] = await db.execute("SELECT is_dealer, dealer_paused FROM users WHERE id = ?", [userId]);
  const isDealer = !!(dealerCheck && dealerCheck.is_dealer === 1 && dealerCheck.dealer_paused !== 1);

  const limit = getAdLimit(); // admin paneldan o'zgartiriladi (0 = cheksiz)
  if (!isDealer && limit > 0) {
    const [[activeAds]] = await db.execute("SELECT COUNT(*) as count FROM ads WHERE userId = ? AND status = 'active'", [userId]);
    if (activeAds.count >= limit) {
      return { ok: false, code: "limit", limit, message: `❗️ <b>Sizda cheklov mavjud!</b>\n\nBir vaqtning o'zida eng ko'pi bilan <b>${limit} ta</b> faol e'loningiz bo'lishi mumkin. Yangi e'lon berish uchun '📂 Mening e'lonlarim' bo'limidan eskilarini 'Sotildi' deb belgilang.\n\n💡 <i>Doimiy sotuvchimisiz? «🏢 Avtosalon bo'lish» tugmasi orqali cheksiz e'lon bering!</i>` };
    }
  }
  return { ok: true, isDealer, limit };
}

// Saqlashdan oldin: ID lar to'liq bo'lmasa, to'liq nomdan aniqlashga harakat qilamiz
function resolveAdIds(ad) {
  if (!ad.model_id) {
    const hit = catalog.matchCarDetails(catalog.carName(ad.brand, ad.model));
    ad.brand_id = ad.brand_id || hit.brandId || null;
    if (hit.modelId && (!ad.brand_id || hit.brandId === ad.brand_id)) ad.model_id = hit.modelId;
  }
  return ad;
}

// Yangi e'lonni bazaga (pending) yozadi va adminga tasdiqlash uchun yuboradi. adId qaytaradi.
// receiptFileId — pullik rejimda to'lov cheki (rasm file_id). Admin e'lonni tasdiqlasa — to'lov qabul qilingan bo'ladi.
async function submitNewAdToAdmin({ ad, userId, firstName, source = "bot", receiptFileId = null }) {
  resolveAdIds(ad);
  const fullCarName = catalog.carName(ad.brand, ad.model);
  const priceBadge = await getPreviewPriceBadge(ad);

  const [[pAds]] = await db.execute("SELECT COUNT(*) as count FROM ads WHERE status = 'pending'");
  const [[pEdits]] = await db.execute("SELECT COUNT(*) as count FROM ad_edits");
  const countText = `\n\n📦 <b>Tasdiq kutayotganlar soni: ${pAds.count + pEdits.count + 1} ta</b>`;

  const [result] = await db.execute(
    `INSERT INTO ads (userId, carDetails, brand_id, model_id, year, probeg, paint, color, transmission, fuel, price, phone, region, photoId, history, barter, nasiya, dealer_offer, videoId, source, paid_amount, receiptId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [userId, fullCarName, ad.brand_id || null, ad.model_id || null, ad.year, ad.probeg, ad.paint, ad.color, ad.trans, ad.fuel, ad.price, ad.phone, ad.region, ad.photos.join(","), ad.history || "Ko'rsatilmagan", ad.barter || "Yo'q", ad.nasiya || "Yo'q", ad.dealer_offer || null, ad.videoId || null, source, receiptFileId ? getPrice("ad") : null, receiptFileId || null]
  );
  const adId = result.insertId;
  const paidText = receiptFileId ? `\n💳 <b>Pullik e'lon: ${somFmt(getPrice("ad"))}</b> — chek pastda. Qabul qilsangiz, to'lov tasdiqlangan bo'ladi.` : "";

  const urgentText = ad.urgent ? "\n\n🔥 <b>DIQQAT: Foydalanuvchi «Qaynoq narx» maqomini so'ragan!</b>" : "";
  const sourceText = source === "miniapp" ? "\n📱 <i>Mini App orqali yuborildi</i>" : "";
  const userLink = `<a href="tg://user?id=${userId}">${sanitizeText(firstName, 64) || "Foydalanuvchi"}</a>`;

  const adminKb = new InlineKeyboard();
  if (ad.urgent) {
    adminKb.text("🔥 Qabul (Qaynoq narx)", `approve_hot:${adId}`).text("❌ Rad etish", `reject:${adId}`).row()
           .text("✅ Oddiy qabul qilish", `approve:${adId}`);
  } else {
    adminKb.text("✅ Qabul qilish", `approve:${adId}`).text("❌ Rad etish", `reject:${adId}`).row()
           .text("🔥 Qaynoq narxda qabul qilish", `approve_hot:${adId}`);
  }

  // Rasm izohi 1024 belgidan oshmasligi kerak — oshsa faqat admin ko'radigan matnda "Tarixi" ni qisqartiramiz
  const makeCaption = (a) => `🆔 <b>ID: ${adId}</b>\n\n${buildAdCaption(a, priceBadge)}\n\n👤 Foydalanuvchi: ${userLink}${countText}${urgentText}${sourceText}${paidText}`;
  let adminCaption = makeCaption(ad);
  if (adminCaption.length > 1000 && ad.history && ad.history !== "Ko'rsatilmagan") {
    const keep = Math.max(40, ad.history.length - (adminCaption.length - 1000) - 1);
    adminCaption = makeCaption({ ...ad, history: ad.history.slice(0, keep) + "…" });
  }

  const photoUrls = await getPhotoUrls(ad.photos);
  const adminCollage = await createCollage(photoUrls);
  try {
    const adminMsg = await bot.api.sendPhoto(ADMIN_ID, new InputFile(adminCollage), {
      caption: adminCaption, reply_markup: adminKb, parse_mode: "HTML",
    });
    if (ad.videoId) {
      await bot.api.sendVideo(ADMIN_ID, ad.videoId, { reply_to_message_id: adminMsg.message_id })
        .catch(e => console.error("Adminga video yuborishda xato:", e.message));
    }
    if (receiptFileId) {
      await bot.api.sendPhoto(ADMIN_ID, receiptFileId, {
        caption: `💳 <b>To'lov cheki</b> — e'lon ID: ${adId}, summa: ${somFmt(getPrice("ad"))}`, parse_mode: "HTML",
        reply_parameters: { message_id: adminMsg.message_id, allow_sending_without_reply: true },
      }).catch(e => console.error("Adminga chek yuborishda xato:", e.message));
    }
  } finally {
    if (fs.existsSync(adminCollage)) fs.unlinkSync(adminCollage);
  }
  return adId;
}

// Obuna (alert) shu e'longa mos keladimi: model ID bo'yicha, ID bo'lmasa nomi bo'yicha
function alertMatchesAd(alert, ad) {
  if (alert.model_id && ad.model_id) return Number(alert.model_id) === Number(ad.model_id);
  const q = String(alert.query || "").toLowerCase();
  return q.length > 0 && String(ad.carDetails || "").toLowerCase().includes(q);
}

// Marka tugmalari: callback = `${prefix}:${brandId}` ("Boshqa" = 0)
function brandKeyboard(prefix) {
  const kb = new InlineKeyboard();
  const items = [...catalog.get().brands, { id: 0, name: "Boshqa" }];
  items.forEach((b, i) => { kb.text(b.name, `${prefix}:${b.id}`); if ((i + 1) % 3 === 0) kb.row(); });
  return kb;
}

// Model tugmalari: callback = `${prefix}:${modelId}`
function modelKeyboard(prefix, brandId) {
  const kb = new InlineKeyboard();
  const brand = brandId ? catalog.brandById(brandId) : null;
  (brand ? brand.models : []).forEach((m, i) => { kb.text(m.name, `${prefix}:${m.id}`); if ((i + 1) % 3 === 0) kb.row(); });
  return kb;
}

// Tugma yoki yozilgan matndan markani aniqlaydi -> { id, name } (id: 0 = Boshqa, null = katalogda yo'q)
function parseBrandAnswer(res, prefix) {
  const data = res.callbackQuery?.data;
  let text = res.message?.text;
  if (data && data.startsWith(prefix + ":")) {
    const val = data.slice(prefix.length + 1);
    if (val === "0" || val === "Boshqa") return { id: 0, name: "Boshqa" };
    const b = /^\d+$/.test(val) ? catalog.brandById(val) : null;
    if (b) return { id: b.id, name: b.name };
    text = val; // eski (nomli) tugma bosilgan bo'lsa
  }
  if (!text) return null;
  const found = catalog.findBrand(text);
  if (found) return { id: found.id, name: found.name };
  if (catalog.norm(text) === "boshqa") return { id: 0, name: "Boshqa" };
  return { id: null, name: sanitizeText(text, 40) };
}

// Tugma yoki yozilgan matndan modelni aniqlaydi -> { id, name, brandId }
function parseModelAnswer(res, prefix, brand) {
  const data = res.callbackQuery?.data;
  let text = res.message?.text;
  if (data && data.startsWith(prefix + ":")) {
    const val = data.slice(prefix.length + 1);
    const m = /^\d+$/.test(val) ? catalog.modelById(val) : null;
    if (m) return { id: m.id, name: m.name, brandId: m.brandId };
    text = val; // eski (nomli) tugma
  }
  if (!text) return null;
  text = sanitizeText(text, 60);
  if (brand && brand.id) {
    const m = catalog.findModel(brand.id, text);
    return m ? { id: m.id, name: m.name, brandId: m.brandId } : { id: null, name: text, brandId: brand.id };
  }
  // "Boshqa" yoki katalogda yo'q marka: to'liq nomdan aniqlashga harakat qilamiz ("Changan UNI-K")
  const full = brand && brand.id === null ? `${brand.name} ${text}` : text;
  const hit = catalog.matchCarDetails(full);
  return { id: hit.modelId, name: text, brandId: hit.brandId };
}

// ==============================================================
// 🧩 BOT VA MINI APP UCHUN UMUMIY AMALLAR
// Har bir amal bitta funksiyada: bot ham, Mini App ham shu funksiyani chaqiradi.
// Natija: { ok: true, ... } yoki { ok: false, error: "foydalanuvchiga ko'rsatiladigan matn" }
// ==============================================================
// Kanaldan ilovani ochish havolasi. Kanal postiga "web_app" tugmasini qo'yib bo'lmaydi (Telegram ruxsat
// bermaydi), lekin t.me/<bot>?startapp=... havolasi ilovani to'g'ridan-to'g'ri ochadi.
// Shart: @BotFather → Bot Settings → Configure Mini App yoqilgan bo'lishi kerak.
// Kanal postlarida ilova tugmasini o'chirish kerak bo'lsa: Railway'da APP_BUTTON_IN_CHANNEL=0
const BOT_LINK_USERNAME = String(process.env.BOT_USERNAME || "arzonida_bot").replace(/^@/, "");
const miniAppLink = (param) => `https://t.me/${BOT_LINK_USERNAME}?startapp${param ? "=" + param : ""}`;
const APP_IN_CHANNEL = !!WEBAPP_URL && process.env.APP_BUTTON_IN_CHANNEL !== "0";

// Kanaldagi post havolasi va «ulashish» havolasi (Telegram'da chat tanlash oynasi ochiladi)
const CHANNEL_USERNAME = CHANNEL_ID.replace(/^@/, "");
function channelPostLink(msgId) {
  return `https://t.me/${CHANNEL_USERNAME}/${msgId}`;
}
function channelShareLink(msgId) {
  return `https://t.me/share/url?url=${encodeURIComponent(channelPostLink(msgId))}&text=${encodeURIComponent("🚗 Shu mashinani ko'rib chiq!")}`;
}

// Kanaldagi har bir e'lon ostidagi tugmalar — BARCHA joyda (yangi e'lon, tahrir, UP, narx, VIP) shu bitta funksiya.
// E'lon kanalning o'zida to'liq ko'rinadi (rasm + barcha ma'lumot) — tugmalar faqat qo'shimcha imkoniyat,
// hech kim ilovaga o'tishga majbur emas. Ixcham, 2 qator:
//   [ ❤️ Saqlash ] [ ➕ E'lon berish ]   ← ikkalasi ham botda ochiladi
//   [ 📱 Ilovada ochish ]                ← ixtiyoriy
// Admin panel → ⏰ Avto-xabarlar → «E'lon postining o'zida»: har birini yoqish/o'chirish.
// «↗️ Ulashish» va «👤 Admin» sukut bo'yicha o'chiq (Telegram'da har bir post yonida o'zining ↪ tugmasi bor).
// msgId — kanal xabarining ID si (ulashish havolasi uchun kerak).
const AD_CHANNEL_MARKUP = (adId, msgId = null) => {
  const kb = new InlineKeyboard();
  kb.url("❤️ Saqlash", `https://t.me/${BOT_LINK_USERNAME}?start=fav_${adId}`);
  if (isAutoOn("btn_sell")) kb.url("➕ E'lon berish", `https://t.me/${BOT_LINK_USERNAME}`);
  kb.row();
  const extra = [];
  if (APP_IN_CHANNEL && isAutoOn("btn_app")) extra.push(["📱 Ilovada ochish", miniAppLink(`ad_${adId}`)]);
  if (msgId && isAutoOn("share_btn")) extra.push(["↗️ Ulashish", channelShareLink(msgId)]);
  if (isAutoOn("btn_admin")) extra.push(["👤 Admin", "https://t.me/uzdev75"]);
  if (extra.length) { extra.forEach(([text, url]) => kb.url(text, url)); kb.row(); }
  return kb;
};

// Yangi post kanalga tushgach (xabar ID si endi ma'lum) — «↗️ Yaqinlarga ulashish» tugmasini qo'shamiz
async function addShareButton(adId, msgId) {
  if (!msgId || !isAutoOn("share_btn")) return;
  await bot.api.editMessageReplyMarkup(CHANNEL_ID, msgId, { reply_markup: AD_CHANNEL_MARKUP(adId, msgId) })
    .catch((e) => console.error("Ulashish tugmasini qo'shib bo'lmadi:", e.description || e.message));
}

// E'lon matnining oxiriga «Narxga baho bering» qatori (reaksiyalar aynan shu qator ostida chiqadi).
// Telegram rasm izohi 1024 belgidan oshmasligi kerak — sig'masa, qator qo'shilmaydi.
const PRICE_VOTE_LINE = "👇 <b>Narxga baho bering:</b> 🔥 arzon · 👍 normal · 🤔 qimmat";
const captionVisibleLength = (html) => String(html).replace(/<[^>]*>/g, "").replace(/&(amp|lt|gt|quot|#39);/g, "_").length;
function addPriceVoteLine(caption) {
  if (!isAutoOn("price_vote") || caption.includes("Narxga baho bering")) return caption;
  const out = `${caption}\n\n${PRICE_VOTE_LINE}`;
  return captionVisibleLength(out) <= 1024 ? out : caption;
}
// E'lon joylanganda sotuvchiga: kanalda baho berilishini va natija kelishini aytamiz
function voteHintForSeller() {
  return isAutoOn("price_vote") && isAutoOn("reaction_notify")
    ? "\n\n📊 Kanalda odamlar narxingizga «🔥 arzon · 👍 normal · 🤔 qimmat» deb baho beradi — natijasini sizga yozib turaman."
    : "";
}

// E'lon faol va shu foydalanuvchiniki ekanini tekshiradi
async function getOwnActiveAd(adId, userId) {
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
  const ad = rows[0];
  if (!ad || ad.status !== "active") return { error: "❌ Bu e'lon faol emas yoki allaqachon yopilgan." };
  if (Number(userId) !== ADMIN_ID && Number(ad.userId) !== Number(userId)) return { error: "❌ Bu e'lon sizga tegishli emas." };
  return { ad };
}

// 💰 "Sotildi" so'rovi (ixtiyoriy real sotuv narxi bilan). Admin tasdiqlagach kanalda belgilanadi.
// Bot orqali: so'rov tugma bosilishi bilan DARHOL adminga ketadi, narx esa keyin (ixtiyoriy) qo'shiladi —
// foydalanuvchi narx savoliga javob bermasa ham so'rov yo'qolmaydi.
// Bir e'lon uchun qayta bosilsa, adminga takror so'rov emas, faqat narx (bo'lsa) yuboriladi.
const soldRequests = new Map(); // adId -> { at, adminMsgId }
const SOLD_DEDUP_MS = 6 * 60 * 60 * 1000;
const soldConfirmKb = (adId) => new InlineKeyboard().text("✅ Tasdiqlash (Kanalda belgilash)", `confirm_sold:${adId}`);

async function requestSoldToAdmin({ adId, userId, firstName, soldPrice = null }) {
  const { ad, error } = await getOwnActiveAd(adId, userId);
  if (error) return { ok: false, error };
  let price = null;
  if (soldPrice) {
    const p = parseAdPrice(soldPrice);
    if (p.error) return { ok: false, error: p.error };
    price = p.value;
  }
  const prev = soldRequests.get(Number(ad.id));
  if (prev && Date.now() - prev.at < SOLD_DEDUP_MS) {
    // So'rov allaqachon adminda — narx aytilgan bo'lsa, faqat uni qo'shamiz
    if (price) await saveSoldPrice({ adId: ad.id, userId, soldPrice: price });
    return { ok: true, ad, soldPrice: price, duplicate: true };
  }
  await db.execute("UPDATE ads SET sold_price = ? WHERE id = ?", [price, ad.id]);
  const priceInfo = price ? `\n💰 <b>Sotuv narxi:</b> ${formatNum(price)}$` : `\n💰 <b>Sotuv narxi:</b> <i>hali aytilmadi</i>`;
  const msg = await bot.api.sendMessage(ADMIN_ID,
    `💰 <b>SOTILDI XABARI!</b>\n\n🆔 <b>ID: ${ad.id}</b>\n🚗 <b>Moshina: ${escapeHtml(ad.carDetails)}</b>${priceInfo}\n👤 <b>Uzer:</b> <a href="tg://user?id=${ad.userId}">${sanitizeText(firstName, 64) || "Foydalanuvchi"}</a>`,
    { reply_markup: soldConfirmKb(ad.id), parse_mode: "HTML" }
  );
  soldRequests.set(Number(ad.id), { at: Date.now(), adminMsgId: msg.message_id });
  return { ok: true, ad, soldPrice: price };
}

// Sotuv narxini keyinroq qo'shish (so'rov allaqachon adminga ketgan). Admin tasdiqlab bo'lgan bo'lsa ham
// narx statistikaga yoziladi.
async function saveSoldPrice({ adId, userId, soldPrice }) {
  const [[ad]] = await db.execute("SELECT id, userId, carDetails, status FROM ads WHERE id = ?", [adId]);
  if (!ad || (Number(userId) !== ADMIN_ID && Number(ad.userId) !== Number(userId))) return { ok: false, error: "❌ E'lon topilmadi." };
  const p = parseAdPrice(soldPrice);
  if (p.error) return { ok: false, error: p.error };
  await db.execute("UPDATE ads SET sold_price = ? WHERE id = ?", [p.value, ad.id]);
  const prev = soldRequests.get(Number(ad.id));
  await bot.api.sendMessage(ADMIN_ID,
    `💰 <b>Sotuv narxi aytildi:</b> ${formatNum(p.value)}$\n🆔 ID: ${ad.id} — ${escapeHtml(ad.carDetails)}` +
      (ad.status === "sold" ? "\n<i>E'lon allaqachon «Sotildi» deb belgilangan — narx statistikaga yozildi.</i>" : ""),
    {
      parse_mode: "HTML",
      ...(prev ? { reply_parameters: { message_id: prev.adminMsgId, allow_sending_without_reply: true } } : {}),
      ...(ad.status === "active" ? { reply_markup: soldConfirmKb(ad.id) } : {}),
    }
  ).catch((e) => console.error("Sotuv narxini adminga yuborib bo'lmadi:", e.description || e.message));
  return { ok: true, soldPrice: p.value };
}

// 📉 Narxni o'zgartirish: kanaldagi e'lon yangilanadi; narx tushsa "Qaynoq narx" posti va saqlaganlarga xabar
async function changeAdPrice({ adId, userId, newPrice }) {
  const { ad, error } = await getOwnActiveAd(adId, userId);
  if (error) return { ok: false, error };
  const p = parseAdPrice(newPrice);
  if (p.error) return { ok: false, error: p.error };
  newPrice = p.value;

  const newCaption = addPriceVoteLine(vipHeader(ad) +
    `🆔 ID: ${ad.id}\n🚗 Moshina: ${ad.carDetails}\n📅 Yili: ${ad.year}\n👣 Probeg: ${kmText(ad.probeg)}\n` +
    `💎 Kraskasi: ${ad.paint}\n🎨 Rangi: ${ad.color}\n✅ Karobka: ${ad.transmission}\n` +
    `⛽ Yoqilg'i: ${ad.fuel}\n💰 Narxi: <s>${formatNum(ad.price)} $</s> <b>${formatNum(newPrice)}$ 📉</b>\n☎️ +${ad.phone}\n🚩 #${String(ad.region).replace(/\s+/g, "_")}\n\n` +
    `⚠️ Moshina savdosiga admin javobgar emas, oldindan to'lov qilmang. Ogohlik davr talabi ❗\n\n👉 ${inviteLink()}`);
  const channelMarkup = AD_CHANNEL_MARKUP(ad.id, ad.channelMsgId);

  try {
    await bot.api.editMessageCaption(CHANNEL_ID, ad.channelMsgId, { caption: newCaption, reply_markup: channelMarkup, parse_mode: "HTML" });
  } catch (e) {
    console.error("Narx: kanaldagi xabarni yangilab bo'lmadi:", e.message);
    return { ok: false, error: "❌ Kanaldagi xabarni yangilab bo'lmadi. Ehtimol eski xabar kanaldan o'chirilgan bo'lishi mumkin." };
  }
  try {
    const SECOND_CHANNEL_ID = process.env.SECOND_CHANNEL_ID;
    if (SECOND_CHANNEL_ID && ad.secondChannelMsgId) {
      await bot.api.editMessageCaption(SECOND_CHANNEL_ID, ad.secondChannelMsgId, { caption: newCaption, reply_markup: AD_CHANNEL_MARKUP(ad.id), parse_mode: "HTML" });
    }
  } catch (err) {
    console.error("2-kanaldagi xabarni yangilashda xato (Narx):", err.message);
  }

  const oldPriceNum = parseInt(ad.price) || 0; // yangilashdan oldin eslab qolamiz
  const newPriceNum = parseInt(newPrice) || 0;
  await db.execute("UPDATE ads SET price = ? WHERE id = ?", [newPrice, ad.id]);
  // 📉 «Narxi tushdi» belgisi: 7 kun ichida bir necha marta tushirilsa, eng birinchi (eski) narx saqlanadi
  if ((parseInt(newPrice) || 0) < (parseInt(ad.price) || 0)) {
    const keepOld = recentDrop(ad) ? ad.old_price : ad.price;
    await db.execute("UPDATE ads SET old_price = ?, price_dropped_at = NOW() WHERE id = ?", [keepOld, ad.id]).catch(() => {});
  } else {
    await db.execute("UPDATE ads SET old_price = NULL, price_dropped_at = NULL WHERE id = ?", [ad.id]).catch(() => {});
  }

  const diff = oldPriceNum - newPriceNum;
  if (diff > 0) {
    const hotPriceText =
      `🔥 <b>QAYNOQ NARX! Mashina arzonlashdi!</b>\n\n` +
      `🚗 <b>${ad.carDetails}</b>\n` +
      `❌ Eski narxi: <s>${oldPriceNum}$</s>\n` +
      `✅ Yangi narxi: <b>${newPriceNum}$ 📉</b>\n\n` +
      `👆 <i>E'lonni to'liq ko'rish uchun tepadagi xabarga bosing</i>`;
    if (isAutoOn("hot_price")) try {
      await bot.api.sendMessage(CHANNEL_ID, hotPriceText, { parse_mode: "HTML", reply_to_message_id: ad.channelMsgId });
      const SECOND_CHANNEL_ID = process.env.SECOND_CHANNEL_ID;
      if (SECOND_CHANNEL_ID && ad.secondChannelMsgId) {
        await bot.api.sendMessage(SECOND_CHANNEL_ID, hotPriceText, { parse_mode: "HTML", reply_to_message_id: ad.secondChannelMsgId });
      }
    } catch (err) {
      console.error("Kanalga qaynoq narx xabarini yuborishda xato:", err.message);
    }
    // Saqlaganlarga xabar (orqa fonda — javobni kutib turmaydi)
    (async () => {
      const [favs] = await db.execute("SELECT userId FROM favorites WHERE adId = ?", [ad.id]);
      for (const fav of favs) {
        try {
          await bot.api.sendMessage(fav.userId,
            `🔔 <b>SIZ KUZATAYOTGAN MOSHINA ARZONLASHDI!</b>\n\n` +
            `🚗 <b>${ad.carDetails}</b> narxi <b>${diff}$</b> ga tushdi.\n\n` +
            `❌ Eski narx: <s>${oldPriceNum}$</s>\n` +
            `✅ Yangi narx: <b>${newPriceNum}$</b>\n\n` +
            `Kanalda ko'rish: https://t.me/engarzonidamoshina/${ad.channelMsgId}`,
            { parse_mode: "HTML" }
          );
          await delay(50);
        } catch (e) {
          if (e.error_code === 429) await delay((e.parameters?.retry_after || 1) * 1000);
        }
      }
    })().catch((e) => console.error("Saqlaganlarga xabar yuborishda xato:", e));
  }
  return { ok: true, ad, oldPrice: String(oldPriceNum), newPrice, dropped: diff > 0 };
}

// ✏️ To'liq tahrir so'rovi: ad_edits ga yoziladi, admin tasdiqlagach kanaldagi e'lon yangilanadi
async function submitAdEditToAdmin({ adId, ad, userId, firstName, source = "bot" }) {
  const own = await getOwnActiveAd(adId, userId);
  if (own.error) return { ok: false, error: own.error };
  resolveAdIds(ad);
  const fullCarName = catalog.carName(ad.brand, ad.model);
  const priceBadge = await getPreviewPriceBadge(ad);
  const caption = buildAdCaption(ad, priceBadge);

  const [[pAds]] = await db.execute("SELECT COUNT(*) as count FROM ads WHERE status = 'pending'");
  const [[pEdits]] = await db.execute("SELECT COUNT(*) as count FROM ad_edits");
  const countText = `\n\n📦 <b>Tasdiq kutayotganlar soni: ${pAds.count + pEdits.count + 1} ta</b>`;
  const urgentTextEdit = ad.urgent ? "\n\n🔥 <b>Diqqat: Foydalanuvchi «Qaynoq narx» maqomini so'ragan!</b>" : "";
  const sourceText = source === "miniapp" ? "\n📱 <i>Mini App orqali yuborildi</i>" : "";

  const [result] = await db.execute(
    `INSERT INTO ad_edits (oldAdId, userId, carDetails, brand_id, model_id, year, probeg, paint, color, transmission, fuel, price, phone, region, photoId, history, barter, nasiya, dealer_offer, videoId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [own.ad.id, userId, fullCarName, ad.brand_id || null, ad.model_id || null, ad.year, ad.probeg, ad.paint, ad.color, ad.trans, ad.fuel, ad.price, ad.phone, ad.region, ad.photos.join(","), ad.history || "Ko'rsatilmagan", ad.barter || "Yo'q", ad.nasiya || "Yo'q", ad.dealer_offer || null, ad.videoId || null]
  );
  const editId = result.insertId;

  const photoUrls = await getPhotoUrls(ad.photos);
  const adminCollage = await createCollage(photoUrls);
  try {
    let adminCaption = `🔄 <b>E'LONNI YANGILASH SO'ROVI!</b>\n\n🆔 <b>Eski ID: ${own.ad.id}</b>\n\n${caption}\n\n👤 Foydalanuvchi: <a href="tg://user?id=${userId}">${sanitizeText(firstName, 64) || "Foydalanuvchi"}</a>${countText}${urgentTextEdit}${sourceText}`;
    if (adminCaption.length > 1020) adminCaption = adminCaption.slice(0, 1000) + "…";
    const adminMsg = await bot.api.sendPhoto(ADMIN_ID, new InputFile(adminCollage), {
      caption: adminCaption,
      reply_markup: new InlineKeyboard().text("✅ O'zgarishni tasdiqlash", `approve_edit:${editId}`).text("❌ Rad etish", `reject_edit:${editId}`),
      parse_mode: "HTML",
    });
    if (ad.videoId) await bot.api.sendVideo(ADMIN_ID, ad.videoId, { reply_to_message_id: adminMsg.message_id }).catch(() => {});
  } finally {
    if (fs.existsSync(adminCollage)) fs.unlinkSync(adminCollage);
  }
  return { ok: true, editId };
}

// 🌟 VIP so'rovi: to'lov cheki adminga boradi, tasdiqlansa e'lon kanal tepasiga qadaladi
async function submitVipRequest({ adId, userId, firstName, username, screenshotFileId, kind = "vip" }) {
  if (!PROMOS[kind]) kind = "vip";
  if (!promoEnabled(kind)) return { ok: false, error: `⏸ ${PROMOS[kind].title} xizmati hozir vaqtincha to'xtatilgan.` };
  const { ad, error } = await getOwnActiveAd(adId, userId);
  if (error) return { ok: false, error };
  const [saveRes] = await db.execute(
    "INSERT INTO vip_requests (userId, adId, screenshotId, status, kind, amount) VALUES (?,?,?,'pending',?,?)",
    [userId, ad.id, screenshotFileId, kind, getPrice(kind)]
  );
  const vipReqId = saveRes.insertId;
  const usernameStr = username ? `@${username}` : "yo'q";
  const adminCaption =
    `${PROMOS[kind].title} — <b>YANGI TO'LOV SO'ROVI!</b>\n\n` +
    `🚗 <b>Moshina:</b> ${ad.carDetails}\n` +
    `🆔 <b>E'lon ID:</b> ${ad.id}\n` +
    `💰 <b>Summa:</b> ${somFmt(getPrice(kind))} (${promoDays(kind)} kun)\n` +
    `👤 <b>Foydalanuvchi:</b> <a href="tg://user?id=${userId}">${sanitizeText(firstName, 64) || "Foydalanuvchi"}</a> (${usernameStr})\n\n` +
    `<i>Chekni tekshiring va tasdiqlang yoki rad eting:</i>`;
  await bot.api.sendPhoto(ADMIN_ID, screenshotFileId, {
    caption: adminCaption,
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
      .text(`✅ Tasdiqlash (${PROMOS[kind].short})`, `vip_approve:${vipReqId}`)
      .text("❌ Rad etish", `vip_reject:${vipReqId}`),
  });
  return { ok: true, vipReqId };
}

// 🚀 Bepul UP (do'st taklif qilib yig'ilgan bonus): e'lon kanalda eng pastga (eng yangi qatorga) ko'tariladi
async function useFreeUp({ adId, userId }) {
  const [[user]] = await db.execute("SELECT free_ups FROM users WHERE id = ?", [userId]);
  if (!user || user.free_ups <= 0) return { ok: false, error: "❌ Sizda bepul UP bonusi tugagan. Do'stlaringizni taklif qilib yangisini oling!" };
  const { ad, error } = await getOwnActiveAd(adId, userId);
  if (error) return { ok: false, error };

  let newMsgId;
  try {
    const newMsg = await bot.api.copyMessage(CHANNEL_ID, CHANNEL_ID, ad.channelMsgId, { reply_markup: AD_CHANNEL_MARKUP(ad.id) });
    newMsgId = newMsg.message_id;
    if (ad.videoId) {
      try { await bot.api.sendVideo(CHANNEL_ID, ad.videoId, { reply_to_message_id: newMsgId }); } catch (e) {}
    }
    await bot.api.deleteMessage(CHANNEL_ID, ad.channelMsgId).catch(() => {});
  } catch (copyErr) {
    return { ok: false, error: "❌ Kanaldagi e'lon topilmadi. Bepul UP amalga oshmadi." };
  }
  await db.execute("UPDATE ads SET channelMsgId = ? WHERE id = ?", [newMsgId, ad.id]);
  await addShareButton(ad.id, newMsgId);
  await repinIfVip(ad, newMsgId);
  await db.execute("UPDATE users SET free_ups = free_ups - 1 WHERE id = ?", [userId]);
  return { ok: true, freeUpsLeft: user.free_ups - 1, channelMsgId: newMsgId };
}

// 🧮 Baholash: shu model (±2 yil) e'lonlari va sotilganlarining o'rtacha narxi asosida oraliq
async function estimateCarPrice({ modelId, model, year }) {
  const f = catalog.modelFilter(modelId, model);
  const [rows] = await db.execute(`SELECT price, year FROM ads WHERE ${f.sql} AND status IN ('active', 'sold')`, f.params);
  const targetYear = parseInt(year);
  const validPrices = rows
    .filter(r => Math.abs((parseInt(r.year) || 0) - targetYear) <= 2)
    .map(r => parseInt(String(r.price).replace(/\D/g, "")))
    .filter(p => p > 1000 && p < 200000);
  if (validPrices.length === 0) return { ok: false, error: "Bazamizda bu moshina uchun yetarli ma'lumot yo'q." };
  const avg = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
  return {
    ok: true,
    minPrice: Math.round((avg * 0.94) / 100) * 100,
    maxPrice: Math.round((avg * 1.06) / 100) * 100,
    count: validPrices.length,
  };
}

// 🏢 Avtosalon (diler) arizasi
async function submitDealerApplication({ userId, firstName, username, name, phone }) {
  const [[u]] = await db.execute("SELECT is_dealer FROM users WHERE id = ?", [userId]);
  if (u && u.is_dealer === 1) return { ok: false, code: "already", error: "✅ Siz allaqachon tasdiqlangan avtosalonsiz!" };
  const dealerName = sanitizeText(name, 80);
  if (dealerName.length < 2) return { ok: false, error: "❗️ Nom juda qisqa. Qaytadan urinib ko'ring." };
  const dealerPhone = normalizePhone(phone);
  if (!dealerPhone) return { ok: false, error: "❗️ To'g'ri raqam kiriting. (Masalan: 901234567)" };

  await db.execute("INSERT IGNORE INTO users (id, first_name, username) VALUES (?, ?, ?)", [userId, String(firstName || "").slice(0, 255), username ? `@${username}` : ""]);
  await db.execute("UPDATE users SET dealer_name = ?, dealer_phone = ? WHERE id = ?", [dealerName, dealerPhone, userId]);

  const usernameStr = username ? `@${username}` : "yo'q";
  const adminText =
    `🏢 <b>YANGI AVTOSALON SO'ROVI!</b>\n\n` +
    `📛 <b>Salon nomi:</b> ${dealerName}\n` +
    `☎️ <b>Telefon:</b> +${dealerPhone}\n` +
    `👤 <b>Foydalanuvchi:</b> <a href="tg://user?id=${userId}">${sanitizeText(firstName, 64) || "Foydalanuvchi"}</a> (${usernameStr})\n` +
    `🆔 <b>ID:</b> <code>${userId}</code>\n\n` +
    `<i>Ushbu foydalanuvchini avtosalon sifatida tasdiqlaysizmi?</i>`;
  await bot.api.sendMessage(ADMIN_ID, adminText, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text("✅ Tasdiqlash", `dealer_approve:${userId}`).text("❌ Rad etish", `dealer_reject:${userId}`),
  });
  return { ok: true, dealerName, dealerPhone };
}

// 📢 Salon reklamasi: faqat tasdiqlangan avtosalonlar, kunlik limit admin panelda (sukut bo'yicha 2 ta)
async function getSalonAdStatus(userId) {
  const [uRows] = await db.execute("SELECT is_dealer, dealer_paused, dealer_name, dealer_phone FROM users WHERE id = ?", [userId]);
  const user = uRows[0];
  const [cRows] = await db.execute(
    "SELECT COUNT(*) as count FROM salon_ads WHERE userId = ? AND DATE(created_at) = CURDATE() AND status != 'rejected'",
    [userId]
  );
  const isDealer = !!(user && user.is_dealer === 1 && user.dealer_paused !== 1);
  const todayCount = cRows[0].count;
  let error = null, code = null;
  if (!isDealer) { code = "not_dealer"; error = "❌ <b>Bu bo'lim faqat tasdiqlangan avtosalonlar uchun.</b>\n\nAgar siz doimiy sotuvchi bo'lsangiz, «🏢 Avtosalon bo'lish» tugmasi orqali ariza qoldiring."; }
  else if (todayCount >= salonDailyLimit()) { code = "limit"; error = `⏳ <b>Bugungi reklama limitingiz tugadi.</b>\n\nBir kunda eng ko'pi bilan <b>${salonDailyLimit()} ta</b> salon reklamasi bera olasiz. Ertaga qaytadan urinib ko'ring.`; }
  return { ok: !error, code, error, user: user || null, todayCount, dailyLimit: salonDailyLimit(), dealerName: user?.dealer_name || null, dealerPhone: user?.dealer_phone || null };
}

async function getSalonCredits(userId) {
  const [[u]] = await db.execute("SELECT salon_credits FROM users WHERE id = ?", [userId]);
  return Number(u && u.salon_credits) || 0;
}
// plan: "single" | "pack5" | "pin" (chek bilan) yoki "credit" (paketdan, chek kerak emas). Bepul rejimda — "free".
async function submitSalonAd({ userId, adText, mediaType, mediaId, thumbId = null, location, phone, plan = null, receiptId = null }) {
  const st = await getSalonAdStatus(userId);
  if (!st.ok) return { ok: false, code: st.code, error: st.error };
  let price = null;
  if (!paidSalonOn() || Number(userId) === ADMIN_ID) { plan = "free"; receiptId = null; }
  else if (plan === "credit") {
    const [r] = await db.execute("UPDATE users SET salon_credits = salon_credits - 1 WHERE id = ? AND salon_credits > 0", [userId]);
    if (!r || !r.affectedRows) return { ok: false, code: "no_credits", error: "❗️ Paketingizda post qolmagan. Tarifni tanlab, to'lov qiling." };
    receiptId = null;
  } else if (SALON_PLANS[plan]) {
    if (!receiptId) return { ok: false, code: "receipt_required", error: "❗️ To'lov chekini (skrinshot) yuboring." };
    price = getPrice(SALON_PLANS[plan].priceKey);
  } else return { ok: false, code: "plan_required", error: "❗️ Tarifni tanlang." };
  adText = String(adText || "").trim();
  if (adText.length < 10) return { ok: false, error: "❗️ Matn juda qisqa. Qaytadan urinib ko'ring." };
  if (!["photo", "video"].includes(mediaType) || !mediaId) return { ok: false, error: "❗️ Iltimos, video yoki rasm yuboring." };
  location = String(location || "").trim();
  phone = String(phone || "").trim() || `+${st.dealerPhone}`;

  const [saveResult] = await db.execute(
    "INSERT INTO salon_ads (userId, salonName, adText, mediaType, mediaId, location, phone, status, plan, price, receiptId, thumbId) VALUES (?,?,?,?,?,?,?,'pending',?,?,?,?)",
    [userId, st.dealerName, adText, mediaType, mediaId, location, phone, plan, price, receiptId, thumbId || null]
  );
  const salonAdId = saveResult.insertId;
  const adminCaption =
    `📢 <b>YANGI SALON REKLAMASI!</b>\n\n` +
    `🏢 <b>Salon:</b> ${st.dealerName}\n\n` +
    `${adText}\n\n` +
    `📍 <b>Manzil:</b> ${location}\n` +
    `📞 <b>Tel:</b> ${phone}\n\n` +
    `👤 <a href="tg://user?id=${userId}">Profil</a> | 🆔 <code>${userId}</code>` +
    (plan === "credit" ? `\n\n🎟 <b>Paketdan</b> (to'lov oldin qilingan)` :
     SALON_PLANS[plan] ? `\n\n💳 <b>${SALON_PLANS[plan].title}: ${somFmt(price)}</b> — chek pastda.` +
       (plan === "pack5" ? " Tasdiqlasangiz, yana 4 ta post paketiga qo'shiladi." : plan === "pin" ? " Tasdiqlasangiz, 24 soatga qadaladi." : "") : "") +
    `\n📍 <b>Joylashuv:</b> ${[salonPlacement(plan).channel ? "kanal" : null, salonPlacement(plan).app ? `ilova (${salonAppDays()} kun)` : null].filter(Boolean).join(" + ")}`;
  const adminKb = new InlineKeyboard().text("✅ Tasdiqlash", `salon_approve:${salonAdId}`).text("❌ Rad etish", `salon_reject:${salonAdId}`);
  const sent = mediaType === "video"
    ? await bot.api.sendVideo(ADMIN_ID, mediaId, { caption: adminCaption.slice(0, 1024), parse_mode: "HTML", reply_markup: adminKb })
    : await bot.api.sendPhoto(ADMIN_ID, mediaId, { caption: adminCaption.slice(0, 1024), parse_mode: "HTML", reply_markup: adminKb });
  if (receiptId) {
    await bot.api.sendPhoto(ADMIN_ID, receiptId, {
      caption: `💳 Salon reklamasi to'lov cheki — ${SALON_PLANS[plan].title}, ${somFmt(price)}`,
      reply_parameters: { message_id: sent.message_id, allow_sending_without_reply: true },
    }).catch(e => console.error("Adminga chek yuborishda xato:", e.message));
  }
  return { ok: true, salonAdId };
}

// 🎁 Referal (do'st taklif qilib bepul UP olish) ma'lumotlari
let cachedBotUsername = null;
async function getReferralInfo(userId) {
  const [rows] = await db.execute("SELECT referral_count, free_ups FROM users WHERE id = ?", [userId]);
  const user = rows[0] || { referral_count: 0, free_ups: 0 };
  if (!cachedBotUsername) cachedBotUsername = (await bot.api.getMe()).username;
  const refLink = `https://t.me/${cachedBotUsername}?start=ref_${userId}`;
  const shareMessage =
    "🚗 O'zbekistondagi eng qulay onlayn Avto-Bozor!\n\n" +
    "💸 E'lon berish mutlaqo BEPUL.\n" +
    "🔍 O'zingiz izlagan moshinani juda oson toping.\n\n" +
    "👇 Hoziroq botga kirib ko'ring:\n" +
    refLink;
  return {
    ok: true,
    refLink,
    shareUrl: `https://t.me/share/url?text=${encodeURIComponent(shareMessage)}`,
    referralCount: user.referral_count || 0,
    freeUps: user.free_ups || 0,
    left: 5 - ((user.referral_count || 0) % 5),
  };
}
/**
 * ✅ 1. АДМИН ПАНЕЛЬ ЖАРАЁНИ (РАССЫЛКА)
 */
async function broadcastConversation(conversation, ctx) {
  const adminMenu = new InlineKeyboard().text("📊 Statistika", "admin_stats").row().text("📢 Rassilka", "admin_broadcast").row().text("❌ Yopish", "admin_close");
  
  await ctx.reply("📢 <b>Rassilka uchun xabarni yuboring:</b>\n<i>(Matn, rasm, video yuborishingiz mumkin. Bekor qilish uchun /cancel)</i>", { parse_mode: "HTML" });
  const res = await conversation.waitFor("message");
  
  if (res.message.text === "/cancel") {
    return ctx.reply("❌ Rassilka bekor qilindi.", { reply_markup: adminMenu });
  }

  const waitMsg = await ctx.reply("⏳ <i>Xabar yuborilmoqda... Bu biroz vaqt olishi mumkin.</i>", { parse_mode: "HTML" });
  
  // Barcha foydalanuvchilarni bazadan olamiz
  const [users] = await db.execute("SELECT id FROM users");
  let success = 0;
  let failed = 0;

  for (const u of users) {
    try {
      await ctx.api.copyMessage(u.id, res.chat.id, res.message.message_id);
      success++;
      await new Promise(r => setTimeout(r, 50)); // Telegram limitiga tushmaslik uchun 50ms pauza
    } catch (error) {
      failed++; // Botni bloklagan uzerlar
    }
  }

  await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
  await ctx.reply(`✅ <b>Rassilka tugadi!</b>\n\n🟢 Muvaffaqiyatli: ${success} ta\n🔴 Bloklangan/Xato: ${failed} ta`, { parse_mode: "HTML", reply_markup: adminMenu });
}
bot.use(createConversation(broadcastConversation));

/**
 * ✅ АДМИН БУЙРУҚЛАРИ
 */
const adminMenu = new InlineKeyboard()
  .text("📊 Statistika", "admin_stats")
  .text("⏳ Kutayotganlar", "admin_pending").row()
  .text("📢 Rassilka", "admin_broadcast")
  .text("🏆 Konkurs (Top-10)", "admin_top").row()
  .text("🏢 Avtosalonlar", "admin_dealers").row()
  .text("📢 Reklamalar", "admin_salon_ads").row()
  .text("⭐ Statuslar: hisobot va faollar", "admin_vip").row()
  .text("🚗 Kunlik TOP-5 yuborish", "admin_test_top5")
  .text("📈 Haftalik Analitika", "admin_test_analytics").row()
  .text("🔎 Top qidiruvlar", "admin_topsearch")
  .text("📊 Narx grafigi", "admin_chart").row()
  .text("🔔 7-kunlik UP xabar jo'natish", "admin_send_7day").row()
  .text("⏰ Avto-xabarlar (yoqish / o'chirish)", "admin_autoposts").row()
  .text("📏 E'lon limiti (foydalanuvchilar)", "admin_adlimit").row()
  .text("💰 Narxlar va to'lovlar", "admin_prices").row()
  .text("⚙️ Sozlamalar (karta, havola, limitlar)", "admin_settings").row()
  .text("🚗 Katalog: marka, model, variantlar", "admin_catalog").row()
  .text("🛠 Boshqa buyruqlar (Qo'llanma)", "admin_help").row()
  .text("❌ Yopish", "admin_close");

bot.command("admin", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.reply("👨‍💻 <b>Boshqaruv paneliga xush kelibsiz!</b>\n\nQuyidagi tugmalar orqali botdagi barcha jarayonlarni birgina bosish bilan boshqarishingiz mumkin:", { reply_markup: adminMenu, parse_mode: "HTML" });
});
// Orqaga qaytish tugmasi
bot.callbackQuery("admin_back", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.editMessageText("👨‍💻 <b>Boshqaruv paneliga xush kelibsiz!</b>\n\nQuyidagi tugmalar orqali botdagi barcha jarayonlarni birgina bosish bilan boshqarishingiz mumkin:", { reply_markup: adminMenu, parse_mode: "HTML" });
});
// ❌ Yopish tugmasi
bot.callbackQuery("admin_close", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.deleteMessage().catch(() => {});
});

// =====================================================================
// ⏰ AVTO-XABARLAR: bot o'zi yuboradigan xabarlarni admin paneldan yoqish/o'chirish
// =====================================================================
// run — «▶️» tugmasi bilan hozir yuborib ko'rish mumkin bo'lganlari (faqat kanal postlari)
const AUTO_POSTS = [
  { key: "sellcall13", group: "kanal", btn: "E'lon bering · 13:00", title: "📣 «E'lon bering» posti", when: "har kuni 13:00", run: () => sendSellCallPost() },
  { key: "sellcall19", group: "kanal", btn: "E'lon bering · 19:00", title: "📣 «E'lon bering» posti", when: "har kuni 19:00", run: () => sendSellCallPost() },
  { key: "top3", group: "kanal", btn: "Eng arzon TOP-3 · 20:00", title: "🚗 Eng arzon TOP-3", when: "har kuni 20:00", run: () => sendDailyTop3() },
  { key: "weekly_analytics", group: "kanal", btn: "Haftalik analitika", title: "📊 Haftalik analitika", when: "yakshanba 10:00", run: () => sendWeeklyAnalytics() },
  { key: "weekly_topsearch", group: "kanal", btn: "Top qidiruvlar", title: "🔎 Eng ko'p qidirilganlar", when: "yakshanba 10:00", run: () => sendTopSearched() },
  { key: "weekly_chart", group: "kanal", btn: "Narx grafigi", title: "📈 Narx grafigi", when: "yakshanba 10:00", run: () => sendPriceChartPost() },
  { key: "hot_price", group: "voqea", btn: "Qaynoq narx", title: "🔥 «Qaynoq narx» posti", when: "e'lon narxi tushganda" },
  { key: "sold_congrats", group: "voqea", btn: "Sotildi tabrigi", title: "🎉 «Yana bitta moshina sotildi»", when: "e'lon sotilganda" },
  { key: "remind_new", group: "sotuvchi", btn: "Yangi e'lonni ko'tarish", title: "🆕 Yangi e'lonni ko'tarish taklifi", when: "12:00, e'lonning 1–3-kuni" },
  { key: "remind_price5", group: "sotuvchi", btn: "Narx maslahati (5-kun)", title: "💡 Narxni tushirish maslahati", when: "12:00, 5-kuni" },
  { key: "remind_up7", group: "sotuvchi", btn: "UP taklifi (7-kun)", title: "🔔 Tepaga ko'tarish (UP) taklifi", when: "12:00, 7-kuni" },
  { key: "reaction_notify", group: "sotuvchi", btn: "Kanaldagi baho natijasi", title: "📊 «N kishi 🔥 arzon / 🤔 qimmat dedi»", when: "3, 10, 25… kishi baho berganda" },
  { key: "price_vote", group: "post", btn: "«Narxga baho bering» qatori", title: "👇 «Narxga baho bering: 🔥 · 👍 · 🤔»", when: "yangi va tahrirlangan e'lon matnida" },
  { key: "btn_sell", group: "post", btn: "«E'lon berish» tugmasi", title: "➕ «E'lon berish» tugmasi", when: "e'lon ostida, «Saqlash» yonida" },
  { key: "btn_app", group: "post", btn: "«Ilovada ochish» tugmasi", title: "📱 «Ilovada ochish» tugmasi", when: "2-qator, ixtiyoriy" },
  { key: "share_btn", group: "post", btn: "«Ulashish» tugmasi", title: "↗️ «Ulashish» tugmasi", when: "2-qator (Telegram'da ↪ tugmasi bor)" },
  { key: "btn_admin", group: "post", btn: "«Admin» tugmasi", title: "👤 «Admin» tugmasi", when: "2-qator" },
];
const AUTO_GROUPS = [
  ["kanal", "📢 <b>Kanalga — jadval bo'yicha</b>"],
  ["voqea", "📢 <b>Kanalga — voqea bo'lganda</b>"],
  ["post", "📝 <b>E'lon postining o'zida</b>"],
  ["sotuvchi", "👤 <b>Sotuvchilarga — shaxsiy eslatma</b>"],
];
function autoPostsView() {
  let text = "⏰ <b>AVTO-XABARLAR</b>\n\nBot o'zi yuboradigan xabarlar. Tugmani bossangiz — yoqiladi yoki o'chadi. " +
    "Sozlama bazada saqlanadi, bot qayta ishga tushsa ham o'zgarmaydi.\n";
  if (channelVoteWarning && (isAutoOn("price_vote") || isAutoOn("reaction_notify"))) {
    text += `\n⚠️ <b>Kanalda ${channelVoteWarning} reaksiyasi yoqilmagan!</b> Kanal → ✏️ Tahrirlash → Reaksiyalar bo'limida yoqing, aks holda odamlar baho bera olmaydi.\n`;
  }
  const kb = new InlineKeyboard();
  for (const [g, title] of AUTO_GROUPS) {
    text += `\n${title}\n`;
    for (const p of AUTO_POSTS.filter((x) => x.group === g)) {
      const on = isAutoOn(p.key);
      text += `${on ? "✅" : "⛔️"} ${p.title} — <i>${p.when}</i>\n`;
      kb.text(`${on ? "✅" : "⛔️"} ${p.btn}`, `ap_t:${p.key}`);
      if (p.run) kb.text("▶️ Hozir", `ap_run:${p.key}`);
      kb.row();
    }
  }
  text += "\n<i>▶️ Hozir — postni darhol kanalga yuborib ko'rish (o'chirilgan bo'lsa ham).</i>" +
    "\n<i>📝 E'lon tugmalarini o'zgartirgach, kanaldagi eski e'lonlarga ham qo'llash: /tugmalar</i>";
  kb.text("⛔️ Hammasini o'chirish", "ap_all:0").text("✅ Hammasini yoqish", "ap_all:1").row()
    .text("🔙 Orqaga", "admin_back");
  return { text, kb };
}
async function showAutoPosts(ctx) {
  const { text, kb } = autoPostsView();
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb }).catch(() => {});
}
bot.callbackQuery("admin_autoposts", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCallbackQuery().catch(() => {});
  await ctx.answerCallbackQuery().catch(() => {});
  await checkChannelReactions(); // 🔥 👍 🤔 kanalda yoqilganini tekshiramiz
  await showAutoPosts(ctx);
});
bot.callbackQuery(/^ap_t:(\w+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCallbackQuery().catch(() => {});
  const p = AUTO_POSTS.find((x) => x.key === ctx.match[1]);
  if (!p) return ctx.answerCallbackQuery({ text: "Topilmadi" }).catch(() => {});
  const on = !isAutoOn(p.key);
  try { await setAutoOn(p.key, on); }
  catch (e) { return ctx.answerCallbackQuery({ text: "Saqlab bo'lmadi, qayta urinib ko'ring.", show_alert: true }).catch(() => {}); }
  await ctx.answerCallbackQuery({ text: `${on ? "✅ Yoqildi" : "⛔️ O'chirildi"}: ${p.btn}` }).catch(() => {});
  await showAutoPosts(ctx);
});
bot.callbackQuery(/^ap_all:([01])$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCallbackQuery().catch(() => {});
  const on = ctx.match[1] === "1";
  try { for (const p of AUTO_POSTS) await setAutoOn(p.key, on); }
  catch (e) { return ctx.answerCallbackQuery({ text: "Saqlab bo'lmadi, qayta urinib ko'ring.", show_alert: true }).catch(() => {}); }
  await ctx.answerCallbackQuery({ text: on ? "✅ Hammasi yoqildi" : "⛔️ Hammasi o'chirildi" }).catch(() => {});
  await showAutoPosts(ctx);
});
bot.callbackQuery(/^ap_run:(\w+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCallbackQuery().catch(() => {});
  const p = AUTO_POSTS.find((x) => x.key === ctx.match[1] && x.run);
  if (!p) return ctx.answerCallbackQuery({ text: "Bu xabarni qo'lda yuborib bo'lmaydi." }).catch(() => {});
  await ctx.answerCallbackQuery({ text: "⏳ Kanalga yuborilmoqda..." }).catch(() => {});
  await p.run();
  await ctx.reply(`✅ <b>${p.title}</b> — bajarildi, kanalni tekshiring.\n<i>Mos ma'lumot bo'lmasa (masalan, oxirgi 24 soatda e'lon yo'q), post chiqmaydi.</i>`, { parse_mode: "HTML" });
});
// =====================================================================
// 📏 E'LON LIMITI: oddiy foydalanuvchi bir vaqtda nechta faol e'lon bera oladi
// =====================================================================
const AD_LIMIT_CHOICES = [1, 2, 3, 4, 5, 7, 10, 15, 20];
function adLimitView() {
  const cur = getAdLimit();
  const text =
    "📏 <b>E'LON LIMITI</b>\n\n" +
    "Oddiy foydalanuvchi bir vaqtning o'zida nechta <b>faol</b> e'longa ega bo'la oladi.\n\n" +
    `Hozir: <b>${cur === 0 ? "cheksiz" : cur + " ta"}</b>\n\n` +
    "<i>• Avtosalonlar va admin uchun limit yo'q.\n" +
    "• Tekshiruvdagi e'loni bor foydalanuvchi u tasdiqlanguncha yangisini bera olmaydi (bu qoida o'zgarmaydi).\n" +
    "• Limitni kamaytirsangiz, ortiqcha faol e'lonlar o'chmaydi — faqat yangi e'lon berish to'xtaydi.</i>";
  const kb = new InlineKeyboard();
  AD_LIMIT_CHOICES.forEach((n, i) => {
    kb.text(`${n === cur ? "✅ " : ""}${n} ta`, `lim_set:${n}`);
    if (i === 4) kb.row();
  });
  kb.row().text(`${cur === 0 ? "✅ " : ""}♾ Cheksiz`, "lim_set:0").row().text("🔙 Orqaga", "admin_back");
  return { text, kb };
}
bot.callbackQuery("admin_adlimit", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCallbackQuery().catch(() => {});
  await ctx.answerCallbackQuery().catch(() => {});
  const { text, kb } = adLimitView();
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb }).catch(() => {});
});
bot.callbackQuery(/^lim_set:(\d+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCallbackQuery().catch(() => {});
  const n = parseInt(ctx.match[1], 10);
  if (!(n === 0 || AD_LIMIT_CHOICES.includes(n))) return ctx.answerCallbackQuery({ text: "Noto'g'ri qiymat" }).catch(() => {});
  try { await setBotSetting("limit:active_ads", n); }
  catch (e) { return ctx.answerCallbackQuery({ text: "Saqlab bo'lmadi, qayta urinib ko'ring.", show_alert: true }).catch(() => {}); }
  await ctx.answerCallbackQuery({ text: `✅ E'lon limiti: ${n === 0 ? "cheksiz" : n + " ta"}` }).catch(() => {});
  const { text, kb } = adLimitView();
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb }).catch(() => {});
});

// =====================================================================
// 💰 NARXLAR VA TO'LOVLAR: VIP, salon reklamasi tariflari, pullik e'lon rejimi
// =====================================================================
let adminPriceEdit = null; // admin hozir qaysi narxni yozyapti (masalan "vip")
let adminInput = null;     // admin hozir nima yozyapti: { type: "setting" | "grant_id" | "grant_days", ... }
function pricesView() {
  const ads = paidAdsOn(), salon = paidSalonOn();
  const text =
    "💰 <b>NARXLAR VA TO'LOVLAR</b>\n\n" +
    "⭐ <b>E'lon statuslari:</b>\n" +
    PROMO_KINDS.map((k) => `• ${PROMOS[k].title}: <b>${somFmt(getPrice(k))}</b> — <b>${promoDays(k)} kun</b>${promoEnabled(k) ? "" : " · ⏸ <i>o'chirilgan</i>"}`).join("\n") + "\n" +
    "<i>Muddat tasdiqlagan paytingizdan hisoblanadi; tugashidan 1 kun oldin bot eslatadi, tugasa statusni o'zi oladi. 🟢/⏸ — statusni sotuvga yoqish yoki vaqtincha o'chirish (faol bo'lganlari muddatigacha ishlaydi).</i>\n\n" +
    `📢 <b>Salon reklamasi:</b> ${salon ? "💳 pullik" : "🆓 bepul"}\n` +
    SALON_PLAN_KEYS.map((k) => `• ${SALON_PLANS[k].title}: <b>${somFmt(getPrice(SALON_PLANS[k].priceKey))}</b>`).join("\n") + "\n" +
    "<i>Ilovada: bozor tepasidagi «Avtosalonlar takliflari» lentasi va e'lonlar orasidagi reklama kartasi.</i>\n\n" +
    `📝 <b>Oddiy e'lonlar:</b> ${ads ? `💳 pullik — <b>${somFmt(getPrice("ad"))}</b>` : `🆓 bepul <i>(yoqilsa: ${somFmt(getPrice("ad"))})</i>`}\n\n` +
    "<i>Pullik rejimda foydalanuvchi kartaga o'tkazib, chek skrinshotini yuboradi (VIP dagidek). " +
    "Siz e'lonni tasdiqlasangiz — to'lov qabul qilingan bo'ladi, rad etsangiz — pulni qaytarasiz. Siz (admin) uchun hammasi bepul.</i>";
  const kb = new InlineKeyboard()
    .text("✏️ 🚨 narxi", "pr_edit:urgent").text("⏳ 🚨 muddati", "pr_edit:urgent_days").row()
    .text("✏️ ⬆️ TOP narxi", "pr_edit:top").text("⏳ TOP muddati", "pr_edit:top_days").row()
    .text("✏️ 🌟 VIP narxi", "pr_edit:vip").text("⏳ VIP muddati", "pr_edit:vip_days").row()
    .text("✏️ 💎 Premium narxi", "pr_edit:premium").text("⏳ Premium muddati", "pr_edit:premium_days").row()
    .text(`${promoEnabled("urgent") ? "🟢" : "⏸"} Shoshilinch`, "pr_toggle:urgent").text(`${promoEnabled("top") ? "🟢" : "⏸"} TOP`, "pr_toggle:top")
    .text(`${promoEnabled("vip") ? "🟢" : "⏸"} VIP`, "pr_toggle:vip").text(`${promoEnabled("premium") ? "🟢" : "⏸"} Premium`, "pr_toggle:premium").row()
    .text("✏️ 📢 Kanal", "pr_edit:salon_single").text("✏️ 📱 Ilova", "pr_edit:salon_app").text("✏️ 📢📱 Ikkalasi", "pr_edit:salon_both").row()
    .text("✏️ 📦 5 post", "pr_edit:salon_pack5").text("✏️ 📌 Qadash", "pr_edit:salon_pin").text("⏳ Ilovada kun", "pr_edit:salon_app_days").row()
    .text("✏️ E'lon narxi", "pr_edit:ad").row()
    .text(salon ? "🆓 Salon reklamasini bepul qilish" : "💳 Salon reklamasini pullik qilish", `pr_mode:salon:${salon ? 0 : 1}`).row()
    .text(ads ? "🆓 E'lonlarni bepulga qaytarish" : "💳 E'lonlarni pullikka o'tkazish", `pr_mode:ads:${ads ? 0 : 1}`).row()
    .text("⚙️ Karta, havola va boshqa sozlamalar", "admin_settings").row()
    .text("🔙 Orqaga", "admin_back");
  return { text, kb };
}
bot.callbackQuery("admin_prices", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCallbackQuery().catch(() => {});
  adminPriceEdit = null;
  await ctx.answerCallbackQuery().catch(() => {});
  const { text, kb } = pricesView();
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb }).catch(() => {});
});
bot.callbackQuery(/^pr_edit:(\w+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCallbackQuery().catch(() => {});
  const key = ctx.match[1];
  adminInput = null;
  if (key === "salon_app_days") {
    adminPriceEdit = key;
    await ctx.answerCallbackQuery().catch(() => {});
    return ctx.reply(`⏳ <b>Salon reklamasi ilovada necha kun tursin?</b>\nHozir: ${salonAppDays()} kun\n\nRaqam yozing (1 dan 90 gacha), masalan: <code>7</code>\nBekor qilish: /cancel`, { parse_mode: "HTML" });
  }
  if (/_days$/.test(key) && PROMOS[key.slice(0, -5)]) {
    const kind = key.slice(0, -5);
    adminPriceEdit = key;
    await ctx.answerCallbackQuery().catch(() => {});
    return ctx.reply(`⏳ <b>${PROMOS[kind].title} muddati</b>\nHozir: ${promoDays(kind)} kun\n\nNecha kun bo'lsin? Raqam yozing (1 dan 90 gacha), masalan: <code>7</code>\nBekor qilish: /cancel\n\n<i>Yangi muddat bundan keyin tasdiqlanadigan to'lovlarga qo'llanadi.</i>`, { parse_mode: "HTML" });
  }
  if (!PRICE_DEFAULTS[key]) return ctx.answerCallbackQuery({ text: "Noma'lum narx" }).catch(() => {});
  adminPriceEdit = key;
  await ctx.answerCallbackQuery().catch(() => {});
  await ctx.reply(`✏️ <b>${PRICE_TITLES[key]}</b>\nHozir: ${somFmt(getPrice(key))}\n\nYangi narxni so'mda raqam bilan yozing, masalan: <code>30000</code>\nBekor qilish: /cancel`, { parse_mode: "HTML" });
});
bot.callbackQuery(/^pr_mode:(ads|salon):([01])$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCallbackQuery().catch(() => {});
  const [, what, on] = ctx.match;
  try { await setBotSetting(`paid:${what}`, on); }
  catch (e) { return ctx.answerCallbackQuery({ text: "Saqlab bo'lmadi, qayta urinib ko'ring.", show_alert: true }).catch(() => {}); }
  await ctx.answerCallbackQuery({ text: (what === "ads" ? "📝 E'lonlar: " : "📢 Salon reklamasi: ") + (on === "1" ? "pullik" : "bepul"), show_alert: true }).catch(() => {});
  const { text, kb } = pricesView();
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb }).catch(() => {});
});

// 🟢/⏸ Statusni sotuvga yoqish / vaqtincha o'chirish
bot.callbackQuery(/^pr_toggle:(urgent|top|vip|premium)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCallbackQuery().catch(() => {});
  const kind = ctx.match[1];
  try { await setBotSetting(`promo_off:${kind}`, promoEnabled(kind) ? "1" : "0"); }
  catch (e) { return ctx.answerCallbackQuery({ text: "Saqlab bo'lmadi, qayta urinib ko'ring.", show_alert: true }).catch(() => {}); }
  await ctx.answerCallbackQuery({ text: `${PROMOS[kind].title}: ${promoEnabled(kind) ? "sotuvga yoqildi" : "vaqtincha o'chirildi"}` }).catch(() => {});
  const { text, kb } = pricesView();
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb }).catch(() => {});
});

// ⚙️ SOZLAMALAR: to'lov kartasi, kanal havolasi, TOP vaqti, salon limiti
const SETTING_FIELDS = {
  card: { title: "💳 Karta raqami", ask: "Yangi karta raqamini yozing (16 ta raqam), masalan: <code>8600 1234 5678 9012</code>" },
  card_name: { title: "👤 Karta egasi", ask: "Karta egasining ism-familiyasini yozing, masalan: <code>Zuhriddin Mustafoyev</code>" },
  invite: { title: "🔗 Postlar oxiridagi havola", ask: "Kanal postlari oxiridagi havolani yozing (https://t.me/ bilan boshlansin)" },
  top_hours: { title: "🕗 TOP avto-UP vaqti", ask: "Avto-UP qaysi soatlar oralig'ida ishlasin? Masalan: <code>8-22</code> (Toshkent vaqti)" },
  salon_limit: { title: "📢 Salon reklamasi: kunlik limit", ask: "Bitta avtosalon kuniga nechta reklama bera olsin? (1 dan 20 gacha)" },
};
function settingsView() {
  const th = topHours();
  const text =
    "⚙️ <b>SOZLAMALAR</b>\n\n" +
    `💳 Karta: <code>${payCard()}</code>\n👤 Egasi: <b>${escapeHtml(payCardName())}</b>\n` +
    "<i>Bu karta VIP, TOP, Shoshilinch, Premium, pullik e'lon va salon reklamasi to'lovlarining hammasida (bot va ilovada) ko'rsatiladi.</i>\n\n" +
    `🔗 Postlar oxiridagi havola: ${inviteLink()}\n` +
    "<i>Yangi postlarda va qayta yoziladigan postlarda qo'llanadi.</i>\n\n" +
    `🕗 TOP avto-UP vaqti: <b>${String(th.from).padStart(2, "0")}:00 – ${String(th.to).padStart(2, "0")}:00</b>\n` +
    `📢 Salon reklamasi: kuniga <b>${salonDailyLimit()} ta</b>`;
  const kb = new InlineKeyboard()
    .text("✏️ Karta raqami", "st_edit:card").text("✏️ Karta egasi", "st_edit:card_name").row()
    .text("✏️ Havola", "st_edit:invite").row()
    .text("✏️ TOP vaqti", "st_edit:top_hours").text("✏️ Salon limiti", "st_edit:salon_limit").row()
    .text("💰 Narxlar va to'lovlar", "admin_prices").row()
    .text("🔙 Orqaga", "admin_back");
  return { text, kb };
}
bot.callbackQuery("admin_settings", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCallbackQuery().catch(() => {});
  adminInput = null; adminPriceEdit = null;
  await ctx.answerCallbackQuery().catch(() => {});
  const { text, kb } = settingsView();
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb, disable_web_page_preview: true }).catch(() => ctx.reply(text, { parse_mode: "HTML", reply_markup: kb, disable_web_page_preview: true }));
});
bot.callbackQuery(/^st_edit:(card|card_name|invite|top_hours|salon_limit)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCallbackQuery().catch(() => {});
  const field = ctx.match[1];
  adminPriceEdit = null;
  adminInput = { type: "setting", field };
  await ctx.answerCallbackQuery().catch(() => {});
  await ctx.reply(`${SETTING_FIELDS[field].title}\n\n${SETTING_FIELDS[field].ask}\n\nBekor qilish: /cancel`, { parse_mode: "HTML", disable_web_page_preview: true });
});
// Yozilgan qiymatni tekshirib saqlash: { ok, value } yoki { error }
async function saveSettingInput(field, t) {
  if (field === "card") {
    const d = t.replace(/\D/g, "");
    if (d.length !== 16) return { error: "❗️ Karta raqami 16 ta raqamdan iborat bo'lishi kerak. Qayta yozing yoki /cancel." };
    await setBotSetting("pay:card", d.replace(/(\d{4})(?=\d)/g, "$1 "));
  } else if (field === "card_name") {
    const v = sanitizeText(t, 64);
    if (!v || v.length < 3) return { error: "❗️ Ism juda qisqa. Qayta yozing yoki /cancel." };
    await setBotSetting("pay:card_name", v);
  } else if (field === "invite") {
    if (!/^https:\/\/t\.me\/\S+$/.test(t) || t.length > 200) return { error: "❗️ Havola https://t.me/ bilan boshlanishi kerak. Qayta yozing yoki /cancel." };
    await setBotSetting("link:invite", t);
  } else if (field === "top_hours") {
    const m = /^(\d{1,2})\s*[-–:]\s*(\d{1,2})$/.exec(t);
    const f = m ? +m[1] : -1, to = m ? +m[2] : -1;
    if (!m || f < 0 || to > 24 || f >= to) return { error: "❗️ Masalan <code>8-22</code> ko'rinishida yozing (boshlanish oxiridan kichik bo'lsin). Qayta yozing yoki /cancel." };
    await setBotSetting("top:from", f); await setBotSetting("top:to", to);
  } else if (field === "salon_limit") {
    const n = parseInt(t, 10);
    if (!/^\d+$/.test(t) || n < 1 || n > 20) return { error: "❗️ 1 dan 20 gacha raqam yozing. Qayta yozing yoki /cancel." };
    await setBotSetting("limit:salon_daily", n);
  }
  return { ok: true };
}

// 🎁 STATUSNI QO'LDA BERISH / OLIB TASHLASH (to'lovsiz bonus, sinov yoki xatoni tuzatish)
function grantView(ad) {
  let text = `🎁 <b>STATUS BERISH / OLIB TASHLASH</b>\n\n🆔 ${ad.id} — <b>${escapeHtml(ad.carDetails)}</b>\n💰 ${formatNum(ad.price)}$\n\n`;
  const act = PROMO_KINDS.filter((k) => tsActive(ad[PROMOS[k].col]));
  text += act.length ? act.map((k) => `${PROMOS[k].title}: ${fmtTash(ad[PROMOS[k].col])} gacha`).join("\n") : "<i>Hozir hech qanday status yo'q.</i>";
  text += "\n\n➕ — status berish yoki uzaytirish (kun sonini so'rayman), ✖️ — darhol olib tashlash.";
  const kb = new InlineKeyboard();
  PROMO_KINDS.forEach((k) => {
    kb.text(`➕ ${PROMOS[k].short}`, `pg_add:${k}:${ad.id}`);
    if (tsActive(ad[PROMOS[k].col])) kb.text(`✖️ ${PROMOS[k].short}`, `pg_del:${k}:${ad.id}`);
    kb.row();
  });
  kb.text("🔢 Boshqa e'lon", "admin_promo_grant").text("🔙 Orqaga", "admin_vip");
  return { text, kb };
}
bot.callbackQuery("admin_promo_grant", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCallbackQuery().catch(() => {});
  adminPriceEdit = null;
  adminInput = { type: "grant_id" };
  await ctx.answerCallbackQuery().catch(() => {});
  await ctx.reply("🎁 Qaysi e'longa? <b>E'lon ID</b> sini yozing (masalan <code>735</code>).\nBekor qilish: /cancel", { parse_mode: "HTML" });
});
bot.callbackQuery(/^pg_add:(urgent|top|vip|premium):(\d+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCallbackQuery().catch(() => {});
  const [, kind, id] = ctx.match;
  adminPriceEdit = null;
  adminInput = { type: "grant_days", kind, adId: Number(id) };
  await ctx.answerCallbackQuery().catch(() => {});
  await ctx.reply(`${PROMOS[kind].title} — necha kun? (1 dan 90 gacha)\nOdatdagi muddat: <b>${promoDays(kind)} kun</b> — shuni yozishingiz mumkin: <code>${promoDays(kind)}</code>\nBekor qilish: /cancel`, { parse_mode: "HTML" });
});
bot.callbackQuery(/^pg_del:(urgent|top|vip|premium):(\d+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCallbackQuery().catch(() => {});
  const [, kind, id] = ctx.match;
  const [[ad]] = await db.execute("SELECT * FROM ads WHERE id = ?", [id]);
  if (!ad) return ctx.answerCallbackQuery({ text: "E'lon topilmadi.", show_alert: true }).catch(() => {});
  await removePromo(ad, kind);
  await ctx.answerCallbackQuery({ text: `${PROMOS[kind].title} olib tashlandi` }).catch(() => {});
  const { text, kb } = grantView(ad);
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb }).catch(() => ctx.reply(text, { parse_mode: "HTML", reply_markup: kb }));
});

// 🚗 KATALOG: marka/model va e'lon formasidagi variantlar (kraska, rang, korobka, yoqilg'i, probeg)
function catalogHomeView() {
  const c = catalog.get();
  const models = c.brands.reduce((n, b) => n + b.models.length, 0);
  const O = catalog.AD_OPTIONS;
  let text = `🚗 <b>KATALOG VA VARIANTLAR</b>\n\n🏷 Markalar: <b>${c.brands.length}</b> · Modellar: <b>${models}</b>\n\n`;
  for (const [k, title] of Object.entries(catalog.EDITABLE_OPTIONS)) text += `${title}: ${O[k].map(escapeHtml).join(", ")}\n`;
  text += "\n<i>O'zgarishlar bot va ilovadagi e'lon formasida, qidiruv filtrlarida darhol ko'rinadi.</i>";
  const kb = new InlineKeyboard()
    .text("🏷 Markalar va modellar", "cat_brands:0").row()
    .text("➕ Yangi marka", "cat_addbrand").row();
  const keys = Object.keys(catalog.EDITABLE_OPTIONS);
  keys.forEach((k, i) => { kb.text(catalog.EDITABLE_OPTIONS[k], `opt_k:${k}`); if (i % 2 === 1) kb.row(); });
  if (keys.length % 2) kb.row();
  kb.text("🔙 Orqaga", "admin_back");
  return { text, kb };
}
const CAT_PAGE = 30;
function brandsView(page) {
  const brands = catalog.get().brands;
  const pages = Math.max(1, Math.ceil(brands.length / CAT_PAGE));
  page = Math.min(Math.max(0, page), pages - 1);
  const kb = new InlineKeyboard();
  brands.slice(page * CAT_PAGE, (page + 1) * CAT_PAGE).forEach((b, i) => { kb.text(`${b.name} (${b.models.length})`, `cat_b:${b.id}`); if (i % 3 === 2) kb.row(); });
  kb.row();
  if (pages > 1) { if (page > 0) kb.text("⬅️", `cat_brands:${page - 1}`); kb.text(`${page + 1}/${pages}`, "ignore"); if (page < pages - 1) kb.text("➡️", `cat_brands:${page + 1}`); kb.row(); }
  kb.text("➕ Yangi marka", "cat_addbrand").row().text("🔙 Orqaga", "admin_catalog");
  return { text: "🏷 <b>MARKALAR</b>\n\nMarkani tanlang — uning modellari chiqadi, yangi model qo'shishingiz mumkin.", kb };
}
function brandView(b) {
  let text = `🏷 <b>${escapeHtml(b.name)}</b> — ${b.models.length} ta model\n\n`;
  text += b.models.length ? b.models.map((m) => escapeHtml(m.name)).join(", ") : "<i>Hali model yo'q.</i>";
  text += "\n\nModelni bossangiz — tafsiloti va o'chirish. Bir nechta modelni vergul bilan birga qo'shish mumkin.";
  const kb = new InlineKeyboard().text("➕ Model qo'shish", `cat_addmodel:${b.id}`).row();
  b.models.slice(0, 60).forEach((m, i) => { kb.text(m.name, `cat_m:${m.id}`); if (i % 3 === 2) kb.row(); });
  kb.row();
  if (!b.models.length) kb.text("🗑 Markani o'chirish", `cat_delb:${b.id}`).row();
  kb.text("🔙 Markalar", "cat_brands:0");
  return { text, kb };
}
function optionsView(kind) {
  const vals = catalog.AD_OPTIONS[kind];
  let text = `${catalog.EDITABLE_OPTIONS[kind]}\n\n` + vals.map((v, i) => `${i + 1}. ${escapeHtml(v)}`).join("\n") +
    "\n\nVariantni bossangiz — o'chirish so'raladi. Yangi variant ro'yxat oxiriga qo'shiladi.";
  if (kind === "probegs") text += "\n<i>Probeg variantlari raqam o'rniga tanlanadi, masalan «Noma'lum». «Salon» — yangi mashina (0 km).</i>";
  const kb = new InlineKeyboard().text("➕ Variant qo'shish", `opt_add:${kind}`).row();
  vals.forEach((v, i) => { kb.text(`🗑 ${v}`, `opt_d:${kind}:${i}`); if (i % 2 === 1) kb.row(); });
  kb.row().text("🔙 Orqaga", "admin_catalog");
  return { text, kb };
}
const editOrReply = (ctx, v) => ctx.editMessageText(v.text, { parse_mode: "HTML", reply_markup: v.kb }).catch(() => ctx.reply(v.text, { parse_mode: "HTML", reply_markup: v.kb }));
const adminOnly = (fn) => async (ctx) => { if (ctx.from.id !== ADMIN_ID) return ctx.answerCallbackQuery().catch(() => {}); return fn(ctx); };

bot.callbackQuery("admin_catalog", adminOnly(async (ctx) => {
  adminInput = null; adminPriceEdit = null;
  await ctx.answerCallbackQuery().catch(() => {});
  await editOrReply(ctx, catalogHomeView());
}));
bot.callbackQuery(/^cat_brands:(\d+)$/, adminOnly(async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  await editOrReply(ctx, brandsView(Number(ctx.match[1])));
}));
bot.callbackQuery(/^cat_b:(\d+)$/, adminOnly(async (ctx) => {
  const b = catalog.brandById(ctx.match[1]);
  if (!b) return ctx.answerCallbackQuery({ text: "Marka topilmadi.", show_alert: true }).catch(() => {});
  await ctx.answerCallbackQuery().catch(() => {});
  await editOrReply(ctx, brandView(b));
}));
bot.callbackQuery(/^cat_m:(\d+)$/, adminOnly(async (ctx) => {
  const m = catalog.modelById(ctx.match[1]);
  if (!m) return ctx.answerCallbackQuery({ text: "Model topilmadi.", show_alert: true }).catch(() => {});
  await ctx.answerCallbackQuery().catch(() => {});
  const used = await catalog.usageCount(db, "model_id", m.id).catch(() => 0);
  const text = `🚗 <b>${escapeHtml(m.brandName)} ${escapeHtml(m.name)}</b>\n\n📋 Ishlatilgan: <b>${used}</b> ta e'lon / obuna` +
    (used ? "\n<i>E'lonlarda ishlatilgan model o'chirilmaydi.</i>" : "");
  const kb = new InlineKeyboard();
  if (!used) kb.text("🗑 Modelni o'chirish", `cat_delm:${m.id}`).row();
  kb.text(`🔙 ${m.brandName}`, `cat_b:${m.brandId}`);
  await editOrReply(ctx, { text, kb });
}));
bot.callbackQuery(/^cat_delm:(\d+)$/, adminOnly(async (ctx) => {
  const m = catalog.modelById(ctx.match[1]);
  const r = await catalog.removeModel(db, ctx.match[1]);
  if (!r.ok) return ctx.answerCallbackQuery({ text: r.error, show_alert: true }).catch(() => {});
  await ctx.answerCallbackQuery({ text: `🗑 ${m.name} o'chirildi` }).catch(() => {});
  const b = catalog.brandById(m.brandId);
  await editOrReply(ctx, b ? brandView(b) : brandsView(0));
}));
bot.callbackQuery(/^cat_delb:(\d+)$/, adminOnly(async (ctx) => {
  const r = await catalog.removeBrand(db, ctx.match[1]);
  if (!r.ok) return ctx.answerCallbackQuery({ text: r.error, show_alert: true }).catch(() => {});
  await ctx.answerCallbackQuery({ text: `🗑 ${r.brand.name} o'chirildi` }).catch(() => {});
  await editOrReply(ctx, brandsView(0));
}));
bot.callbackQuery("cat_addbrand", adminOnly(async (ctx) => {
  adminPriceEdit = null; adminInput = { type: "cat_brand" };
  await ctx.answerCallbackQuery().catch(() => {});
  await ctx.reply("➕ <b>Yangi marka</b>\n\nMarka nomini yozing, masalan: <code>Changan</code>\nBekor qilish: /cancel", { parse_mode: "HTML" });
}));
bot.callbackQuery(/^cat_addmodel:(\d+)$/, adminOnly(async (ctx) => {
  const b = catalog.brandById(ctx.match[1]);
  if (!b) return ctx.answerCallbackQuery({ text: "Marka topilmadi.", show_alert: true }).catch(() => {});
  adminPriceEdit = null; adminInput = { type: "cat_model", brandId: b.id };
  await ctx.answerCallbackQuery().catch(() => {});
  await ctx.reply(`➕ <b>${escapeHtml(b.name)}</b> — yangi model\n\nModel nomini yozing. Bir nechtasini vergul bilan: <code>CS35 Plus, CS55, UNI-K</code>\nBekor qilish: /cancel`, { parse_mode: "HTML" });
}));
bot.callbackQuery(/^opt_k:(\w+)$/, adminOnly(async (ctx) => {
  if (!catalog.EDITABLE_OPTIONS[ctx.match[1]]) return ctx.answerCallbackQuery().catch(() => {});
  adminInput = null;
  await ctx.answerCallbackQuery().catch(() => {});
  await editOrReply(ctx, optionsView(ctx.match[1]));
}));
bot.callbackQuery(/^opt_add:(\w+)$/, adminOnly(async (ctx) => {
  const kind = ctx.match[1];
  if (!catalog.EDITABLE_OPTIONS[kind]) return ctx.answerCallbackQuery().catch(() => {});
  adminPriceEdit = null; adminInput = { type: "opt_add", kind };
  await ctx.answerCallbackQuery().catch(() => {});
  const ex = { paints: "Faqat kosmetika", colors: "Jigarrang", transmissions: "DSG", fuels: "Gaz (faqat)", probegs: "Noma'lum" }[kind];
  await ctx.reply(`➕ ${catalog.EDITABLE_OPTIONS[kind]} — yangi variant\n\nNomini yozing (2–24 belgi), masalan: <code>${ex}</code>\nBekor qilish: /cancel`, { parse_mode: "HTML" });
}));
bot.callbackQuery(/^opt_d:(\w+):(\d+)$/, adminOnly(async (ctx) => {
  const [, kind, idx] = ctx.match;
  const v = (catalog.AD_OPTIONS[kind] || [])[Number(idx)];
  if (!v) return ctx.answerCallbackQuery({ text: "Ro'yxat o'zgargan, qayta oching.", show_alert: true }).catch(() => {});
  await ctx.answerCallbackQuery().catch(() => {});
  const kb = new InlineKeyboard().text(`🗑 Ha, «${v}» ni o'chirish`, `opt_dy:${kind}:${idx}`).row().text("🔙 Yo'q, orqaga", `opt_k:${kind}`);
  await editOrReply(ctx, { text: `«<b>${escapeHtml(v)}</b>» variantini o'chirasizmi?\n\n<i>Eski e'lonlarda bu yozuv qoladi, faqat yangi e'lonlarda tanlab bo'lmaydi.</i>`, kb });
}));
bot.callbackQuery(/^opt_dy:(\w+):(\d+)$/, adminOnly(async (ctx) => {
  const [, kind, idx] = ctx.match;
  const v = (catalog.AD_OPTIONS[kind] || [])[Number(idx)];
  const r = v ? await catalog.removeOption(db, kind, v) : { ok: false, error: "Ro'yxat o'zgargan, qayta oching." };
  if (!r.ok) return ctx.answerCallbackQuery({ text: r.error, show_alert: true }).catch(() => {});
  await ctx.answerCallbackQuery({ text: `🗑 «${v}» o'chirildi` }).catch(() => {});
  await editOrReply(ctx, optionsView(kind));
}));

// 🏆 Konkurs Top-10
bot.callbackQuery("admin_top", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const [topUsers] = await db.execute("SELECT id, first_name, username, contest_score FROM users WHERE contest_score > 0 ORDER BY contest_score DESC LIMIT 10");
  
  if (topUsers.length === 0) {
      return ctx.answerCallbackQuery({ text: "📭 Hali hech kim konkursda ball yig'madi.", show_alert: true });
  }

  let text = "🏆 <b>KONKURS LIDERLARI (TOP-10):</b>\n\n";
  topUsers.forEach((u, i) => {
      const name = u.first_name || "Ismsiz";
      const userLink = u.username ? `(@${u.username})` : "";
      text += `${i + 1}. <a href="tg://user?id=${u.id}">${name}</a> ${userLink} — <b>${u.contest_score} ta</b>\n(ID: <code>${u.id}</code>)\n\n`;
  });
  
  text += `💡 <i>G'olib bilan bog'lanish uchun: /xabar [ID] [Matn]</i>`;
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Orqaga", "admin_back") });
});
// 🏢 AVTOSALONLAR RO'YXATI
bot.callbackQuery("admin_dealers", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.answerCallbackQuery("⏳ Avtosalonlar yuklanmoqda...").catch(()=>{});

  const [dealers] = await db.execute(
    "SELECT id, first_name, username, dealer_name, dealer_phone, dealer_paused FROM users WHERE is_dealer = 1 ORDER BY dealer_name ASC"
  );

  if (dealers.length === 0) {
    return ctx.editMessageText("📭 <b>Hozircha tasdiqlangan avtosalonlar yo'q.</b>", {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("🔙 Orqaga", "admin_back")
    });
  }

  let text = `🏢 <b>TASDIQLANGAN AVTOSALONLAR (${dealers.length} ta):</b>\n\n`;
  const kb = new InlineKeyboard();

  dealers.forEach((d, i) => {
    const status = d.dealer_paused === 1 ? "⏸ (To'xtatilgan)" : "✅ (Faol)";
    text += `${i + 1}. <b>${d.dealer_name}</b> ${status}\n`;
    text += `☎️ +${d.dealer_phone} | <a href="tg://user?id=${d.id}">Profil</a>\n\n`;
    // Har bir salon uchun boshqaruv tugmasi
    kb.text(`${i + 1}. ${d.dealer_name}`, `dealer_manage:${d.id}`).row();
  });

  kb.text("🔙 Orqaga", "admin_back");
  text += `👇 <i>Boshqarmoqchi bo'lgan salonni tanlang:</i>`;

  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb, disable_web_page_preview: true });
});
// 📢 SALON REKLAMALARI RO'YXATI
bot.callbackQuery("admin_salon_ads", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.answerCallbackQuery("⏳ Reklamalar yuklanmoqda...").catch(()=>{});

  // Faqat faol (kanalda turgan) reklamalarni olamiz
  const [ads] = await db.execute(
    "SELECT id, salonName, location, created_at, channelMsgId, app_until, app_opens, app_calls FROM salon_ads WHERE status = 'active' ORDER BY created_at DESC LIMIT 20"
  );

  if (ads.length === 0) {
    return ctx.editMessageText("📭 <b>Hozircha faol salon reklamalari yo'q.</b>", {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("🔙 Orqaga", "admin_back")
    });
  }

  let text = `📢 <b>FAOL SALON REKLAMALARI (${ads.length} ta):</b>\n\n`;
  const kb = new InlineKeyboard();

  ads.forEach((a, i) => {
    // Sanani chiroyli ko'rsatamiz
    const dateStr = new Intl.DateTimeFormat('uz-UZ', { day: 'numeric', month: 'short', timeZone: 'Asia/Tashkent' }).format(new Date(a.created_at));
    const appOn = a.app_until && new Date(a.app_until).getTime() > Date.now();
    const where = [a.channelMsgId ? "📢 kanal" : null, appOn ? `📱 ilovada ${fmtTash(a.app_until)} gacha (👀 ${a.app_opens || 0}, 📞 ${a.app_calls || 0})` : null].filter(Boolean).join(" · ") || "<i>muddati tugagan</i>";
    text += `${i + 1}. <b>${a.salonName}</b>\n📍 ${a.location} | 🗓 ${dateStr}\n${where}\n\n`;
    kb.text(`${i + 1}. ${a.salonName}`, `salon_ad_manage:${a.id}`).row();
  });

  kb.text("🔙 Orqaga", "admin_back");
  text += `👇 <i>Boshqarmoqchi bo'lgan reklamani tanlang:</i>`;

  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
});
// ⭐ STATUSLAR HISOBOTI: har bir status bo'yicha soni va daromadi, eng ko'p to'laganlar
bot.callbackQuery("admin_vip", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.answerCallbackQuery().catch(() => {});
  try {
    // amount — to'lov paytidagi narx; eski yozuvlarda bo'lmasa, hozirgi narx bo'yicha hisoblanadi
    const [rows] = await db.execute("SELECT COALESCE(kind, 'vip') AS kind, status, COUNT(*) AS cnt, SUM(amount) AS summa, SUM(amount IS NULL) AS noAmount FROM vip_requests GROUP BY COALESCE(kind, 'vip'), status");
    const [[m]] = await db.execute("SELECT SUM(COALESCE(amount, 0)) AS summa, COUNT(*) AS cnt FROM vip_requests WHERE status = 'approved' AND created_at >= NOW() - INTERVAL 30 DAY");
    let total = 0, pendingAll = 0;
    let text = "⭐ <b>STATUSLAR HISOBOTI</b>\n\n";
    for (const k of PROMO_KINDS) {
      const get = (st) => rows.find((r) => r.kind === k && r.status === st) || { cnt: 0, summa: 0, noAmount: 0 };
      const ap = get("approved"), pe = get("pending"), rj = get("rejected");
      const income = Number(ap.summa || 0) + Number(ap.noAmount || 0) * getPrice(k);
      total += income; pendingAll += Number(pe.cnt);
      text += `${PROMOS[k].title}: ✅ <b>${ap.cnt}</b> · ⏳ ${pe.cnt} · ❌ ${rj.cnt}\n   💰 ${somFmt(income)}\n`;
    }
    text += `\n💰 <b>Jami daromad: ${somFmt(total)}</b>\n📅 Oxirgi 30 kun: <b>${somFmt(m?.summa || 0)}</b> (${m?.cnt || 0} ta to'lov)\n`;
    if (pendingAll) text += `⏳ <b>Tekshirilmagan cheklar: ${pendingAll} ta</b>\n`;
    const [topClients] = await db.execute(`
      SELECT v.userId, u.first_name, u.username, COUNT(*) AS cnt
      FROM vip_requests v LEFT JOIN users u ON v.userId = u.id
      WHERE v.status = 'approved' GROUP BY v.userId ORDER BY cnt DESC LIMIT 10`);
    text += "━━━━━━━━━━━━━━━━━━\n👥 <b>ENG KO'P TO'LAGANLAR:</b>\n";
    if (!topClients.length) text += "<i>Hozircha yo'q.</i>";
    topClients.forEach((c, i) => {
      text += `${i + 1}. <a href="tg://user?id=${c.userId}">${escapeHtml(c.first_name || "Ismsiz")}</a>${c.username ? ` (@${c.username})` : ""} — <b>${c.cnt} ta</b>\n`;
    });
    const kb = new InlineKeyboard()
      .text("🟢 Hozir faol statuslar", "admin_promo_active").row()
      .text("🎁 Status berish / olib tashlash", "admin_promo_grant").row()
      .text("📋 Oxirgi to'lovlar", "admin_vip_recent").row()
      .text("💰 Narx va muddatlar", "admin_prices").row()
      .text("🔙 Orqaga", "admin_back");
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb, disable_web_page_preview: true });
  } catch (e) {
    console.error("Statuslar hisoboti xatosi:", e);
    await ctx.answerCallbackQuery({ text: "Xatolik yuz berdi.", show_alert: true }).catch(() => {});
  }
});

// 🟢 Hozir qaysi e'lonlarda qaysi status faol (tugash sanasi bilan)
bot.callbackQuery("admin_promo_active", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.answerCallbackQuery().catch(() => {});
  try {
    const cond = PROMO_KINDS.map((k) => `${PROMOS[k].col} > NOW()`).join(" OR ");
    const [ads] = await db.execute(`SELECT * FROM ads WHERE status = 'active' AND (${cond}) ORDER BY id DESC LIMIT 40`);
    let text = `🟢 <b>FAOL STATUSLAR</b> (${ads.length} ta e'lon)\n\n`;
    if (!ads.length) text += "<i>Hozir hech bir e'londa pullik status yo'q.</i>";
    for (const k of ["premium", "vip", "top", "urgent"]) {
      const list = ads.filter((a) => tsActive(a[PROMOS[k].col]));
      if (!list.length) continue;
      text += `${PROMOS[k].title} — ${list.length} ta\n`;
      list.forEach((a) => { text += `• ${a.id} — ${escapeHtml(a.carDetails)} · <b>${fmtTash(a[PROMOS[k].col])}</b> gacha\n`; });
      text += "\n";
    }
    if (text.length > 3900) text = text.slice(0, 3900) + "\n…";
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Orqaga", "admin_vip") });
  } catch (e) {
    console.error("Faol statuslar xatosi:", e);
    await ctx.answerCallbackQuery({ text: "Xatolik yuz berdi.", show_alert: true }).catch(() => {});
  }
});

// 📋 OXIRGI TO'LOVLAR (barcha statuslar)
bot.callbackQuery("admin_vip_recent", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.answerCallbackQuery().catch(() => {});
  try {
    const [rows] = await db.execute(`
      SELECT v.id, v.userId, v.status, v.created_at, v.kind, v.amount, a.carDetails, u.first_name
      FROM vip_requests v LEFT JOIN ads a ON v.adId = a.id LEFT JOIN users u ON v.userId = u.id
      ORDER BY v.created_at DESC LIMIT 15`);
    if (!rows.length) {
      return ctx.editMessageText("📭 <b>Hozircha to'lovlar yo'q.</b>", { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Orqaga", "admin_vip") });
    }
    let text = "📋 <b>OXIRGI TO'LOVLAR:</b>\n\n";
    rows.forEach((r) => {
      const P = PROMOS[r.kind] || PROMOS.vip;
      const st = r.status === "approved" ? "✅" : r.status === "rejected" ? "❌" : "⏳";
      text += `${st} ${P.title} — <b>${escapeHtml(r.carDetails || "E'lon o'chirilgan")}</b>${r.amount ? ` · ${somFmt(r.amount)}` : ""}\n`;
      text += `👤 <a href="tg://user?id=${r.userId}">${escapeHtml(r.first_name || "Ismsiz")}</a> | 🗓 ${fmtTash(r.created_at)}\n\n`;
    });
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Orqaga", "admin_vip"), disable_web_page_preview: true });
  } catch (e) {
    console.error("To'lovlar ro'yxati xatosi:", e);
    await ctx.answerCallbackQuery({ text: "Xatolik yuz berdi.", show_alert: true }).catch(() => {});
  }
});
// 📢 BITTA REKLAMANI BOSHQARISH
bot.callbackQuery(/^salon_ad_manage:(\d+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const salonAdId = ctx.match[1];

  const [[a]] = await db.execute("SELECT * FROM salon_ads WHERE id = ?", [salonAdId]);
  if (!a) return ctx.answerCallbackQuery({ text: "Reklama topilmadi.", show_alert: true });

  const dateStr = new Intl.DateTimeFormat('uz-UZ', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' }).format(new Date(a.created_at));

  const text =
    `📢 <b>${a.salonName}</b>\n\n` +
    `${a.adText}\n\n` +
    `📍 <b>Manzil:</b> ${a.location}\n` +
    `📞 <b>Tel:</b> ${a.phone}\n` +
    `🗓 <b>Joylangan:</b> ${dateStr}\n` +
    `👤 <a href="tg://user?id=${a.userId}">Egasi profili</a>\n\n` +
    `👇 <i>Amalni tanlang:</i>`;

  const kb = new InlineKeyboard()
    .text("🗑 Kanaldan o'chirish", `salon_ad_delete:${a.id}`).row()
    .text("🔙 Ro'yxatga qaytish", "admin_salon_ads");

  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
});

// 🗑 REKLAMANI O'CHIRISH (tasdiq so'raymiz)
bot.callbackQuery(/^salon_ad_delete:(\d+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const salonAdId = ctx.match[1];

  const [[a]] = await db.execute("SELECT salonName FROM salon_ads WHERE id = ?", [salonAdId]);
  const name = a ? a.salonName : "reklama";

  await ctx.editMessageText(
    `⚠️ <b>${name}</b> reklamasini kanaldan o'chirmoqchimisiz?\n\n<i>Reklama post kanaldan butunlay o'chiriladi.</i>`,
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("✅ Ha, o'chirish", `salon_ad_delete_confirm:${salonAdId}`)
        .text("🔙 Bekor qilish", `salon_ad_manage:${salonAdId}`)
    }
  );
});

// 🗑 O'CHIRISHNI TASDIQLASH
bot.callbackQuery(/^salon_ad_delete_confirm:(\d+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const salonAdId = ctx.match[1];

  const [[a]] = await db.execute("SELECT salonName, channelMsgId FROM salon_ads WHERE id = ?", [salonAdId]);
  if (!a) return ctx.answerCallbackQuery({ text: "Reklama topilmadi.", show_alert: true });

  // Kanaldan xabarni o'chiramiz
  if (a.channelMsgId) {
    try {
      await bot.api.deleteMessage(CHANNEL_ID, a.channelMsgId);
    } catch (e) {
      console.error("Reklamani kanaldan o'chirishda xato:", e.message);
    }
  }

  // Bazada holatini 'deleted' qilamiz
  await db.execute("UPDATE salon_ads SET status = 'deleted' WHERE id = ?", [salonAdId]);

  await ctx.answerCallbackQuery({ text: "🗑 Reklama o'chirildi." });
  await ctx.editMessageText(`🗑 <b>${a.salonName}</b> reklamasi kanaldan o'chirildi.`, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text("🔙 Ro'yxatga qaytish", "admin_salon_ads")
  });
});
// 🏢 BITTA SALONNI BOSHQARISH (menyu)
bot.callbackQuery(/^dealer_manage:(\d+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const userId = ctx.match[1];

  const [[d]] = await db.execute(
    "SELECT id, first_name, username, dealer_name, dealer_phone, dealer_paused FROM users WHERE id = ? AND is_dealer = 1",
    [userId]
  );

  if (!d) {
    return ctx.answerCallbackQuery({ text: "Bu salon topilmadi.", show_alert: true });
  }

  // Shu salonning nechta faol e'loni borligini sanaymiz
  const [[adsCount]] = await db.execute("SELECT COUNT(*) as count FROM ads WHERE userId = ? AND status = 'active'", [userId]);

  const statusText = d.dealer_paused === 1 ? "⏸ To'xtatilgan" : "✅ Faol";
  const usernameStr = d.username ? `${d.username}` : "yo'q";

  const text =
    `🏢 <b>${d.dealer_name}</b>\n\n` +
    `📊 <b>Holati:</b> ${statusText}\n` +
    `☎️ <b>Telefon:</b> +${d.dealer_phone}\n` +
    `👤 <b>Egasi:</b> <a href="tg://user?id=${d.id}">${d.first_name}</a> (${usernameStr})\n` +
    `🆔 <b>ID:</b> <code>${d.id}</code>\n` +
    `🚗 <b>Faol e'lonlari:</b> ${adsCount.count} ta\n\n` +
    `👇 <i>Amalni tanlang:</i>`;

  const kb = new InlineKeyboard();
  // Holatiga qarab: to'xtatilgan bo'lsa "Faollashtirish", faol bo'lsa "To'xtatish"
  if (d.dealer_paused === 1) {
    kb.text("▶️ Faollashtirish", `dealer_resume:${d.id}`).row();
  } else {
    kb.text("⏸ Vaqtincha to'xtatish", `dealer_pause:${d.id}`).row();
  }
  kb.text("🗑 Salonni o'chirish", `dealer_delete:${d.id}`).row();
  kb.text("🔙 Ro'yxatga qaytish", "admin_dealers");

  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
});

// ⏸ SALONNI VAQTINCHA TO'XTATISH
bot.callbackQuery(/^dealer_pause:(\d+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const userId = ctx.match[1];

  await db.execute("UPDATE users SET dealer_paused = 1 WHERE id = ?", [userId]);
  await ctx.answerCallbackQuery({ text: "⏸ Salon vaqtincha to'xtatildi." });

  // Dilerga xabar
  try {
    await bot.api.sendMessage(userId,
      "⏸ <b>Avtosalon maqomingiz vaqtincha to'xtatildi.</b>\n\n" +
      "Hozircha e'lonlaringizda «Ishonchli sotuvchi» belgisi chiqmaydi va cheksiz e'lon imkoniyati vaqtincha o'chirilgan.\n\n" +
      "Savol bo'lsa admin bilan bog'laning: @uzdev75",
      { parse_mode: "HTML" }
    );
  } catch (e) {}

  // Boshqaruv menyusini yangilaymiz
  await ctx.editMessageText("⏸ <b>Salon vaqtincha to'xtatildi.</b>", {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text("🔙 Ro'yxatga qaytish", "admin_dealers")
  });
});

// ▶️ SALONNI QAYTA FAOLLASHTIRISH
bot.callbackQuery(/^dealer_resume:(\d+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const userId = ctx.match[1];

  await db.execute("UPDATE users SET dealer_paused = 0 WHERE id = ?", [userId]);
  await ctx.answerCallbackQuery({ text: "▶️ Salon qayta faollashtirildi." });

  try {
    await bot.api.sendMessage(userId,
      "▶️ <b>Avtosalon maqomingiz qayta faollashtirildi!</b>\n\n" +
      "Endi barcha diler imkoniyatlaringiz yana ochiq. E'lonlaringizda «Ishonchli sotuvchi» belgisi qaytadan chiqadi.",
      { parse_mode: "HTML" }
    );
  } catch (e) {}

  await ctx.editMessageText("▶️ <b>Salon qayta faollashtirildi.</b>", {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text("🔙 Ro'yxatga qaytish", "admin_dealers")
  });
});

// 🗑 SALONNI O'CHIRISH (tasdiq so'raymiz)
bot.callbackQuery(/^dealer_delete:(\d+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const userId = ctx.match[1];

  const [[d]] = await db.execute("SELECT dealer_name FROM users WHERE id = ?", [userId]);
  const dealerName = d ? d.dealer_name : "salon";

  // O'chirishdan oldin tasdiq so'raymiz (xato bilan bosmaslik uchun)
  await ctx.editMessageText(
    `⚠️ <b>${dealerName}</b> salonini o'chirmoqchimisiz?\n\n` +
    `<i>Salon maqomi butunlay olib tashlanadi (lekin uning e'lonlari kanalda qoladi). Bu amalni qaytarib bo'lmaydi.</i>`,
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("✅ Ha, o'chirish", `dealer_delete_confirm:${userId}`)
        .text("🔙 Bekor qilish", `dealer_manage:${userId}`)
    }
  );
});

// 🗑 O'CHIRISHNI TASDIQLASH
bot.callbackQuery(/^dealer_delete_confirm:(\d+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const userId = ctx.match[1];

  const [[d]] = await db.execute("SELECT dealer_name FROM users WHERE id = ?", [userId]);
  const dealerName = d ? d.dealer_name : "salon";

  // Diler maqomini butunlay olib tashlaymiz
  await db.execute("UPDATE users SET is_dealer = 0, dealer_paused = 0, dealer_name = NULL, dealer_phone = NULL WHERE id = ?", [userId]);

  await ctx.answerCallbackQuery({ text: "🗑 Salon o'chirildi." });

  try {
    await bot.api.sendMessage(userId,
      "❌ <b>Avtosalon maqomingiz bekor qilindi.</b>\n\n" +
      `Endi siz oddiy foydalanuvchi sifatida botdan foydalanishingiz mumkin (bir vaqtda ${getAdLimit() || "cheksiz"} tagacha e'lon).\n\n` +
      "Savol bo'lsa: @uzdev75",
      { parse_mode: "HTML" }
    );
  } catch (e) {}

  await ctx.editMessageText(`🗑 <b>${dealerName}</b> saloni o'chirildi.`, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text("🔙 Ro'yxatga qaytish", "admin_dealers")
  });
});
// 🚗 Kunlik TOP-5 ni ishga tushirish
bot.callbackQuery("admin_test_top5", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.answerCallbackQuery("⏳ Kunlik TOP-5 tayyorlanmoqda...");
  await sendDailyTop3(); // Funksiya kanalda post chiqaradi
  await ctx.reply("✅ <b>Kunlik TOP-5 ro'yxati kanalga muvaffaqiyatli yuborildi!</b>", { parse_mode: "HTML" });
});
// 📈 Haftalik analitikani ishga tushirish
bot.callbackQuery("admin_test_analytics", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.answerCallbackQuery("⏳ Analitika hisoblanmoqda...");
  await sendWeeklyAnalytics(); // Funksiya kanalda post chiqaradi
  await ctx.reply("✅ <b>Haftalik bozor analitikasi kanalga muvaffaqiyatli yuborildi!</b>", { parse_mode: "HTML" });
});
// 🔎 Eng ko'p qidirilganlar reytingini yuborish
bot.callbackQuery("admin_topsearch", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.answerCallbackQuery("⏳ Qidiruv reytingi tayyorlanmoqda...");
  await sendTopSearched();
  await ctx.reply("✅ <b>Eng ko'p qidirilganlar reytingi kanalga yuborildi!</b>\n\n<i>Agar post chiqmagan bo'lsa, demak hali qidiruv statistikasi yetarli emas.</i>", { parse_mode: "HTML" });
});

// 📊 Narx grafigini yuborish
bot.callbackQuery("admin_chart", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.answerCallbackQuery("⏳ Grafik yasalmoqda...");
  await sendPriceChartPost();
  await ctx.reply("✅ <b>Narx grafigi kanalga yuborildi!</b>\n\n<i>Agar post chiqmagan bo'lsa, demak hali narx tarixi (bir necha haftalik ma'lumot) yetarli emas.</i>", { parse_mode: "HTML" });
});
bot.command("test_analytics", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.reply("⏳ <i>Analitika hisoblanmoqda va kanalga yuborilmoqda...</i>", { parse_mode: "HTML" });
  await sendWeeklyAnalytics();
  await ctx.reply("✅ <b>Test muvaffaqiyatli yakunlandi! Kanalni tekshiring.</b>", { parse_mode: "HTML" });
});
// 🔔 7-kunlik xabarlarni Hozir yuborish
bot.callbackQuery("admin_send_7day", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.editMessageText("⏳ <i>Real foydalanuvchilarga 7 kunlik e'lonlar bo'yicha xabarlar yuborish boshlandi... Kuting.</i>", { parse_mode: "HTML" });

  try {
      const [ads7] = await db.execute(
          "SELECT id, userId, carDetails FROM ads WHERE status = 'active' AND userId != ? AND DATEDIFF(CURDATE(), DATE(created_at)) = 7",
          [ADMIN_ID]
      );

      if (ads7.length === 0) {
          return ctx.editMessageText("📭 <b>Bugun roppa-rosa 7 kun bo'lgan e'lonlar topilmadi.</b>", { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Orqaga", "admin_back") });
      }

      let notifiedUsersText = ""; 
      let notifiedCount = 0;

      for (let ad of ads7) {
          const text = `⚠️ <b>E'loningiz eski xabarlar qatorida qolib ketdi!</b>\n\n🚗 <b>${ad.carDetails}</b> e'lon qilinganiga 7 kun bo'ldi va u kanalda ancha tepaga chiqib ketib, xaridorlarga ko'rinishi qiyinlashdi.\n\nE'lonni qaytadan kanalning eng oxiriga (tepaga) ko'tarishni istaysizmi?`;
          
          try {
              await bot.api.sendMessage(ad.userId, text, {
                  parse_mode: "HTML",
                  reply_markup: new InlineKeyboard()
                    .text("🚀 Ha, tepaga ko'tarish", `ask_bump:${ad.id}`).row()
                    .text("✅ Allaqachon sotildi", `confirm_sold:${ad.id}`)
              });
              notifiedUsersText += `👤 <a href="tg://user?id=${ad.userId}">Profilga o'tish</a> | 🚗 ${ad.carDetails} (ID: ${ad.id})\n`;
              notifiedCount++;
          } catch (err) {}
          await delay(200); 
      }

      if (notifiedCount > 0) {
          const adminReport = `📊 <b>YUBORILGAN HISOBOT (7 KUNLIK):</b>\n\nJami <b>${notifiedCount} ta</b> real foydalanuvchiga UP taklifi yuborildi:\n\n${notifiedUsersText}`;
          await ctx.editMessageText(adminReport, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Orqaga", "admin_back") });
      } else {
          await ctx.editMessageText("❌ Xabarlar yuborilmadi (Foydalanuvchilar botni bloklagan bo'lishi mumkin).", { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Orqaga", "admin_back") });
      }
  } catch (e) {
      await ctx.editMessageText("❌ Xatolik yuz berdi.", { reply_markup: new InlineKeyboard().text("🔙 Orqaga", "admin_back") });
  }
});

// 🛠 Qo'lda yoziladigan buyruqlar bo'yicha QO'LLANMA
bot.callbackQuery("admin_help", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const helpText = 
    `🛠 <b>BOSHQA MAXSUS BUYRUQLAR:</b>\n\n` +
    `<i>Ushbu buyruqlarni botga oddiy xabar kabi yozib yuborasiz:</i>\n\n` +
    `🚫 <b>Foydalanuvchini bloklash:</b>\n<code>/ban [Foydalanuvchi_ID]</code>\n\n` +
    `✅ <b>Foydalanuvchini blokdan ochish:</b>\n<code>/unban [Foydalanuvchi_ID]</code>\n\n` +
    `🚀 <b>E'lonni qo'lda UP qilish (Tepaga ko'tarish):</b>\n<code>/up [E'lon_ID]</code>\n\n` +
    `✉️ <b>G'olibga yoki uzerga xabar yuborish:</b>\n<code>/xabar [Foydalanuvchi_ID] [Sizning matningiz]</code>\n\n` +
    `🔄 <b>Konkurs ballarini nollash (Yangi hafta uchun):</b>\n<code>/reset_contest</code>\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🧪 <b>TEST BUYRUQLARI (kanalga post yuboradi):</b>\n\n` +
    `📊 <b>Kunlik TOP post:</b>\n<code>/test_top3</code>\n\n` +
    `🔎 <b>Top qidiruvlar:</b>\n<code>/test_topsearch</code>\n\n` +
    `📈 <b>Narx grafigi:</b>\n<code>/test_chart</code>\n\n` +
    `📊 <b>Haftalik analitika:</b>\n<code>/test_analytics</code>\n\n` +
    `📣 <b>"E'lon bering" chaqiriq posti:</b>\n<code>/test_sellcall</code>\n\n` +
    `🆕 <b>1-3 kunlik yangi e'lon ko'tarish:</b>\n<code>/test_newbump</code>\n\n` +
    `🚀 <b>15 kunlik UP testi:</b>\n<code>/test_up</code>\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🚗 <b>KATALOG (bot va Mini App uchun):</b>\n\n` +
    `➕ <b>Yangi model qo'shish</b> (marka yo'q bo'lsa u ham qo'shiladi):\n<code>/model_qosh Chevrolet | Tracker 2</code>\n\n` +
    `📋 <b>Katalogni ko'rish:</b>\n<code>/katalog</code>\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📝 <b>Kanaldagi eski e'lonlar tugmalarini yangi ko'rinishga keltirish:</b>\n<code>/tugmalar</code>`;

  await ctx.editMessageText(helpText, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Orqaga", "admin_back") });
});

// 🚗 KATALOGGA MODEL QO'SHISH: /model_qosh Marka | Model
bot.command("model_qosh", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const [brandName, modelName] = String(ctx.match || "").split("|").map(s => s.trim());
  if (!brandName || !modelName) {
    return ctx.reply("❗️ Format: <code>/model_qosh Marka | Model</code>\nMasalan: <code>/model_qosh Chevrolet | Tracker 2</code>", { parse_mode: "HTML" });
  }
  try {
    const r = await catalog.addModel(db, sanitizeText(brandName, 50), sanitizeText(modelName, 50));
    if (!r.created) return ctx.reply(`ℹ️ <b>${r.brand.name} ${r.model.name}</b> katalogda allaqachon bor (ID: ${r.model.id}).`, { parse_mode: "HTML" });
    const filled = await catalog.backfill(db); // shu nomdagi eski e'lonlarni ham bog'laymiz
    await ctx.reply(
      `✅ <b>Qo'shildi:</b> ${r.brand.name} ${r.model.name} (ID: ${r.model.id})${r.brandCreated ? "\n🆕 Yangi marka ham yaratildi." : ""}\n\n` +
      `Endi bot va Mini App'da darhol ko'rinadi. Eski e'lonlardan bog'landi: ${filled.ads} ta.`,
      { parse_mode: "HTML" }
    );
  } catch (e) {
    console.error("Model qo'shishda xato:", e);
    await ctx.reply("❌ Xatolik: " + e.message);
  }
});

// 📋 KATALOG: markalar va har biridagi modellar soni
bot.command("katalog", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const brands = catalog.get().brands;
  const [counts] = await db.execute("SELECT brand_id, COUNT(*) AS cnt FROM ads WHERE status = 'active' AND brand_id IS NOT NULL GROUP BY brand_id");
  const [[unlinked]] = await db.execute("SELECT COUNT(*) AS cnt FROM ads WHERE status = 'active' AND model_id IS NULL");
  const adsByBrand = new Map(counts.map(r => [r.brand_id, r.cnt]));
  let text = `📋 <b>KATALOG:</b> ${brands.length} marka\n\n`;
  brands.forEach(b => { text += `• <b>${b.name}</b> — ${b.models.length} model, ${adsByBrand.get(b.id) || 0} faol e'lon\n`; });
  text += `\n❔ Modelga bog'lanmagan faol e'lonlar: <b>${unlinked.cnt} ta</b> <i>(ular nomi bo'yicha qidiriladi)</i>`;
  await ctx.reply(text, { parse_mode: "HTML" });
});

// =====================================================================
// 📝 /tugmalar (eski nomi /ilova_tugmalari) — kanaldagi ESKI faol e'lonlarning tugmalarini hozirgi
// ko'rinishga keltiradi (admin paneldagi sozlamalarga qarab). Yangi e'lonlarda tugmalar o'zi to'g'ri chiqadi.
// Telegram cheklovi sabab sekin, fonda ishlaydi.
// =====================================================================
let channelButtonsJob = null;
const CHANNEL_EDIT_DELAY_MS = Number(process.env.CHANNEL_EDIT_DELAY_MS) || 1500;
bot.command(["tugmalar", "ilova_tugmalari"], async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  if (channelButtonsJob) return ctx.reply("⏳ Tugmalar hozir yangilanmoqda, tugashini kuting.");
  const [ads] = await db.execute("SELECT id, channelMsgId FROM ads WHERE status = 'active' AND channelMsgId IS NOT NULL ORDER BY id DESC");
  if (!ads.length) return ctx.reply("Kanalda faol e'lon yo'q.");
  const minutes = Math.max(1, Math.ceil((ads.length * CHANNEL_EDIT_DELAY_MS) / 60000));
  await ctx.reply(`⏳ <b>${ads.length} ta</b> faol e'lonning tugmalari yangilanmoqda (~${minutes} daqiqa). Tugagach xabar beraman.`, { parse_mode: "HTML" });

  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  channelButtonsJob = (async () => {
    let ok = 0, failed = 0;
    for (const ad of ads) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await bot.api.editMessageReplyMarkup(CHANNEL_ID, ad.channelMsgId, { reply_markup: AD_CHANNEL_MARKUP(ad.id, ad.channelMsgId) });
          ok++;
          break;
        } catch (e) {
          const desc = e.description || e.message || "";
          if (/not modified/i.test(desc)) { ok++; break; }
          if (e.error_code === 429 && attempt < 2) { await pause(((e.parameters && e.parameters.retry_after) || 5) * 1000 + 500); continue; }
          failed++;
          break;
        }
      }
      await pause(CHANNEL_EDIT_DELAY_MS);
    }
    await bot.api.sendMessage(ADMIN_ID,
      `✅ <b>Tayyor!</b> ${ok} ta e'lonning tugmalari yangi ko'rinishga keltirildi.` +
      (failed ? `\n⚠️ ${failed} tasida bo'lmadi (kanaldan o'chirilgan bo'lishi mumkin).` : ""),
      { parse_mode: "HTML" }
    ).catch(() => {});
  })().catch((e) => console.error("Ilova tugmalarini yangilashda xato:", e.message)).finally(() => { channelButtonsJob = null; });
});
// =====================================================================
// 🛠 15 KUNLIK "UP" TIZIMINI TEST QILISH UCHUN MAXSUS BUYRUQ
// =====================================================================
bot.command("test_up", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  
  // Bazadan bitta ixtiyoriy faol e'lonni olamiz
  const [ads] = await db.execute("SELECT id, userId, carDetails FROM ads WHERE status = 'active' LIMIT 1");
  
  if (ads.length === 0) {
      return ctx.reply("📭 Bazada hozircha hech qanday faol e'lon yo'q. Avval bot orqali bitta e'lon bering.");
  }

  const ad = ads[0];
  
 const text = `⚠️ <b>E'loningiz eski xabarlar qatorida qolib ketdi!</b>\n\n🚗 <b>${ad.carDetails}</b> e'lon qilinganiga 7 kun bo'ldi va u kanalda ancha tepaga chiqib ketib, xaridorlarga ko'rinishi qiyinlashdi.\n\nE'lonni qaytadan kanalning eng oxiriga (tepaga) ko'tarishni istaysizmi?`;
  
  // Xabarni foydalanuvchiga emas, to'g'ridan-to'g'ri o'zingizga (adminga) yuboramiz
  await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("🚀 Ha, tepaga ko'tarish", `ask_bump:${ad.id}`).row()
        .text("✅ Allaqachon sotildi", `confirm_sold:${ad.id}`)
  });
  
  await ctx.reply("✅ <b>Test xabari tayyor!</b> \nEndi yuqoridagi <i>«🚀 Ha, tepaga ko'tarish»</i> tugmasini bosib, uzer so'rov yuborganda adminga qanday kelishi va tasdiqlangach kanalda qanday ko'tarilishini tekshirib ko'ring.", { parse_mode: "HTML" });
});
/**
 * ✅ АДМИН УЧУН БЛОКЛАШ ТИЗИМИ
 */
// =====================================================================
// 🚀 REAL FOYDALANUVCHILARGA 7 KUNLIK XABARNI HOZIROQ YUBORISH
// =====================================================================

bot.command("ban", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const match = ctx.message.text.split(" ");
  if (match.length < 2) return ctx.reply("Qo'llash tartibi: /ban [ID raqam]");
  
  const targetId = parseInt(match[1]);
  if (!targetId) return ctx.reply("❗️ ID raqam bo'lishi kerak.");

  try {
    await db.execute("INSERT IGNORE INTO banned_users (userId) VALUES (?)", [targetId]);
    await ctx.reply(`✅ <b>${targetId}</b> ID egasi qora ro'yxatga tushdi!`, { parse_mode: "HTML" });
    await bot.api.sendMessage(targetId, "🚫 <b>Siz qoidabuzarlik sababli botdan bloklandingiz.</b>", { parse_mode: "HTML", reply_markup: { remove_keyboard: true } }).catch(() => {});
  } catch(e) {
    ctx.reply("Xatolik yuz berdi.");
  }
});
/**
 * ✅ АДМИН УЧУН ЭЪЛОННИ ҚАЙТА КЎТАРИШ (BUMP / UP)
 */
bot.command("up", async (ctx) => {
  // Faqat admin ishlata olishi uchun tekshiruv
  if (ctx.from.id !== ADMIN_ID) return;

  const match = ctx.message.text.split(" ");
  if (match.length < 2) {
    return ctx.reply("📝 <b>Qo'llash tartibi:</b> /up [ID raqam]\n<i>Masalan: /up 15</i>", { parse_mode: "HTML" });
  }

  const adId = parseInt(match[1]);
  if (!adId) return ctx.reply("❗️ ID raqam bo'lishi kerak.");

  // Bazadan e'lonni qidiramiz
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ? AND status = 'active'", [adId]);
  const ad = rows[0];

  if (!ad) return ctx.reply("❌ Bunday ID ga ega faol e'lon topilmadi yoki u allaqachon sotilgan.");

  const waitMsg = await ctx.reply(`⏳ <i>${adId}-ID li e'lon kanalga qayta ko'tarilmoqda...</i>`, { parse_mode: "HTML" });

  try {
    const channelMarkup = AD_CHANNEL_MARKUP(ad.id); // ilova tugmasi ham shu yerda
      // .url("📢 KANALIMIZ", "https://t.me/engarzonidamoshina");

    let newMsgId;

    try {
      // 1-URINISH: Kanaldagi eski xabardan tezkor nusxa olish (Rasm yasab o'tirmaydi, 1 soniyada tugaydi)
      const newMsg = await bot.api.copyMessage(CHANNEL_ID, CHANNEL_ID, ad.channelMsgId, {
        reply_markup: channelMarkup
      });
      newMsgId = newMsg.message_id;

      // Oldingi eski xabarni kanaldan o'chirib tashlaymiz (dublikat bo'lmasligi uchun)
      await bot.api.deleteMessage(CHANNEL_ID, ad.channelMsgId).catch(() => {});

    } catch (copyErr) {
      // 2-URINISH (Fallback): Agar eski xabar kanaldan o'chirilgan bo'lsa, kollajni boshqatdan yasaymiz!
      const photos = ad.photoId.split(",");
      const photoUrls = await Promise.all(
        photos.map(async (id) => {
          const file = await bot.api.getFile(id);
          return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
        })
      );
      const collagePath = await createCollage(photoUrls);

      const caption = addPriceVoteLine(vipHeader(ad) +
        `🆔 ID: ${ad.id}\n🚗 Moshina: ${ad.carDetails}\n📅 Yili: ${ad.year}\n👣 Probeg: ${kmText(ad.probeg)}\n` +
        `💎 Kraskasi: ${ad.paint}\n🎨 Rangi: ${ad.color}\n✅ Karobka: ${ad.transmission}\n` +
        `⛽ Yoqilg'i: ${ad.fuel}\n💰 Narxi: ${ad.price}$\n☎️ +${ad.phone}\n🚩 #${ad.region.replace(/\s+/g, "_")}\n\n` +
        `⚠️ Moshina savdosiga admin javobgar emas, oldindan to'lov qilmang. Ogohlik davr talabi ❗\n\n👉 ${inviteLink()}`);

      const sentMsg = await bot.api.sendPhoto(CHANNEL_ID, new InputFile(collagePath), {
        caption: caption,
        reply_markup: channelMarkup,
        parse_mode: "HTML",
      });
      newMsgId = sentMsg.message_id;
      
      if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
    }

    // BAZANI YANGILASH: Yangi tashlangan xabarning ID sini bazaga yozib qo'yamiz
    await db.execute("UPDATE ads SET channelMsgId = ? WHERE id = ?", [newMsgId, adId]);
    await addShareButton(ad.id, newMsgId);
    await repinIfVip(ad, newMsgId);

    await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply(`✅ <b>${adId}-ID</b> li e'lon muvaffaqiyatli qayta ko'tarildi!\n\nEski xabar o'chirilib, kanal oxiriga (eng yangi xabar sifatida) joylandi.`, { parse_mode: "HTML" });

  } catch (err) {
    console.error(err);
    await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply("❌ Xatolik yuz berdi: E'lonni qayta ko'tarib bo'lmadi.");
  }
});

bot.command("unban", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const match = ctx.message.text.split(" ");
  if (match.length < 2) return ctx.reply("Qo'llash tartibi: /unban [ID raqam]");
  
  const targetId = parseInt(match[1]);
  try {
    await db.execute("DELETE FROM banned_users WHERE userId = ?", [targetId]);
    await ctx.reply(`✅ <b>${targetId}</b> ID egasi blokdan chiqarildi.`, { parse_mode: "HTML" });
    await bot.api.sendMessage(targetId, "✅ <b>Blokingiz ochildi.</b> Botdan qayta foydalanishingiz mumkin. /start", { parse_mode: "HTML" }).catch(() => {});
  } catch(e) {
    ctx.reply("Xatolik yuz berdi.");
  }
});



bot.callbackQuery("admin_stats", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.answerCallbackQuery("⏳ Mukammal statistika yuklanmoqda...");
  
  try {
      // 1. UMUMIY BAZA STATISTIKASI
      const [[userCount]] = await db.execute("SELECT COUNT(*) as count FROM users");
      const [[activeAds]] = await db.execute("SELECT COUNT(*) as count FROM ads WHERE status = 'active'");
      const [[soldAds]] = await db.execute("SELECT COUNT(*) as count FROM ads WHERE status = 'sold'");
      const [[pendingAds]] = await db.execute("SELECT COUNT(*) as count FROM ads WHERE status = 'pending'");
      
      const [[todayUsers]] = await db.execute("SELECT COUNT(*) as count FROM users WHERE DATE(joined_at) = CURDATE()");
      const [[todayAds]] = await db.execute("SELECT COUNT(*) as count FROM ads WHERE DATE(created_at) = CURDATE()");

      const [[alertCount]] = await db.execute("SELECT COUNT(*) as count FROM alerts");
      const [[bannedCount]] = await db.execute("SELECT COUNT(*) as count FROM banned_users");

      const [[soldSumRow]] = await db.execute("SELECT SUM(CAST(price AS UNSIGNED)) as totalSum FROM ads WHERE status = 'sold'");
      const totalMoney = soldSumRow.totalSum ? soldSumRow.totalSum.toLocaleString("en-US") + " $" : "0 $";

      const [[favCount]] = await db.execute("SELECT COUNT(*) as count FROM favorites");
      
      let topFavCarText = "Hali yo'q";
      try {
          const [topFavs] = await db.execute(`SELECT a.carDetails, COUNT(f.adId) as saves FROM favorites f JOIN ads a ON f.adId = a.id GROUP BY f.adId ORDER BY saves DESC LIMIT 1`);
          if (topFavs.length > 0) topFavCarText = `${topFavs[0].carDetails} <i>(${topFavs[0].saves} kishi saqlagan)</i>`;
      } catch (e) {}

      let conversionRate = 0;
      let totalProcessedAds = activeAds.count + soldAds.count;
      if (totalProcessedAds > 0) conversionRate = Math.round((soldAds.count / totalProcessedAds) * 100);

      // 2. KANALLAR STATISTIKASI
      let mainChannelCount = 0;
      let mainAdminsCount = 0;
      let secondChannelCount = 0;

      try {
          mainChannelCount = await bot.api.getChatMemberCount(CHANNEL_ID);
          const admins = await bot.api.getChatAdministrators(CHANNEL_ID);
          mainAdminsCount = admins.length; 
      } catch (e) { }

      try {
          const SECOND_CHANNEL_ID = process.env.SECOND_CHANNEL_ID;
          if (SECOND_CHANNEL_ID) secondChannelCount = await bot.api.getChatMemberCount(SECOND_CHANNEL_ID);
      } catch (e) {}

      // === YANGI: KANALGA BUGUN QO'SHILGANLAR VA CHIQIB KETGANLAR ===
      let mainDiffText = " <i>(🟢 +0 | 🔴 -0)</i>";
      let secDiffText = " <i>(🟢 +0 | 🔴 -0)</i>";

      try {
          const [mainEvents] = await db.execute("SELECT joined, left_count FROM channel_events WHERE channel_id = 'main' AND date = CURDATE()");
          if (mainEvents.length > 0) {
              mainDiffText = ` <i>(🟢 +${mainEvents[0].joined} | 🔴 -${mainEvents[0].left_count})</i>`;
          }

          const [secEvents] = await db.execute("SELECT joined, left_count FROM channel_events WHERE channel_id = 'second' AND date = CURDATE()");
          if (secEvents.length > 0) {
              secDiffText = ` <i>(🟢 +${secEvents[0].joined} | 🔴 -${secEvents[0].left_count})</i>`;
          }
      } catch (e) { }
      // ==============================================================

      // XABARNI SHAKLLANTIRISH
      const text = 
        `📊 <b>MUKAMMAL BIZNES STATISTIKA</b>\n\n` +
        
        `🔥 <b>BUGUNGI FAOLLIK:</b>\n` +
        `➕ Yangi a'zolar: <b>+${todayUsers.count} ta</b>\n` +
        `📝 Yangi e'lonlar: <b>+${todayAds.count} ta</b>\n\n` +
        
        `💸 <b>MOLIYAVIY KO'RSATKICHLAR:</b>\n` +
        `✅ Jami sotilganlar: <b>${soldAds.count} ta</b>\n` +
        `💵 Umumiy aylanma: <b>${totalMoney}</b>\n` +
        `🎯 Sotuv samaradorligi: <b>${conversionRate}%</b>\n\n` +

        `❤️ <b>XARIDORLAR QIZIQISHI:</b>\n` +
        `💾 Jami e'lon saqlashlar: <b>${favCount.count} marta</b>\n` +
        `🏆 Eng xaridorgir moshina: <b>${topFavCarText}</b>\n\n` +
        
        `📈 <b>UMUMIY KO'RSATKICHLAR:</b>\n` +
        `👥 Barcha foydalanuvchilar: <b>${userCount.count} ta</b>\n` +
        `🟢 Faol e'lonlar: <b>${activeAds.count} ta</b>\n` +
        `⏳ Tasdiq kutayotganlar: <b>${pendingAds.count} ta</b>\n` +
        `🔔 Tayyor xaridorlar (Obuna): <b>${alertCount.count} ta</b>\n` +
        `🚫 Bloklanganlar: <b>${bannedCount.count} ta</b>\n\n` +
        
        `📢 <b>KANALLAR HOLATI:</b>\n` +
        `1️⃣ <b>Asosiy:</b> ${mainChannelCount} ta${mainDiffText} <i>(${mainAdminsCount} admin)</i>\n` +
        `2️⃣ <b>2-kanal:</b> ${secondChannelCount} ta${secDiffText}`;

      await ctx.editMessageText(text, { reply_markup: adminMenu, parse_mode: "HTML" });

  } catch (error) {
      // Agar xato "matn o'zgarmadi" bo'lsa, uni inkor qilamiz (chunki ekranda shundoq ham eng yangisi turibdi)
      if (error.description && error.description.includes("message is not modified")) {
          // Hech narsa qilmaydi
      } else {
          console.error("Statistika xatosi:", error);
          await ctx.answerCallbackQuery({text: "Statistika olishda xatolik yuz berdi.", show_alert: true});
      }
  }
});

bot.callbackQuery("admin_broadcast", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.deleteMessage();
  await ctx.conversation.enter("broadcastConversation");
});

bot.callbackQuery("admin_pending", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.answerCallbackQuery("⏳ E'lon qidirilmoqda...");
  
  // 1. Yangi e'lonlarni tekshiramiz
  const [pendingAds] = await db.execute("SELECT * FROM ads WHERE status = 'pending' ORDER BY id ASC LIMIT 1");
  if (pendingAds.length > 0) {
      const ad = pendingAds[0];
      const photoUrls = await Promise.all(ad.photoId.split(",").map(async (id) => `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${(await bot.api.getFile(id)).file_path}`));
      const collagePath = await createCollage(photoUrls);

      let caption = `🆔 <b>ID: ${ad.id}</b>\n🚗 Moshina: ${ad.carDetails}\n📅 Yili: ${ad.year}\n👣 Probeg: ${kmText(ad.probeg)}\n💎 Kraskasi: ${ad.paint}\n🎨 Rangi: ${ad.color}\n✅ Karobka: ${ad.transmission}\n⛽ Yoqilg'i: ${ad.fuel}\n`;
      if (ad.history && ad.history !== "Ko'rsatilmagan") caption += `🛠 Tarixi: ${ad.history}\n`;
      if (ad.barter && ad.barter !== "Yo'q") caption += `🔄 Barter: ${ad.barter}\n`;
      caption += `💰 Narxi:${formatNum(ad.price)}$\n☎️ +${ad.phone}\n🚩 #${ad.region.replace(/\s+/g, "_")}\n\n👤 Foydalanuvchi: <a href="tg://user?id=${ad.userId}">Profil</a>`;

      const adminKb = new InlineKeyboard()
      .text("✅ Qabul qilish", `approve:${ad.id}`)
      .text("❌ Rad etish", `reject:${ad.id}`).row()
      .text("🔥 Qaynoq narxda qabul qilish", `approve_hot:${ad.id}`);
      await ctx.deleteMessage().catch(()=>{});
      const adminMsg = await ctx.replyWithPhoto(new InputFile(collagePath), { caption, reply_markup: adminKb, parse_mode: "HTML" });
      if (ad.videoId) { try { await ctx.replyWithVideo(ad.videoId, { reply_to_message_id: adminMsg.message_id }); } catch(e){} }
      if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
      return;
  }

  // 2. Tahrirlangan e'lonlarni tekshiramiz
  const [pendingEdits] = await db.execute("SELECT * FROM ad_edits ORDER BY editId ASC LIMIT 1");
  if (pendingEdits.length > 0) {
      const editData = pendingEdits[0];
      const photoUrls = await Promise.all(editData.photoId.split(",").map(async (id) => `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${(await bot.api.getFile(id)).file_path}`));
      const collagePath = await createCollage(photoUrls);

      let caption = `🔄 <b>E'LONNI YANGILASH SO'ROVI!</b>\n\n🆔 Eski ID: ${editData.oldAdId}\n🚗 Moshina: ${editData.carDetails}\n📅 Yili: ${editData.year}\n👣 Probeg: ${editData.probeg} km\n💎 Kraskasi: ${editData.paint}\n🎨 Rangi: ${editData.color}\n✅ Karobka: ${editData.transmission}\n⛽ Yoqilg'i: ${editData.fuel}\n`;
      if (editData.history && editData.history !== "Ko'rsatilmagan") caption += `🛠 Tarixi: ${editData.history}\n`;
      if (editData.barter && editData.barter !== "Yo'q") caption += `🔄 Barter: ${editData.barter}\n`;
      caption += `💰 Narxi: ${editData.price}$\n☎️ +${editData.phone}\n🚩 #${editData.region.replace(/\s+/g, "_")}\n\n👤 Foydalanuvchi: <a href="tg://user?id=${editData.userId}">Profil</a>`;

      const adminKb = new InlineKeyboard().text("✅ O'zgarishni tasdiqlash", `approve_edit:${editData.editId}`).text("❌ Rad etish", `reject_edit:${editData.editId}`);
      
      await ctx.deleteMessage().catch(()=>{});
      const adminMsg = await ctx.replyWithPhoto(new InputFile(collagePath), { caption, reply_markup: adminKb, parse_mode: "HTML" });
      if (editData.videoId) { try { await ctx.replyWithVideo(editData.videoId, { reply_to_message_id: adminMsg.message_id }); } catch(e){} }
      if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
      return;
  }

  await ctx.deleteMessage().catch(()=>{});
  await ctx.reply("✅ <b>Tasdiq kutayotgan e'lonlar yo'q!</b> Baza toza.", { parse_mode: "HTML", reply_markup: adminMenu });
});


/**
 * ✅ МОШИНА ҚИДИРИШ ЖАРАЁНИ (Тўғирланган)
 */
/**
 * ✅ МОШИНА ҚИДИРИШ ЖАРАЁНИ (Tugmali, Narx oraliqli va Takroriy qidiruv)
 */
async function searchCarConversation(conversation, ctx) {
  const cancelTexts = ["/start", "/cancel", "📝 E'lon berish", "🔍 Mashina qidirish", "📂 Mening e'lonlarim", "🔔 Obunalarim", "🎁 Bepul VIP (UP)", "🧮 Mashina narxini aniqlash"];
  const chatToClean = [];

  // Marka/model ro'yxati endi bazada (catalog.js) — bu yerdagi eski ro'yxat olib tashlandi

  // ================= KATTA SIKL: YANA QIDIRISH UCHUN =================
  while (true) {
      let brand = "";
      let model = "";
      let query = "";
      let brandObj = null;  // { id, name } — id: 0 = Boshqa, null = katalogda yo'q
      let modelId = null;   // katalogdagi model ID (qidiruv shu bo'yicha)
      let step = "BRAND";

      // 1. Marka va Modelni tanlash sikli
      while (true) {
          if (step === "BRAND") {
              const kb = brandKeyboard("sb");
              kb.row().text("❌ Bekor qilish", "cancel_search");

              const msgPrompt = await ctx.reply("🔍 <b>Qaysi moshina markasini qidiryapsiz?</b>", { reply_markup: kb, parse_mode: "HTML" });
              chatToClean.push(msgPrompt.message_id);

              const res = await conversation.waitFor(["callback_query:data", "message:text"]);
              if (res.message) chatToClean.push(res.message.message_id);

              if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean); return ctx.reply("❌ <b>Qidiruv to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { parse_mode: "HTML", reply_markup: mainMenu }); }
              if (res.callbackQuery?.data === "cancel_search") { await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); return ctx.reply("❌ <b>Qidiruv to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { parse_mode: "HTML", reply_markup: mainMenu }); }

              brandObj = parseBrandAnswer(res, "sb");
              await safeAnswerCbq(res);
              await deleteMsgs(ctx, chatToClean);
              if (!brandObj) continue; // boshqa (eski) tugma bosildi — qayta so'raymiz
              brand = brandObj.name;
              step = "MODEL";
          }
          else if (step === "MODEL") {
              const kb = modelKeyboard("sm", brandObj?.id);
              kb.row().text("🔙 Orqaga", "back_to_brand").text("❌ Bekor qilish", "cancel_search");

              const promptText = !brandObj?.id
                  ? "🔍 <b>Qidirayotgan moshinangiz rusumini to'liq yozing:</b>\n<i>(Masalan: Changan UNI-K)</i>"
                  : `🔍 <b>${brand}</b> qaysi modelini qidiryapsiz?`;

              const msgPrompt = await ctx.reply(promptText, { reply_markup: kb, parse_mode: "HTML" });
              chatToClean.push(msgPrompt.message_id);

              const res = await conversation.waitFor(["callback_query:data", "message:text"]);
              if (res.message) chatToClean.push(res.message.message_id);

              if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean); return ctx.reply("❌ <b>Qidiruv to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { parse_mode: "HTML", reply_markup: mainMenu }); }
              if (res.callbackQuery?.data === "cancel_search") { await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); return ctx.reply("❌ <b>Qidiruv to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { parse_mode: "HTML", reply_markup: mainMenu }); }
              if (res.callbackQuery?.data === "back_to_brand") { await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); step = "BRAND"; continue; }

              const modelObj = parseModelAnswer(res, "sm", brandObj);
              await safeAnswerCbq(res);
              await deleteMsgs(ctx, chatToClean);
              if (!modelObj) continue;
              model = modelObj.name;
              modelId = modelObj.id;
              // Katalogda yo'q marka bilan yozilgan bo'lsa ham, to'liq nomda qidiramiz
              if (brandObj && brandObj.id === null) { brand = "Boshqa"; model = `${brandObj.name} ${modelObj.name}`; }

              query = model.toLowerCase();
              // Qidiruvni statistika uchun bazaga yozamiz (model ID bilan)
              await conversation.external(() =>
                db.execute("INSERT INTO search_logs (query, model_id) VALUES (?, ?)", [query, modelId || null]).catch(() => {})
              );
              break;
          }
      }

      // 2. Narx oralig'ini so'rash
      const msgPromptPrice = await ctx.reply(
          `💰 <b>${brand === "Boshqa" ? model : `${brand} ${model}`}</b> uchun narxni kiriting ($)\n\n` +
          `<i>Narxni ikki xil usulda kiritishingiz mumkin:</i>\n` +
          `1️⃣ <b>Bitta narx:</b> Masalan, <code>12000</code> deb yozsangiz 12,000$ gacha izlaydi.\n` +
          `2️⃣ <b>Oraliq narx:</b> Masalan, <code>8000-12000</code> deb yozsangiz shu oraliqdan izlaydi.\n\n` +
          `Bekor qilish uchun pastdagi menyudan foydalaning.`, 
          { reply_markup: mainMenu, parse_mode: "HTML" }
      );
      
      const pRes = await conversation.waitFor("message:text");
      if(cancelTexts.includes(pRes.message.text)) return ctx.reply("❌ Qidiruv bekor qilindi.", {reply_markup: mainMenu});
      
      const userInput = pRes.message.text;
      let minPrice = 0;
      let maxPrice = 999999;

      const numbers = userInput.match(/\d+/g);
      if (numbers && numbers.length >= 2) {
          let num1 = parseInt(numbers[0]);
          let num2 = parseInt(numbers[1]);
          minPrice = Math.min(num1, num2);
          maxPrice = Math.max(num1, num2);
      } else if (numbers && numbers.length === 1) {
          maxPrice = parseInt(numbers[0]);
      }

      const waitMsg = await ctx.reply("⏳ <i>Qidirilmoqda...</i>", {parse_mode: "HTML"});

      // Model ID bo'yicha qidiramiz (ID siz eski e'lonlar — nomi bo'yicha)
      const ads = await conversation.external(async () => {
          const f = catalog.modelFilter(modelId, query);
          const [rows] = await db.execute(`SELECT * FROM ads WHERE status = 'active' AND ${f.sql}`, f.params);
          return rows;
      });

      const filtered = ads.filter(ad => {
          const price = parseInt(String(ad.price).replace(/\D/g,"")) || 0;
          return price >= minPrice && price <= maxPrice;
      });

      await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(()=>{});

      let priceText = minPrice > 0 ? `<b>${minPrice}$ - ${maxPrice}$</b> oraliq` : `<b>${maxPrice}$</b> gacha`;

            if(filtered.length === 0) {
         await ctx.reply(`📭 ${priceText} bo'lgan <b>${brand === "Boshqa" ? model : `${brand} ${model}`}</b> topilmadi.`, {parse_mode: "HTML", reply_markup: mainMenu});
      } else {
         // Eng arzondan boshlab saralaymiz
         const sortedResults = [...filtered].sort((a, b) => {
             const priceA = parseInt(a.price.replace(/\D/g, "")) || 0;
             const priceB = parseInt(b.price.replace(/\D/g, "")) || 0;
             return priceA - priceB;
         });

         const PER_PAGE = 8;
         const totalPages = Math.ceil(sortedResults.length / PER_PAGE);
         let currentPage = 1;

         // Sahifani chizadigan ichki yordamchi funksiya
         const buildPageKeyboard = (page) => {
             const startIndex = (page - 1) * PER_PAGE;
             const pageAds = sortedResults.slice(startIndex, startIndex + PER_PAGE);

             let listText = `✅ <b>Topildi: ${filtered.length} ta e'lon!</b> (${priceText})\n`;
             listText += `📄 Sahifa: <b>${page}/${totalPages}</b> | 🔽 Eng arzondan tartiblangan\n\n`;

             const kb = new InlineKeyboard();
             pageAds.forEach((ad, i) => {
                 const num = startIndex + i + 1;
                 listText += `<b>${num}.</b> 🚗 ${ad.carDetails} — <b>${formatNum(ad.price)}$</b>\n`;
                 listText += `📅 ${ad.year} | 👣 ${kmText(ad.probeg)}\n\n`;
                 kb.text(`${num}`, `sr_view:${ad.id}`);
                 if ((i + 1) % 5 === 0) kb.row();
             });

             // Tugmalar qatorini yopamiz
             if (pageAds.length % 5 !== 0) kb.row();

             // Oldingi / Keyingi tugmalari
             const navRow = [];
             if (page > 1) navRow.push(InlineKeyboard.text("⬅️ Oldingi", "sr_prev"));
             if (page < totalPages) navRow.push(InlineKeyboard.text("Keyingi ➡️", "sr_next"));
             if (navRow.length > 0) kb.row(...navRow);

             kb.row().text("✅ Qidiruvni yakunlash", "sr_done");

             listText += `👇 <i>To'liq ko'rish uchun moshina raqamini bosing:</i>`;
             return { listText, kb };
         };

         // Birinchi sahifani chiqaramiz
                // ================= RO'YXAT VA E'LON KO'RISH =================
         let listMsgId = null;   // ro'yxat xabari
         let viewMsgId = null;   // hozir ochiq turgan e'lon xabari
         const removeKb = { reply_markup: { inline_keyboard: [] } };

         // Ro'yxatni chat oxiriga chiqaradi
         const showList = async () => {
             const { listText, kb } = buildPageKeyboard(currentPage);
             const m = await ctx.reply(listText, { parse_mode: "HTML", reply_markup: kb });
             listMsgId = m.message_id;
         };

         // Bitta e'lonni o'z tugmalari bilan chiqaradi (tugmalar e'lonning o'zida turadi)
         const showAd = async (index) => {
             const chosenAd = sortedResults[index];
             const navKb = new InlineKeyboard();
             if (index > 0) navKb.text("⬅️ Oldingi", `sr_view:${sortedResults[index - 1].id}`);
             if (index < sortedResults.length - 1) navKb.text("Keyingi ➡️", `sr_view:${sortedResults[index + 1].id}`);
             navKb.row()
                 .text(`📋 Ro'yxatga qaytish (${index + 1}/${sortedResults.length})`, "sr_list").row()
                 .text("✅ Qidiruvni yakunlash", "sr_done");

             if (chosenAd.channelMsgId) {
                 try {
                     const m = await ctx.api.copyMessage(ctx.chat.id, CHANNEL_ID, chosenAd.channelMsgId, { reply_markup: navKb });
                     viewMsgId = m.message_id;
                     return;
                 } catch (e) {
                     console.error("Kanaldan nusxa olib bo'lmadi:", e.message);
                 }
             }
             // Zaxira: kanalda post topilmasa, rasm + qisqa ma'lumot
             const caption = `🚗 <b>${chosenAd.carDetails}</b>\n📅 Yili: ${chosenAd.year}\n👣 Probeg: ${kmText(chosenAd.probeg)}\n💰 Narxi: ${formatNum(chosenAd.price)}$\n☎️ Tel: +${chosenAd.phone}`;
             const photos = chosenAd.photoId.split(",");
             const m = await ctx.replyWithPhoto(photos[0], { caption, parse_mode: "HTML", reply_markup: navKb });
             viewMsgId = m.message_id;
         };

         await showList();

         let browsing = true;
         while (browsing) {
             const navRes = await conversation.waitFor(["callback_query:data", "message:text"]);

             if (navRes.message?.text) {
                 if (cancelTexts.includes(navRes.message.text)) {
                     if (listMsgId) await ctx.api.deleteMessage(ctx.chat.id, listMsgId).catch(()=>{});
                     if (viewMsgId) await ctx.api.editMessageReplyMarkup(ctx.chat.id, viewMsgId, removeKb).catch(()=>{});
                     return ctx.reply("❌ Qidiruv yakunlandi.", { reply_markup: mainMenu });
                 }
                 continue;
             }

             const data = navRes.callbackQuery?.data || "";
             const pressedMsgId = navRes.callbackQuery?.message?.message_id;
             await safeAnswerCbq(navRes);

             if (data === "sr_next" || data === "sr_prev") {
                 currentPage += (data === "sr_next") ? 1 : -1;
                 currentPage = Math.min(Math.max(currentPage, 1), totalPages);
                 const { listText, kb } = buildPageKeyboard(currentPage);
                 await ctx.api.editMessageText(ctx.chat.id, pressedMsgId, listText, { parse_mode: "HTML", reply_markup: kb }).catch(()=>{});
                 listMsgId = pressedMsgId;
             }
             else if (data.startsWith("sr_view:")) {
                 const viewId = data.split(":")[1];
                 const index = sortedResults.findIndex(a => String(a.id) === String(viewId));
                 if (index === -1) continue;

                 // Ro'yxatni va oldingi ochiq e'lonni olib tashlaymiz — ekranda faqat yangi e'lon qoladi
                 if (listMsgId) { await ctx.api.deleteMessage(ctx.chat.id, listMsgId).catch(()=>{}); listMsgId = null; }
                 if (viewMsgId) { await ctx.api.deleteMessage(ctx.chat.id, viewMsgId).catch(()=>{}); viewMsgId = null; }

                 await showAd(index);
                 currentPage = Math.floor(index / PER_PAGE) + 1; // ro'yxatga qaytganda shu sahifa ochilsin
             }
             else if (data === "sr_list") {
                 // E'lon chatda qoladi (telefon raqami ko'rinib tursin), faqat tugmalari olib tashlanadi
                 if (viewMsgId) { await ctx.api.editMessageReplyMarkup(ctx.chat.id, viewMsgId, removeKb).catch(()=>{}); viewMsgId = null; }
                 await showList();
             }
             else if (data === "sr_done") {
                 if (listMsgId) await ctx.api.deleteMessage(ctx.chat.id, listMsgId).catch(()=>{});
                 if (viewMsgId) await ctx.api.editMessageReplyMarkup(ctx.chat.id, viewMsgId, removeKb).catch(()=>{});
                 browsing = false;
             }
         }
      }
      // Obuna qismi
      // Obuna tugmasi: model ID ham saqlanadi (Telegram tugma ma'lumoti 64 baytdan oshmasligi uchun nomi qisqartiriladi)
      const alertPrefix = `als:${modelId || 0}:${Math.min(maxPrice, 999999)}:`;
      const alertKb = new InlineKeyboard().text("🔔 Qidiruvga obuna bo'lish", alertPrefix + cutBytes(query, 64 - Buffer.byteLength(alertPrefix)));
      await ctx.reply(`<i>Agar ushbu moshina bozorga chiqqanda darhol xabardor bo'lishni istasangiz, qo'ng'iroqchani bosing:</i>`, { parse_mode: "HTML", reply_markup: alertKb });

      // ================= YANGI QO'SHILGAN QISM =================
      const againKb = new InlineKeyboard()
          .text("🔍 Ha, yana qidirish", "search_again")
          .text("❌ Yo'q, rahmat", "search_stop");

      const promptMsg = await ctx.reply("🔄 <b>Yana boshqa moshina qidirishni xohlaysizmi?</b>", {
          parse_mode: "HTML",
          reply_markup: againKb
      });

      // «🔔 Obuna bo'lish» tugmasi ham shu paytda bosiladi — suhbat uni yutib yubormasligi uchun
      // shu yerning o'zida obuna yaratamiz va «Yana qidirasizmi?» javobini kutishda davom etamiz
      let againRes;
      while (true) {
          againRes = await conversation.waitFor(["callback_query:data", "message:text"]);
          const alertData = againRes.callbackQuery?.data || "";
          if (!alertData.startsWith("als:")) break;
          const alertRes = await conversation.external(() => createAlertFromButton(againRes.from.id, alertData));
          await againRes.answerCallbackQuery(alertRes.ok ? { text: "🔔 Obuna bo'ldingiz!" } : { text: alertRes.error, show_alert: true }).catch(()=>{});
          if (alertRes.ok) await againRes.editMessageText(alertRes.text, { parse_mode: "HTML" }).catch(()=>{});
      }

      if (againRes.message?.text && cancelTexts.includes(againRes.message.text)) {
          await ctx.api.deleteMessage(ctx.chat.id, promptMsg.message_id).catch(()=>{});
          return ctx.reply("❌ Qidiruv yakunlandi.", { reply_markup: mainMenu });
      }

      await safeAnswerCbq(againRes);
      await ctx.api.deleteMessage(ctx.chat.id, promptMsg.message_id).catch(()=>{});

      if (againRes.callbackQuery?.data === "search_again") {
          continue; // Sikl yana eng boshiga, markani tanlashga qaytadi!
      } else {
          await ctx.reply("✅ Qidiruv jarayoni yakunlandi. Bosh menyudasiz.", { reply_markup: mainMenu });
          break; // Sikl tugaydi
      }
      // =========================================================
  }
}
bot.use(createConversation(searchCarConversation));

/**
 * ✅ ЭЪЛОН ЯРАТИШ ЖАРАЁНИ
 */
async function createAdConversation(conversation, ctx) {
  const cancelTexts = ["/start", "/cancel", "📝 E'lon berish", "🔍 Mashina qidirish", "📂 Mening e'lonlarim"];
  const ad = { photos: [], urgent: false }; // urgent (shoshilinch) holati qo'shildi
    // Foydalanuvchi diler (va to'xtatilmagan) ekanligini tekshiramiz
  const isDealerUser = await conversation.external(async () => {
    const [rows] = await db.execute("SELECT is_dealer, dealer_paused FROM users WHERE id = ?", [ctx.from.id]);
    return rows[0] && rows[0].is_dealer === 1 && rows[0].dealer_paused !== 1;
  });
  let isFullUpdate = false; 
  let updateAdId = null;
  let step = "BRAND"; 

  const cbData = ctx.callbackQuery?.data;

  if (cbData && cbData.startsWith("full_edit_req:")) {
    const adId = cbData.split(":")[1];

    const existingAd = await conversation.external(async () => {
      const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
      return rows[0] || null;
    });

    if (existingAd) {
      isFullUpdate = true;
      updateAdId = existingAd.id;

      // Marka/modelni ID bo'yicha tiklaymiz ("Li Auto L7" kabi ikki so'zli markalar ham to'g'ri chiqadi)
      const exModel = existingAd.model_id ? catalog.modelById(existingAd.model_id) : null;
      const exBrand = existingAd.brand_id ? catalog.brandById(existingAd.brand_id) : null;
      if (exModel) {
        ad.brand = exModel.brandName; ad.brand_id = exModel.brandId;
        ad.model = exModel.name; ad.model_id = exModel.id;
      } else if (exBrand && existingAd.carDetails.toLowerCase().startsWith(exBrand.name.toLowerCase() + " ")) {
        ad.brand = exBrand.name; ad.brand_id = exBrand.id;
        ad.model = existingAd.carDetails.slice(exBrand.name.length + 1); ad.model_id = null;
      } else {
        // Katalogga mos kelmagan eski e'lon: nomi o'zgarmay qolishi uchun "Boshqa" sifatida olamiz
        ad.brand = "Boshqa"; ad.brand_id = null;
        ad.model = existingAd.carDetails; ad.model_id = null;
      }
      ad.year = existingAd.year;
      ad.probeg = existingAd.probeg;
      ad.paint = existingAd.paint;
      ad.color = existingAd.color;
      ad.trans = existingAd.transmission;
      ad.fuel = existingAd.fuel;
      ad.price = existingAd.price;
      ad.phone = existingAd.phone;
      ad.region = existingAd.region;
      ad.photos = existingAd.photoId.split(",");
      ad.history = existingAd.history;
      ad.barter = existingAd.barter;
       ad.nasiya = existingAd.nasiya;
       ad.dealer_offer = existingAd.dealer_offer;
      ad.videoId = existingAd.videoId;
      ad.urgent = false; // Tahrirlashda avvaliga false bo'ladi
      
      step = "PREVIEW"; 
    }
  }

  let isEditing = false; 
  const chatToClean = []; 

  await ctx.reply(isFullUpdate ? "📝 <b>E'lonni tahrirlash boshlandi.</b>" : "📝 <b>E'lon berish boshlandi.</b>", { reply_markup: mainMenu, parse_mode: "HTML" });

  // Marka/model ro'yxati endi bazada (catalog.js) — bu yerdagi eski ro'yxat olib tashlandi

  while (true) {
    let msgPrompt;
    try {
      if (step === "BRAND") {
        const kb = brandKeyboard("b");
        kb.row().text("❌ Bekor qilish", "cancel_ad");
        msgPrompt = await ctx.reply("🚗 <b>Avtomobil markasini tanlang:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);

        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean);return ctx.reply("❌ <b>Jarayon to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        const picked = parseBrandAnswer(res, "b");
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        if (!picked) continue;
        const sameBrand = ad.brand === picked.name;
        ad.brand = picked.name;
        ad.brand_id = picked.id || null;
        ad.brandKnown = picked.id !== null; // false = katalogda yo'q, qo'lda yozilgan marka
        // Tahrirlashda marka o'zgarsa, eski model endi mos kelmaydi — modelni qayta so'raymiz
        if (!sameBrand) { ad.model_id = null; }
        step = isEditing && sameBrand ? "PREVIEW" : "MODEL";
      }

else if (step === "MODEL") {
        const kb = modelKeyboard("m", ad.brand_id);
        kb.row().text("🔙 Orqaga", "back_BRAND").text("❌ Bekor qilish", "cancel_ad");

        // "Boshqa" tanlanganda matnni o'zgartirish
        const promptText = !ad.brand_id && ad.brandKnown !== false
            ? "🚙 <b>Moshinangiz markasi va modelini to'liq yozing:</b>\n<i>(Masalan: Changan UNI-K)</i>"
            : `🚙 <b>${ad.brand}</b> modelini tanlang yoki yozing:`;
            
        msgPrompt = await ctx.reply(promptText, { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean);return ctx.reply("❌ <b>Jarayon to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_BRAND") { step = "BRAND"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        const pickedModel = parseModelAnswer(res, "m", { id: ad.brand_id || (ad.brandKnown === false ? null : 0), name: ad.brand });
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        if (!pickedModel) continue;
        ad.model = pickedModel.name;
        ad.model_id = pickedModel.id || null;
        if (!ad.brand_id && pickedModel.brandId) ad.brand_id = pickedModel.brandId; // "Boshqa" orqali yozilgan, lekin katalogda bor
        step = isEditing ? "PREVIEW" : "YEAR";
      }

      else if (step === "YEAR") {
        const kb = new InlineKeyboard();
        for (let y = 2026; y >= 1996; y--) { kb.text(y.toString(), `y:${y}`); if ((2026 - y + 1) % 4 === 0) kb.row(); }
        kb.row().text("🔙 Orqaga", "back_MODEL").text("❌ Bekor qilish", "cancel_ad");
        msgPrompt = await ctx.reply("📅 <b>Yilini tanlang yoki yozing:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean);return ctx.reply("❌ <b>Jarayon to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_MODEL") { step = "MODEL"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.year = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text.replace(/\D/g, "");
        if (!ad.year || ad.year.length < 4) { await ctx.reply("❗️ Xato yil kiritildi."); continue; }
        
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "PROBEG";
      }

      else if (step === "PROBEG") {
        const kb = optionKb("probegs", "pr:", "back_YEAR", { Salon: "Salon (0 km)" });
        msgPrompt = await ctx.reply("👣 <b>Probegini kiriting (masalan: 35000):</b>\n<i>Agar moshina yangi bo'lsa «Salon (0 km)» ni" + (catalog.AD_OPTIONS.probegs.length > 1 ? ", probeg aniq bo'lmasa pastdagi variantlardan birini" : "") + " tanlang.</i>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean);return ctx.reply("❌ <b>Jarayon to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_YEAR") { step = "YEAR"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.probeg = res.callbackQuery ? optValue(res.callbackQuery.data) : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "PAINT";
      }

      else if (step === "PAINT") {
        const kb = optionKb("paints", "p:", "back_PROBEG");
        msgPrompt = await ctx.reply("💎 <b>Kraskasi holatini tanlang yoki yozing:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean);return ctx.reply("❌ <b>Jarayon to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_PROBEG") { step = "PROBEG"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.paint = res.callbackQuery ? optValue(res.callbackQuery.data) : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "COLOR";
      }

      else if (step === "COLOR") {
        const kb = optionKb("colors", "c:", "back_PAINT");
        msgPrompt = await ctx.reply("🎨 <b>Moshina rangini tanlang yoki yozing:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean);return ctx.reply("❌ <b>Jarayon to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_PAINT") { step = "PAINT"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.color = res.callbackQuery ? optValue(res.callbackQuery.data) : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "TRANS";
      }

      else if (step === "TRANS") {
        const kb = optionKb("transmissions", "t:", "back_COLOR");
        msgPrompt = await ctx.reply("⚙️ <b>Korobka turini tanlang:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean);return ctx.reply("❌ <b>Jarayon to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_COLOR") { step = "COLOR"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.trans = res.callbackQuery ? optValue(res.callbackQuery.data) : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "FUEL";
      }

      else if (step === "FUEL") {
        const kb = optionKb("fuels", "f:", "back_TRANS");
        msgPrompt = await ctx.reply("⛽ <b>Yoqilg'i turini tanlang:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean);return ctx.reply("❌ <b>Jarayon to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_TRANS") { step = "TRANS"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.fuel = res.callbackQuery ? optValue(res.callbackQuery.data) : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "PRICE";
      }

      else if (step === "PRICE") {
        const kb = new InlineKeyboard().text("🔙 Orqaga", "back_FUEL").text("❌ Bekor", "cancel_ad");
        msgPrompt = await ctx.reply("💰 <b>Narxini kiriting ($):</b>\n<i>Faqat sonlardan foydalaning. Masalan: 7500</i>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean);return ctx.reply("❌ <b>Jarayon to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_FUEL") { step = "FUEL"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        // Umumiy qoida (Mini App bilan bir xil): 300$ — 500 000$
        const priceCheck = parseAdPrice(res.message?.text);
        if (priceCheck.error) { const m = await ctx.reply(priceCheck.error); chatToClean.push(m.message_id); continue; }

        ad.price = priceCheck.value;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "PHONE";
      }

      else if (step === "PHONE") {
        const kb = new InlineKeyboard().text("🔙 Orqaga", "back_PRICE").text("❌ Bekor", "cancel_ad");
        msgPrompt = await ctx.reply("☎️ <b>Telefon raqamingizni kiriting:</b>\n<i>(Masalan: 901234567 yoki 998901234567)</i>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text", "message:contact"]);
        if (res.message) chatToClean.push(res.message.message_id);
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean);return ctx.reply("❌ <b>Jarayon to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_PRICE") { step = "PRICE"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        let phoneText = res.message?.contact ? res.message.contact.phone_number : res.message?.text;
        // Umumiy qoida: 998 ikki marta yozilsa ham to'g'rilanadi, 9 xonali raqam bo'lishi shart
        const normalizedPhone = normalizePhone(phoneText);
        if (!normalizedPhone) { const m = await ctx.reply("❗️ To'g'ri raqam kiriting (masalan: 901234567)."); chatToClean.push(m.message_id); continue; }

        ad.phone = normalizedPhone;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "REGION";
      }

      else if (step === "REGION") {
        const regions = catalog.AD_OPTIONS.regions; // Mini App bilan bir xil ro'yxat
        const kb = new InlineKeyboard();
        regions.forEach((r, i) => { kb.text(r, `r:${r}`); if ((i + 1) % 2 === 0) kb.row(); });
        kb.row().text("🔙 Orqaga", "back_PHONE").text("❌ Bekor", "cancel_ad");
        msgPrompt = await ctx.reply("🚩 <b>Viloyatni tanlang:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean);return ctx.reply("❌ <b>Jarayon to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_PHONE") { step = "PHONE"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.region = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "HISTORY";
      }

      else if (step === "HISTORY") {
        const kb = new InlineKeyboard().text("O'tkazib yuborish", "skip_history").row().text("🔙 Orqaga", "back_REGION").text("❌ Bekor", "cancel_ad");
        msgPrompt = await ctx.reply(
          "🛠 <b>Moshina tarixi va xizmat ko'rsatish holati:</b>\n\n" +
          "<i>Xaridorlar ishonchini oshirish uchun moshinaga qanday qaralganini yozing. Masalan:\n" +
          "«2 yil oldin LPG o'rnatilgan, har 7500 km da Liqui Moly Molygen 5w-30 quyilgan, 46 ming km da karobka moyi almashtirilgan.»</i>\n\n" +
          "Yozishni istamasangiz «O'tkazib yuborish» ni bosing.", { reply_markup: kb, parse_mode: "HTML" }
        );
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean);return ctx.reply("❌ <b>Jarayon to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_REGION") { step = "REGION"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.history = res.callbackQuery?.data === "skip_history" ? "Ko'rsatilmagan" : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "BARTER";
      }

      else if (step === "BARTER") {
        const kb = new InlineKeyboard().text("Yo'q, faqat naqd", "brtr:Yo'q").row().text("🔙 Orqaga", "back_HISTORY").text("❌ Bekor", "cancel_ad");
        msgPrompt = await ctx.reply("🔄 <b>Barter (Ayirboshlash) bormi?</b>\n\n<i>Agar bor bo'lsa, qaysi moshinalarga almashishingizni yozing. Agar yo'q bo'lsa tugmani bosing.</i>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean);return ctx.reply("❌ <b>Jarayon to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_HISTORY") { step = "HISTORY"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.barter = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        
        // ================= O'ZGARISH: NASIYA qadamiga o'tamiz =================
        step = isEditing ? "PREVIEW" : "NASIYA"; 
      }

      // ================= YANGI QADAM: NASIYA (BO'LIB TO'LASH) =================
      else if (step === "NASIYA") {
        const kb = new InlineKeyboard()
          .text("✅ Ha, nasiyaga beraman", "nas:yes")
          .text("Yo'q, faqat naqd", "nas:no").row()
          .text("🔙 Orqaga", "back_BARTER").text("❌ Bekor", "cancel_ad");

        msgPrompt = await ctx.reply(
          "💳 <b>Moshinani nasiyaga (bo'lib to'lash) berasizmi?</b>\n\n" +
          "<i>Agar xaridor pulni bo'lib-bo'lib to'lashiga rozi bo'lsangiz «Ha» ni tanlang. " +
          "Bu e'loningizga xaridorlarni ko'proq jalb qiladi!</i>",
          { reply_markup: kb, parse_mode: "HTML" }
        );
        chatToClean.push(msgPrompt.message_id);

        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);

        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean);return ctx.reply("❌ <b>Jarayon to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_BARTER") { step = "BARTER"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        // Agar "Ha" tanlansa, qo'shimcha shartlarni so'raymiz (ixtiyoriy)
        if (res.callbackQuery?.data === "nas:yes") {
          await safeAnswerCbq(res);
          await deleteMsgs(ctx, chatToClean);

          const kb2 = new InlineKeyboard()
            .text("Shartsiz (kelishiladi)", "nasterm:skip").row()
            .text("🔙 Orqaga", "back_BARTER").text("❌ Bekor", "cancel_ad");

          msgPrompt = await ctx.reply(
            "📝 <b>Nasiya shartlaringizni yozing:</b>\n\n" +
            "<i>Masalan: «50% oldindan, qolgani 6 oyga bo'lib» yoki «Boshlang'ich 5000$, oyiga 500$». " +
            "Agar shartni keyin kelishmoqchi bo'lsangiz, pastdagi tugmani bosing.</i>",
            { reply_markup: kb2, parse_mode: "HTML" }
          );
          chatToClean.push(msgPrompt.message_id);

          const res2 = await conversation.waitFor(["callback_query:data", "message:text"]);
          if (res2.message) chatToClean.push(res2.message.message_id);

          if (res2.message?.text && cancelTexts.includes(res2.message.text)) { await deleteMsgs(ctx, chatToClean);return ctx.reply("❌ <b>Jarayon to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { reply_markup: mainMenu, parse_mode: "HTML" }); }
          if (res2.callbackQuery?.data === "cancel_ad") break;
          if (res2.callbackQuery?.data === "back_BARTER") { step = "BARTER"; await safeAnswerCbq(res2); await deleteMsgs(ctx, chatToClean); continue; }

          if (res2.callbackQuery?.data === "nasterm:skip") {
            ad.nasiya = "Bor (shartlari kelishiladi)";
          } else {
            ad.nasiya = res2.message.text;
          }
          await safeAnswerCbq(res2);
          await deleteMsgs(ctx, chatToClean);
        } else {
          // "Yo'q" tanlandi
          ad.nasiya = "Yo'q";
          await safeAnswerCbq(res);
          await deleteMsgs(ctx, chatToClean);
        }

        step = isEditing ? "PREVIEW" : (isDealerUser ? "OFFER" : "URGENT");
      }
      else if (step === "OFFER") {
        const kb = new InlineKeyboard()
          .text("O'tkazib yuborish", "offer_skip").row()
          .text("🔙 Orqaga", "back_NASIYA").text("❌ Bekor", "cancel_ad");

        msgPrompt = await ctx.reply(
          "🎁 <b>MAXSUS TAKLIFLARINGIZ (faqat avtosalonlar uchun):</b>\n\n" +
          "<i>Aksiya, past foizli kredit, sovg'a yoki boshqa maxsus shartlaringiz bo'lsa yozing. Masalan:\n\n" +
          "«🔥 Aksiya: 12 oygacha 0% foizli bo'lib to'lash! 🎁 Sovg'aga to'liq bak yoqilg'i va sug'urta!»\n\n" +
          "Bu taklif e'loningizda alohida ajralib turadi va xaridorlarni ko'proq jalb qiladi.</i>\n\n" +
          "Agar maxsus taklif bo'lmasa «O'tkazib yuborish» ni bosing.",
          { reply_markup: kb, parse_mode: "HTML" }
        );
        chatToClean.push(msgPrompt.message_id);

        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);

        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean);return ctx.reply("❌ <b>Jarayon to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_NASIYA") { step = "NASIYA"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.dealer_offer = res.callbackQuery?.data === "offer_skip" ? null : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "URGENT";
      }
       else if (step === "URGENT") {
        const kb = new InlineKeyboard()
          .text("🔥 Ha, qaynoq narxda", "urg:yes")
          .text("Oddiy sotuv", "urg:no").row()
          .text("🔙 Orqaga", "back_NASIYA").text("❌ Bekor", "cancel_ad");

        msgPrompt = await ctx.reply("🔥 <b>Qaynoq narxda sotasizmi?</b>\n\n<i>Agar moshinani bozor narxidan arzonroq va tezroq sotmoqchi bo'lsangiz «Ha, qaynoq narxda» ni tanlang — admin ma'qullasa, e'lon kanalga «🔥 QAYNOQ NARX» sarlavhasi bilan chiqadi (bepul).</i>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);

        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);

        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean);return ctx.reply("❌ <b>Jarayon to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
                if (res.callbackQuery?.data === "back_NASIYA") { step = isDealerUser ? "OFFER" : "NASIYA"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.urgent = res.callbackQuery?.data === "urg:yes";
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "MEDIA";
      }
      // =========================================================================
      // =========================================================================

      else if (step === "MEDIA") {
        const kb = new InlineKeyboard().text("✅ Bo'ldi (Yuborish)", "done_media").row().text("🔙 Orqaga", "back_URGENT").text("❌ Bekor", "cancel_ad");
        msgPrompt = await ctx.reply("📸🎥 <b>Rasm va qisqa Video yuboring (Maks 6 ta rasm, 1 ta video):</b>\n\n<i>Video yuborish majburiy emas, lekin moshinani 30 soniyalik videoga olib yuborsangiz, tezroq sotiladi!</i>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        
        ad.photos = ad.photos || [];
        ad.videoId = ad.videoId || null;

        while (ad.photos.length < 6 || !ad.videoId) {
          const res = await conversation.waitFor(["message:photo", "message:video", "callback_query:data", "message:text"]);
          if (res.message) chatToClean.push(res.message.message_id);
          
          if (res.message?.text) {
              if (cancelTexts.includes(res.message.text)) {
                  await deleteMsgs(ctx, chatToClean);
                 return ctx.reply("❌ <b>Jarayon to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { reply_markup: mainMenu, parse_mode: "HTML" });
              }
              continue;
          }

          if (res.callbackQuery?.data === "cancel_ad") { step = "CANCEL"; break; }
          // O'ZGARISH: back_BARTER ni back_URGENT ga o'zgartirdik
          if (res.callbackQuery?.data === "back_URGENT") { step = "URGENT"; await safeAnswerCbq(res); break; } 
          
          if (res.callbackQuery?.data === "done_media") {
            await safeAnswerCbq(res);
            if (ad.photos.length === 0) {
              let m = await ctx.reply("❗️ Kamida 1 ta rasm yuborishingiz kerak!");
              chatToClean.push(m.message_id);
              continue;
            }
            step = "PREVIEW"; break;
          }

          if (res.message?.photo) {
            if (ad.photos.length >= 6) { await ctx.reply("❗️ 6 ta rasm to'ldi."); continue; }
            const photoArr = res.message.photo;
            ad.photos.push(photoArr[photoArr.length - 1].file_id);
            try { await ctx.api.deleteMessage(ctx.chat.id, msgPrompt.message_id); } catch (e) {}
            msgPrompt = await ctx.reply(`✅ <b>${ad.photos.length}-rasm qabul qilindi!</b>\nYana rasm/video yuboring yoki «✅ Bo'ldi» ni bosing.`, { reply_markup: kb, parse_mode: "HTML" });
            chatToClean.push(msgPrompt.message_id);
          } else if (res.message?.video) {
            if (ad.videoId) { await ctx.reply("❗️ Siz allaqachon video yubordingiz."); continue; }
            ad.videoId = res.message.video.file_id;
            try { await ctx.api.deleteMessage(ctx.chat.id, msgPrompt.message_id); } catch (e) {}
            msgPrompt = await ctx.reply(`✅ <b>Video qabul qilindi!</b>\nRasm yuborishda davom eting yoki «✅ Bo'ldi» ni bosing.`, { reply_markup: kb, parse_mode: "HTML" });
            chatToClean.push(msgPrompt.message_id);
          }
        }
        if (step === "CANCEL") break;
        if (step === "URGENT") { await deleteMsgs(ctx, chatToClean); continue; }
        await deleteMsgs(ctx, chatToClean);
      }

else if (step === "PREVIEW") {
        isEditing = false;
        let waitMsg = await ctx.reply("⏳ <b>Aqlli tizim e'lonni tahlil qilmoqda...</b>", { parse_mode: "HTML" });
        
        // Umumiy funksiyalar (Mini App ham aynan shulardan foydalanadi)
        resolveAdIds(ad);
        const fullCarName = catalog.carName(ad.brand, ad.model); // "Boshqa" so'zi qo'shilmaydi
        const priceBadge = await getPreviewPriceBadge(ad);
        const photoUrls = await getPhotoUrls(ad.photos);
        const collagePath = await createCollage(photoUrls);
        const caption = buildAdCaption(ad, priceBadge);

        const kb = new InlineKeyboard()
          .text("✅ ADMINGA YUBORISH", "submit_ad").row()
          .text("✏️ Marka", "edit_BRAND").text("✏️ Model", "edit_MODEL").text("✏️ Yili", "edit_YEAR").row()
          .text("✏️ Probeg", "edit_PROBEG").text("✏️ Kraska", "edit_PAINT").text("✏️ Rang", "edit_COLOR").row()
          .text("✏️ Korobka", "edit_TRANS").text("✏️ Yoqilg'i", "edit_FUEL").text("✏️ Narx", "edit_PRICE").row()
          .text("✏️ Raqam", "edit_PHONE").text("✏️ Viloyat", "edit_REGION").row()
          .text("⚡️ Shoshilinch", "edit_URGENT").text("📸🎥 Rasm/Video", "edit_MEDIA").row()
          .text("❌ Bekor qilish", "cancel_ad");

        await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
        const previewMsg = await ctx.replyWithPhoto(new InputFile(collagePath), {
          caption: `📋 <b>E'LON TAYYOR!</b> Quyida tekshiring yoki xatosi bo'lsa tahrirlang:\n\n${caption}`,
          reply_markup: kb, parse_mode: "HTML"
        });
        
        if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath); 

        let res, action;
        while(true) {
            res = await conversation.waitFor(["callback_query:data", "message:text"]);
            if (res.message?.text) {
                if (cancelTexts.includes(res.message.text)) {
                    await ctx.api.deleteMessage(ctx.chat.id, previewMsg.message_id).catch(()=>{});
                   return ctx.reply("❌ <b>Jarayon to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { reply_markup: mainMenu, parse_mode: "HTML" });
                }
                await ctx.api.deleteMessage(ctx.chat.id, res.message.message_id).catch(()=>{});
                continue; 
            }
            action = res.callbackQuery.data;
            break;
        }

        await safeAnswerCbq(res);
        await ctx.api.deleteMessage(ctx.chat.id, previewMsg.message_id); 

        if (action === "cancel_ad") break;
        
if (action === "submit_ad") {
          const [[pAds]] = await db.execute("SELECT COUNT(*) as count FROM ads WHERE status = 'pending'");
          const [[pEdits]] = await db.execute("SELECT COUNT(*) as count FROM ad_edits");
          const totalPending = pAds.count + pEdits.count + 1; 
          const countText = `\n\n📦 <b>Tasdiq kutayotganlar soni: ${totalPending} ta</b>`;
          
          if (isFullUpdate) {
            // ad_edits ga yozish va adminga yuborish — umumiy funksiya (Mini App ham shuni chaqiradi)
            const editResult = await conversation.external(() =>
              submitAdEditToAdmin({ adId: updateAdId, ad, userId: ctx.from.id, firstName: ctx.from.first_name, source: "bot" })
            );
            if (!editResult.ok) return ctx.reply(editResult.error, { parse_mode: "HTML", reply_markup: mainMenu });

            if (ctx.session) ctx.session.editAdData = null;
            await ctx.reply("✅ <b>Tahrirlangan e'lon adminga muvaffaqiyatli yuborildi!</b>\n\nTekshiruvdan so'ng kanaldagi e'lon yangilanadi.", { parse_mode: "HTML", reply_markup: mainMenu });
            return; 
          }

          // 💳 Pullik rejim: avval to'lov cheki (admin uchun bepul)
          let receiptFileId = null;
          const pay = await conversation.external(() => ({ on: paidAdsOn() && ctx.from.id !== ADMIN_ID, price: getPrice("ad") }));
          if (pay.on) {
            const payKb = new InlineKeyboard().text("❌ Bekor qilish", "cancel_pay");
            await ctx.reply(
              `💳 <b>E'lon joylash pullik: ${somFmt(pay.price)}</b>\n\n` +
              `Quyidagi kartaga o'tkazing:\n<code>${payCard()}</code>\n👤 ${payCardName()}\n\n` +
              `📸 So'ng <b>to'lov chekini (skrinshot)</b> shu yerga rasm qilib yuboring — e'lon chek bilan birga adminga boradi.`,
              { parse_mode: "HTML", reply_markup: payKb }
            );
            while (!receiptFileId) {
              const pr = await conversation.waitFor(["message:photo", "message:text", "callback_query:data"]);
              if (pr.message?.photo) { receiptFileId = pr.message.photo[pr.message.photo.length - 1].file_id; break; }
              if (pr.callbackQuery) {
                await pr.answerCallbackQuery().catch(() => {});
                if (pr.callbackQuery.data === "cancel_pay") { if (ctx.session) ctx.session.editAdData = null; return ctx.reply("❌ <b>E'lon berish bekor qilindi.</b>", { parse_mode: "HTML", reply_markup: mainMenu }); }
                continue;
              }
              if (cancelTexts.includes(pr.message.text)) { if (ctx.session) ctx.session.editAdData = null; return ctx.reply("❌ <b>E'lon berish bekor qilindi.</b>", { parse_mode: "HTML", reply_markup: mainMenu }); }
              await ctx.reply("📸 Iltimos, to'lov chekini <b>rasm</b> qilib yuboring.", { parse_mode: "HTML", reply_markup: payKb });
            }
          }

          // Yangi e'lon: bazaga yozish + adminga yuborish umumiy funksiyada (Mini App ham shuni chaqiradi)
          await conversation.external(() =>
            submitNewAdToAdmin({ ad, userId: ctx.from.id, firstName: ctx.from.first_name, source: "bot", receiptFileId })
          );

          if (ctx.session) ctx.session.editAdData = null;
          await ctx.reply("✅ <b>E'loningiz adminga muvaffaqiyatli yuborildi!</b>\n\nTekshiruvdan so'ng kanalga joylanadi.", { parse_mode: "HTML", reply_markup: mainMenu });
          return; 
        }

        if (action.startsWith("edit_")) {
          isEditing = true;
          step = action.split("_")[1];
        }
      }
    } catch (err) {
      console.error("E'lon yaratishda xatolik:", err);
      if (ctx.session) ctx.session.editAdData = null;
      await deleteMsgs(ctx, chatToClean);
      return ctx.reply(
        "😔 <b>Kechirasiz, tizimda kutilmagan xatolik yuz berdi.</b>\n\n" +
        "E'lon yaratish jarayoni to'xtatildi. Iltimos, pastdagi <b>«📝 E'lon berish</b> tugmasini yoki /start buyrug'ini bosib, jarayonni boshqatdan boshlang.", 
        { parse_mode: "HTML", reply_markup: mainMenu }
      );
    }
  }
  
if (ctx.session) ctx.session.editAdData = null; 
await ctx.reply("❌ <b>E'lon berish bekor qilindi.</b>", { parse_mode: "HTML", reply_markup: mainMenu });
await deleteMsgs(ctx, chatToClean);
}
bot.use(createConversation(createAdConversation));

/**
 * ✅ АВТО-БАҲОЛАШ КАЛЬКУЛЯТОРИ ЖАРАЁНИ
 */
async function evaluateCarConversation(conversation, ctx) {
  const cancelTexts = ["/start", "/cancel", "📝 E'lon berish", "🔍 Mashina qidirish", "📂 Mening e'lonlarim", "🎁 Bepul VIP (UP)", "🧮 Mashina narxini aniqlash"];
  let ad = {};
  let step = "BRAND";
  const chatToClean = [];

  const originalWaitFor = conversation.waitFor.bind(conversation);
  conversation.waitFor = async (args) => {
    const res = await originalWaitFor(args);
    if (res.message?.text && cancelTexts.includes(res.message.text)) {
       Object.defineProperty(res, 'callbackQuery', { get: () => ({ data: "cancel_ad" }), configurable: true });
    }
    return res;
  };

  // Marka/model ro'yxati endi bazada (catalog.js) — bu yerdagi eski ro'yxat olib tashlandi

  await ctx.reply("🧮 <b>Aqlli baholash tizimiga xush kelibsiz!</b>\n\nMoshinangizning bozordagi real narxini ma'lumotlar bazamizdagi e'lonlar asosida hisoblab beramiz.", { reply_markup: mainMenu, parse_mode: "HTML" });

  while (true) {
    let msgPrompt;
    try {
      if (step === "BRAND") {
        const kb = brandKeyboard("b");
        kb.row().text("❌ Bekor qilish", "cancel_ad");
        msgPrompt = await ctx.reply("🚗 <b>Markani tanlang:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "cancel_ad") break;

        const picked = parseBrandAnswer(res, "b");
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        if (!picked) continue;
        ad.brandObj = picked;
        ad.brand = picked.name;
        step = "MODEL";
      }
      else if (step === "MODEL") {
        const kb = modelKeyboard("m", ad.brandObj?.id);
        kb.row().text("🔙 Orqaga", "back_BRAND").text("❌ Bekor qilish", "cancel_ad");
        const modelPrompt = ad.brandObj?.id ? `🚙 <b>${ad.brand}</b> modelini tanlang:` : "🚙 <b>Moshina rusumini to'liq yozing:</b>\n<i>(Masalan: Changan UNI-K)</i>";
        msgPrompt = await ctx.reply(modelPrompt, { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_BRAND") { step = "BRAND"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        const pickedModel = parseModelAnswer(res, "m", ad.brandObj);
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        if (!pickedModel) continue;
        ad.model = pickedModel.name;
        ad.model_id = pickedModel.id || null;
        step = "YEAR";
      }
      else if (step === "YEAR") {
        const kb = new InlineKeyboard();
        for (let y = 2026; y >= 2005; y--) { kb.text(y.toString(), `y:${y}`); if ((2026 - y + 1) % 4 === 0) kb.row(); }
        kb.row().text("🔙 Orqaga", "back_MODEL").text("❌ Bekor qilish", "cancel_ad");
        msgPrompt = await ctx.reply("📅 <b>Yilini tanlang yoki yozing:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_MODEL") { step = "MODEL"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.year = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text.replace(/\D/g, "");
        if (!ad.year || ad.year.length < 4) { await ctx.reply("❗️ Xato yil kiritildi."); continue; }

        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = "CALCULATE";
      }
      else if (step === "CALCULATE") {
        let waitMsg = await ctx.reply("⏳ <b>Bazadagi e'lonlar va narxlar tahlil qilinmoqda...</b>", { parse_mode: "HTML" });

        try {
            // Hisob-kitob umumiy funksiyada (Mini App ham shuni chaqiradi)
            const estimate = await estimateCarPrice({ modelId: ad.model_id, model: ad.model, year: ad.year });
            ad.brand = ad.brand === "Boshqa" ? "" : ad.brand; // natija matnida "Boshqa" so'zi chiqmasin
            await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(()=>{});

            if (!estimate.ok) {
                await ctx.reply(`📭 <b>Kechirasiz, bazamizda ${ad.year} yil ${ad.brand} ${ad.model} uchun yetarli ma'lumot yo'q.</b>\n\nMoshinangizning narxi holatiga qarab turlicha bo'lishi mumkin.`, { parse_mode: "HTML", reply_markup: mainMenu });
            } else {
                const { minPrice, maxPrice } = estimate; // o'rtacha narxning -6% / +6% oralig'i

                const text = 
                  `📊 <b>SIZNING MOSHINANGIZ BAHOLANDI!</b>\n\n` +
                  `🚗 <b>Model:</b> ${ad.brand} ${ad.model}\n` +
                  `📅 <b>Yili:</b> ${ad.year}\n\n` +
                  `Bizning bazadagi e'lonlar va sotilgan moshinalar tahliliga ko'ra, hozirda bozorda bunday moshinalarning o'rtacha narxi:\n\n` +
                  `💰 <b>${minPrice}$ - ${maxPrice}$</b> atrofida bo'lmoqda.\n\n` +
                  `<i>⚠️ Eslatma: Aniq narx moshinaning kraskasi, probegi va umumiy holatiga qarab o'zgarishi mumkin!\n\nMoshinangizni hoziroq sotuvga qo'yish uchun «📝 E'lon berish tugmasini bosing.</i>`;

                await ctx.reply(text, { parse_mode: "HTML", reply_markup: mainMenu });
            }
        } catch(e) {
            console.error(e);
            await ctx.reply("❌ Xatolik yuz berdi. Baholab bo'lmadi.");
        }
        break; // Jarayon muvaffaqiyatli tugadi
      }
    } catch (err) {
      console.error("Baholashda xatolik:", err);
      await deleteMsgs(ctx, chatToClean);
      return ctx.reply("😔 <b>Xatolik yuz berdi.</b> Jarayon to'xtatildi.", { parse_mode: "HTML", reply_markup: mainMenu });
    }
  }
  await deleteMsgs(ctx, chatToClean);
}
bot.use(createConversation(evaluateCarConversation));
/**
 * ✅ AVTOKREDIT / BO'LIB TO'LASH KALKULYATORI
 */
/**
 * ✅ AVTOKREDIT / BO'LIB TO'LASH KALKULYATORI (2 VALYUTA: $ va so'm)
 */
async function creditCalcConversation(conversation, ctx) {
  const cancelTexts = ["/start", "/cancel", "📝 E'lon berish", "🔍 Mashina qidirish", "📂 Mening e'lonlarim", "🎁 Bepul VIP (UP)", "🧮 Mashina narxini aniqlash", "💳 Bo'lib to'lashni hisoblash", "🔔 Obunalarim"];

  // ============ 0. VALYUTANI TANLASH ============
  const curKb = new InlineKeyboard()
    .text("💵 Dollar ($)", "cur:usd")
    .text("🇺🇿 So'm (UZS)", "cur:uzs");
  await ctx.reply(
    "💳 <b>Bo'lib to'lash (Avtokredit) kalkulyatori</b>\n\n" +
    "Avval qaysi <b>valyutada</b> hisoblaymiz?",
    { parse_mode: "HTML", reply_markup: curKb }
  );

  const curRes = await conversation.waitFor(["callback_query:data", "message:text"]);
  if (curRes.message?.text && cancelTexts.includes(curRes.message.text)) return ctx.reply("❌ <b>Hisoblash to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { parse_mode: "HTML", reply_markup: mainMenu });

  let currency = "usd"; // standart
  if (curRes.callbackQuery?.data === "cur:uzs") currency = "uzs";
  if (curRes.callbackQuery) await curRes.answerCallbackQuery();

  // Valyutaga qarab belgi va misollarni tayyorlab qo'yamiz
  const isUzs = currency === "uzs";
  const sign = isUzs ? "so'm" : "$";
  const examplePrice = isUzs ? "150 000 000" : "12000";
  const exampleDown = isUzs ? "30 000 000" : "2000";

  await ctx.reply(
    `✅ Hisob-kitob <b>${isUzs ? "so'mda 🇺🇿" : "dollarda 💵"}</b> bo'ladi.\n\n` +
    `1️⃣ Endi <b>moshina narxini</b> kiriting (${sign}):\n<i>(Masalan: ${examplePrice})</i>`,
    { parse_mode: "HTML", reply_markup: mainMenu }
  );

  // 1. Moshina narxi
  const priceRes = await conversation.waitFor("message:text");
  if (cancelTexts.includes(priceRes.message.text)) return ctx.reply("❌ <b>Hisoblash to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { parse_mode: "HTML", reply_markup: mainMenu });
  const carPrice = parseInt(priceRes.message.text.replace(/\D/g, "")) || 0;
  if (carPrice <= 0) return ctx.reply("❗️ Xato narx kiritildi. Qaytadan urinib ko'ring.", { reply_markup: mainMenu });

  // 2. Boshlang'ich to'lov
  await ctx.reply(
    `2️⃣ <b>Boshlang'ich to'lov</b> (dastlab naqd beradigan pulingiz) qancha (${sign})?\n\n` +
    `<i>Agar boshlang'ich to'lov bo'lmasa 0 deb yozing. Masalan: ${exampleDown}</i>`,
    { parse_mode: "HTML" }
  );
  const downRes = await conversation.waitFor("message:text");
  if (cancelTexts.includes(downRes.message.text)) return ctx.reply("❌ <b>Hisoblash to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { parse_mode: "HTML", reply_markup: mainMenu });
  let downPayment = parseInt(downRes.message.text.replace(/\D/g, "")) || 0;
  if (downPayment >= carPrice) return ctx.reply("❗️ Boshlang'ich to'lov moshina narxidan kam bo'lishi kerak.", { reply_markup: mainMenu });

  // 3. Necha oyga
  await ctx.reply(
    "3️⃣ Necha <b>oyga</b> bo'lib to'lamoqchisiz?\n<i>(Masalan: 12, 24, 36)</i>",
    { parse_mode: "HTML" }
  );
  const monthRes = await conversation.waitFor("message:text");
  if (cancelTexts.includes(monthRes.message.text)) return ctx.reply("❌ <b>Hisoblash to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { parse_mode: "HTML", reply_markup: mainMenu });
  const months = parseInt(monthRes.message.text.replace(/\D/g, "")) || 0;
  if (months <= 0 || months > 120) return ctx.reply("❗️ Oy soni 1 dan 120 gacha bo'lishi kerak.", { reply_markup: mainMenu });

  // 4. Foiz stavkasi
  const kb = new InlineKeyboard()
    .text("Foizsiz (0%)", "rate:0").row()
    .text("Foizni o'zim kiritaman", "rate:manual");
  await ctx.reply(
    "4️⃣ <b>Yillik foiz stavkasi</b> necha foiz?\n\n" +
    "<i>Agar sotuvchi foizsiz bersa «Foizsiz» ni tanlang. Bankdan olsangiz, foizni o'zingiz kiriting (masalan 24).</i>",
    { parse_mode: "HTML", reply_markup: kb }
  );

  const rateRes = await conversation.waitFor(["callback_query:data", "message:text"]);
  let annualRate = 0;

  if (rateRes.callbackQuery?.data === "rate:0") {
    await rateRes.answerCallbackQuery();
    annualRate = 0;
  } else if (rateRes.callbackQuery?.data === "rate:manual") {
    await rateRes.answerCallbackQuery();
    await ctx.reply("✍️ <b>Yillik foizni raqamda yozing:</b>\n<i>(Masalan: 24)</i>", { parse_mode: "HTML" });
    const manualRate = await conversation.waitFor("message:text");
    if (cancelTexts.includes(manualRate.message.text)) return ctx.reply("❌ <b>Hisoblash to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { parse_mode: "HTML", reply_markup: mainMenu });
    annualRate = parseFloat(manualRate.message.text.replace(",", ".").replace(/[^\d.]/g, "")) || 0;
  } else {
    if (cancelTexts.includes(rateRes.message?.text))return ctx.reply("❌ <b>Hisoblash to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { parse_mode: "HTML", reply_markup: mainMenu });
    annualRate = parseFloat((rateRes.message?.text || "0").replace(",", ".").replace(/[^\d.]/g, "")) || 0;
  }

  // ============ HISOB-KITOB ============
  const loanAmount = carPrice - downPayment;
  let monthlyPayment;
  let totalPay;

  if (annualRate === 0) {
    monthlyPayment = loanAmount / months;
    totalPay = loanAmount;
  } else {
    const monthlyRate = annualRate / 100 / 12;
    monthlyPayment = (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
    totalPay = monthlyPayment * months;
  }

  const overpay = totalPay - loanAmount;

  // Valyutaga qarab formatlash: dollar -> vergul (12,000), so'm -> probel (12 000 000)
  const fmt = (n) => {
    const rounded = Math.round(n);
    return isUzs
      ? rounded.toLocaleString("ru-RU")   // 150 000 000
      : rounded.toLocaleString("en-US");  // 150,000,000
  };

  let resultText =
    `📊 <b>HISOB-KITOB NATIJASI</b> ${isUzs ? "🇺🇿" : "💵"}\n\n` +
    `🚗 Moshina narxi: <b>${fmt(carPrice)} ${sign}</b>\n` +
    `💵 Boshlang'ich to'lov: <b>${fmt(downPayment)} ${sign}</b>\n` +
    `🏦 Kreditga olinadigan: <b>${fmt(loanAmount)} ${sign}</b>\n` +
    `📅 Muddat: <b>${months} oy</b>\n` +
    `📈 Yillik foiz: <b>${annualRate}%</b>\n\n` +
    `━━━━━━━━━━━━━━━\n\n` +
    `💰 <b>OYLIK TO'LOV: ${fmt(monthlyPayment)} ${sign}</b>\n\n`;

  if (annualRate > 0) {
    resultText += `💸 Umumiy ustama (foiz): <b>${fmt(overpay)} ${sign}</b>\n`;
    resultText += `🧾 Jami to'lanadigan summa: <b>${fmt(totalPay + downPayment)} ${sign}</b>\n\n`;
  } else {
    resultText += `✅ <b>Foizsiz!</b> Ortiqcha to'lov yo'q.\n\n`;
  }

  resultText += `<i>⚠️ Bu taxminiy hisob. Aniq shartlarni bank yoki sotuvchi bilan aniqlashtiring.</i>`;

  await ctx.reply(resultText, { parse_mode: "HTML", reply_markup: mainMenu });
}
bot.use(createConversation(creditCalcConversation));
/**
 * ✅ DILER (AVTOSALON) BO'LISH SO'ROVI
 */
async function becomeDealerConversation(conversation, ctx) {
  const cancelTexts = ["/start", "/cancel", "📝 E'lon berish", "🔍 Mashina qidirish", "📂 Mening e'lonlarim", "🔔 Obunalarim"];

  // Avval allaqachon diler emasligini tekshiramiz
  const alreadyDealer = await conversation.external(async () => {
    const [rows] = await db.execute("SELECT is_dealer FROM users WHERE id = ?", [ctx.from.id]);
    return rows[0] && rows[0].is_dealer === 1;
  });

  if (alreadyDealer) {
    return ctx.reply("✅ <b>Siz allaqachon tasdiqlangan avtosalonsiz!</b>\n\nSizga barcha diler imkoniyatlari ochiq.", { parse_mode: "HTML", reply_markup: mainMenu });
  }

  await ctx.reply(
    "🏢 <b>AVTOSALON / DOIMIY SOTUVCHI BO'LISH</b>\n\n" +
    "Agar siz doimiy ravishda moshina savdosi bilan shug'ullansangiz (avtosalon, diler yoki ko'p moshina sotuvchi), sizga maxsus imkoniyatlar beramiz:\n\n" +
    "✅ E'lonlaringizda «Ishonchli sotuvchi» belgisi\n" +
    `✅ Cheksiz e'lon berish imkoniyati${paidAdsOn() ? ` (har bir e'lon ${somFmt(getPrice("ad"))})` : ""}\n` +
    "✅ Kanalda salon reklamasi joylash huquqi\n" +
    "✅ Xaridorlar ishonchi yuqori bo'ladi\n\n" +
    "🆓 <i>Avtosalon maqomining o'zi bepul.</i>\n" +
    (paidSalonOn()
      ? `💳 <i>Salon reklamasi pullik:</i>\n` + SALON_PLAN_KEYS.map((k) => `   • ${SALON_PLANS[k].title} — ${somFmt(getPrice(SALON_PLANS[k].priceKey))}`).join("\n") + "\n\n"
      : `🎁 <i>Salon reklamasi hozircha bepul (kuniga ${salonDailyLimit()} tagacha).</i>\n\n`) +
    "1️⃣ Avval <b>salon yoki biznesingiz nomini</b> yozing:\n<i>(Masalan: «Avto Lider» yoki «Samarqand Avto»)</i>\n\n" +
    "Bekor qilish uchun pastdagi menyudan foydalaning.",
    { parse_mode: "HTML", reply_markup: mainMenu }
  );

  // 1. Salon nomi
  const nameRes = await conversation.waitFor("message:text");
  if (cancelTexts.includes(nameRes.message.text)) return ctx.reply("❌ <b>So'rov to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { parse_mode: "HTML", reply_markup: mainMenu });
  const dealerName = nameRes.message.text.trim();
  if (dealerName.length < 2) return ctx.reply("❗️ Nom juda qisqa. Qaytadan urinib ko'ring.", { reply_markup: mainMenu });

  // 2. Telefon
  await ctx.reply(
    "2️⃣ Endi <b>bog'lanish uchun telefon raqamingizni</b> yozing:\n<i>(Masalan: 901234567)</i>",
    { parse_mode: "HTML" }
  );
  const phoneRes = await conversation.waitFor("message:text");
  if (cancelTexts.includes(phoneRes.message.text)) return ctx.reply("❌ <b>So'rov to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { parse_mode: "HTML", reply_markup: mainMenu });
  // Telefonni tekshirish, saqlash va adminga yuborish — umumiy funksiya (Mini App ham shuni chaqiradi)
  const dealerResult = await conversation.external(() => submitDealerApplication({
    userId: ctx.from.id, firstName: ctx.from.first_name, username: ctx.from.username,
    name: dealerName, phone: phoneRes.message.text,
  }));
  if (!dealerResult.ok) return ctx.reply(dealerResult.error, { parse_mode: "HTML", reply_markup: mainMenu });

  await ctx.reply(
    "✅ <b>So'rovingiz adminga yuborildi!</b>\n\n" +
    "Tez orada ko'rib chiqamiz. Tasdiqlangach, sizga xabar beramiz va barcha diler imkoniyatlari ochiladi.",
    { parse_mode: "HTML", reply_markup: mainMenu }
  );
}
bot.use(createConversation(becomeDealerConversation));
/**
 * ✅ SALON REKLAMASI BERISH (faqat dilerlar uchun)
 */
async function salonAdConversation(conversation, ctx) {
  const cancelTexts = ["/start", "/cancel", "📝 E'lon berish", "🔍 Mashina qidirish", "📂 Mening e'lonlarim", "🔔 Obunalarim"];

  // Diler ekanligi va kunlik limit (2 ta) — umumiy funksiya (Mini App ham shuni chaqiradi)
  const checkData = await conversation.external(() => getSalonAdStatus(ctx.from.id));
  if (!checkData.ok) return ctx.reply(checkData.error, { parse_mode: "HTML", reply_markup: mainMenu });

  await ctx.reply(
    "📢 <b>SALON REKLAMASI BERISH</b>\n\n" +
    "Saloningiz, aksiya yoki maxsus takliflaringiz haqida reklama post joylang!\n\n" +
    "1️⃣ Avval <b>reklama matnini</b> yozing:\n" +
    "<i>(Aksiya, kredit shartlari, bonuslar va boshqalar haqida to'liq yozing. Masalan: «🔥 Kia Sportage 60 oygacha 0% foizli bo'lib to'lash! Boshlang'ich 25%, oyiga 2 300 000 so'mdan.»)</i>\n\n" +
    "Bekor qilish uchun pastdagi menyudan foydalaning.",
    { parse_mode: "HTML", reply_markup: mainMenu }
  );

  // 1. Reklama matni
  const textRes = await conversation.waitFor("message:text");
  if (cancelTexts.includes(textRes.message.text)) return ctx.reply("❌ <b>Reklama berish to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { parse_mode: "HTML", reply_markup: mainMenu });
  const adText = textRes.message.text;
  if (adText.length < 10) return ctx.reply("❗️ Matn juda qisqa. Qaytadan urinib ko'ring.", { reply_markup: mainMenu });

  // 2. Video yoki rasm
  await ctx.reply(
    "2️⃣ Endi <b>reklama video yoki rasmini</b> yuboring:\n<i>(Video yuborsangiz yaxshiroq — ko'proq e'tibor tortadi. 1 ta video yoki 1 ta rasm)</i>",
    { parse_mode: "HTML" }
  );
  const mediaRes = await conversation.waitFor(["message:video", "message:photo", "message:text"]);
  if (mediaRes.message?.text && cancelTexts.includes(mediaRes.message.text)) return ctx.reply("❌ <b>Reklama berish to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { parse_mode: "HTML", reply_markup: mainMenu });

  let mediaType, mediaId, thumbId = null;
  if (mediaRes.message?.video) {
    mediaType = "video";
    mediaId = mediaRes.message.video.file_id;
    thumbId = mediaRes.message.video.thumbnail?.file_id || null; // ilovada muqova sifatida
  } else if (mediaRes.message?.photo) {
    mediaType = "photo";
    const photoArr = mediaRes.message.photo;
    mediaId = photoArr[photoArr.length - 1].file_id;
  } else {
    return ctx.reply("❗️ Iltimos, video yoki rasm yuboring.", { reply_markup: mainMenu });
  }

  // 3. Manzil (matn bilan)
  await ctx.reply(
    "3️⃣ <b>Salon manzilini</b> yozing:\n<i>(Masalan: «Toshkent sh., Chilonzor tumani, Bunyodkor ko'chasi 12-uy» yoki «Samarqand, Gazli shossesi, 1-uy»)</i>",
    { parse_mode: "HTML" }
  );
  const locRes = await conversation.waitFor("message:text");
  if (cancelTexts.includes(locRes.message.text)) return ctx.reply("❌ <b>Reklama berish to'xtatildi.</b>\n\n💡 Tanlagan bo'limingizni ochish uchun pastdagi tugmani <b>yana bir marta bosing.</b>", { parse_mode: "HTML", reply_markup: mainMenu });
  const location = locRes.message.text.trim();

  // 4. Telefon (salon telefoni bor, lekin yangisini kiritish imkoniyati)
  const kbPhone = new InlineKeyboard().text(`✅ Saqlangan raqam: +${checkData.user.dealer_phone}`, "phone_saved");
  await ctx.reply(
    "4️⃣ <b>Bog'lanish uchun telefon raqami:</b>\n\n" +
    "Saqlangan raqamingizni ishlatasizmi yoki yangisini kiritasizmi?\n" +
    "<i>(Yangi raqam kiritish uchun shunchaki yozing, yoki bir nechta raqamni vergul bilan yozing)</i>",
    { parse_mode: "HTML", reply_markup: kbPhone }
  );

  const phoneRes = await conversation.waitFor(["callback_query:data", "message:text"]);
  let phone;
  if (phoneRes.callbackQuery?.data === "phone_saved") {
    await phoneRes.answerCallbackQuery();
    phone = `+${checkData.user.dealer_phone}`;
  } else {
    if (cancelTexts.includes(phoneRes.message?.text)) return ctx.reply("❌ Reklama bekor qilindi.", { reply_markup: mainMenu });
    phone = phoneRes.message.text.trim();
  }

  // 5. 💳 Tarif va to'lov (pullik rejimda)
  let plan = null, receiptId = null;
  const payInfo = await conversation.external(async () => ({
    on: paidSalonOn() && ctx.from.id !== ADMIN_ID, credits: await getSalonCredits(ctx.from.id),
    plans: SALON_PLAN_KEYS.map((k) => ({ key: k, title: SALON_PLANS[k].title, price: getPrice(SALON_PLANS[k].priceKey) })),
  }));
  payInfo.prices = Object.fromEntries(payInfo.plans.map((x) => [x.key, x.price]));
  if (payInfo.on) {
    const planKb = new InlineKeyboard();
    if (payInfo.credits > 0) planKb.text(`🎟 Paketdan (${payInfo.credits} ta qoldi)`, "splan:credit").row();
    payInfo.plans.forEach((x) => planKb.text(`${x.title} — ${somFmt(x.price)}`, `splan:${x.key}`).row());
    planKb.text("❌ Bekor qilish", "splan:cancel");
    await ctx.reply(
      "5️⃣ <b>Reklama qayerda chiqsin? Tarifni tanlang:</b>\n\n" +
      "📢 <b>Kanal</b> — kanalga alohida post bo'lib chiqadi.\n" +
      "📱 <b>Ilova</b> — Mini App'da bozor tepasidagi «Avtosalonlar takliflari» lentasida va e'lonlar orasida turadi, saloningiz sahifasida barcha e'lonlaringiz ko'rinadi.\n" +
      "📢📱 <b>Ikkalasi</b> — eng ko'p qamrov, alohida olishdan arzonroq.",
      { parse_mode: "HTML", reply_markup: planKb });
    while (!plan) {
      const pr = await conversation.waitFor(["callback_query:data", "message:text"]);
      if (pr.message?.text) {
        if (cancelTexts.includes(pr.message.text)) return ctx.reply("❌ Reklama bekor qilindi.", { reply_markup: mainMenu });
        await ctx.reply("👆 Tarifni yuqoridagi tugmalardan tanlang.");
        continue;
      }
      await pr.answerCallbackQuery().catch(() => {});
      const d = pr.callbackQuery.data;
      if (d === "splan:cancel") return ctx.reply("❌ Reklama bekor qilindi.", { reply_markup: mainMenu });
      const pk = d.split(":")[1];
      if (pk === "credit" || SALON_PLANS[pk]) plan = pk;
    }
    if (plan !== "credit") {
      await ctx.reply(
        `💳 <b>${SALON_PLANS[plan].title}: ${somFmt(payInfo.prices[plan])}</b>\n\n` +
        `Quyidagi kartaga o'tkazing:\n<code>${payCard()}</code>\n👤 ${payCardName()}\n\n` +
        `📸 So'ng <b>to'lov chekini (skrinshot)</b> shu yerga rasm qilib yuboring.`,
        { parse_mode: "HTML" }
      );
      while (!receiptId) {
        const rr = await conversation.waitFor(["message:photo", "message:text"]);
        if (rr.message.photo) { receiptId = rr.message.photo[rr.message.photo.length - 1].file_id; break; }
        if (cancelTexts.includes(rr.message.text)) return ctx.reply("❌ Reklama bekor qilindi.", { reply_markup: mainMenu });
        await ctx.reply("📸 Iltimos, to'lov chekini <b>rasm</b> qilib yuboring.", { parse_mode: "HTML" });
      }
    }
  }

  // Bazaga saqlash va adminga yuborish — umumiy funksiya (Mini App ham shuni chaqiradi)
  const salonResult = await conversation.external(() => submitSalonAd({
    userId: ctx.from.id, adText, mediaType, mediaId, thumbId, location, phone, plan, receiptId,
  }));
  if (!salonResult.ok) return ctx.reply(salonResult.error, { parse_mode: "HTML", reply_markup: mainMenu });

  await ctx.reply(
    "✅ <b>Reklamangiz adminga yuborildi!</b>\n\nTekshiruvdan so'ng tanlagan joyingizga (kanal / ilova) chiqadi. Odatda bu tez amalga oshadi.",
    { parse_mode: "HTML", reply_markup: mainMenu }
  );
}
bot.use(createConversation(salonAdConversation));
// ✅ Admin salon reklamasini tasdiqlaganda — kanalga joylaydi
bot.callbackQuery(/^salon_approve:(\d+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const salonAdId = ctx.match[1];

  const [[sa]] = await db.execute("SELECT * FROM salon_ads WHERE id = ?", [salonAdId]);
  if (!sa || sa.status !== 'pending') {
    return ctx.answerCallbackQuery({ text: "Bu reklama allaqachon ko'rib chiqilgan.", show_alert: true });
  }

  await ctx.answerCallbackQuery("⏳ Joylanmoqda...").catch(()=>{});
  const place = salonPlacement(sa.plan);

  // Kanalga chiqadigan chiroyli post
  const channelCaption =
    `📢 <b>REKLAMA | ${sa.salonName.toUpperCase()}</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    `${sa.adText}\n\n` +
    `📍 <b>Manzil:</b> ${sa.location}\n` +
    `📞 <b>Bog'lanish:</b> ${sa.phone}\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🚗 <i>Ishonchli avtosalon | @engarzonidamoshina</i>`;

  const channelKb = new InlineKeyboard()
    .url("🤖 O'z e'loningizni bering", "https://t.me/arzonida_bot").row()
    .url("📢 Kanalimiz", "https://t.me/engarzonidamoshina");

  try {
    let sentMsg = null;
    if (place.channel) {
      sentMsg = sa.mediaType === "video"
        ? await bot.api.sendVideo(CHANNEL_ID, sa.mediaId, { caption: channelCaption, parse_mode: "HTML", reply_markup: channelKb })
        : await bot.api.sendPhoto(CHANNEL_ID, sa.mediaId, { caption: channelCaption, parse_mode: "HTML", reply_markup: channelKb });
    }
    await db.execute("UPDATE salon_ads SET status = 'active', channelMsgId = ? WHERE id = ?", [sentMsg ? sentMsg.message_id : null, salonAdId]);

    let extra = "";
    if (place.app) {
      const until = new Date(Date.now() + salonAppDays() * 86400000);
      await db.execute("UPDATE salon_ads SET app_until = ?, app_notified = 0 WHERE id = ?", [until, salonAdId]);
      extra += `\n\n📱 Ilovada <b>${fmtTash(until)}</b> gacha turadi: bozor tepasidagi «Avtosalonlar takliflari» lentasida va e'lonlar orasida. Muddat tugaganda nechta odam ochgani va qo'ng'iroq qilganini yozib yuboramiz.`;
    }
    if (sa.plan === "pack5") {
      await db.execute("UPDATE users SET salon_credits = salon_credits + 4 WHERE id = ?", [sa.userId]);
      const left = await getSalonCredits(sa.userId);
      extra += `\n\n🎟 Paketingizda yana <b>${left} ta</b> post bor. Keyingi reklamada «Paketdan» ni tanlang.`;
    }
    if (sa.plan === "pin" && sentMsg) {
      await bot.api.pinChatMessage(CHANNEL_ID, sentMsg.message_id, { disable_notification: true }).catch((e) => console.error("Qadab bo'lmadi:", e.message));
      await db.execute("UPDATE salon_ads SET pin_until = NOW() + INTERVAL 24 HOUR WHERE id = ?", [salonAdId]);
      extra += "\n\n📌 Reklama 24 soat kanal tepasida turadi.";
    }

    const where = [place.channel ? "kanalga" : null, place.app ? "ilovaga" : null].filter(Boolean).join(" va ");
    await ctx.editMessageCaption({ caption: `✅ <b>Reklama ${where} joylandi!</b>` + extra.replace(/Paketingizda/, "Dilerning paketida").replace(/ Muddat tugaganda.*$/s, ""), parse_mode: "HTML" });

    // Dilerga xabar
    try {
      await bot.api.sendMessage(sa.userId, `🎉 <b>Reklamangiz ${where} joylandi!</b>${extra}` + (place.channel ? "\n\nKanalni ko'rish: https://t.me/engarzonidamoshina" : ""), { parse_mode: "HTML" });
    } catch (e) {}

  } catch (e) {
    console.error("Salon reklamasini joylashda xato:", e);
    await ctx.reply("❌ Xatolik: Reklamani joylab bo'lmadi.");
  }
});

// ❌ Admin salon reklamasini rad etganda
bot.callbackQuery(/^salon_reject:(\d+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const salonAdId = ctx.match[1];

  const [[sa]] = await db.execute("SELECT * FROM salon_ads WHERE id = ?", [salonAdId]);
  if (!sa) return ctx.answerCallbackQuery({ text: "Reklama topilmadi.", show_alert: true });

  if (sa.status !== "pending") return ctx.answerCallbackQuery({ text: "Bu reklama allaqachon ko'rib chiqilgan.", show_alert: true });
  await db.execute("UPDATE salon_ads SET status = 'rejected' WHERE id = ?", [salonAdId]);
  // Paketdan berilgan bo'lsa — postni qaytaramiz; pullik bo'lsa — adminga pulni qaytarish eslatmasi
  if (sa.plan === "credit") await db.execute("UPDATE users SET salon_credits = salon_credits + 1 WHERE id = ?", [sa.userId]);
  const refundNote = sa.price ? `\n\n💳 Diler ${somFmt(sa.price)} to'lagan — pulni qaytarishni unutmang.` : sa.plan === "credit" ? "\n\n🎟 Post dilerning paketiga qaytarildi." : "";
  await ctx.editMessageCaption({ caption: "❌ <b>Reklama rad etildi.</b>" + refundNote, parse_mode: "HTML" });

  try {
    await bot.api.sendMessage(sa.userId, "❌ <b>Salon reklamangiz rad etildi.</b>\n\nReklama qoidalarga mos kelmadi. Savol bo'lsa: @uzdev75", { parse_mode: "HTML" });
  } catch (e) {}
});
// ✅ Admin dilerni tasdiqlaganda
bot.callbackQuery(/^dealer_approve:(\d+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const userId = ctx.match[1];

  await db.execute("UPDATE users SET is_dealer = 1 WHERE id = ?", [userId]);

  // Diler nomini olamiz (xabarda ko'rsatish uchun)
  const [[u]] = await db.execute("SELECT dealer_name FROM users WHERE id = ?", [userId]);
  const dealerName = u ? u.dealer_name : "Avtosalon";

  await ctx.editMessageText(`✅ <b>${dealerName}</b> avtosalon sifatida tasdiqlandi!`, { parse_mode: "HTML" });

  // Dilerga xursandchilik xabari
  try {
    await bot.api.sendMessage(userId,
      `🎉 <b>TABRIKLAYMIZ!</b>\n\n` +
      `Siz endi rasmiy <b>«${dealerName}»</b> avtosaloni sifatida tasdiqlandingiz!\n\n` +
      `Endi sizga quyidagilar ochiq:\n` +
      `✅ E'lonlaringizda «Ishonchli sotuvchi» belgisi chiqadi\n` +
      `✅ Cheksiz e'lon berishingiz mumkin${paidAdsOn() ? ` (har biri ${somFmt(getPrice("ad"))})` : ""}\n` +
      `✅ «📢 Salon reklamasi» bo'limidan kanalga reklama joylay olasiz` + (paidSalonOn() ? ` (${somFmt(getPrice("salon_single"))} dan)` : " (hozircha bepul)") + `\n` +
      `✅ Xaridorlar sizga ko'proq ishonadi\n\n` +
      `Hoziroq e'lon berib ko'ring! 🚗`,
      { parse_mode: "HTML", reply_markup: mainMenu }
    );
  } catch (e) {}
});

// ❌ Admin dilerni rad etganda
bot.callbackQuery(/^dealer_reject:(\d+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const userId = ctx.match[1];

  // Ma'lumotlarni tozalaymiz
  await db.execute("UPDATE users SET is_dealer = 0, dealer_name = NULL, dealer_phone = NULL WHERE id = ?", [userId]);

  await ctx.editMessageText("❌ <b>Avtosalon so'rovi rad etildi.</b>", { parse_mode: "HTML" });

  try {
    await bot.api.sendMessage(userId,
      "❌ <b>Avtosalon so'rovingiz rad etildi.</b>\n\nAgar bu xato bo'lsa yoki savolingiz bo'lsa, admin bilan bog'laning: @uzdev75",
      { parse_mode: "HTML" }
    );
  } catch (e) {}
});
/**
 * ✅ АДМИН ТАСДИҚЛАШИ (Каналга юбориш)
 */
bot.callbackQuery(/^approve:(\d+)/, async (ctx) => {
  const adId = ctx.match[1];
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
  const ad = rows[0];

  if (ad && ad.status === "pending") {
        // E'lon egasi dilermi tekshiramiz
       const [[dealerRow]] = await db.execute("SELECT is_dealer, dealer_name, dealer_paused FROM users WHERE id = ?", [ad.userId]);
    const dealerBadge = (dealerRow && dealerRow.is_dealer === 1 && dealerRow.dealer_paused !== 1)
      ? `✅ <b>Ishonchli sotuvchi: ${dealerRow.dealer_name}</b>\n\n`
      : "";
    const photos = ad.photoId.split(",");
    const photoUrls = await Promise.all(
      photos.map(async (id) => {
        const file = await bot.api.getFile(id);
        return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
      })
    );
        const badgeInfo = await getPriceBadgeForImage(ad.carDetails, ad.price, ad.year);
    const collagePath = await createCollage(photoUrls, badgeInfo);

    let caption =dealerBadge +
      `🆔 ID: ${ad.id}\n🚗 Moshina: ${ad.carDetails}\n📅 Yili: ${ad.year}\n👣 Probeg: ${kmText(ad.probeg)}\n` +
      `💎 Kraskasi: ${ad.paint}\n🎨 Rangi: ${ad.color}\n✅ Karobka: ${ad.transmission}\n` +
      `⛽ Yoqilg'i: ${ad.fuel}\n`;

    if (ad.history && ad.history !== "Ko'rsatilmagan") {
      caption += `🛠 Tarixi: ${ad.history}\n`;
    }
if (ad.barter && ad.barter !== "Yo'q") {
      caption += `🔄 Barter: ${ad.barter}\n`;
    }
    if (ad.nasiya && ad.nasiya !== "Yo'q") {
      caption += `💳 Nasiya (bo'lib to'lash): ${ad.nasiya}\n`;
    }
    if (ad.dealer_offer) {
      caption += `\n🎁 <b>MAXSUS TAKLIF:</b>\n${ad.dealer_offer}\n`;
    }
        const badge = await getPriceBadge(ad.carDetails, ad.price, ad.year);
    caption += `💰 Narxi: ${formatNum(ad.price)}$${badge}\n☎️ +${ad.phone}\n🚩 #${ad.region.replace(/\s+/g, "_")}\n\n` +
      `⚠️ Moshina savdosiga admin javobgar emas, oldindan to'lov qilmang. Ogohlik davr talabi ❗\n\n👉 ${inviteLink()}`;
    caption = addPriceVoteLine(caption); // 👇 Narxga baho bering: 🔥 · 👍 · 🤔

    const channelMarkup = AD_CHANNEL_MARKUP(ad.id); // ilova tugmasi ham shu yerda
      // .url("📢 KANALIMIZ", "https://t.me/engarzonidamoshina");

    try {
      const msg = await bot.api.sendPhoto(CHANNEL_ID, new InputFile(collagePath), {
        caption: caption, reply_markup: channelMarkup, parse_mode: "HTML",
      });

      console.log(`✅ YANGI E'LON KANALGA TUSHDI! Kanal: ${CHANNEL_ID}, Xabar ID: ${msg.message_id}`);
      await addShareButton(ad.id, msg.message_id); // ↗️ ulashish tugmasi uchun post ID si kerak edi

      let vidMsg = null; // Video uchun maxsus o'zgaruvchi
      if (ad.videoId) {
        try {
          vidMsg = await bot.api.sendVideo(CHANNEL_ID, ad.videoId, { reply_to_message_id: msg.message_id });
        } catch (vidErr) {
          console.error("Videoni kanalga yuborishda xatolik:", vidErr);
        }
      }

      // ================= YANGI: 2-KANALGA HAM NUSXALASH =================
      let secondMsgId = null; // 2-kanal ID sini saqlash uchun
      try {
        const SECOND_CHANNEL_ID = process.env.SECOND_CHANNEL_ID; 
        
        if (SECOND_CHANNEL_ID) { 
          const secondMsg = await bot.api.copyMessage(SECOND_CHANNEL_ID, CHANNEL_ID, msg.message_id, {
            reply_markup: channelMarkup
          });
          secondMsgId = secondMsg.message_id; // <-- ID ni ushlab oldik!
          
          if (vidMsg) {
            await bot.api.copyMessage(SECOND_CHANNEL_ID, CHANNEL_ID, vidMsg.message_id, {
              reply_to_message_id: secondMsgId
            });
          }
        }
      } catch (err) {
        console.error("2-kanalga nusxalashda xato yuz berdi:", err);
      }
      // ==================================================================

      // MUHIM: Endi ikkala kanal ID si ham bazaga saqlanadi
      await db.execute("UPDATE ads SET status='active', channelMsgId=?, secondChannelMsgId=?, posted_at = COALESCE(posted_at, NOW()) WHERE id=?", [msg.message_id, secondMsgId, adId]);
      
      if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
      
      await ctx.editMessageCaption({ caption: "✅ Kanalga joylandi!", parse_mode: "HTML", reply_markup: new InlineKeyboard().text("➡️ Keyingisini ko'rish", "admin_pending") });
      
      // YANGI: Agar uzer botni blok qilib qo'ygan bo'lsa, dastur qulab tushmasligi uchun himoya (try-catch)
      try {
          await bot.api.sendMessage(ad.userId, `🎉 <b>Tabriklaymiz!</b>\n\nSizning <b>${ad.carDetails}</b> e'loningiz kanalga joylandi.\n\n💡 <b>Eslatma:</b> Agar moshinangiz sotilsa, pastdagi <b>«📂 Mening e'lonlarim»</b> bo'limiga kirib <b>«Sotildi»</b> deb belgilab qo'yishni unutmang. Shuningdek, o'sha yerdan e'lon narxini pasaytirishingiz ham mumkin!${voteHintForSeller()}\n\nE'loningiz: ${channelPostLink(msg.message_id)}`, { parse_mode: "HTML", reply_markup: mainMenu });
      } catch (e) {
        console.log(`⚠️ ${ad.userId} ID egasi botni blok qilgani sababli xabar bormadi.`);
      }
      
      try {
        const [alerts] = await db.execute("SELECT * FROM alerts");
        const adPrice = parseInt(ad.price.replace(/\D/g, "")) || 0;
        const adDetails = ad.carDetails.toLowerCase();

        for (const alert of alerts) {
            if (alertMatchesAd(alert, ad) && adPrice <= alert.maxPrice) { // model ID bo'yicha (bo'lmasa nomi bo'yicha)
                try {
                    await bot.api.sendMessage(alert.userId, `🔔 <b>SIZ Qidirayotgan moshina chiqdi!</b>\n\nBizning kanalga sizning talabingizga mos moshina joylandi:`, { parse_mode: "HTML" });
                    await bot.api.copyMessage(alert.userId, CHANNEL_ID, msg.message_id);
                    
                    await delay(50); // <--- MANA SHU PAUZA QO'SHILDI
                } catch(e) {
                    if (e.error_code === 429) {
                       await delay((e.parameters?.retry_after || 1) * 1000);
                    }
                }
            }
        }
      } catch(e) { console.error("Xabarnoma yuborishda xato:", e); }
      
    } catch (e) {
      console.error("Kanalga yuborishda xatolik:", e);
      await ctx.reply("Xatolik: Kanalga yuborib bo'lmadi. Bot kanalda admin ekanligini tekshiring.");
    }
  } else {
     await ctx.answerCallbackQuery("Bu e'lon allaqachon ko'rib chiqilgan.");
  }
});


bot.callbackQuery(/^approve_hot:(\d+)/, async (ctx) => {
  const adId = ctx.match[1];
  db.execute("UPDATE ads SET is_hot = 1 WHERE id = ? AND status = 'pending'", [adId]).catch(() => {});
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
  const ad = rows[0];

  if (ad && ad.status === "pending") {
        // E'lon egasi dilermi tekshiramiz
        const [[dealerRow]] = await db.execute("SELECT is_dealer, dealer_name, dealer_paused FROM users WHERE id = ?", [ad.userId]);
    const dealerBadge = (dealerRow && dealerRow.is_dealer === 1 && dealerRow.dealer_paused !== 1)
      ? `✅ <b>Ishonchli sotuvchi: ${dealerRow.dealer_name}</b>\n\n`
      : "";
    const photos = ad.photoId.split(",");
    const photoUrls = await Promise.all(
      photos.map(async (id) => {
        const file = await bot.api.getFile(id);
        return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
      })
    );
        const badgeInfo = await getPriceBadgeForImage(ad.carDetails, ad.price, ad.year);
    const collagePath = await createCollage(photoUrls, badgeInfo);

    // ================= MATN TEPASIGA QAYNOQ NARX QO'SHILDI =================
    let caption =dealerBadge +
      `🔥 <b>QAYNOQ NARX!</b>\n\n` +
      `🆔 ID: ${ad.id}\n🚗 Moshina: ${ad.carDetails}\n📅 Yili: ${ad.year}\n👣 Probeg: ${kmText(ad.probeg)}\n` +
      `💎 Kraskasi: ${ad.paint}\n🎨 Rangi: ${ad.color}\n✅ Karobka: ${ad.transmission}\n` +
      `⛽ Yoqilg'i: ${ad.fuel}\n`;

    if (ad.history && ad.history !== "Ko'rsatilmagan") {
      caption += `🛠 Tarixi: ${ad.history}\n`;
    }
    if (ad.barter && ad.barter !== "Yo'q") {
      caption += `🔄 Barter: ${ad.barter}\n`;
    }
    if (ad.nasiya && ad.nasiya !== "Yo'q") {
      caption += `💳 Nasiya (bo'lib to'lash): ${ad.nasiya}\n`;
    }
    if (ad.dealer_offer) {
      caption += `\n🎁 <b>MAXSUS TAKLIF:</b>\n${ad.dealer_offer}\n`;
    }
        const badge = await getPriceBadge(ad.carDetails, ad.price, ad.year);
    caption += `💰 Narxi: ${formatNum(ad.price)}$${badge}\n☎️ +${ad.phone}\n🚩 #${ad.region.replace(/\s+/g, "_")}\n\n` +
      `⚠️ Moshina savdosiga admin javobgar emas, oldindan to'lov qilmang. Ogohlik davr talabi ❗\n\n👉 ${inviteLink()}`;
    caption = addPriceVoteLine(caption); // 👇 Narxga baho bering: 🔥 · 👍 · 🤔
    // ==============================================================================

    const channelMarkup = AD_CHANNEL_MARKUP(ad.id); // ilova tugmasi ham shu yerda
      // .url("📢 KANALIMIZ", "https://t.me/engarzonidamoshina");

    try {
      // 1. Asosiy kanalga rasm yuborish
      const msg = await bot.api.sendPhoto(CHANNEL_ID, new InputFile(collagePath), {
        caption: caption, reply_markup: channelMarkup, parse_mode: "HTML",
      });
      await addShareButton(ad.id, msg.message_id); // ↗️ ulashish tugmasi uchun post ID si kerak edi

      // 2. Asosiy kanalga video yuborish (vidMsg o'zgaruvchisi ochildi)
      let vidMsg = null;
      if (ad.videoId) {
        try { 
            vidMsg = await bot.api.sendVideo(CHANNEL_ID, ad.videoId, { reply_to_message_id: msg.message_id }); 
        } catch (e) {
            console.error("Videoni kanalga yuborishda xatolik:", e);
        }
      }

      // ================= YANGI: 2-KANALGA HAM NUSXALASH =================
      let secondMsgId = null; // 2-kanal xabarining ID si uchun
      try {
        const SECOND_CHANNEL_ID = process.env.SECOND_CHANNEL_ID; 
        
        if (SECOND_CHANNEL_ID) { 
          const secondMsg = await bot.api.copyMessage(SECOND_CHANNEL_ID, CHANNEL_ID, msg.message_id, {
            reply_markup: channelMarkup
          });
          secondMsgId = secondMsg.message_id; // <-- 2-kanal ID si olindi
          
          if (vidMsg) {
            await bot.api.copyMessage(SECOND_CHANNEL_ID, CHANNEL_ID, vidMsg.message_id, {
              reply_to_message_id: secondMsgId
            });
          }
        }
      } catch (err) {
        console.error("2-kanalga nusxalashda xato yuz berdi:", err);
      }
      // ==================================================================

      // 3. IKKALA kanal ID sini ham bazaga bitta qilib saqlash
      await db.execute("UPDATE ads SET status='active', channelMsgId=?, secondChannelMsgId=?, posted_at = COALESCE(posted_at, NOW()) WHERE id=?", [msg.message_id, secondMsgId, adId]);

      if (require('fs').existsSync(collagePath)) require('fs').unlinkSync(collagePath);
      
      await ctx.editMessageCaption({ caption: "✅ Qaynoq narx sifatida kanalga joylandi!", parse_mode: "HTML", reply_markup: new InlineKeyboard().text("➡️ Keyingisini ko'rish", "admin_pending") });
      
      try {
          await bot.api.sendMessage(ad.userId, 
            `🎉 <b>Tabriklaymiz!</b>\n\n` +
            `Sizning <b>${ad.carDetails}</b> e'loningiz kanalga <b>"🔥 QAYNOQ NARX"</b> maqomida joylandi!\n\n` +
            `E'loningiz: ${channelPostLink(msg.message_id)}\n\n` +
            `📌 <b>Eslatma:</b> Agar moshinangiz sotilsa, pastdagi «📂 Mening e'lonlarim» bo'limiga kirib «Sotildi» deb belgilab qo'yishni unutmang. Shuningdek, o'sha yerdan e'lon narxini pasaytirishingiz ham mumkin!` +
            voteHintForSeller(),
            { parse_mode: "HTML", reply_markup: mainMenu }
          );
      } catch (e) {}
      
      // Alert xabarnomalari
     // Alert xabarnomalari
      try {
        const [alerts] = await db.execute("SELECT * FROM alerts");
        const adPrice = parseInt(ad.price.replace(/\D/g, "")) || 0;
        const adDetails = ad.carDetails.toLowerCase();

        for (const alert of alerts) {
            if (alertMatchesAd(alert, ad) && adPrice <= alert.maxPrice) { // model ID bo'yicha (bo'lmasa nomi bo'yicha)
                try {
                    await bot.api.sendMessage(alert.userId, `🔔 <b>SIZ Qidirayotgan moshina chiqdi!</b>`, { parse_mode: "HTML" });
                    await bot.api.copyMessage(alert.userId, CHANNEL_ID, msg.message_id);
                    
                    await delay(50); // <--- MANA SHU PAUZA QO'SHILDI
                } catch(e) {
                    if (e.error_code === 429) {
                       await delay((e.parameters?.retry_after || 1) * 1000);
                    }
                }
            }
        }
      } catch(e) {}
      
    } catch (e) {
      console.error("Kanalga yuborishda xatolik:", e);
      await ctx.reply("Xatolik: Kanalga yuborib bo'lmadi.");
    }
  } else {
     await ctx.answerCallbackQuery("Bu e'lon allaqachon ko'rib chiqilgan.");
  }
});
//Shu yergacha lotinga o'zgardi
// ==============================================================
// ❌ RAD ETISH VA SABAB YOZISH (KONVERSATSIYA)
// ==============================================================
// ==============================================================
// ❌ RAD ETISH VA SABAB YOZISH (XATOSIZ KONVERSATSIYA)
// ==============================================================
async function rejectReasonConversation(conversation, ctx) {
  // 1. Ma'lumotlarni xotiradan emas, to'g'ridan-to'g'ri bosilgan tugmadan ajratib olamiz!
  const cbData = ctx.callbackQuery.data; 
  const isEdit = cbData.startsWith("reject_edit:");
  const adId = cbData.split(":")[1];
  const photoMsgId = ctx.callbackQuery.message?.message_id;

  const table = isEdit ? "ad_edits" : "ads";
  const idField = isEdit ? "editId" : "id";

  // Bazadan e'lonni tekshirish
  const [rows] = await conversation.external(() => db.execute(`SELECT * FROM ${table} WHERE ${idField} = ?`, [adId]));
  const ad = rows[0];

  if (!ad) {
      await ctx.reply("❌ E'lon allaqachon ko'rib chiqilgan yoki topilmadi.");
      return;
  }

  // Admin uchun qulay tayyor sabablar
  const kb = new InlineKeyboard()
    .text("📸 Rasmlar sifatsiz", "rsn:Rasmlar sifatsiz yoki xiralashgan").row()
    .text("💰 Narxi xato", "rsn:Narx noto'g'ri (Masalan, so'mda yozilgan)").row()
    .text("📝 Ma'lumot xato", "rsn:Ma'lumotlar to'liq emas yoki xato").row()
    .text("✍️ Qo'lda yozish", "rsn:manual").row()
    .text("❌ Bekor qilish", "cancel_reject");

  const promptMsg = await ctx.reply("📝 <b>Nima uchun e'lon rad etildi?</b>\nSababni tanlang yoki qo'lda yozing:", { parse_mode: "HTML", reply_markup: kb });

  let reasonText = "";
  // Faqat sabab tugmasi yoki «Bekor qilish» qabul qilinadi. Admin shu payt boshqa e'lonning tugmasini
  // bossa — avval e'lon SABABSIZ rad etilib ketardi; endi eslatma chiqadi va sabab kutilaveradi.
  let res;
  while (true) {
    res = await conversation.waitFor("callback_query:data");
    const d = res.callbackQuery.data;
    if (d === "cancel_reject" || d.startsWith("rsn:")) break;
    await res.answerCallbackQuery({ text: "Avval rad etish sababini tanlang yoki «Bekor qilish» ni bosing.", show_alert: true }).catch(() => {});
  }

  if (res.callbackQuery.data === "cancel_reject") {
      await res.answerCallbackQuery();
      await ctx.api.deleteMessage(ctx.chat.id, promptMsg.message_id).catch(()=>{});
      return;
  }

  if (res.callbackQuery.data.startsWith("rsn:")) {
      const val = res.callbackQuery.data.replace("rsn:", ""); // Tayyor matnni ajratib olamiz
      if (val === "manual") {
          await res.answerCallbackQuery();
          await ctx.api.editMessageText(ctx.chat.id, promptMsg.message_id, "✍️ <b>Foydalanuvchiga yuboriladigan rad etish sababini yozib yuboring:</b>", { parse_mode: "HTML" });
          const textRes = await conversation.waitFor("message:text");
          reasonText = textRes.message.text;
          await ctx.api.deleteMessage(ctx.chat.id, textRes.message.message_id).catch(()=>{});
      } else {
          reasonText = val;
          await res.answerCallbackQuery();
      }
  }

  await ctx.api.deleteMessage(ctx.chat.id, promptMsg.message_id).catch(()=>{});

  // DB dan o'chirish yoki 'rejected' qilish
  if (isEdit) {
      await conversation.external(() => db.execute("DELETE FROM ad_edits WHERE editId = ?", [adId]));
  } else {
      await conversation.external(() => db.execute("UPDATE ads SET status='rejected' WHERE id=?", [adId]));
  }

  // Admindagi rasmni "Rad etildi" deb o'zgartirish
  if (photoMsgId) {
      try {
         await ctx.api.editMessageCaption(ctx.chat.id, photoMsgId, { caption: "❌ <b>E'lon rad etildi.</b>", parse_mode: "HTML", reply_markup: new InlineKeyboard().text("➡️ Keyingisini ko'rish", "admin_pending") });
      } catch(e) {}
  }

  // Foydalanuvchiga sababni yuborish
  const userMsg = isEdit
      ? `❌ <b>E'lonni yangilash rad etildi.</b>\n\nSizning <b>${ad.carDetails}</b> e'loningizdagi o'zgarishlar qabul qilinmadi.\n\n📝 <b>Sabab:</b> ${escapeHtml(reasonText)}`
      : `❌ <b>E'loningiz rad etildi.</b>\n\nSizning <b>${ad.carDetails}</b> e'loningiz admin tomonidan rad etildi.\n\n📝 <b>Sabab:</b> ${escapeHtml(reasonText)}\n\nIltimos, xatolikni to'g'rilab qaytadan e'lon bering.`;

  try {
      await bot.api.sendMessage(ad.userId, userMsg, { parse_mode: "HTML" });
  } catch (e) {}

  await ctx.reply(`✅ Foydalanuvchiga rad etish sababi yuborildi:\n<i>"${escapeHtml(reasonText)}"</i>`, { parse_mode: "HTML" });
}

// Konversatsiyani ulash
bot.use(createConversation(rejectReasonConversation));

// MUHIM: suhbat (conversation) uni ochadigan tugma handleridan OLDIN ulanishi shart —
// grammY middleware'larni yozilgan tartibda ishlatadi. Aks holda:
// "The conversation 'soldConversation' has not been registered!" xatosi chiqadi.
bot.use(createConversation(editPriceConversation));
bot.use(createConversation(soldConversation));

// Yangi e'lonni rad etish tugmasi
bot.callbackQuery(/^reject:(\d+)/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("rejectReasonConversation");
});

// Tahrirlashni rad etish tugmasi
bot.callbackQuery(/^reject_edit:(\d+)/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("rejectReasonConversation");
});

// bot.callbackQuery(/^reject:(\d+)/, async (ctx) => {
//   const adId = ctx.match[1];
//   const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
//   const ad = rows[0];
  
//   if (ad && ad.status === "pending") {
//     await db.execute("UPDATE ads SET status='rejected' WHERE id=?", [adId]);
//     await ctx.editMessageCaption({ caption: "❌ <b>E'lon rad etildi.</b>", parse_mode: "HTML", reply_markup: new InlineKeyboard().text("➡️ Keyingisini ko'rish", "admin_pending") });
//     try {
//         await bot.api.sendMessage(ad.userId, `❌ <b>E'loningiz rad etildi.</b>\n\nSizning <b>${ad.carDetails}</b> e'loningiz qoidalarga mos kelmaganligi sababli rad etildi. Iltimos, ma'lumotlarni to'g'rilab qaytadan e'lon bering.`, { parse_mode: "HTML", reply_markup: mainMenu });
//     } catch (e) {}
//   } else {
//       await ctx.answerCallbackQuery("Bu e'lon allaqachon ko'rib chiqilgan.");
//   }
// });

// "💰 Sotildi" — avval real sotuv narxini so'raymiz (ixtiyoriy), keyin adminga (soldConversation)
bot.callbackQuery(/^sold_req:(\d+)/, async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  await ctx.conversation.enter("soldConversation");
});
// «⏭ Aytmayman» — so'rov allaqachon adminda, narx so'rovini yopamiz (eski xabardagi tugma bosilsa ham)
bot.callbackQuery("sold_skip_price", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "✅ So'rov adminga yuborilgan. Rahmat!" }).catch(() => {});
  await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => {});
});

bot.callbackQuery(/^confirm_sold:(\d+)/, async (ctx) => {
  // FAQAT ADMIN kanalda "sotildi" deb belgilay oladi!
  if (ctx.from.id !== ADMIN_ID) {
    // Oddiy foydalanuvchi (eslatmadagi "Allaqachon sotildi") — kanalda o'zgartirmaymiz,
    // avval sotuv narxini so'rab, adminga so'rov yuboramiz
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.conversation.enter("soldConversation");
    return;
  }

  const adId = ctx.match[1];
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
  const ad = rows[0];
  
  if (ad && ad.status === 'active') {
      try {
       // Real sotuv narxi aytilgan bo'lsa shuni, aks holda e'londagi narxni ko'rsatamiz
       const newCaption = ad.sold_price
         ? `💰 <b>SOTILDI!</b>\n\n<s>${ad.carDetails}</s>\n💰 <b>Sotildi: ${formatNum(ad.sold_price)} $</b>\n\n❌ <b>E'lon yopildi.</b>`
         : `💰 <b>SOTILDI!</b>\n\n<s>${ad.carDetails}</s>\n💰 <b>Narxi: ${formatNum(ad.price)} $</b>\n\n❌ <b>E'lon yopildi.</b>`;
        
        // 1. Asosiy kanalni yangilash
        await bot.api.editMessageCaption(CHANNEL_ID, ad.channelMsgId, { caption: newCaption, parse_mode: "HTML" });
        
        // ================= YANGI: 2-KANALDAGI E'LONNI HAM YANGILASH =================
        try {
            const SECOND_CHANNEL_ID = process.env.SECOND_CHANNEL_ID;
            if (SECOND_CHANNEL_ID && ad.secondChannelMsgId) {
                await bot.api.editMessageCaption(SECOND_CHANNEL_ID, ad.secondChannelMsgId, {
                    caption: newCaption, // <--- newCaption ishlatiladi
                    parse_mode: "HTML"
                });
            }
        } catch (err) {
            console.error("2-kanaldagi xabarni yangilashda xato (Sotildi):", err);
        }
        // ============================================================================
        
        await db.execute("UPDATE ads SET status='sold' WHERE id=?", [adId]);
        await ctx.editMessageText("✅ <b>Kanalda sotildi deb belgilandi!</b>", { parse_mode: "HTML" });
        await bot.api.sendMessage(ad.userId, `🎉 <b>Tabriklaymiz!</b>\n\nSizning <b>${ad.carDetails}</b> e'loningiz kanalda "SOTILDI" deb belgilandi.`, { parse_mode: "HTML" });

        // Avtomatik tabriknoma (Reklama) asosiy kanalga
               // Moshina necha kunda sotilganini hisoblaymiz
                // Moshina necha kunda sotilganini hisoblaymiz
        let daysText = "o'z xaridorini topdi";
        try {
            const createdDate = new Date(ad.created_at);
            const now = new Date();
            const diffDays = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));

            // FAQAT tez sotilgan (7 kungacha) moshinalar uchun kun sonini ko'rsatamiz.
            // Uzoq turganlar uchun kun yozilmaydi (teskari taassurot bo'lmasligi uchun).
            if (diffDays <= 0) {
                daysText = "atigi <b>bugun</b> joylanib, bugunoq o'z xaridorini topdi";
            } else if (diffDays === 1) {
                daysText = "atigi <b>1 kunda</b> o'z xaridorini topdi";
            } else if (diffDays <= 7) {
                daysText = `atigi <b>${diffDays} kunda</b> o'z xaridorini topdi`;
            } else {
                // 7 kundan ko'p — son yozilmaydi, shunchaki "sotildi"
                daysText = "o'z xaridorini topdi";
            }
        } catch (e) {
            daysText = "o'z xaridorini topdi";
        }
        // Avtomatik tabriknoma (Reklama) asosiy kanalga
               // Avtomatik tabriknoma (Reklama) asosiy kanalga
        const soldPriceText = ad.sold_price ? ` <b>${formatNum(ad.sold_price)}$ ga</b>` : "";
        const congratsText =
          `🎉 <b>YANA BITTA MOSHINA SOTILDI!</b>\n\n` +
          `🚗 <b>${ad.carDetails}</b> — ${daysText}${soldPriceText}! 🤝\n\n` +
          `Sotuvchini tabriklaymiz! Bizning botimiz orqali moshinalar <b>maklersiz, komissiyasiz va tez</b> sotilmoqda.\n\n` +
          `🚘 <b>Sizda ham sotiladigan moshina bormi?</b>\n` +
          `Uni bepul joylang — minglab xaridor kutmoqda! 👇\n` +
          `🤖 @arzonida_bot`;

        if (isAutoOn("sold_congrats")) await bot.api.sendMessage(CHANNEL_ID, congratsText, {
            parse_mode: "HTML",
            reply_to_message_id: ad.channelMsgId 
        });

      } catch (e) {
        console.error("Sotildi qilishda xatolik:", e);
        await ctx.reply("Xatolik: Kanaldagi xabarni tahrirlab bo'lmadi.");
      }
  } else {
      await ctx.answerCallbackQuery("Bu e'lon allaqachon sotilgan yoki faol emas.");
  }
});

/**
 * ✅ АСОСИЙ КНОПКАЛАР (ВА ФОЙДАЛАНУВЧИНИ БАЗАГА ҚЎШИШ)
 */
/**
 * ✅ АСОСИЙ КНОПКАЛАР (ВА ФОЙДАЛАНУВЧИНИ БАЗАГА ҚЎШИШ)
 */
// KANALGA KELGAN VA KETGANLARNI JONLI HISOBGA OLISH
bot.on("chat_member", async (ctx) => {
  const chat = ctx.chat;
  if (!chat || (chat.type !== "channel" && chat.type !== "supergroup")) return;

  const MAIN_CH = CHANNEL_ID;
  const SEC_CH = process.env.SECOND_CHANNEL_ID;

  let dbChannelId = null;
  // Qaysi kanaldan kelayotganini aniqlaymiz
  if (chat.id.toString() === MAIN_CH || (chat.username && `@${chat.username}` === MAIN_CH)) {
      dbChannelId = "main";
  } else if (SEC_CH && (chat.id.toString() === SEC_CH || (chat.username && `@${chat.username}` === SEC_CH))) {
      dbChannelId = "second";
  }

  if (!dbChannelId) return;

  const oldStatus = ctx.chatMember.old_chat_member.status;
  const newStatus = ctx.chatMember.new_chat_member.status;

  let joined = 0;
  let left = 0;

  // Foydalanuvchi qo'shildi
// Foydalanuvchi qo'shildi
  if (["left", "kicked"].includes(oldStatus) && ["member", "administrator", "creator"].includes(newStatus)) {
      joined = 1;

      // ==============================================================
      // 🏆 REFERAL UCHUN BALL BERISH (FAQAT KANALGA QO'SHILGANDA)
      // ==============================================================
      try {
          const joinedUserId = ctx.chatMember.new_chat_member.user.id;
          // Bu foydalanuvchini kimdir taklif qilganmi yoki o'zi kirdimi tekshiramiz
          const [userRows] = await db.execute("SELECT referred_by, is_referral_counted FROM users WHERE id = ?", [joinedUserId]);
          
          if (userRows.length > 0) {
              const u = userRows[0];
              // Agar kimdir taklif qilgan bo'lsa va hali ball berilmagan bo'lsa
              if (u.referred_by && u.is_referral_counted === 0) {
                  // Taklif qilgan odamga ballarini qo'shamiz
                  await db.execute("UPDATE users SET referral_count = referral_count + 1, contest_score = contest_score + 1 WHERE id = ?", [u.referred_by]);
                  
                  // Ball berilganini belgilab qo'yamiz (qayta-qayta chiqaversa ball berilmasligi uchun)
                  await db.execute("UPDATE users SET is_referral_counted = 1 WHERE id = ?", [joinedUserId]);
                  
                  // Taklif qilgan odamni tabriklaymiz
                  await bot.api.sendMessage(
                      u.referred_by, 
                      "🎉 <b>Tabriklaymiz!</b> Sizning havolangiz orqali do'stingiz kanalimizga obuna bo'ldi va sizga <b>+1 ball</b> qo'shildi!", 
                      { parse_mode: "HTML" }
                  ).catch(() => {}); // Bloklagan bo'lsa xato bermasligi uchun
              }
          }
      } catch (e) {
          console.error("Referal ball berishda xatolik:", e);
      }
      // ==============================================================
  }
  // Foydalanuvchi chiqib ketdi
  else if (["member", "administrator", "creator"].includes(oldStatus) && ["left", "kicked"].includes(newStatus)) {
      left = 1;
  }

  // Bazaga qo'shish yoki ayirish
  if (joined || left) {
      try {
          await db.execute(
              "INSERT INTO channel_events (channel_id, date, joined, left_count) VALUES (?, CURDATE(), ?, ?) ON DUPLICATE KEY UPDATE joined = joined + ?, left_count = left_count + ?",
              [dbChannelId, joined, left, joined, left]
          );
      } catch (e) {
          console.error("Kanal obunachilarini hisoblashda xato:", e);
      }
  }
});
bot.command("start", async (ctx) => {
  let isNewUser = false;
  // Foydalanuvchini avtomatik tarzda users bazasiga qo'shish yoki yangilash
  try {
    const id = ctx.from.id;
    const first_name = ctx.from.first_name || "";
    const username = ctx.from.username ? `@${ctx.from.username}` : "";
    const [result] = await db.execute(
      "INSERT IGNORE INTO users (id, first_name, username) VALUES (?, ?, ?)", 
      [id, first_name, username]
    );
    if (result.affectedRows === 1) isNewUser = true;
  } catch (error) {
    console.error("Userni saqlashda xatolik:", error);
  }
  const payload = ctx.match;
  // 1. E'LONNI SAQLASH (Fav) logikasi
  if (payload && payload.startsWith("fav_")) {
      const favAdId = parseInt(payload.split("_")[1]);
      if (favAdId) {
          try {
              await db.execute("INSERT IGNORE INTO favorites (userId, adId) VALUES (?, ?)", [ctx.from.id, favAdId]);
              await ctx.reply(`❤️ <b>E'lon saqlandi!</b> (ID: ${favAdId})\n\nAgar ushbu moshina narxi tushsa, bot sizga darhol avtomatik xabar yuboradi!`, { parse_mode: "HTML" });
          } catch(e) {}
      }
  }
  // 2. REFERAL (Taklif) logikasi
  if (isNewUser && payload && payload.startsWith("ref_")) {
      const referrerId = parseInt(payload.split("_")[1]);
      if (referrerId && referrerId !== ctx.from.id) {
          try {
              // Taklif qilgan odamning hisobini 1 taga oshiramiz
              // Odamga darhol ball bermaymiz, shunchaki kim taklif qilganini bazaga yozib qo'yamiz
            if (referrerId != ctx.from.id) {
                await db.execute("UPDATE users SET referred_by = ? WHERE id = ? AND is_referral_counted = 0", [referrerId, ctx.from.id]);
            }
              const [refRows] = await db.execute("SELECT referral_count FROM users WHERE id = ?", [referrerId]);
              
              if (refRows[0]) {
                  const count = refRows[0].referral_count;
                  if (count % 5 === 0) {
                      // 5 ta odam yig'di, bonus beramiz!
                      await db.execute("UPDATE users SET free_ups = free_ups + 1 WHERE id = ?", [referrerId]);
                      await bot.api.sendMessage(referrerId, `🎉 <b>TABRIKLAYMIZ!</b>\n\nSiz 5 ta do'stingizni taklif qildingiz va <b>1 ta BEPUL E'LON KO'TARISH (UP)</b> bonusini qo'lga kiritdingiz! 🚀\n\nBonusni ishlatish uchun <b>"📂 Mening e'lonlarim"</b> bo'limiga kiring.`, { parse_mode: "HTML" });
                  } else {
                      const qoldi = 5 - (count % 5);
                      await bot.api.sendMessage(referrerId, `👤 <b>Sizning taklif havolangiz orqali yangi do'stingiz botga qo'shildi!</b>\nJami takliflaringiz: <b>${count} ta.</b>\n\nYana <b>${qoldi} ta</b> do'stingizni taklif qilsangiz Bepul VIP (UP) olasiz!`, { parse_mode: "HTML" });
                  }
              }
          } catch(e) { console.error(e); }
      }
  }

  const welcomeText = 
    `🚗 <b>Avto-bozorimizga xush kelibsiz!</b>\n\n` +
    `Bu bot orqali siz moshinangizni tez va oson sotishingiz yoki o'zingizga mos avtomobil topishingiz mumkin.\n\n` +
    `🤖 <b>Botning asosiy imkoniyatlari:</b>\n` +
    `➖ <b>Tekin e'lon berish:</b> Moshinangiz ma'lumotlari va rasmlarini yuboring, bot avtomatik tarzda chiroyli kollaj yasab kanalga joylaydi.\n` +
    `➖ <b>Aqlli qidiruv:</b> O'zingiz izlayotgan marka va narxni kiriting, bot kanaldagi eng yaxshi variantlarni topib beradi.\n` +
    `➖ <b>Bildirishnoma (Obuna):</b> Siz izlayotgan moshina sotuvga chiqqan zahoti bot sizga darhol xabar beradi.\n` +
    `➖ <b>E'lonlarni boshqarish:</b> Moshinangiz sotilsa yoki narxini tushirmoqchi bo'lsangiz, eski xabarni o'chirmasdan osongina yangilashingiz mumkin.\n\n` +
    `👇 <i>Quyidagi menyu orqali o'zingizga kerakli bo'limni tanlang!</i>\n\n`+
    `(💡 Agar menyu tugmalari ko'rinmasa, xabar yozish joyidagi 🎛 belgisini bosing)`
    ;
    

  await ctx.reply(welcomeText, {
    reply_markup: mainMenu,
    parse_mode: "HTML",
  });

  // Ilovani ochish tugmasi (Mini App) — har /start da
  if (WEBAPP_URL) {
    const appText =
      `📱 <b>Endi ilova ham bor!</b>\n\n` +
      `E'lonlarni ko'rish, saqlash va joylash — hammasi bitta ilovada, Telegram ichida. Hech narsa yuklab olish shart emas.\n\n` +
      `🔍 Barcha e'lonlar rasmlari bilan, marka va narx bo'yicha filtr\n` +
      `❤️ Saqlang — narxi tushsa, bot xabar beradi\n` +
      `➕ E'lonni qulay forma orqali joylang\n` +
      `📂 E'lonlaringizni boshqaring: sotildi, narx, tahrir, VIP\n\n` +
      `👇 Ochish uchun pastdagi tugmani bosing. Keyin xabar yozish joyi yonidagi <b>«📱 Ilova»</b> tugmasidan ham ochasiz.`;
    await ctx.reply(appText, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().webApp("📱 Ilovani ochish", `${WEBAPP_URL}/`),
    }).catch((e) => console.error("Ilova xabarini yuborishda xato:", e.message));
  }
});

bot.hears("📝 E'lon berish", async (ctx) => {
  // Obuna, kutilayotgan e'lon va 3 ta limit — umumiy funksiyada (Mini App ham aynan shuni tekshiradi)
  const check = await checkCanPostAd(ctx.from.id);
  if (!check.ok) {
    if (check.code === "not_subscribed") return askForSub(ctx);
    return ctx.reply(check.message, { parse_mode: "HTML" });
  }

  if (ctx.session) ctx.session.editAdData = null;

  // Mini App ulangan bo'lsa — foydalanuvchi o'zi tanlaydi: ilovada (forma) yoki botda (savol-javob)
  if (WEBAPP_URL) {
    return ctx.reply(
      "📝 <b>E'lonni qanday to'ldirasiz?</b>\n\n" +
      (paidAdsOn() && ctx.from.id !== ADMIN_ID ? `💳 <b>E'lon joylash: ${somFmt(getPrice("ad"))}</b> — oxirida to'lov cheki so'raladi.\n\n` : "") +
      "📱 <b>Ilovada</b> — barcha maydonlar bitta sahifada, 1-2 daqiqada tayyor.\n" +
      "💬 <b>Bot orqali</b> — savol-javob tarzida, qadamma-qadam.",
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .webApp("📱 Ilovada to'ldirish", `${WEBAPP_URL}/#/new`).row()
          .text("💬 Bot orqali to'ldirish", "ad_via_bot"),
      }
    );
  }
  if (paidAdsOn() && ctx.from.id !== ADMIN_ID) {
    await ctx.reply(`💳 <b>E'lon joylash: ${somFmt(getPrice("ad"))}</b> — oxirida to'lov cheki so'raladi.`, { parse_mode: "HTML" });
  }
  await ctx.conversation.enter("createAdConversation");
});

// "💬 Bot orqali to'ldirish" tanlanganda — eski (savol-javob) usul
bot.callbackQuery("ad_via_bot", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const check = await checkCanPostAd(ctx.from.id); // tugma kechroq bosilgan bo'lishi mumkin
  if (!check.ok) {
    if (check.code === "not_subscribed") return askForSub(ctx);
    return ctx.reply(check.message, { parse_mode: "HTML" });
  }
  await ctx.deleteMessage().catch(() => {});
  if (ctx.session) ctx.session.editAdData = null;
  await ctx.conversation.enter("createAdConversation");
});

bot.hears("🔍 Mashina qidirish", async (ctx) => {
  if (!(await isSubscribed(ctx))) return askForSub(ctx);
  await ctx.conversation.enter("searchCarConversation");
});

// ==============================================================
// 📂 MENING E'LONLARIM (20 TALIK PAGINATSIYA VA RO'YXAT)
// ==============================================================
async function sendMyAdsPage(ctx, page = 1) {
  // Faol VA sotilgan e'lonlarni birga olamiz (eng yangisi tepada)
  const [ads] = await db.execute(
    "SELECT * FROM ads WHERE userId = ? AND status IN ('active', 'sold') ORDER BY created_at DESC",
    [ctx.from.id]
  );
  
  if (ads.length === 0) {
    const text = "📭 <b>Sizda hozirda e'lonlar yo'q.</b>";
    return ctx.callbackQuery ? ctx.editMessageText(text, { parse_mode: "HTML" }) : ctx.reply(text, { parse_mode: "HTML" });
  }

  const PER_PAGE = 20;
  const totalPages = Math.ceil(ads.length / PER_PAGE);
  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;

  const startIndex = (page - 1) * PER_PAGE;
  const endIndex = startIndex + PER_PAGE;
  const currentAds = ads.slice(startIndex, endIndex);

  // Faol va sotilganlar sonini alohida sanaymiz
  const activeCount = ads.filter(a => a.status === 'active').length;
  const soldCount = ads.filter(a => a.status === 'sold').length;

  let text = `📂 <b>Sizning e'lonlaringiz</b>\n`;
  text += `🟢 Faol: <b>${activeCount} ta</b> | ✅ Sotilgan: <b>${soldCount} ta</b>\n`;
  text += `📄 Sahifa: <b>${page}/${totalPages}</b>\n\n`;

  const kb = new InlineKeyboard();
  
  currentAds.forEach((ad, index) => {
    const adNum = startIndex + index + 1;
    // Sotilgan bo'lsa ✅ belgi va nomi chizib qo'yiladi, faol bo'lsa oddiy
    if (ad.status === 'sold') {
      text += `<b>${adNum}.</b> ✅ <s>${ad.carDetails}</s> — <s>${formatNum(ad.price)}$</s> <i>(Sotilgan)</i>\n<code>ID: ${ad.id}</code>\n\n`;
      // Sotilganlar uchun tugma qo'ymaymiz (boshqarib bo'lmaydi)
    } else {
      text += `<b>${adNum}.</b> 🟢 ${ad.carDetails} — <b>${formatNum(ad.price)}$</b>\n<code>ID: ${ad.id}</code>\n\n`;
      // Faqat faol e'lonlar uchun boshqaruv tugmasi
      kb.text(`${adNum}`, `manage_ad:${ad.id}`);
      if (kb.inline_keyboard[kb.inline_keyboard.length - 1]?.length >= 5) kb.row();
    }
  });

  // Oxirgi tugmalar qatorini yopamiz (agar to'liq bo'lmasa)
  if (kb.inline_keyboard.length > 0 && kb.inline_keyboard[kb.inline_keyboard.length - 1].length > 0 && kb.inline_keyboard[kb.inline_keyboard.length - 1].length < 5) {
    kb.row();
  }

  // Paginatsiya (Oldingi / Keyingi) tugmalari
  const navRow = [];
  if (page > 1) navRow.push(InlineKeyboard.text("⬅️ Oldingi", `myads_page:${page - 1}`));
  if (page < totalPages) navRow.push(InlineKeyboard.text("Keyingi ➡️", `myads_page:${page + 1}`));
  if (navRow.length > 0) kb.row(...navRow);

  text += `👇 <i>Boshqarmoqchi bo'lgan faol e'loningiz raqamini tanlang (faqat 🟢 faollar boshqariladi):</i>`;

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
}

// 1. Asosiy tugma bosilganda 1-sahifani ochish
bot.hears("📂 Mening e'lonlarim", async (ctx) => {
  if (!(await isSubscribed(ctx))) return askForSub(ctx);
  await sendMyAdsPage(ctx, 1);
});

// 2. Sahifalarni o'tkazish logikasi
bot.callbackQuery(/^myads_page:(\d+)/, async (ctx) => {
  const page = parseInt(ctx.match[1]) || 1;
  await ctx.answerCallbackQuery().catch(()=>{});
  await sendMyAdsPage(ctx, page);
});

// 3. Bitta e'lonni tanlaganda uning menyusini chiqarish
bot.callbackQuery(/^manage_ad:(\d+)/, async (ctx) => {
  const adId = ctx.match[1];
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ? AND userId = ? AND status = 'active'", [adId, ctx.from.id]);
  const ad = rows[0];
  
  if (!ad) return ctx.answerCallbackQuery("❌ Bu e'lon faol emas yoki yopilgan.", { show_alert: true });

  const [[u]] = await db.execute("SELECT free_ups FROM users WHERE id = ?", [ctx.from.id]);
  const freeUps = u ? u.free_ups : 0;

  const kb = new InlineKeyboard()
    .text("💰 Sotildi", `sold_req:${ad.id}`)
    .text("📉 Narxni tushirish", `edit_price:${ad.id}`).row()
    .text("✏️ To'liq tahrirlash", `full_edit_req:${ad.id}`).row()
    .text("🚀 E'lonni ko'tarish (VIP, TOP, Shoshilinch...)", `promo_menu:${ad.id}`).row();

  if (freeUps > 0) {
    kb.text(`🚀 BEPUL UP (${freeUps} ta bor)`, `free_up_req:${ad.id}`).row();
  }
  kb.text("🔙 Ro'yxatga qaytish", "myads_page:1"); // Ro'yxatga oson qaytish uchun

  const votes = await getAdVotes(ad.id, ad.channelMsgId);
  const votesLine = votes ? `\n📊 <b>Kanaldagi baho:</b> 🔥 ${votes.fire} arzon · 👍 ${votes.ok} normal · 🤔 ${votes.think} qimmat` : "";
  const vipLine = PROMO_KINDS.filter((k) => tsActive(ad[PROMOS[k].col])).map((k) => `\n${PROMOS[k].title}: ${fmtTash(ad[PROMOS[k].col])} gacha`).join("");
  const text = `🆔 <b>ID: ${ad.id}</b>\n🚗 <b>Moshina: ${ad.carDetails}</b>\n💰 <b>Narxi: ${formatNum(ad.price)}$</b>${vipLine}${votesLine}\n\n👇 <i>Kerakli amalni tanlang:</i>`;
  
  await ctx.answerCallbackQuery().catch(()=>{});
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
});
bot.hears("🔔 Obunalarim", async (ctx) => {
  if (!(await isSubscribed(ctx))) return askForSub(ctx);

  // Foydalanuvchining bazadagi barcha obunalarini qidiramiz
  const [alerts] = await db.execute("SELECT * FROM alerts WHERE userId = ?", [ctx.from.id]);

  if (alerts.length === 0) {
    return ctx.reply("📭 <b>Sizda mashina qidiruvi bo'yicha faol obunalar yo'q.</b>\n\n🔍 <i>Yangi mashina poylash uchun «🔍 Mashina qidirish» bo'limidan foydalaning.</i>", { parse_mode: "HTML", reply_markup: mainMenu });
  }

  await ctx.reply("🔔 <b>Sizning faol obunalaringiz:</b>\n<i>Kutayotgan mashinalaringiz sotuvga chiqsa, bot sizga darhol xabar beradi.</i>", { parse_mode: "HTML" });

  // Har bir obuna uchun alohida xabar va "O'chirish" tugmasini chiqaramiz
  for (const alert of alerts) {
    const kb = new InlineKeyboard().text("❌ Obunani bekor qilish", `del_alert:${alert.id}`);
    
    // Model ID bo'lsa to'liq nomi (marka bilan), bo'lmasa saqlangan so'z bosh harf bilan
    const alertModel = alert.model_id ? catalog.modelById(alert.model_id) : null;
    const carName = alertModel ? `${alertModel.brandName} ${alertModel.name}` : alert.query.charAt(0).toUpperCase() + alert.query.slice(1);
    
    const text = `🚗 <b>Mashina:</b> ${carName}\n💰 <b>Maksimal narx:</b> ${alert.maxPrice}$ gacha`;
    
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
});
bot.hears("🎁 Bepul VIP (UP)", async (ctx) => {
  if (!(await isSubscribed(ctx))) return askForSub(ctx);

  // Havola va statistika — umumiy funksiya (Mini App ham shuni ko'rsatadi)
  const ref = await getReferralInfo(ctx.from.id);
  const user = { referral_count: ref.referralCount, free_ups: ref.freeUps };
  const refLink = ref.refLink;
  const qoldi = ref.left;

  const text = 
    `🎁 <b>BEPUL E'LON KO'TARISH (VIP)</b>\n\n` +
    `Do'stlaringizni botimizga taklif qiling va har 5 ta do'stingiz uchun e'loningizni kanalda tekinga <b>ENG TEPAGA (UP)</b> ko'tarish imkoniyatini qo'lga kiriting!\n\n` +
    `📊 <b>SIZNING STATISTIKANGIZ:</b>\n` +
    `👥 Taklif qilgan do'stlaringiz: <b>${user.referral_count} ta</b>\n` +
    `🚀 Ishlatilmagan VIP bonuslaringiz: <b>${user.free_ups} ta</b>\n` +
    `⏳ Keyingi bonusgacha: <b>${qoldi} ta odam qoldi</b>\n\n` +
    `👇 <b>Sizning shaxsiy taklif havolangiz:</b>\n` +
    `<code>${refLink}</code>\n\n` +
    `<i>Shu havolani do'stlaringizga va gruppalarga tarqating!</i>`;

  const kb = new InlineKeyboard().url("📤 Do'stlarga yuborish", ref.shareUrl);
  
  await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
});
bot.hears("🧮 Mashina narxini aniqlash", async (ctx) => {
  if (!(await isSubscribed(ctx))) return askForSub(ctx);
  await ctx.conversation.enter("evaluateCarConversation");
});
bot.hears("💳 Bo'lib to'lashni hisoblash", async (ctx) => {
  if (!(await isSubscribed(ctx))) return askForSub(ctx);
  await ctx.conversation.enter("creditCalcConversation");
});
bot.hears("🏢 Avtosalon bo'lish", async (ctx) => {
  if (!(await isSubscribed(ctx))) return askForSub(ctx);
  await ctx.conversation.enter("becomeDealerConversation");
});
bot.hears("📢 Salon reklamasi", async (ctx) => {
  if (!(await isSubscribed(ctx))) return askForSub(ctx);
  await ctx.conversation.enter("salonAdConversation");
});
// =========================================================================
// 🏆 150,000 SO'MLIK KONKURS TIZIMI
// =========================================================================

// Foydalanuvchi "Konkurs" tugmasini bosganda
bot.hears("🏆 150.000 so'm Yutib oling!", async (ctx) => {
  if (!(await isSubscribed(ctx))) return askForSub(ctx);

  const [rows] = await db.execute("SELECT contest_score FROM users WHERE id = ?", [ctx.from.id]);
  const user = rows[0];
  if (!user) return;

  const botInfo = await bot.api.getMe();
  const refLink = `https://t.me/${botInfo.username}?start=ref_${ctx.from.id}`;

  const text = 
    `🏆 <b>150,000 SO'MLIK KONKURS!</b>\n\n` +
    `Botimiz orqali o'z shaxsiy havolangizni do'stlaringizga tarqating va eng ko'p odam taklif qilgan g'olibga aylanib, <b>150,000 so'm</b> naqd pul (Uzcard/Humo) yutib oling!\n\n` +
    `📊 <b>SIZNING NATIJANGIZ:</b>\n` +
    `👥 Siz qo'shgan odamlar (Konkurs uchun): <b>${user.contest_score} ta</b>\n\n` +
    `👇 <b>Sizning shaxsiy taklif havolangiz:</b>\n` +
    `<code>${refLink}</code>\n\n` +
    `<i>⚠️ Qoidalar: Soxta (feyk) akkauntlar yoki botlar orqali nakrutka qilish qat'iyan man etiladi. Tekshiruvda feyk obunachilar aniqlansa, ishtirokchi g'oliblikdan chetlatiladi.</i>`;

  const shareMessage = 
    "🚗 O'zbekistondagi eng zo'r va qulay onlayn Avto-Bozor bot!\n\n" +
    "Moshinangizni tekinga soting yoki o'zingiz izlagan moshinani juda oson toping.\n\n" +
    "👇 Hoziroq kirib ko'ring:\n" + 
    refLink;

  const shareText = encodeURIComponent(shareMessage);
  const kb = new InlineKeyboard().url("📤 Do'stlarga yuborish", `https://t.me/share/url?text=${shareText}`);
  
  await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
});

// Admin uchun TOP-10 likni ko'rish
// Admin uchun TOP-10 likni ko'rish
bot.command("top", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const [topUsers] = await db.execute("SELECT id, first_name, username, contest_score FROM users WHERE contest_score > 0 ORDER BY contest_score DESC LIMIT 10");
  
  if (topUsers.length === 0) {
      return ctx.reply("📭 Hali hech kim konkursda ball yig'madi.");
  }

  let text = "🏆 <b>KONKURS LIDERLARI (TOP-10):</b>\n\n";
  topUsers.forEach((u, i) => {
      const name = u.first_name || "Ismsiz";
      const userLink = u.username ? `(@${u.username})` : "";
      
      // Ismi, Username va aniq ID raqami chiqib turadi
      text += `${i + 1}. <a href="tg://user?id=${u.id}">${name}</a> ${userLink} — <b>${u.contest_score} ta</b>\n(ID: <code>${u.id}</code>)\n\n`;
  });
  
  text += `💡 <i>G'olib bilan bog'lanish uchun quyidagi buyruqdan foydalaning:</i>\n/xabar [ID] [Xabar matni]\n\n`;
  text += `<i>Yutuq to'langach, yangi hafta konkursini boshlash uchun: /reset_contest</i>`;

  await ctx.reply(text, { parse_mode: "HTML" });
});

// =========================================================================
// ✉️ ADMIN TOMONIDAN G'OLIBGA XABAR YUBORISH
// =========================================================================
bot.command("xabar", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  
  const match = ctx.message.text.split(" ");
  // Agar ID yoki matn yozishni unutgan bo'lsa
  if (match.length < 3) {
      return ctx.reply("❗️ <b>Qo'llash tartibi:</b>\n/xabar [ID raqam] [Sizning matningiz]\n\n<i>Masalan: /xabar 12345678 Tabriklaymiz, siz yutdingiz! Pulingizni olish uchun menga yozing: @uzdev75</i>", { parse_mode: "HTML" });
  }
  
  const targetId = parseInt(match[1]);
  // Xabar matnini yig'ib olamiz
  const textMsg = match.slice(2).join(" ");
  
  try {
      // G'olibga bot nomidan xabar boradi
      await bot.api.sendMessage(targetId, `🎁 <b>ADMINISTRATORDAN XABAR:</b>\n\n${textMsg}`, { parse_mode: "HTML" });
      await ctx.reply(`✅ <b>Xabar ${targetId} ID egasiga muvaffaqiyatli yuborildi!</b>`, { parse_mode: "HTML" });
  } catch (error) {
      await ctx.reply("❌ <b>Xatolik:</b> Xabar yuborib bo'lmadi. Foydalanuvchi botni bloklagan yoki bunday ID mavjud emas.", { parse_mode: "HTML" });
  }
});

// Admin uchun Konkursni noldan boshlash
bot.command("reset_contest", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await db.execute("UPDATE users SET contest_score = 0");
  await ctx.reply("✅ <b>Barcha konkurs ballari 0 ga tushirildi!</b>\n\nYangi hafta konkursi rasman boshlandi.", { parse_mode: "HTML" });
});
// =========================================================================
// "Тўлиқ таҳрирлаш" тугмаси босилганда
bot.callbackQuery(/^full_edit_req:(\d+)/, async (ctx) => {
  await ctx.answerCallbackQuery("⏳ Ma'lumotlar yuklanmoqda...");
  const adId = ctx.match[1];
  
  // Bazadan e'lonni to'liq olib, sessiyaga saqlaymiz!
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
  if (rows.length > 0) {
    ctx.session.editAdData = rows[0]; 
    await ctx.conversation.enter("createAdConversation");
  } else {
    await ctx.answerCallbackQuery({text: "❌ E'lon topilmadi.", show_alert: true});
  }
});
/**
 * ✅ НАРХНИ ПАСАЙТИРИШ ЖАРАЁНИ
 */
/**
 * ✅ НАРХНИ ПАСАЙТИРИШ ЖАРАЁНИ (ЯНГИЛАНГАН ВА ТЎҒИРЛАНГАН)
 */
async function editPriceConversation(conversation, ctx) {
  const cancelTexts = ["/start", "/cancel", "📝 E'lon berish", "🔍 Mashina qidirish", "📂 Mening e'lonlarim"];
  const cbData = ctx.callbackQuery?.data;
  if (!cbData) return;
  const adId = cbData.split(":")[1]; 

  // Bazaga murojaat external ichida — suhbat qayta o'ynalganda (replay) qayta so'ralmaydi
  const rows = await conversation.external(async () => (await db.execute("SELECT * FROM ads WHERE id = ?", [adId]))[0]);
  const ad = rows[0];

  if (!ad || ad.status !== 'active') {
     return ctx.reply("❌ Bu e'lon faol emas yoki allaqachon yopilgan.");
  }

  await ctx.reply(`📉 <b>${ad.carDetails}</b> uchun yangi narxni kiriting ($):\n<i>(Masalan: 8500)</i>\n\nBekor qilish uchun pastdagi menyudan foydalaning.`, { reply_markup: mainMenu, parse_mode: "HTML" });

  const res = await conversation.waitFor("message:text");
  const text = res.message.text.trim();
  // Menyu tugmasi yoki buyruq bosilsa — narx deb o'qimaymiz, bekor qilamiz
  if (cancelTexts.includes(text) || text.startsWith("/") || !/\d/.test(text)) {
    return ctx.reply("❌ Narx o'zgartirish bekor qilindi. Kerakli bo'limni menyudan qayta tanlang.", { reply_markup: mainMenu });
  }

  let newPrice = text.replace(/\D/g, "");

  const waitMsg = await ctx.reply("⏳ <i>Kanaldagi e'lon yangilanmoqda...</i>", { parse_mode: "HTML" });

  // Kanal, baza, "Qaynoq narx" posti va saqlaganlarga xabar — umumiy funksiyada (Mini App ham shuni chaqiradi)
  const result = await conversation.external(() => changeAdPrice({ adId, userId: ctx.from.id, newPrice }));
  await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
  if (!result.ok) return ctx.reply(result.error, { parse_mode: "HTML", reply_markup: mainMenu });
  await ctx.reply(`✅ <b>Narx muvaffaqiyatli o'zgartirildi!</b>\nKanalda moshinangiz narxi <b>${formatNum(result.newPrice)}$</b> bo'lib o'zgardi.`, { parse_mode: "HTML", reply_markup: mainMenu });
}
// (editPriceConversation va soldConversation yuqorida, tugmalaridan oldin ulangan)
/**
 * ✅ SOTILDI + SOTUV NARXINI SO'RASH JARAYONI
 */
async function soldConversation(conversation, ctx) {
  const cbData = ctx.callbackQuery?.data;
  if (!cbData) return;
  const adId = cbData.split(":")[1];

  // 1) So'rov tugma bosilishi bilan DARHOL adminga ketadi (narxsiz). Avval narx so'ralib, javob kutilardi —
  //    foydalanuvchi javob bermasa yoki boshqa e'londa ham «Sotildi» ni bossa, so'rov umuman yetib bormasdi.
  const first = await conversation.external(async () => {
    const r = await requestSoldToAdmin({ adId, userId: ctx.from.id, firstName: ctx.from.first_name });
    return { ok: r.ok, error: r.error || null, car: r.ad ? r.ad.carDetails : "", duplicate: !!r.duplicate };
  });
  if (!first.ok) return ctx.reply(first.error, { parse_mode: "HTML", reply_markup: mainMenu });

  // 2) Sotuv narxi — ixtiyoriy, keyin so'raymiz
  await ctx.reply(
    `✅ <b>So'rovingiz adminga yuborildi!</b>\n\n` +
    `🚗 <b>${escapeHtml(first.car)}</b> — admin tasdiqlagach kanalda «Sotildi» deb belgilanadi.\n\n` +
    `💰 <b>Qanchaga sotildi?</b> Narxni dollarda yozing, masalan: <b>10500</b>. ` +
    `Bu boshqa sotuvchilarga bozor narxini bilishda yordam beradi. Aytish shart emas.`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("⏭ Aytmayman", "sold_skip_price") }
  );

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await conversation.wait();
    // Narxdan boshqa narsa (tugma, rasm...) — bu suhbatga tegishli emas, odatdagi handlerlarga o'tkazamiz
    if (!res.message || !res.message.text) await conversation.skip({ next: true });
    const text = res.message.text.trim();
    const num = /\d/.test(text) ? parseInt(text.replace(/\D/g, ""), 10) : NaN;
    if (num >= AD_MIN_PRICE && num <= AD_MAX_PRICE) {
      const saved = await conversation.external(async () => {
        const r = await saveSoldPrice({ adId, userId: ctx.from.id, soldPrice: String(num) });
        return { ok: r.ok, error: r.error || null };
      });
      if (!saved.ok) return ctx.reply(saved.error, { parse_mode: "HTML", reply_markup: mainMenu });
      return ctx.reply(`🤝 Rahmat! Sotuv narxi saqlandi: <b>${formatNum(num)}$</b>`, { parse_mode: "HTML", reply_markup: mainMenu });
    }
    if (attempt === 0) {
      await ctx.reply(
        `⚠️ Narxni dollarda raqam bilan yozing (${formatNum(AD_MIN_PRICE)} dan ${formatNum(AD_MAX_PRICE)} gacha), masalan: <b>10500</b>.\n` +
        `<i>So'rovingiz adminga allaqachon yuborilgan — narx aytish shart emas.</i>`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("⏭ Aytmayman", "sold_skip_price") }
      );
    }
  }
}
// "Нархни тушириш" тугмаси босилганда ишлайдиган код
bot.callbackQuery(/^edit_price:(\d+)/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("editPriceConversation");
});

bot.callbackQuery(/^free_up_req:(\d+)/, async (ctx) => {
  await ctx.answerCallbackQuery("⏳ E'lon kanalga qayta ko'tarilmoqda...").catch(() => {});
  // Umumiy funksiya (Mini App ham shuni chaqiradi)
  const result = await useFreeUp({ adId: parseInt(ctx.match[1]), userId: ctx.from.id });
  if (!result.ok) return ctx.reply(result.error, { parse_mode: "HTML" });
  await ctx.deleteMessage().catch(() => {});
  await ctx.reply(`✅ <b>E'loningiz muvaffaqiyatli ko'tarildi!</b>\n\nMoshinangiz kanalda eng so'nggi xabarlar qatoriga chiqdi.`, { parse_mode: "HTML" });
});
/**
 * ✅ АҚЛЛИ ХАБАРНОМАГА ОБУНА БЎЛИШ
 */
bot.callbackQuery(/^al_sub:(.+):(\d+)$/, async (ctx) => {
  const query = ctx.match[1];
  const maxPrice = parseInt(ctx.match[2]);
  
  try {
    await db.execute("INSERT INTO alerts (userId, query, maxPrice) VALUES (?, ?, ?)", [ctx.from.id, query, maxPrice]);
    await ctx.editMessageText(`✅ <b>Qidiruvga obuna bo'ldingiz!</b>\n\nEndi botga <b>${maxPrice}$</b> gacha bo'lgan <b>${query}</b> qo'shilsa va admin tasdiqlasa, sizga avtomatik tarzda xabar beraman.`, { parse_mode: "HTML" });
  } catch(e) {
    await ctx.answerCallbackQuery({ text: "Xatolik yuz berdi.", show_alert: true });
  }
});
// Yangi format: als:<modelId>:<maxPrice>:<nomi> — obuna model ID bilan saqlanadi.
// Umumiy funksiya: oddiy tugma handleri ham, qidiruv suhbati ham shuni chaqiradi.
async function createAlertFromButton(userId, data) {
  const m = String(data || "").match(/^als:(\d+):(\d+):(.*)$/s);
  if (!m) return { ok: false, error: "Xatolik yuz berdi." };
  const modelId = Number(m[1]) || null;
  const maxPrice = parseInt(m[2]);
  const model = modelId ? catalog.modelById(modelId) : null;
  const query = model ? model.name.toLowerCase() : m[3];
  const title = model ? `${model.brandName} ${model.name}` : query;
  try {
    await db.execute("INSERT INTO alerts (userId, query, maxPrice, model_id) VALUES (?, ?, ?, ?)", [userId, query, maxPrice, modelId]);
    const priceText = maxPrice >= 999999 ? "" : `<b>${formatNum(maxPrice)}$</b> gacha bo'lgan `;
    return { ok: true, text: `✅ <b>Qidiruvga obuna bo'ldingiz!</b>\n\nEndi botga ${priceText}<b>${sanitizeText(title, 80)}</b> qo'shilsa va admin tasdiqlasa, sizga avtomatik tarzda xabar beraman.` };
  } catch (e) {
    console.error("Obuna yaratishda xato:", e.message);
    return { ok: false, error: "Xatolik yuz berdi." };
  }
}
bot.callbackQuery(/^als:(\d+):(\d+):(.*)$/s, async (ctx) => {
  const r = await createAlertFromButton(ctx.from.id, ctx.match[0]);
  if (r.ok) {
    await ctx.answerCallbackQuery({ text: "🔔 Obuna bo'ldingiz!" }).catch(() => {});
    await ctx.editMessageText(r.text, { parse_mode: "HTML" }).catch(() => {});
  } else {
    await ctx.answerCallbackQuery({ text: r.error, show_alert: true }).catch(() => {});
  }
});
bot.callbackQuery(/^approve_edit:(\d+)/, async (ctx) => {
  const editId = ctx.match[1];
  const [editRows] = await db.execute("SELECT * FROM ad_edits WHERE editId = ?", [editId]);
  const editData = editRows[0];

  if (!editData) return ctx.answerCallbackQuery("Bu so'rov allaqachon ko'rib chiqilgan yoki o'chirilgan.", {show_alert:true});

  const [adRows] = await db.execute("SELECT * FROM ads WHERE id = ?", [editData.oldAdId]);
  const oldAd = adRows[0];

  if (!oldAd || oldAd.status !== 'active') {
      await db.execute("DELETE FROM ad_edits WHERE editId = ?", [editId]);
      return ctx.answerCallbackQuery("Xato: Asl e'lon kanalda faol emas.", {show_alert:true});
  }

  const photos = editData.photoId.split(",");
  const photoUrls = await Promise.all(
    photos.map(async (id) => {
      const file = await bot.api.getFile(id);
      return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    })
  );
  const collagePath = await createCollage(photoUrls);

  let newCaption = vipHeader(oldAd) +
    `🆔 ID: ${oldAd.id}\n🚗 Moshina: ${editData.carDetails}\n📅 Yili: ${editData.year}\n👣 Probeg: ${kmText(editData.probeg)}\n` +
    `💎 Kraskasi: ${editData.paint}\n🎨 Rangi: ${editData.color}\n✅ Karobka: ${editData.transmission}\n` +
    `⛽ Yoqilg'i: ${editData.fuel}\n`;

  if (editData.history && editData.history !== "Кўрсатилмаган" && editData.history !== "Ko'rsatilmagan") {
    newCaption += `🛠 Tarixi: ${editData.history}\n`;
  }
  if (editData.barter && editData.barter !== "Йўқ" && editData.barter !== "Yo'q") {
    newCaption += `🔄 Barter: ${editData.barter}\n`;
  }
    if (editData.nasiya && editData.nasiya !== "Yo'q") {
    newCaption += `💳 Nasiya (bo'lib to'lash): ${editData.nasiya}\n`;
  }
  newCaption += `💰 Narxi: ${editData.price}$\n☎️ +${editData.phone}\n🚩 #${editData.region.replace(/\s+/g, "_")}\n\n` +
    `⚠️ Moshina savdosiga admin javobgar emas, oldindan to'lov qilmang. Ogohlik davr talabi ❗\n\n👉 ${inviteLink()}`;
  newCaption = addPriceVoteLine(newCaption); // 👇 Narxga baho bering: 🔥 · 👍 · 🤔

  const channelMarkup = AD_CHANNEL_MARKUP(oldAd.id, oldAd.channelMsgId); // ilova va ulashish tugmalari ham shu yerda
    // .url("📢 KANALIMIZ", "https://t.me/engarzonidamoshina");

  try {
    // 1. Asosiy kanaldagi rasm va matnni yangilash
    await bot.api.editMessageMedia(CHANNEL_ID, oldAd.channelMsgId, {
        type: "photo",
        media: new InputFile(collagePath),
        caption: newCaption,
        parse_mode: "HTML"
    }, { reply_markup: channelMarkup });
    
    if (editData.videoId) {
      try {
        await bot.api.sendVideo(CHANNEL_ID, editData.videoId, { reply_to_message_id: oldAd.channelMsgId });
      } catch (vidErr) {
        console.error("Yangi videoni kanalga yuborishda xatolik:", vidErr);
      }
    }

    // ================= YANGI: 2-KANALDAGI E'LONNI HAM YANGILASH =================
    try {
        const SECOND_CHANNEL_ID = process.env.SECOND_CHANNEL_ID;
        if (SECOND_CHANNEL_ID && oldAd.secondChannelMsgId) {
            // Rasmni va matnni yangilash
            await bot.api.editMessageMedia(SECOND_CHANNEL_ID, oldAd.secondChannelMsgId, {
                type: "photo",
                media: new InputFile(collagePath),
                caption: newCaption,
                parse_mode: "HTML"
            }, { reply_markup: AD_CHANNEL_MARKUP(oldAd.id) });

            // Video bo'lsa uni ham 2-kanalga yuborish
            if (editData.videoId) {
                await bot.api.sendVideo(SECOND_CHANNEL_ID, editData.videoId, { reply_to_message_id: oldAd.secondChannelMsgId });
            }
        }
    } catch (err) {
        console.error("2-kanaldagi xabarni yangilashda xato (Tahrirlash):", err);
    }
    // ============================================================================

    await db.execute(
        `UPDATE ads SET carDetails=?, brand_id=?, model_id=?, year=?, probeg=?, paint=?, color=?, transmission=?, fuel=?, price=?, phone=?, region=?, photoId=?, history=?, barter=?, nasiya=?, dealer_offer=?, videoId=? WHERE id=?`,
        [editData.carDetails, editData.brand_id || null, editData.model_id || null, editData.year, editData.probeg, editData.paint, editData.color, editData.transmission, editData.fuel, editData.price, editData.phone, editData.region, editData.photoId, editData.history || "Ko'rsatilmagan", editData.barter || "Yo'q", editData.nasiya || "Yo'q", editData.dealer_offer || null, editData.videoId || null, oldAd.id]
    );

    await db.execute("DELETE FROM ad_edits WHERE editId = ?", [editId]);
    if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);

    await ctx.editMessageCaption({ caption: "✅ <b>Kanaldagi e'lon muvaffaqiyatli yangilandi!</b>", parse_mode: "HTML", reply_markup: new InlineKeyboard().text("➡️ Keyingisini ko'rish", "admin_pending") });
    await bot.api.sendMessage(editData.userId, `🎉 <b>Tabriklaymiz!</b>\n\nSizning e'loningiz kanalda muvaffaqiyatli yangilandi.`, { parse_mode: "HTML", reply_markup: mainMenu });

  } catch (error) {
    console.error("Kanalda xabarni yangilashda xatolik:", error);
    await ctx.reply("❌ Kanaldagi e'lonni yangilab bo'lmadi. Xabar o'chirilgan bo'lishi mumkin.");
  }
});

// bot.callbackQuery(/^reject_edit:(\d+)/, async (ctx) => {
//   const editId = ctx.match[1];
//   const [editRows] = await db.execute("SELECT * FROM ad_edits WHERE editId = ?", [editId]);
//   const editData = editRows[0];

//   if (editData) {
//     await db.execute("DELETE FROM ad_edits WHERE editId = ?", [editId]);
//     await ctx.editMessageCaption({ caption: "❌ <b>E'lonni yangilash rad etildi.</b>", parse_mode: "HTML", reply_markup: new InlineKeyboard().text("➡️ Keyingisini ko'rish", "admin_pending") });
//     try {
//         await bot.api.sendMessage(editData.userId, `❌ <b>E'lonni yangilash rad etildi.</b>\n\nAdminlar o'zgarishni qoidalarga mos emas deb topdi va kanaldagi eski e'loningiz o'zgarishsiz qoldi.`, { parse_mode: "HTML", reply_markup: mainMenu });
//     } catch (e) {}
//   } else {
//       await ctx.answerCallbackQuery("Bu so'rov allaqachon ko'rib chiqilgan.", {show_alert:true});
//   }
// });

bot.callbackQuery(/^del_alert:(\d+)/, async (ctx) => {
  const alertId = ctx.match[1];
  
  try {
    // Bazadan foydalanuvchining ID si va Obuna ID si orqali o'chiramiz (xavfsizlik uchun)
    const [res] = await db.execute("DELETE FROM alerts WHERE id = ? AND userId = ?", [alertId, ctx.from.id]);
    
    if (res.affectedRows > 0) {
      // O'chirilgach, xabarni o'zgartirib qo'yamiz
      await ctx.editMessageText("❌ <b>Obuna bekor qilindi.</b>\nEndi bu mashina haqida sizga bezovta qilinmaydi.", { parse_mode: "HTML" });
    } else {
      await ctx.answerCallbackQuery({ text: "Bu obuna allaqachon o'chirilgan yoki topilmadi.", show_alert: true });
    }
  } catch (error) {
    console.error("Obunani o'chirishda xatolik:", error);
    await ctx.answerCallbackQuery({ text: "Xatolik yuz berdi. Qaytadan urinib ko'ring.", show_alert: true });
  }
});
// ==============================================================
// 🌟 VIP MONETIZATSIYA (TELEGRAM STARS TO'LOV TIZIMI)
// ==============================================================
// ==============================================================
// 🌟 VIP MONETIZATSIYA (TELEGRAM STARS TO'LOV TIZIMI)
// ==============================================================
// =====================================================================
// ⭐ PULLIK STATUSLAR: 🚨 Shoshilinch · ⬆️ TOP · 🌟 VIP · 💎 Premium
// Narx va muddat — admin panel → «💰 Narxlar va to'lovlar». Sotuvchi kartaga to'lab chek yuboradi,
// admin tasdiqlaydi; muddat tugashidan 1 kun oldin eslatma, tugaganda status o'zi olinadi.
// =====================================================================
function promoOfferText(ad, kind) {
  const P = PROMOS[kind], days = promoDays(kind), price = somFmt(getPrice(kind));
  const own = ad[P.col] && new Date(ad[P.col]).getTime() > Date.now();
  const covered = kind !== "premium" && P.inPremium && isPremiumActive(ad);
  let head = `${P.title}\n\n🚗 <b>${ad.carDetails}</b>\n\n`;
  if (own) head += `✅ Hozir faol: <b>${fmtTash(ad[P.col])}</b> gacha.\nTo'lasangiz, muddat yana <b>${days} kunga</b> uzaytiriladi.\n\n`;
  else if (covered) head += `ℹ️ Bu imkoniyat hozir 💎 Premium ichida bor (${fmtTash(ad.premium_until)} gacha).\n\n`;
  else head += `<b>${days} kun</b> davomida:\n` + P.perks.map((x) => `✅ ${x}`).join("\n") + "\n\n";
  return head +
    `💰 <b>Narxi: ${price}</b> — ${days} kun\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💳 <b>To'lov uchun karta:</b>\n<code>${payCard()}</code>\n👤 ${payCardName()}\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    `📸 <b>To'lovni amalga oshirgach, chek (skrinshot)ni shu yerga rasm qilib yuboring.</b>\nAdmin tekshirib, statusni yoqadi.`;
}
async function showPromoOffer(ctx, adId, kind) {
  await ctx.answerCallbackQuery().catch(() => {});
  if (!promoEnabled(kind)) return ctx.reply(`⏸ ${PROMOS[kind].title} xizmati hozir vaqtincha to'xtatilgan. Boshqa statuslarni «🚀 E'lonni ko'tarish» bo'limidan tanlashingiz mumkin.`);
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ? AND userId = ? AND status = 'active'", [adId, ctx.from.id]);
  const ad = rows[0];
  if (!ad) return ctx.reply("❌ Bu e'lon faol emas yoki sizga tegishli emas.");
  if (ctx.session) { ctx.session.waitingVipScreenshot = adId; ctx.session.waitingPromoKind = kind; }
  await ctx.reply(promoOfferText(ad, kind), { parse_mode: "HTML" });
}
// Barcha statuslar ro'yxati (e'lonni boshqarish → «🚀 Statuslar»)
function promoMenuView(ad) {
  const kinds = PROMO_KINDS.filter((k) => promoEnabled(k) || tsActive(ad[PROMOS[k].col]));
  const lines = kinds.map((k) => {
    const P = PROMOS[k];
    const on = ad[P.col] && new Date(ad[P.col]).getTime() > Date.now();
    return `${P.title} — ${somFmt(getPrice(k))} / ${promoDays(k)} kun` + (on ? `\n   ✅ faol: ${fmtTash(ad[P.col])} gacha` : `\n   <i>${P.perks[0]}</i>`);
  });
  const kb = new InlineKeyboard();
  kinds.filter(promoEnabled).forEach((k) => {
    const on = ad[PROMOS[k].col] && new Date(ad[PROMOS[k].col]).getTime() > Date.now();
    kb.text(`${on ? "🔁 " : ""}${PROMOS[k].short} — ${somFmt(getPrice(k))}`, `buy_promo:${k}:${ad.id}`).row();
  });
  kb.text("🔙 Orqaga", `manage_ad:${ad.id}`);
  return { text: `🚀 <b>E'LONNI KO'TARISH</b>\n🚗 ${ad.carDetails}\n\n` + lines.join("\n\n") + "\n\n👇 <i>Kerakli statusni tanlang:</i>", kb };
}
bot.callbackQuery(/^promo_menu:(\d+)/, async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ? AND userId = ? AND status = 'active'", [ctx.match[1], ctx.from.id]);
  if (!rows[0]) return ctx.reply("❌ Bu e'lon faol emas yoki sizga tegishli emas.");
  const { text, kb } = promoMenuView(rows[0]);
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb }).catch(() => ctx.reply(text, { parse_mode: "HTML", reply_markup: kb }));
});
bot.callbackQuery(/^buy_vip:(\d+)/, (ctx) => showPromoOffer(ctx, ctx.match[1], "vip")); // eski tugmalar uchun
bot.callbackQuery(/^buy_promo:(urgent|top|vip|premium):(\d+)/, (ctx) => showPromoOffer(ctx, ctx.match[2], ctx.match[1]));

// 📸 STATUS TO'LOV SKRINSHOTINI QABUL QILISH
bot.on("message:photo", async (ctx, next) => {
  if (!ctx.session?.waitingVipScreenshot) return next();
  const adId = ctx.session.waitingVipScreenshot;
  const kind = PROMOS[ctx.session.waitingPromoKind] ? ctx.session.waitingPromoKind : "vip";
  ctx.session.waitingVipScreenshot = null;
  ctx.session.waitingPromoKind = null;
  const photoArr = ctx.message.photo;
  const screenshotId = photoArr[photoArr.length - 1].file_id;
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ? AND userId = ? AND status = 'active'", [adId, ctx.from.id]);
  if (!rows[0]) return ctx.reply("❌ Bu e'lon faol emas yoki topilmadi.", { reply_markup: mainMenu });
  const out = await submitVipRequest({ adId, userId: ctx.from.id, firstName: ctx.from.first_name, username: ctx.from.username, screenshotFileId: screenshotId, kind });
  if (!out.ok) return ctx.reply(out.error, { parse_mode: "HTML", reply_markup: mainMenu });
  await ctx.reply(
    `✅ <b>Chekingiz adminga yuborildi!</b>\n\nTo'lov tekshirilgach, e'loningizga ${PROMOS[kind].title} statusi beriladi. Odatda bu tez amalga oshadi.`,
    { parse_mode: "HTML", reply_markup: mainMenu }
  );
});

// Kanal postini (to'liq matn bilan) qayta yozish — statuslar sarlavhasi ham shu yerda qo'shiladi
async function refreshChannelCaption(ad) {
  if (!ad || !ad.channelMsgId) return;
  const caption = await buildChannelCaption(ad);
  await bot.api.editMessageCaption(CHANNEL_ID, Number(ad.channelMsgId), {
    caption, parse_mode: "HTML", reply_markup: AD_CHANNEL_MARKUP(ad.id, ad.channelMsgId),
  }).catch((e) => console.error("Kanal matnini yangilab bo'lmadi:", e.description || e.message));
}
// E'lonni kanalda yangi post qilib ko'tarish (TOP va VIP uchun). VIP bo'lsa qayta qadaladi.
async function bumpAdInChannel(ad) {
  if (!ad || !ad.channelMsgId) return null;
  let newMsgId;
  try {
    const newMsg = await bot.api.copyMessage(CHANNEL_ID, CHANNEL_ID, Number(ad.channelMsgId), { reply_markup: AD_CHANNEL_MARKUP(ad.id) });
    newMsgId = newMsg.message_id;
  } catch (e) {
    console.error(`E'lonni ko'tarib bo'lmadi (ID ${ad.id}):`, e.description || e.message);
    await db.execute("UPDATE ads SET last_bumped = CURRENT_TIMESTAMP WHERE id = ?", [ad.id]).catch(() => {}); // har 10 daqiqada qayta urinmasin
    return null;
  }
  if (ad.videoId) { try { await bot.api.sendVideo(CHANNEL_ID, ad.videoId, { reply_to_message_id: newMsgId }); } catch (e) {} }
  await bot.api.deleteMessage(CHANNEL_ID, Number(ad.channelMsgId)).catch(() => {});
  await db.execute("UPDATE ads SET channelMsgId = ?, created_at = CURRENT_TIMESTAMP, last_bumped = CURRENT_TIMESTAMP WHERE id = ?", [newMsgId, ad.id]);
  ad.channelMsgId = newMsgId;
  await addShareButton(ad.id, newMsgId);
  await repinIfVip(ad, newMsgId);
  return newMsgId;
}

// Statusni yoqish / uzaytirish (to'lov tasdiqlanganda va admin o'zi berganda): baza + kanaldagi ko'rinish
async function activatePromo(ad, kind, days) {
  const P = PROMOS[kind];
  const wasVip = isVipActive(ad), wasUrgent = isUrgentActive(ad), wasPremium = isPremiumActive(ad);
  const ownActive = tsActive(ad[P.col]);
  const base = ownActive ? new Date(ad[P.col]).getTime() : Date.now();
  const until = new Date(base + days * 86400000);
  await db.execute(`UPDATE ads SET ${P.col} = ?, ${P.rem} = 0 WHERE id = ?`, [until, ad.id]);
  ad[P.col] = until;
  try {
    if ((kind === "vip" || kind === "premium") && !wasVip) {
      // Yangi VIP/Premium: kanal oxiriga yangi post bo'lib chiqadi, sarlavha qo'yiladi va qadaladi
      await bumpAdInChannel(ad);
      await refreshChannelCaption(ad);
    } else if (kind === "top" || kind === "premium") {
      if (kind === "top" && !wasVip) await bumpAdInChannel(ad);      // TOP: darhol bir marta ko'tariladi
      if (kind === "premium" && !wasPremium) { await bumpAdInChannel(ad); await refreshChannelCaption(ad); }
    } else if (kind === "urgent" && !wasUrgent) {
      await refreshChannelCaption(ad);
    }
    if (isVipActive(ad) && ad.channelMsgId) await bot.api.pinChatMessage(CHANNEL_ID, Number(ad.channelMsgId), { disable_notification: true }).catch(() => {});
  } catch (e) { console.error("Statusni kanalga qo'llashda xato:", e.message); }
  return { until, ownActive };
}
// Statusni muddatidan oldin olib tashlash (admin): qadash yechiladi, sarlavha olinadi
async function removePromo(ad, kind) {
  const P = PROMOS[kind];
  const before = { vip: isVipActive(ad), premium: isPremiumActive(ad), urgent: isUrgentActive(ad) };
  await db.execute(`UPDATE ads SET ${P.col} = NULL, ${P.rem} = 0 WHERE id = ?`, [ad.id]);
  ad[P.col] = null;
  const after = { vip: isVipActive(ad), premium: isPremiumActive(ad), urgent: isUrgentActive(ad) };
  if (!ad.channelMsgId || ad.status !== "active") return;
  if (before.vip && !after.vip) await bot.api.unpinChatMessage(CHANNEL_ID, Number(ad.channelMsgId)).catch(() => {});
  if (before.vip !== after.vip || before.premium !== after.premium || before.urgent !== after.urgent) await refreshChannelCaption(ad);
}
// ✅ Admin status to'lovini tasdiqlaganda
bot.callbackQuery(/^vip_approve:(\d+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const reqId = ctx.match[1];
  const [[req]] = await db.execute("SELECT * FROM vip_requests WHERE id = ?", [reqId]);
  if (!req || req.status !== 'pending') {
    return ctx.answerCallbackQuery({ text: "Bu so'rov allaqachon ko'rib chiqilgan.", show_alert: true });
  }
  const kind = PROMOS[req.kind] ? req.kind : "vip";
  const P = PROMOS[kind];
  const [[ad]] = await db.execute("SELECT * FROM ads WHERE id = ? AND status = 'active'", [req.adId]);
  if (!ad) {
    await db.execute("UPDATE vip_requests SET status = 'rejected' WHERE id = ?", [reqId]);
    return ctx.answerCallbackQuery({ text: "E'lon faol emas.", show_alert: true });
  }
  await ctx.answerCallbackQuery("⏳ Status yoqilmoqda...").catch(() => {});
  const days = promoDays(kind);
  await db.execute("UPDATE vip_requests SET status = 'approved' WHERE id = ?", [reqId]);
  const { until, ownActive } = await activatePromo(ad, kind, days);
  const verb = ownActive ? "uzaytirildi" : "yoqildi";
  await ctx.editMessageCaption({ caption: `✅ <b>${P.title} ${verb}</b>\n🆔 ${ad.id} — ${escapeHtml(ad.carDetails)}\n⏳ ${fmtTash(until)} gacha (${ownActive ? "+" : ""}${days} kun)`, parse_mode: "HTML" }).catch(() => {});
  try {
    await bot.api.sendMessage(req.userId,
      `🎉 <b>To'lovingiz tasdiqlandi!</b>\n\n<b>${ad.carDetails}</b> e'loningizga ${P.title} statusi ${verb}.\n` +
      `${P.done}\n\n⏳ Muddati: <b>${fmtTash(until)}</b> gacha. Tugashidan bir kun oldin eslatamiz.`,
      { parse_mode: "HTML" });
  } catch (e) {}
});

// ❌ Admin status to'lovini rad etganda
bot.callbackQuery(/^vip_reject:(\d+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const reqId = ctx.match[1];
  const [[req]] = await db.execute("SELECT * FROM vip_requests WHERE id = ?", [reqId]);
  if (!req) return ctx.answerCallbackQuery({ text: "So'rov topilmadi.", show_alert: true });
  if (req.status !== "pending") return ctx.answerCallbackQuery({ text: "Bu so'rov allaqachon ko'rib chiqilgan.", show_alert: true });
  const P = PROMOS[req.kind] || PROMOS.vip;
  await db.execute("UPDATE vip_requests SET status = 'rejected' WHERE id = ?", [reqId]);
  await ctx.editMessageCaption({ caption: `❌ <b>${P.title} to'lovi rad etildi.</b>`, parse_mode: "HTML" }).catch(() => {});
  try {
    await bot.api.sendMessage(req.userId,
      `❌ <b>${P.title} uchun to'lovingiz tasdiqlanmadi.</b>\n\nChek noto'g'ri yoki to'lov kelmadi. Savol bo'lsa admin bilan bog'laning: @uzdev75`,
      { parse_mode: "HTML" });
  } catch (e) {}
});
// To'lovni tasdiqlash

// To'lov muvaffaqiyatli bo'lganda ishlovchi mantiq
bot.on("message:successful_payment", async (ctx) => {
    const payload = ctx.message.successful_payment.invoice_payload;
    if (payload.startsWith("vip_")) {
        const adId = payload.split("_")[1];
        const [rows] = await db.execute("SELECT * FROM ads WHERE id = ? AND status = 'active'", [adId]);
        const ad = rows[0];
        
        if (!ad) return ctx.reply("❌ E'lon topilmadi yoki u allaqachon sotilgan.");

        const channelMarkup = new InlineKeyboard()
            .url("📞 SOTUVCHI BILAN BOG'LANISH", `https://t.me/arzonida_bot?start=seller_${adId}`)
            .url("📸 BARCHA RASMLAR", `https://t.me/arzonida_bot?start=photos_${adId}`).row()
            .url("🤖 BEPUL E'LON BERISH", "https://t.me/arzonida_bot");

        let newMsgId;
        try {
            // Eskisini o'chirib yangidan kanalga VIP formatda tashlaymiz
            const newMsg = await bot.api.copyMessage(CHANNEL_ID, CHANNEL_ID, ad.channelMsgId, { reply_markup: channelMarkup });
            newMsgId = newMsg.message_id;
            await bot.api.deleteMessage(CHANNEL_ID, ad.channelMsgId).catch(()=>{});
        } catch(e) { console.error("VIP yuborishda xato:", e); }

        const vipCaption = `🌟 <b>VIP E'LON!</b> 🌟\n\n🆔 ID: ${ad.id}\n🚗 Moshina: ${ad.carDetails}\n💰 Narxi: ${formatNum(ad.price)}$\n☎️ +${ad.phone}\n🚩 #${ad.region.replace(/\s+/g, "_")}\n\n👉 Moshina rasmlari uchun tugmani bosing!`;
        
        if (newMsgId) {
            // Matnni VIP qilib o'zgartirish va PIN qilish
            await bot.api.editMessageCaption(CHANNEL_ID, newMsgId, { caption: vipCaption, parse_mode: "HTML", reply_markup: channelMarkup }).catch(()=>{});
            await bot.api.pinChatMessage(CHANNEL_ID, newMsgId).catch(()=>{});
            await db.execute("UPDATE ads SET channelMsgId = ? WHERE id = ?", [newMsgId, adId]);
        }

        await ctx.reply("🎉 <b>To'lov qabul qilindi!</b>\n\nE'loningiz VIP maqomida kanalga joylandi va tepaga qadab qo'yildi!", { parse_mode: "HTML" });
    }
});

// Muddatni uzaytirish (15 kunlik eslatmada bosiladi)
bot.callbackQuery(/^keep_ad:(\d+)/, async (ctx) => {
    const adId = ctx.match[1];
    // Vaqtni bugungi kunga yangilab qo'yamiz (yana 15 kunga uzayadi)
    await db.execute("UPDATE ads SET created_at = CURRENT_TIMESTAMP WHERE id = ?", [adId]);
    await ctx.editMessageText("✅ <b>E'loningiz muddati yana 15 kunga uzaytirildi!</b> Moshina sotilguncha bazamizda turadi.", { parse_mode: "HTML" });
});
// =====================================================================
// 📊 ҲАФТАЛИК БОЗОР АНАЛИТИКАСИ (ЯКШАНБА КУНЛАРИ УЧУН)
// =====================================================================
async function sendWeeklyAnalytics() {
  try {
    // 1. Bu hafta eng ko'p qo'yilgan moshinani topamiz (Faqat faol va sotilganlar)
    const [topCarRows] = await db.execute(`
      SELECT carDetails, COUNT(*) as count 
      FROM ads 
      WHERE status IN ('active', 'sold') AND created_at >= NOW() - INTERVAL 7 DAY 
      GROUP BY carDetails 
      ORDER BY count DESC 
      LIMIT 1
    `);
    
    // 2. Bu hafta jami nechta yangi e'lon tushdi
    const [[totalAdsRows]] = await db.execute(`
      SELECT COUNT(*) as count 
      FROM ads 
      WHERE status IN ('active', 'sold') AND created_at >= NOW() - INTERVAL 7 DAY
    `);

    let priceTrendText = "";
    if (topCarRows.length > 0) {
        const topCar = topCarRows[0].carDetails;
        
        // Bu haftagi o'rtacha narx
        const [[thisWeek]] = await db.execute(`
            SELECT AVG(CAST(price AS UNSIGNED)) as avgPrice 
            FROM ads 
            WHERE carDetails = ? AND status IN ('active', 'sold') AND created_at >= NOW() - INTERVAL 7 DAY
        `, [topCar]);
        
        // O'tgan haftagi o'rtacha narx
        const [[lastWeek]] = await db.execute(`
            SELECT AVG(CAST(price AS UNSIGNED)) as avgPrice 
            FROM ads 
            WHERE carDetails = ? AND status IN ('active', 'sold') AND created_at >= NOW() - INTERVAL 14 DAY AND created_at < NOW() - INTERVAL 7 DAY
        `, [topCar]);


        const currAvg = Math.round(thisWeek.avgPrice || 0);
        const lastAvg = Math.round(lastWeek.avgPrice || 0);

        if (currAvg > 0 && lastAvg > 0) {
            const diff = currAvg - lastAvg;
            const percent = Math.round(Math.abs(diff) / lastAvg * 100);
            
            if (diff > 0) {
                priceTrendText = `📈 <b>${topCar}</b> o'rtacha bozor narxi o'tgan haftaga nisbatan <b>${percent}% ga oshdi.</b>`;
            } else if (diff < 0) {
                priceTrendText = `📉 <b>${topCar}</b> o'rtacha bozor narxi o'tgan haftaga nisbatan <b>${percent}% ga tushdi.</b>`;
            } else {
                priceTrendText = `⚖️ <b>${topCar}</b> o'rtacha bozor narxi barqaror qoldi (${currAvg}$).`;
            }
        } else if (currAvg > 0) {
             priceTrendText = `💰 <b>${topCar}</b> ning bu haftagi o'rtacha bozor narxi: <b>${currAvg}$</b>`;
        }
    }

    const topCarName = topCarRows.length > 0 ? topCarRows[0].carDetails : "Hali ma'lumot yo'q";
    const topCarCount = topCarRows.length > 0 ? topCarRows[0].count : 0;
    const totalAds = totalAdsRows ? totalAdsRows.count : 0;

    // Agar bu hafta hech qanday e'lon tushmagan bo'lsa, xabar yubormaydi
    if (totalAds === 0) return; 

    const text = 
      `📊 <b>HAFTALIK AVTO-BOZOR ANALITIKASI</b>\n\n` +
      `<i>O'tgan 7 kun ichida bozorimizdagi holat:</i>\n\n` +
      `📦 <b>Yangi e'lonlar soni:</b> ${totalAds} ta\n` +
      `🏆 <b>Eng ko'p sotuvga qo'yilgan moshina:</b> ${topCarName} (${topCarCount} ta)\n\n` +
      `${priceTrendText}\n\n` +
      `👉 O'zingizga mos moshinani izlash yoki tekin e'lon berish uchun botimizga kiring: @arzonida_bot`;

    const kb = new InlineKeyboard()
      .url("🔍 Mashina qidirish", "https://t.me/arzonida_bot")
      .url("📢 Kanalga qo'shilish", "https://t.me/engarzonidamoshina");

    // Kanalga avtomatik yuborish
    await bot.api.sendMessage(CHANNEL_ID, text, { parse_mode: "HTML", reply_markup: kb });

  } catch (err) {
      console.error("Haftalik analitika xatosi:", err);
  }
}
// =====================================================================
// 🔎 HAFTALIK "ENG KO'P QIDIRILGAN 5 TA MOSHINA" REYTINGI
// =====================================================================
async function sendTopSearched() {
  try {
    const [rows] = await db.execute(`
      SELECT query, COUNT(*) as cnt
      FROM search_logs
      WHERE created_at >= NOW() - INTERVAL 7 DAY
      GROUP BY query
      ORDER BY cnt DESC
      LIMIT 5
    `);

    // Yetarli ma'lumot bo'lmasa, post yubormaymiz
    if (rows.length === 0) {
      console.log("📭 Qidiruv statistikasi hali yetarli emas.");
      return;
    }

    const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
    let text = `🔎 <b>BU HAFTA ENG KO'P IZLANGAN MOSHINALAR</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━\n\n`;
    text += `<i>Xaridorlar shu hafta botimizda eng ko'p mana bularni qidirishdi:</i>\n\n`;

    rows.forEach((r, i) => {
      const name = r.query.charAt(0).toUpperCase() + r.query.slice(1);
      text += `${medals[i]} <b>${name}</b> — <code>${r.cnt} marta</code>\n`;
    });

    text += `\n💡 <i>Sotuvchilar uchun: agar sizda shu ro'yxatdagi moshina bo'lsa — hoziroq e'lon bering, xaridorlar tayyor turibdi!</i>`;

    const kb = new InlineKeyboard()
      .url("➕ Tekin e'lon berish", "https://t.me/arzonida_bot").row()
      .url("🔍 Mashina qidirish", "https://t.me/arzonida_bot");

    await bot.api.sendMessage(CHANNEL_ID, text, { parse_mode: "HTML", reply_markup: kb });
    console.log("✅ Eng ko'p qidirilganlar reytingi yuborildi!");
  } catch (err) {
    console.error("Qidiruv reytingi xatosi:", err);
  }
}
// =====================================================================
// 🏆 HAR KUNLIK "TOP-3" AVTO-POST TIZIMI
// =====================================================================
async function sendDailyTop3() { 
  try {
    const [allAds] = await db.execute(`
      SELECT id, carDetails, price, channelMsgId
      FROM ads
      WHERE status = 'active' 
        AND created_at >= NOW() - INTERVAL 24 HOUR
        AND CAST(price AS UNSIGNED) >= 100
      ORDER BY CAST(price AS UNSIGNED) ASC
    `);

    if (allAds.length === 0) {
        console.log("📭 Tizim: Oxirgi 24 soat ichida mos e'lonlar topilmadi.");
        return; 
    }

    const dateOptions = { day: 'numeric', month: 'long', timeZone: 'Asia/Tashkent' };
    const todayStr = new Intl.DateTimeFormat('uz-UZ', dateOptions).format(new Date());

    const top5Ads = allAds.slice(0, 3);
    const otherAds = allAds.slice(3);
    const channelUsername = process.env.CHANNEL_ID.replace("@", "");

    // 🌟 Sarlavha qismi (Zamonaviy ajratgich bilan)
    let text = `🗓 <b>${todayStr.toUpperCase()} | KUNLIK AVTO-BOZOR</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━\n\n`;
    
    text += `🏆 <b>ENG ARZON 3 TA TAKLIF:</b>\n\n`;
    
    // 🥇 Top-5 lik (Narxlar code formatida, ya'ni kulrang fonda chiqadi)
    const topEmojis = ["🥇", "🥈", "🥉"];
    top5Ads.forEach((ad, index) => {
      const postLink = `https://t.me/${channelUsername}/${ad.channelMsgId}`;
      text += `${topEmojis[index]} <b><a href="${postLink}">${ad.carDetails.toUpperCase()}</a></b>\n`;
      text += `💸 <b>Narxi:</b> <code> ${formatNum(ad.price)} $ </code>\n\n`;
    });

    // 📋 Qolgan e'lonlar qismi (Kompakt va chiroyli ro'yxat)
    if (otherAds.length > 0) {
        text += `➖➖➖➖➖➖➖➖➖➖\n\n`;
        text += `📋 <b>BOSHQA YANGI E'LONLAR:</b>\n\n`;
        otherAds.forEach((ad) => {
            const postLink = `https://t.me/${channelUsername}/${ad.channelMsgId}`;
            // Nuqtali ajratgich va code formatidagi narx
            text += `🚘 <b><a href="${postLink}">${ad.carDetails}</a></b>  •  <code>${formatNum(ad.price)} $</code>\n`;
        });
        text += `\n`;
    }

    text += `━━━━━━━━━━━━━━━━━━\n`;
    text += `👆 <i>Mashina rasmlari va batafsil ma'lumotni ko'rish uchun ko'k yozuv ustiga bosing.</i>`;

    // 🚀 PREMIUM TUGMALAR
    const proKeyboard = new InlineKeyboard()
      .url("🔍 Mashina izlash", "https://t.me/arzonida_bot").row()
      .url("➕ Tekin e'lon berish", "https://t.me/arzonida_bot");

    // Asosiy kanalga yuborish
    await bot.api.sendMessage(CHANNEL_ID, text, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: proKeyboard
    });
    
    console.log("✅ Tizim: Premium dayjest post muvaffaqiyatli yuborildi!");
  } catch (err) {
    console.error("Kunlik post yuborishda xatolik:", err);
  }
}
// =====================================================================
// 📣 AVTOMATIK "E'LON BERING" CHAQIRIQ POSTI (Sotuvchilarni jalb qilish)
// =====================================================================
async function sendSellCallPost() {
  try {
    // Bir necha xil matn — bot har safar tasodifiy bittasini tanlaydi
    const messages = [
      `🚗 <b>Moshinangizni sotmoqchimisiz?</b>\n\n` +
      `Bizning bot orqali <b>3 daqiqada</b> bepul e'lon bering va to'g'ridan-to'g'ri xaridor toping!\n\n` +
      `✅ Maklersiz\n✅ Komissiyasiz\n✅ Mutlaqo BEPUL\n\n` +
      `Minglab xaridor sizning moshinangizni kutmoqda 👇`,

      `💰 <b>Eski moshinangiz turibdimi?</b>\n\n` +
      `Uni bu yerda soting! Rasmini yuboring, bot o'zi chiroyli e'lon yasab, kanalga joylaydi.\n\n` +
      `🔥 Xaridorlar har kuni shu yerdan moshina qidirmoqda. Navbatingizni o'tkazib yubormang! 👇`,

      `📢 <b>SOTUVCHILAR UCHUN!</b>\n\n` +
      `Moshinangizni tez va bepul sotishning eng oson yo'li — bizning botimiz.\n\n` +
      `Bir necha bosishda e'loningiz tayyor. Vositachilarga ortiqcha pul to'lamang!\n\n` +
      `👇 Hoziroq sinab ko'ring:`,

      `🚘 <b>Moshina almashtirmoqchimisiz?</b>\n\n` +
      `Avval eskisini soting! Bu yerda e'lon berish <b>bepul</b>, tez va oson.\n\n` +
      `Sizga faqat rasm va narxni yuborish kifoya — qolganini bot bajaradi 👇`
    ];

    // Tasodifiy bitta matnni tanlaymiz
    const text = messages[Math.floor(Math.random() * messages.length)];

    // Ilova yoqilgan bo'lsa — tugmalar ilovaning o'sha bo'limini to'g'ridan-to'g'ri ochadi
    const kb = APP_IN_CHANNEL
      ? new InlineKeyboard()
          .url("➕ BEPUL E'LON BERISH (ilovada)", miniAppLink("new")).row()
          .url("🧮 Moshinamni baholash", miniAppLink("evaluate")).row()
          .url("🤖 Bot orqali", "https://t.me/arzonida_bot")
      : new InlineKeyboard()
          .url("➕ BEPUL E'LON BERISH", "https://t.me/arzonida_bot").row()
          .url("🧮 Moshinamni baholash", "https://t.me/arzonida_bot");

    await bot.api.sendMessage(CHANNEL_ID, text, { parse_mode: "HTML", reply_markup: kb });
    console.log("✅ 'E'lon bering' chaqiriq posti yuborildi!");
  } catch (err) {
    console.error("Chaqiriq posti xatosi:", err);
  }
}
// =====================================================================
// 🛠 ADMIN UCHUN MAXSUS TEST BUYRUG'I
// =====================================================================
bot.command("test_top3", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  
  await ctx.reply("⏳ <i>TOP-3 post tayyorlanmoqda va kanalga yuborilmoqda...</i>", { parse_mode: "HTML" });
  await sendDailyTop3();
  await ctx.reply("✅ <b>TOP-3 test muvaffaqiyatli yakunlandi! Kanalni tekshiring.</b>", { parse_mode: "HTML" });
});
bot.command("test_topsearch", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.reply("⏳ <i>Qidiruv reytingi tayyorlanmoqda...</i>", { parse_mode: "HTML" });
  await sendTopSearched();
  await ctx.reply("✅ <b>Tayyor! Kanalni tekshiring.</b>", { parse_mode: "HTML" });
});
bot.command("test_chart", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.reply("⏳ <i>Grafik yasalmoqda...</i>", { parse_mode: "HTML" });
  await sendPriceChartPost();
  await ctx.reply("✅ <b>Tayyor! Kanalni tekshiring.</b>", { parse_mode: "HTML" });
});
bot.command("test_sellcall", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.reply("⏳ <i>Chaqiriq posti yuborilmoqda...</i>", { parse_mode: "HTML" });
  await sendSellCallPost();
  await ctx.reply("✅ <b>Tayyor! Kanalni tekshiring.</b>", { parse_mode: "HTML" });
});
bot.command("test_newbump", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.reply("⏳ <i>1-3 kunlik yangi e'lon ko'tarish taklifi yuborilmoqda...</i>", { parse_mode: "HTML" });
  await runAutomations();
  await ctx.reply("✅ <b>Tayyor!</b>\n\n<i>Agar hech kimga bormasa, demak 1-3 kunlik yangi e'lon yo'q (admin e'lonlari hisobga olinmaydi), yoki bugun allaqachon so'ralgan.</i>", { parse_mode: "HTML" });
});
// ==============================================================
// 🤖 AVTO-TOZALASH VA AQLLI MASLAHATCHI TIZIMI (ADMIN ishtirok etmaydi)
// ==============================================================

// ==============================================================
async function runAutomations() {
  try {
      // ================= 0. YANGI E'LONNI KO'TARISH (1-3 KUN) =================
      // Yangi foydalanuvchilarning e'loni admin e'lonlari orasida pastda qolib
      // ketmasligi uchun birinchi 3 kun har kuni "ko'tarasizmi?" deb so'raymiz
      // (admin paneldagi «⏰ Avto-xabarlar»da o'chirilgan bo'lsa — hech kimga yuborilmaydi)
      const [newAds] = !isAutoOn("remind_new") ? [[]] : await db.execute(
          `SELECT id, userId, carDetails FROM ads 
           WHERE status = 'active' AND userId != ? 
             AND DATEDIFF(CURDATE(), DATE(created_at)) BETWEEN 1 AND 3
             AND (last_bumped IS NULL OR DATE(last_bumped) != CURDATE())`,
          [ADMIN_ID]
      );

      let newBumpText = "";   // Admin uchun hisobot yig'amiz
      let newBumpCount = 0;

      for (let ad of newAds) {
          const text = 
            `🆕 <b>E'loningiz yangi — uni tepaga ko'taraylikmi?</b>\n\n` +
            `🚗 <b>${ad.carDetails}</b>\n\n` +
            `Kanalimizda har kuni ko'plab yangi e'lonlar chiqadi va sizniki pastga tushib qolishi mumkin. ` +
            `E'lonni tepaga ko'tarsangiz, uni <b>ko'proq xaridor ko'radi</b> va tezroq sotiladi!\n\n` +
            `👇 Ko'tarishni istaysizmi?`;
          
          try {
              await bot.api.sendMessage(ad.userId, text, {
                  parse_mode: "HTML",
                  reply_markup: new InlineKeyboard()
                    .text("🚀 Ha, tepaga ko'tarish", `ask_bump:${ad.id}`).row()
                    .text("✅ Allaqachon sotildi", `confirm_sold:${ad.id}`)
              });
              // Muvaffaqiyatli yuborilsa, admin hisobotiga qo'shamiz
              newBumpText += `👤 <a href="tg://user?id=${ad.userId}">Profil</a> | 🚗 ${ad.carDetails} (ID: ${ad.id})\n`;
              newBumpCount++;
          } catch (err) {
              // Bloklagan bo'lsa o'tkazib yuboramiz
          }
          // Bugun so'raganimizni belgilaymiz (qayta so'ramaslik uchun)
          await db.execute("UPDATE ads SET last_bumped = CURRENT_TIMESTAMP WHERE id = ?", [ad.id]).catch(()=>{});
          await delay(200);
      }

      // Adminga hisobot yuboramiz (agar kamida 1 kishiga xabar ketgan bo'lsa)
      if (newBumpCount > 0) {
          const adminReport = `📊 <b>YANGI E'LON KO'TARISH HISOBOTI (1-3 KUNLIK):</b>\n\nBugun jami <b>${newBumpCount} ta</b> yangi foydalanuvchiga e'lonini ko'tarish taklifi yuborildi:\n\n${newBumpText}`;
          await bot.api.sendMessage(ADMIN_ID, adminReport, { parse_mode: "HTML" }).catch(()=>{});
      }
      // ======================================================================

      // 1. AQLLI MASLAHATCHI (5 KUNLIK)
      const [ads5] = !isAutoOn("remind_price5") ? [[]] : await db.execute(
          "SELECT id, userId, carDetails FROM ads WHERE status = 'active' AND userId != ? AND DATEDIFF(CURDATE(), DATE(created_at)) = 5",
          [ADMIN_ID]
      );
      for (let ad of ads5) {
          const text = `💡 <b>Aqlli maslahatchi:</b>\n\n🚗 Sizning <b>${ad.carDetails}</b> mashinangiz e'loniga 5 kun bo'ldi. \n\nKuzatuvlarimizga ko'ra, moshina 5 kunda sotilmasa, uning narxini biroz tushirish va "Qaynoq narx" xabarini jo'natish xaridor topishni 3 barobar tezlashtiradi!\n\n👇 <i>Narxni tushirish uchun pastdagi tugmani bosing:</i>`;
          await bot.api.sendMessage(ad.userId, text, {
              parse_mode: "HTML",
              reply_markup: new InlineKeyboard().text("📉 Narxni tushirish", `edit_price:${ad.id}`)
          }).catch(()=>{});
          await delay(200); // Spam blokiga tushmaslik uchun
      }

      // ================= YANGILANISH =================
      // 2. TEPAGA KO'TARISH TAKLIFI (7 KUNLIK) VA ADMINGA HISOBOT
      const [ads7] = !isAutoOn("remind_up7") ? [[]] : await db.execute(
          "SELECT id, userId, carDetails FROM ads WHERE status = 'active' AND userId != ? AND DATEDIFF(CURDATE(), DATE(created_at)) = 7",
          [ADMIN_ID]
      );
      
      let notifiedUsersText = ""; // Admin uchun hisobot yig'ishga
      let notifiedCount = 0;

      for (let ad of ads7) {
          const text = `⚠️ <b>E'loningiz eski xabarlar qatorida qolib ketdi!</b>\n\n🚗 <b>${ad.carDetails}</b> e'lon qilinganiga 7 kun bo'ldi va u kanalda ancha tepaga chiqib ketib, xaridorlarga ko'rinishi qiyinlashdi.\n\nE'lonni qaytadan kanalning eng oxiriga (tepaga) ko'tarishni istaysizmi?`;
          
          try {
              // Foydalanuvchiga xabar jo'natish
              await bot.api.sendMessage(ad.userId, text, {
                  parse_mode: "HTML",
                  reply_markup: new InlineKeyboard()
                    .text("🚀 Ha, tepaga ko'tarish", `ask_bump:${ad.id}`).row()
                    .text("✅ Allaqachon sotildi", `confirm_sold:${ad.id}`)
              });
              
              // Muvaffaqiyatli jo'natilsa, admin ro'yxatiga qo'shamiz
              notifiedUsersText += `👤 <a href="tg://user?id=${ad.userId}">Foydalanuvchi profili</a> | 🚗 ${ad.carDetails} (ID: ${ad.id})\n`;
              notifiedCount++;
          } catch (err) {
              // Agar uzer botni bloklagan bo'lsa xatolik ushlanadi va dastur to'xtab qolmaydi
          }
          await delay(200);
      }

      // Agar kamida 1 kishiga xabar ketgan bo'lsa, Adminga ro'yxatni yuboramiz
      if (notifiedCount > 0) {
          const adminReport = `📊 <b>AVTO-ESLATMA HISOBOTI (7 KUNLIK):</b>\n\nBugun jami <b>${notifiedCount} ta</b> foydalanuvchiga e'lonini ko'tarish (UP) haqida taklif yuborildi:\n\n${notifiedUsersText}`;
          await bot.api.sendMessage(ADMIN_ID, adminReport, { parse_mode: "HTML" }).catch(()=>{});
      }
      // ===============================================

  } catch(e) { console.error("Avtomatizatsiya xatosi:", e); }
}

// ---------------------------------------------------------
// 🚀 TEPAGA KO'TARISH SO'ROVINI YUBORISH (UZER BOSGANDA)
// ---------------------------------------------------------
bot.callbackQuery(/^ask_bump:(\d+)/, async (ctx) => {
    const adId = ctx.match[1];
    const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
    const ad = rows[0];

    if (!ad || ad.status !== 'active') {
        return ctx.answerCallbackQuery({ text: "Bu e'lon faol emas yoki allaqachon sotilgan.", show_alert: true });
    }

    // Adminga so'rov yuborish
    const adminText = `🚀 <b>UP (Tepaga ko'tarish) SO'ROVI!</b>\n\n🆔 <b>ID: ${adId}</b>\n🚗 <b>Moshina: ${ad.carDetails}</b>\n👤 <b>Uzer:</b> <a href="tg://user?id=${ad.userId}">${ctx.from.first_name}</a>\n\n<i>E'lon kanalda 15 kunlik bo'ldi. Uzer uni qayta ko'tarmoqchi. Ruxsat berasizmi?</i>`;
    
    await bot.api.sendMessage(ADMIN_ID, adminText, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text("✅ Ruxsat berish (UP)", `approve_bump:${adId}`)
          .text("❌ Rad etish", `reject_bump:${adId}`)
    });

    await ctx.editMessageText(`⏳ <b>${ad.carDetails}</b> e'lonini tepaga ko'tarish bo'yicha so'rov adminga yuborildi. \n\nAdmin tasdiqlagach, u kanalda eng yangi e'lonlar qatoriga chiqadi!`, { parse_mode: "HTML" });
});

// ---------------------------------------------------------
// ✅ ADMIN TEPAGA KO'TARISHNI TASDIQLAGANDA
// ---------------------------------------------------------
bot.callbackQuery(/^approve_bump:(\d+)/, async (ctx) => {
    const adId = ctx.match[1];
    const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
    const ad = rows[0];

    if (!ad || ad.status !== 'active') {
        return ctx.editMessageText("❌ Bu e'lon faol emas yoki yopilgan.");
    }

    await ctx.editMessageText(`⏳ <i>E'lon kanalga qayta ko'tarilmoqda...</i>`, { parse_mode: "HTML" });

    try {
        const channelMarkup = AD_CHANNEL_MARKUP(ad.id); // ilova tugmasi ham shu yerda
          // .url("📢 KANALIMIZ", "https://t.me/engarzonidamoshina");

        let newMsgId;
        let newSecMsgId = null;

        // Asosiy kanalga ko'tarish
        const newMsg = await bot.api.copyMessage(CHANNEL_ID, CHANNEL_ID, ad.channelMsgId, { reply_markup: channelMarkup });
        newMsgId = newMsg.message_id;
        if (ad.videoId) {
            try { await bot.api.sendVideo(CHANNEL_ID, ad.videoId, { reply_to_message_id: newMsgId }); } catch(e){}
        }
        await bot.api.deleteMessage(CHANNEL_ID, ad.channelMsgId).catch(() => {});
        await repinIfVip(ad, newMsgId);

        // 2-kanalga ko'tarish (agar u ulangan bo'lsa)
        const SECOND_CHANNEL_ID = process.env.SECOND_CHANNEL_ID;
        if (SECOND_CHANNEL_ID && ad.secondChannelMsgId) {
            try {
                const secMsg = await bot.api.copyMessage(SECOND_CHANNEL_ID, SECOND_CHANNEL_ID, ad.secondChannelMsgId, { reply_markup: channelMarkup });
                newSecMsgId = secMsg.message_id;
                if (ad.videoId) {
                    try { await bot.api.sendVideo(SECOND_CHANNEL_ID, ad.videoId, { reply_to_message_id: newSecMsgId }); } catch(e){}
                }
                await bot.api.deleteMessage(SECOND_CHANNEL_ID, ad.secondChannelMsgId).catch(() => {});
            } catch(e) {}
        }

        // BAZANI YANGILASH: Yaratilgan vaqtini (created_at) yangilaymiz, shunda 15 kundan keyin yana ko'tarish taklifi boradi.
        let updateQuery = "UPDATE ads SET channelMsgId = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?";
        let updateParams = [newMsgId, adId];
        if (newSecMsgId) {
            updateQuery = "UPDATE ads SET channelMsgId = ?, secondChannelMsgId = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?";
            updateParams = [newMsgId, newSecMsgId, adId];
        }
        await db.execute(updateQuery, updateParams);
        await addShareButton(ad.id, newMsgId);

        await ctx.editMessageText(`✅ <b>${ad.carDetails}</b> (ID: ${ad.id}) kanalda muvaffaqiyatli UP qilindi!`, { parse_mode: "HTML" });
        
        // Mijozni xursand qilish
        await bot.api.sendMessage(ad.userId, `🚀 <b>Tabriklaymiz!</b>\n\nSizning <b>${ad.carDetails}</b> e'loningiz adminga ma'qullandi va kanalda eng yangi xabarlar qatoriga ko'tarildi! Moshina tezroq sotilishiga tilakdoshmiz.`, { parse_mode: "HTML" }).catch(()=>{});

    } catch (err) {
        console.error("Bump xatosi:", err);
        await ctx.editMessageText("❌ Xatolik yuz berdi. Kanaldagi eski e'lon o'chirib yuborilgan bo'lishi mumkin.");
    }
});

// ---------------------------------------------------------
// ❌ ADMIN TEPAGA KO'TARISHNI RAD ETGANDA
// ---------------------------------------------------------
bot.callbackQuery(/^reject_bump:(\d+)/, async (ctx) => {
    const adId = ctx.match[1];
    const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
    const ad = rows[0];

    await ctx.editMessageText(`❌ UP (Tepaga ko'tarish) so'rovi rad etildi. (ID: ${adId})`);
    
    if (ad) {
        await bot.api.sendMessage(ad.userId, `❌ <b>E'lonni ko'tarish rad etildi.</b>\n\nSizning <b>${ad.carDetails}</b> e'loningizni qayta ko'tarish adminlar tomonidan rad etildi. Hozirda e'loningiz eski o'rnida turibdi.`, { parse_mode: "HTML" }).catch(()=>{});
    }
});
// =====================================================================
// ⏰ UMUMIY TAYMER: HAR 30 MINUTDA VAQTNI TEKSHIRIB TURADI
// =====================================================================
// =====================================================================
// ⏰ UMUMIY TAYMER: HAR 30 MINUTDA VAQTNI TEKSHIRIB TURADI
// =====================================================================
// =====================================================================
// ⏰ UMUMIY TAYMER: HAR 30 MINUTDA VAQTNI TEKSHIRIB TURADI
// =====================================================================
let lastAnalyticsDate = null;
let lastTop3Date = null; // Nomini to'g'rilab qo'ydik
let lastAutoCleanDate = null;
let lastSellCall13 = null;
let lastSellCall19 = null;

// Har bir avto-xabar admin paneldagi «⏰ Avto-xabarlar» sozlamasiga bo'ysunadi (isAutoOn).
// O'chirilgan bo'lsa ham kun belgisi qo'yiladi — keyin yoqilsa, shu soatda kutilmaganda chiqib ketmaydi.
function runScheduledPosts(now = new Date()) {
    // Server qayerda bo'lishidan qat'i nazar, O'zbekiston vaqtini ajratib olamiz
    const uzbDateStr = new Intl.DateTimeFormat('uz-UZ', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const uzbHour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tashkent', hour: 'numeric', hour12: false }).format(now));
    const dayString = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tashkent', weekday: 'long' }).format(now);
    const isSunday = dayString === 'Sunday';

    // 1. HAFTALIK ANALITIKA (Yakshanba kuni roppa-rosa soat 05:xx da)
    if (isSunday && uzbHour === 10) {
        if (lastAnalyticsDate !== uzbDateStr) {
            lastAnalyticsDate = uzbDateStr;
            if (isAutoOn("weekly_analytics")) sendWeeklyAnalytics();
            if (isAutoOn("weekly_topsearch")) sendTopSearched();
            if (isAutoOn("weekly_chart")) sendPriceChartPost();
        }
    }

    // 2. KUNLIK ENG ARZON TOP-3 POST (Har kuni kechqurun roppa-rosa soat 20:xx da)
    if (uzbHour === 20) {
        if (lastTop3Date !== uzbDateStr) {
            lastTop3Date = uzbDateStr; // Nomini to'g'rilab qo'ydik
            if (isAutoOn("top3")) sendDailyTop3();
        }
    }

    // 3. 🤖 AVTOMAT TOZALASH VA MASLAHATCHI (Har kuni soat 12:xx da ishga tushadi)
    //    (har bir eslatma turi runAutomations ichida alohida tekshiriladi)
    if (uzbHour === 12) {
        if (lastAutoCleanDate !== uzbDateStr) {
            lastAutoCleanDate = uzbDateStr;
            runAutomations();
            console.log("✅ Avto-tozalash va maslahatchi xabarlari yuborildi!");
        }
    }
        // 4. 📣 "E'LON BERING" CHAQIRIQ POSTI (Har kuni soat 13:00 da)
    if (uzbHour === 13) {
        if (lastSellCall13 !== uzbDateStr) {
            lastSellCall13 = uzbDateStr;
            if (isAutoOn("sellcall13")) sendSellCallPost();
        }
    }

    // 5. 📣 "E'LON BERING" CHAQIRIQ POSTI (Har kuni soat 19:00 da)
    if (uzbHour === 19) {
        if (lastSellCall19 !== uzbDateStr) {
            lastSellCall19 = uzbDateStr;
            if (isAutoOn("sellcall19")) sendSellCallPost();
        }
    }
}
// 📌 Salon reklamasi 24 soatlik qadash muddati tugasa — yechamiz
async function unpinExpiredSalonAds() {
  try {
    const [rows] = await db.execute("SELECT id, channelMsgId FROM salon_ads WHERE pin_until IS NOT NULL AND pin_until < NOW()");
    for (const r of rows) {
      if (r.channelMsgId) await bot.api.unpinChatMessage(CHANNEL_ID, Number(r.channelMsgId)).catch(() => {});
      await db.execute("UPDATE salon_ads SET pin_until = NULL WHERE id = ?", [r.id]);
    }
  } catch (e) { console.error("Qadashni yechishda xato:", e.message); }
}
setInterval(unpinExpiredSalonAds, 10 * 60 * 1000).unref();

// 📱 Ilovadagi salon reklamasi muddati tugadi — salonga natijani yozamiz (bir marta)
async function finishSalonAppAds() {
  try {
    const [rows] = await db.execute("SELECT * FROM salon_ads WHERE app_until IS NOT NULL AND app_until < NOW() AND app_notified = 0");
    for (const r of rows) {
      await db.execute("UPDATE salon_ads SET app_notified = 1 WHERE id = ?", [r.id]);
      if (r.status !== "active") continue;
      await bot.api.sendMessage(r.userId,
        `📱 <b>Ilovadagi reklamangiz muddati tugadi</b>\n\n🏢 ${escapeHtml(r.salonName || "")}\n` +
        `👀 Reklamani ochishdi: <b>${Number(r.app_opens) || 0}</b> marta\n📞 Qo'ng'iroq tugmasini bosishdi: <b>${Number(r.app_calls) || 0}</b> marta\n\n` +
        `Yana joylash uchun: «📢 Salon reklamasi».`,
        { parse_mode: "HTML" }).catch(() => {});
    }
  } catch (e) { console.error("Salon reklamasi (ilova) muddatini tekshirishda xato:", e.message); }
}
setInterval(finishSalonAppAds, 10 * 60 * 1000).unref();

// ⏳ STATUSLAR MUDDATI: tugashidan 1 kun oldin eslatma; tugaganda kanaldan yechish / sarlavhani olish.
// E'lon sotilsa yoki o'chirilsa — keyingi tekshiruvda (10 daqiqa ichida) hammasi olinadi.
const promoRenewKb = (kind, adId) => new InlineKeyboard().text(`🔁 ${PROMOS[kind].short} ni uzaytirish`, `buy_promo:${kind}:${adId}`);
const tsOf = (v) => (v ? new Date(v).getTime() : 0);
// VIP yoki TOP ni Premium o'z ichiga olgan bo'lsa (Premium undan keyin tugaydi) — alohida xabar yubormaymiz
const coveredByPremium = (ad, kind) => PROMOS[kind].inPremium && tsOf(ad.premium_until) > Math.max(Date.now(), tsOf(ad[PROMOS[kind].col]));
let promoCheckRunning = false;
async function checkVipExpiry() {
  if (promoCheckRunning) return;
  promoCheckRunning = true;
  try {
    // 1) Ertaga tugaydiganlar — eslatma
    for (const kind of PROMO_KINDS) {
      const P = PROMOS[kind];
      const [soon] = await db.execute(
        `SELECT * FROM ads WHERE status = 'active' AND ${P.col} IS NOT NULL AND ${P.rem} = 0 AND ${P.col} > NOW() AND ${P.col} <= NOW() + INTERVAL 1 DAY`
      );
      for (const ad of soon) {
        await db.execute(`UPDATE ads SET ${P.rem} = 1 WHERE id = ?`, [ad.id]);
        if (coveredByPremium(ad, kind) || !promoEnabled(kind)) continue;
        await bot.api.sendMessage(ad.userId,
          `⏳ <b>${P.title} muddati tugayapti</b>\n\n<b>${ad.carDetails}</b> e'loningizda bu status <b>${fmtTash(ad[P.col])}</b> da tugaydi: ${P.endsText}.\n\n` +
          `Uzaytirsangiz — yana ${promoDays(kind)} kun (${somFmt(getPrice(kind))}).`,
          { parse_mode: "HTML", reply_markup: promoRenewKb(kind, ad.id) }).catch(() => {});
      }
    }
    // 2) Muddati tugagan yoki e'lon endi faol emas — statusni olamiz
    const cond = PROMO_KINDS.map((k) => `(${PROMOS[k].col} IS NOT NULL AND (${PROMOS[k].col} <= NOW() OR status <> 'active'))`).join(" OR ");
    const [ended] = await db.execute(`SELECT * FROM ads WHERE ${cond}`);
    for (const row of ended) {
      const ad = Object.assign({}, row);
      const now = Date.now();
      // Bazada hali turgan har qanday status — kanalda hozir ko'rinib turibdi deb hisoblaymiz
      const before = { vip: !!(ad.vip_until || ad.premium_until), premium: !!ad.premium_until, urgent: !!ad.urgent_until };
      const endedKinds = PROMO_KINDS.filter((k) => ad[PROMOS[k].col] && (tsOf(ad[PROMOS[k].col]) <= now || ad.status !== "active"));
      const endedAt = {};
      for (const k of endedKinds) {
        endedAt[k] = tsOf(ad[PROMOS[k].col]);
        await db.execute(`UPDATE ads SET ${PROMOS[k].col} = NULL, ${PROMOS[k].rem} = 0 WHERE id = ?`, [ad.id]);
        ad[PROMOS[k].col] = null;
      }
      const after = { vip: isVipActive(ad), premium: isPremiumActive(ad), urgent: isUrgentActive(ad) };
      if (!ad.channelMsgId) continue;
      if (before.vip && !after.vip) await bot.api.unpinChatMessage(CHANNEL_ID, Number(ad.channelMsgId)).catch(() => {});
      if (ad.status !== "active") continue; // sotilgan e'lonning matniga tegmaymiz
      if (before.vip !== after.vip || before.premium !== after.premium || before.urgent !== after.urgent) await refreshChannelCaption(ad);
      for (const k of endedKinds) {
        if (now - endedAt[k] > 2 * 86400000) continue; // ancha oldin tugagan (eski) — xabar yubormaymiz
        if (PROMOS[k].inPremium && after.premium) continue;
        let extra = "";
        if (k === "premium" && after.vip) extra = `\n🌟 VIP esa ${fmtTash(ad.vip_until)} gacha davom etadi.`;
        await bot.api.sendMessage(ad.userId,
          `ℹ️ <b>${ad.carDetails}</b> e'loningizda ${PROMOS[k].title} muddati tugadi. E'lon kanalda va ilovada odatdagidek turibdi.${extra}\n\nYana yoqmoqchi bo'lsangiz 👇`,
          { parse_mode: "HTML", ...(promoEnabled(k) ? { reply_markup: promoRenewKb(k, ad.id) } : {}) }).catch(() => {});
      }
    }
    // 3) ⬆️ TOP / 💎 Premium: har kuni bir marta kanalda ko'tarish (admin paneldagi soatlarda, bir martada ko'pi bilan 5 ta)
    const h = new Date(Date.now() + 5 * 3600 * 1000).getUTCHours(), TH = topHours();
    if (h >= TH.from && h < TH.to) {
      const [due] = await db.execute(
        "SELECT * FROM ads WHERE status = 'active' AND (top_until > NOW() OR premium_until > NOW()) AND (last_bumped IS NULL OR last_bumped <= NOW() - INTERVAL 23 HOUR) ORDER BY last_bumped LIMIT 5"
      );
      for (const ad of due) await bumpAdInChannel(ad);
    }
  } catch (e) { console.error("Statuslar muddatini tekshirishda xato:", e.message); }
  finally { promoCheckRunning = false; }
}
setInterval(checkVipExpiry, 10 * 60 * 1000).unref();
setTimeout(checkVipExpiry, 60 * 1000).unref();

setInterval(() => runScheduledPosts(new Date()), 60 * 1000 * 30);
module.exports = { runScheduledPosts, addPriceVoteLine, AD_CHANNEL_MARKUP, checkVipExpiry, changeAdPrice, useFreeUp, finishSalonAppAds }; // testlar uchun

// ==============================================================
// 🧯 JAVOBSIZ TUGMALAR (eng oxirida turishi shart — boshqa handlerlardan keyin)
// ==============================================================
// "⏳ Kutilmoqda..." tugmasi
bot.callbackQuery("ignore", (ctx) => ctx.answerCallbackQuery({ text: "⏳ Iltimos, biroz kuting..." }).catch(() => {}));
// Eskirgan tugmalar: suhbat tugagandan keyin bosilgan eski xabardagi tugma (masalan, tashlab ketilgan
// e'lon formasidagi tugmalar). Avval Telegram'da tugma cheksiz "aylanib" turardi.
bot.on("callback_query:data", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Bu tugma eskirgan. Kerakli bo'limni menyudan qaytadan tanlang.", show_alert: false }).catch(() => {});
});

// ==============================================================
// 🚀 ISHGA TUSHIRISH: avval jadvallar va katalog, keyin Mini App va bot
// ==============================================================
dbReady.finally(async () => {
  // 📱 MINI APP serveri (Railway PORT ni o'zi beradi). Xato bo'lsa ham bot ishlayveradi.
  try {
    const { startWebApp } = require("./webapp");
    startWebApp({
      bot, db, catalog, InputFile, mainMenu,
      ADMIN_ID, CHANNEL_ID, LOG_CHANNEL_ID, WEBAPP_URL,
      VIP_PRICE, VIP_CARD, VIP_CARD_NAME, payCard, payCardName, salonDailyLimit, promoEnabled,
      // Bot ham, Mini App ham aynan shu funksiyalarni chaqiradi:
      checkCanPostAd, submitNewAdToAdmin, sanitizeText, normalizePhone, parseAdPrice,
      requestSoldToAdmin, changeAdPrice, submitAdEditToAdmin, submitVipRequest, useFreeUp,
      estimateCarPrice, submitDealerApplication, getSalonAdStatus, submitSalonAd, getReferralInfo,
      logUserAction, getAdVotes,
      getPrice, getVipDays, PROMOS, PROMO_KINDS, promoDays, paidAdsOn, paidSalonOn, getSalonCredits, SALON_PLANS, salonAppDays, salonPlacement,
    });
  } catch (e) {
    console.error("❌ Mini App serverini ishga tushirib bo'lmadi:", e);
  }

  // Yozish joyining chap tomonidagi "📱 Ilova" tugmasi (barcha foydalanuvchilar uchun)
  if (WEBAPP_URL) {
    bot.api.setChatMenuButton({
      menu_button: { type: "web_app", text: "📱 Ilova", web_app: { url: `${WEBAPP_URL}/` } },
    }).then(() => console.log(`✅ Mini App tugmasi o'rnatildi: ${WEBAPP_URL}`))
      .catch((e) => console.error("Menyu tugmasini o'rnatishda xato:", e.message));
  } else {
    console.log("ℹ️ WEBAPP_URL yo'q — Mini App tugmasi qo'yilmadi (faqat bot orqali e'lon berish ishlaydi).");
  }

  bot.start({
    // message_reaction_count — kanal postlaridagi reaksiyalar soni («Narxga baho»). Ro'yxatda bo'lmasa Telegram yubormaydi.
    allowed_updates: ["message", "edited_message", "callback_query", "chat_member", "my_chat_member", "channel_post", "edited_channel_post", "message_reaction_count"]
  });
});
console.log("Бот муваффақиятли ишга тушди...");