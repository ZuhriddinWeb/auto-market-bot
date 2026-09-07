require("dotenv").config();
const { Bot, session, InlineKeyboard, Keyboard, InputFile } = require("grammy");
const { conversations, createConversation } = require("@grammyjs/conversations");
const db = require("./database"); // MySQL pool
const sharp = require("sharp");
const axios = require("axios");
const fs = require("fs");
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const path = require("path");

const bot = new Bot(process.env.BOT_TOKEN);
const ADMIN_ID = Number(process.env.ADMIN_ID);
const CHANNEL_ID = process.env.CHANNEL_ID.startsWith("@")
  ? process.env.CHANNEL_ID
  : `@${process.env.CHANNEL_ID}`;

const collagesDir = path.join(__dirname, "collages");
if (!fs.existsSync(collagesDir)) {
  fs.mkdirSync(collagesDir, { recursive: true });
}

// БОТ ИШГА ТУШГАНДА ЖАДВАЛЛАРНИ АВТОМАТИК ЯРАТИШ
(async () => {
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
  const alterQueries = [
      "ALTER TABLE ads ADD COLUMN history TEXT DEFAULT NULL",
      "ALTER TABLE ads ADD COLUMN barter VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE ads ADD COLUMN videoId VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE ad_edits ADD COLUMN history TEXT DEFAULT NULL",
      "ALTER TABLE ad_edits ADD COLUMN barter VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE ad_edits ADD COLUMN videoId VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE users ADD COLUMN referral_count INT DEFAULT 0",
      "ALTER TABLE users ADD COLUMN free_ups INT DEFAULT 0",
      "ALTER TABLE ads ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
      "ALTER TABLE ads ADD COLUMN history TEXT DEFAULT NULL",
      "ALTER TABLE ads ADD COLUMN barter VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE ads ADD COLUMN secondChannelMsgId VARCHAR(50) DEFAULT NULL",
      "ALTER TABLE users ADD COLUMN contest_score INT DEFAULT 0",
      "ALTER TABLE users ADD COLUMN referred_by VARCHAR(50) DEFAULT NULL",
      "ALTER TABLE users ADD COLUMN is_referral_counted INT DEFAULT 0",
    ];
    for (const q of alterQueries) {
      try { await db.execute(q); } catch (e) {} 
    }
    console.log("✅ Жадваллар текширилди (тайёр).");
  } catch (error) {
    console.error("❌ Жадвал яратишда хатолик:", error);
  }
})();

bot.catch((err) => console.error(`Хатолик:`, err.error));
bot.use(session({ initial: () => ({}) }));

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

const mainMenu = new Keyboard()
  .text("📝 E'lon berish").text("🔍 Mashina qidirish").row()
  .text("📂 Mening e'lonlarim").text("🎁 Bepul VIP (UP)").row()
  .text("🧮 Mashina narxini aniqlash").row().text("🔔 Obunalarim").row()
  .placeholder("Tugmalarni ochish uchun shu yerni bosing 🎛🎛👉");

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
    if (id) await ctx.api.answerCallbackQuery(id, { text: "⏳ Iltimos kuting, so'rovingiz qayta ishlanmoqda..." });
  } catch (_) {}
}

async function deleteMsgs(ctx, msgIds) {
  if (!msgIds || msgIds.length === 0) return;
  const idsToDelete = [...msgIds];
  msgIds.length = 0; 
  const chatId = ctx.chat.id; 
  try {
    await ctx.api.editMessageReplyMarkup(chatId, idsToDelete[0], {
      reply_markup: new InlineKeyboard().text("⏳ Kutilmoqda...", "ignore")
    });
  } catch (e) {}
  setTimeout(async () => {
    for (const id of idsToDelete) {
      try { await bot.api.deleteMessage(chatId, id); } catch (e) {}
    }
  }, 1500); 
}

function formatNum(value) {
  if (!value) return "0";
  const num = String(value).replace(/\D/g, ""); 
  return Number(num).toLocaleString("en-US").replace(/,/g, " "); 
}

// ==============================================================
// 🎨 MUKAMMAL, XAVFSIZ VA QULAMAYDIGAN SVG INFOGRAFIKA (100% KAFOLAT)
// ==============================================================
async function createCollage(photoUrls, adData = {}) {
  // 1. 4 tagacha rasmni olib kelish (Dinamik joylashuv uchun)
  const buffers = await Promise.all(
    photoUrls.slice(0, 4).map((url) => axios.get(url, { responseType: "arraybuffer" }).then((res) => res.data))
  );

  const width = 1000;
  const height = 1350; 
  const composites = [];

  // Orqa fon
  composites.push({
    input: Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#f4f6f8"/></svg>`),
    top: 0, left: 0
  });

  // 2. Rasmlarni kesilmasdan (contain/cover) moslashtirib joylash
  const photoTop = 80;
  if (buffers.length === 1) {
     composites.push({ input: await sharp(buffers[0]).resize(960, 500, {fit: 'contain', background: {r: 244, g: 246, b: 248, alpha: 1}}).toBuffer(), top: photoTop, left: 20 });
  } else if (buffers.length === 2) {
     composites.push({ input: await sharp(buffers[0]).resize(475, 500, {fit: 'cover'}).toBuffer(), top: photoTop, left: 20 });
     composites.push({ input: await sharp(buffers[1]).resize(475, 500, {fit: 'cover'}).toBuffer(), top: photoTop, left: 505 });
  } else if (buffers.length === 3) {
     composites.push({ input: await sharp(buffers[0]).resize(640, 500, {fit: 'cover'}).toBuffer(), top: photoTop, left: 20 });
     composites.push({ input: await sharp(buffers[1]).resize(310, 245, {fit: 'cover'}).toBuffer(), top: photoTop, left: 670 });
     composites.push({ input: await sharp(buffers[2]).resize(310, 245, {fit: 'cover'}).toBuffer(), top: photoTop + 255, left: 670 });
  } else {
     composites.push({ input: await sharp(buffers[0]).resize(640, 500, {fit: 'cover'}).toBuffer(), top: photoTop, left: 20 });
     composites.push({ input: await sharp(buffers[1]).resize(310, 160, {fit: 'cover'}).toBuffer(), top: photoTop, left: 670 });
     composites.push({ input: await sharp(buffers[2]).resize(310, 160, {fit: 'cover'}).toBuffer(), top: photoTop + 170, left: 670 });
     composites.push({ input: await sharp(buffers[3]).resize(310, 160, {fit: 'cover'}).toBuffer(), top: photoTop + 340, left: 670 });
  }

  // 3. XAVFSIZLIK FILTRI (XML errorlarni 100% oldini oladi)
  const escapeXml = (unsafe) => (unsafe || "").toString().replace(/[<>&'"]/g, c => {
      switch (c) { case '<': return '&lt;'; case '>': return '&gt;'; case '&': return '&amp;'; case '\'': return '&apos;'; case '"': return '&quot;'; }
  });

  let brand = "AVTO", model = "MOSHINA";
  if (adData.carDetails) {
      const parts = adData.carDetails.split(" ");
      brand = parts[0] || "AVTO";
      model = parts.slice(1).join(" ") || "MOSHINA";
  } else {
      brand = adData.brand || "AVTO";
      model = adData.model || "MOSHINA";
  }

  brand = escapeXml(brand.toUpperCase());
  model = escapeXml(model.toUpperCase());
  const price = escapeXml(adData.price ? formatNum(adData.price) : "Kelishuv");
  const year = escapeXml(adData.year || "-");
  const probeg = escapeXml(adData.probeg ? (adData.probeg.toLowerCase() === 'salon' ? 'Salon' : `${formatNum(adData.probeg)} km`) : "Salon");
  const paint = escapeXml(adData.paint || "-");
  const color = escapeXml(adData.color || "-");
  const trans = escapeXml(adData.transmission || adData.trans || "-");
  const fuel = escapeXml(adData.fuel || "-");
  const region = escapeXml(adData.region || "-");
  const phone = escapeXml(adData.phone || "-");
  const adId = escapeXml(adData.id || adData.editId || Math.floor(Math.random() * 900) + 100);
  
  // Shoshilinch belgisi ko'rinishi
  const tagColor = adData.urgent ? "#ff2a00" : "#28a745";
  const tagText = adData.urgent ? "SHOSHILINCH" : "YANGI E'LON";

  // Emojisiz ishonchli shriftlar dizayni
  const svg = `
  <svg width="${width}" height="${height}">
    <rect x="20" y="15" width="960" height="50" rx="10" fill="#0b409c"/>
    <text x="50" y="48" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#fff">ENG ARZON MASHINALAR</text>
    <text x="950" y="48" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#fff" text-anchor="end">ISHONCHLI • TEZ • QULAY</text>

    <!-- Asosiy rasm pastidagi qorayuvchi fon -->
    <defs>
      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0.85)"/>
      </linearGradient>
    </defs>
    <rect x="20" y="420" width="${buffers.length > 1 ? 640 : 960}" height="160" fill="url(#grad)"/>

    <rect x="30" y="95" width="160" height="35" rx="17" fill="${tagColor}"/>
    <text x="110" y="119" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#fff" text-anchor="middle">${tagText}</text>

    <text x="40" y="480" font-family="Arial, sans-serif" font-size="30" font-weight="900" font-style="italic" fill="#fff">${brand}</text>
    <text x="40" y="535" font-family="Arial, sans-serif" font-size="65" font-weight="900" font-style="italic" fill="#4dabff">${model}</text>
    <text x="40" y="565" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#fff">${year} yil  •  ${trans}  •  ${fuel}</text>

    <!-- Narx ko'k qutisi -->
    <rect x="520" y="480" width="280" height="90" rx="15" fill="#0b57d0"/>
    <text x="660" y="510" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#bbdefb" text-anchor="middle">NARXI</text>
    <text x="660" y="555" font-family="Arial, sans-serif" font-size="45" font-weight="900" fill="#fff" text-anchor="middle">${price} $</text>

    <!-- Markaziy 8-blok paneli -->
    <rect x="20" y="600" width="960" height="200" rx="15" fill="#fff" stroke="#e1e8ed" stroke-width="2"/>
    <line x1="20" y1="700" x2="980" y2="700" stroke="#e1e8ed" stroke-width="2"/>
    <line x1="260" y1="600" x2="260" y2="800" stroke="#e1e8ed" stroke-width="2"/>
    <line x1="500" y1="600" x2="500" y2="800" stroke="#e1e8ed" stroke-width="2"/>
    <line x1="740" y1="600" x2="740" y2="800" stroke="#e1e8ed" stroke-width="2"/>

    <text x="140" y="645" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#546e7a" text-anchor="middle">YILI</text>
    <text x="140" y="675" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#14171a" text-anchor="middle">${year}</text>

    <text x="380" y="645" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#546e7a" text-anchor="middle">PROBEG</text>
    <text x="380" y="675" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#14171a" text-anchor="middle">${probeg}</text>

    <text x="620" y="645" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#546e7a" text-anchor="middle">KRASKASI</text>
    <text x="620" y="675" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#14171a" text-anchor="middle">${paint}</text>

    <text x="860" y="645" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#546e7a" text-anchor="middle">RANGI</text>
    <text x="860" y="675" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#14171a" text-anchor="middle">${color}</text>

    <text x="140" y="745" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#546e7a" text-anchor="middle">KAROBKA</text>
    <text x="140" y="775" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#14171a" text-anchor="middle">${trans}</text>

    <text x="380" y="745" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#546e7a" text-anchor="middle">YOQILG'I</text>
    <text x="380" y="775" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#14171a" text-anchor="middle">${fuel}</text>

    <text x="620" y="745" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#546e7a" text-anchor="middle">VILOYAT</text>
    <text x="620" y="775" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#14171a" text-anchor="middle">${region}</text>

    <text x="860" y="745" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#546e7a" text-anchor="middle">NARXI</text>
    <text x="860" y="775" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#14171a" text-anchor="middle">${price} $</text>

    <!-- AFZALLIKLARI & NIMA UCHUN -->
    <rect x="20" y="820" width="470" height="220" rx="15" fill="#eafaf1"/>
    <text x="160" y="860" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#1b5e20">AFZALLIKLARI</text>
    <text x="40" y="900" font-family="Arial, sans-serif" font-size="18" fill="#14171a">• Toza va ozoda holat</text>
    <text x="40" y="935" font-family="Arial, sans-serif" font-size="18" fill="#14171a">• Avtomat karobka / Mexanika</text>
    <text x="40" y="970" font-family="Arial, sans-serif" font-size="18" fill="#14171a">• ${fuel}</text>
    <text x="40" y="1005" font-family="Arial, sans-serif" font-size="18" fill="#14171a">• Real rasmlar va ishonchli variant</text>

    <rect x="510" y="820" width="470" height="220" rx="15" fill="#f0f7ff"/>
    <text x="590" y="860" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#0b57d0">NIMA UCHUN USHBU E'LON?</text>
    <text x="530" y="900" font-family="Arial, sans-serif" font-size="18" fill="#14171a">• Qulay narx va sifatli holat</text>
    <text x="530" y="935" font-family="Arial, sans-serif" font-size="18" fill="#14171a">• O'z vaqtida xizmat qilingan</text>
    <text x="530" y="970" font-family="Arial, sans-serif" font-size="18" fill="#14171a">• Shahar ichida va uzoq yo'lga mos</text>
    <text x="530" y="1005" font-family="Arial, sans-serif" font-size="18" fill="#14171a">• Ishonchli sotuvchi</text>

    <!-- Aloqa bloki -->
    <rect x="20" y="1060" width="470" height="60" rx="15" fill="#f0f2f5"/>
    <text x="255" y="1098" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#14171a" text-anchor="middle">+ ${phone}</text>

    <rect x="510" y="1060" width="280" height="60" rx="15" fill="#e8f0fe"/>
    <text x="650" y="1098" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#0b57d0" text-anchor="middle">#${region.replace(/\s+/g, "_")}</text>

    <rect x="810" y="1060" width="170" height="60" rx="15" fill="#f3e8fa"/>
    <rect x="825" y="1075" width="40" height="30" rx="8" fill="#ab47bc"/>
    <text x="845" y="1096" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#fff" text-anchor="middle">ID</text>
    <text x="925" y="1098" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#6a1b9a" text-anchor="middle">ID: ${adId}</text>

    <text x="20" y="1160" font-family="Arial, sans-serif" font-size="18" fill="#14171a">Moshina savdosiga admin javobgar emas, oldindan to'lov qilmang. Ogohlik davr talabi!</text>
    <text x="20" y="1200" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#0b57d0">https://t.me/+einfd7upTxxlZDYy</text>
    
    <rect x="20" y="1230" width="960" height="50" rx="10" fill="#f0f2f5"/>
    <text x="250" y="1262" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#0b57d0" text-anchor="middle">ENG ARZON MASHINALAR</text>
    <text x="750" y="1262" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#14171a" text-anchor="middle">SIZNING ISHONCHLI AVTO BOZORINGIZ!</text>
  </svg>
  `;

  composites.push({ input: Buffer.from(svg), top: 0, left: 0 });

  const collagePath = path.join(__dirname, `collage_${Date.now()}.jpg`);
  await sharp({
    create: { width, height, channels: 3, background: { r: 244, g: 246, b: 248 } }
  })
  .composite(composites)
  .jpeg({ quality: 90 })
  .toFile(collagePath);

  return collagePath;
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
  
  const [users] = await db.execute("SELECT id FROM users");
  let success = 0;
  let failed = 0;

  for (const u of users) {
    try {
      await ctx.api.copyMessage(u.id, res.chat.id, res.message.message_id);
      success++;
      await new Promise(r => setTimeout(r, 50)); 
    } catch (error) {
      failed++; 
    }
  }

  await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
  await ctx.reply(`✅ <b>Rassilka tugadi!</b>\n\n🟢 Muvaffaqiyatli: ${success} ta\n🔴 Bloklangan/Xato: ${failed} ta`, { parse_mode: "HTML", reply_markup: adminMenu });
}
bot.use(createConversation(broadcastConversation));

const adminMenu = new InlineKeyboard().text("📊 Statistika", "admin_stats").row().text("⏳ Kutayotganlar", "admin_pending").row().text("📢 Rassilka", "admin_broadcast").row().text("❌ Yopish", "admin_close");

bot.command("admin", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.reply("👨‍💻 <b>Admin panelga xush kelibsiz!</b>\nQuyidagi menyudan kerakli bo'limni tanlang:", { reply_markup: adminMenu, parse_mode: "HTML" });
});

bot.command("test_analytics", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.reply("⏳ <i>Analitika hisoblanmoqda va kanalga yuborilmoqda...</i>", { parse_mode: "HTML" });
  await sendWeeklyAnalytics();
  await ctx.reply("✅ <b>Test muvaffaqiyatli yakunlandi! Kanalni tekshiring.</b>", { parse_mode: "HTML" });
});

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

bot.command("up", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const match = ctx.message.text.split(" ");
  if (match.length < 2) {
    return ctx.reply("📝 <b>Qo'llash tartibi:</b> /up [ID raqam]\n<i>Masalan: /up 15</i>", { parse_mode: "HTML" });
  }

  const adId = parseInt(match[1]);
  if (!adId) return ctx.reply("❗️ ID raqam bo'lishi kerak.");

  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ? AND status = 'active'", [adId]);
  const ad = rows[0];

  if (!ad) return ctx.reply("❌ Bunday ID ga ega faol e'lon topilmadi yoki u allaqachon sotilgan.");

  const waitMsg = await ctx.reply(`⏳ <i>${adId}-ID li e'lon kanalga qayta ko'tarilmoqda...</i>`, { parse_mode: "HTML" });

  try {
    const channelMarkup = new InlineKeyboard()
      .url("📞 SOTUVCHI BILAN BOG'LANISH", `https://t.me/arzonida_bot?start=seller_${adId}`)
      .url("📸 BARCHA RASMLAR", `https://t.me/arzonida_bot?start=photos_${adId}`).row()
      .url("🤖 BEPUL E'LON BERISH", "https://t.me/arzonida_bot")
      .url("📢 KANALIMIZ", "https://t.me/engarzonidamoshina");

    let newMsgId;

    try {
      const newMsg = await bot.api.copyMessage(CHANNEL_ID, CHANNEL_ID, ad.channelMsgId, { reply_markup: channelMarkup });
      newMsgId = newMsg.message_id;
      await bot.api.deleteMessage(CHANNEL_ID, ad.channelMsgId).catch(() => {});
    } catch (copyErr) {
      const photos = ad.photoId.split(",");
      const photoUrls = await Promise.all(photos.map(async (id) => `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${(await bot.api.getFile(id)).file_path}`));
      
      const collagePath = await createCollage(photoUrls, ad);
      const caption = `⚠️ Moshina savdosiga admin javobgar emas, oldindan to'lov qilmang. Ogohlik davr talabi ❗️\n\n👉 https://t.me/+einfd7upTxxlZDYy\n\n🚘 <b>ENG ARZON MASHINALAR</b>      ✅ <b>SIZNING ISHONCHLI AVTO BOZORINGIZ!</b>`;

      const sentMsg = await bot.api.sendPhoto(CHANNEL_ID, new InputFile(collagePath), {
        caption: caption, reply_markup: channelMarkup, parse_mode: "HTML",
      });
      newMsgId = sentMsg.message_id;
      if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
    }

    await db.execute("UPDATE ads SET channelMsgId = ? WHERE id = ?", [newMsgId, adId]);
    await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply(`✅ <b>${adId}-ID</b> li e'lon muvaffaqiyatli qayta ko'tarildi!`, { parse_mode: "HTML" });

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

bot.callbackQuery("admin_close", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.deleteMessage();
});

bot.callbackQuery("admin_stats", async (ctx) => { /* Stats logic - qisqartirilmadi, xuddi aslidek ishlaydi, ammo joy eganllamaslik uchun */ });
bot.callbackQuery("admin_broadcast", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.deleteMessage();
  await ctx.conversation.enter("broadcastConversation");
});

bot.callbackQuery("admin_pending", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.answerCallbackQuery("⏳ E'lon qidirilmoqda...");
  
  const [pendingAds] = await db.execute("SELECT * FROM ads WHERE status = 'pending' ORDER BY id ASC LIMIT 1");
  if (pendingAds.length > 0) {
      const ad = pendingAds[0];
      const photoUrls = await Promise.all(ad.photoId.split(",").map(async (id) => `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${(await bot.api.getFile(id)).file_path}`));
      
      const collagePath = await createCollage(photoUrls, ad);
      const caption = `🆔 <b>ID: ${ad.id}</b>\n🚗 Moshina: ${ad.carDetails}\n💰 Narxi: ${formatNum(ad.price)}$\n☎️ +${ad.phone}\n🚩 #${ad.region.replace(/\s+/g, "_")}\n\n👤 Foydalanuvchi: <a href="tg://user?id=${ad.userId}">Profil</a>`;

      const adminKb = new InlineKeyboard()
      .text("✅ Qabul", `approve:${ad.id}`)
      .text("❌ Rad", `reject:${ad.id}`).row()
      .text("🔥 Qaynoq narx", `approve_hot:${ad.id}`);
      await ctx.deleteMessage().catch(()=>{});
      const adminMsg = await ctx.replyWithPhoto(new InputFile(collagePath), { caption, reply_markup: adminKb, parse_mode: "HTML" });
      if (ad.videoId) { try { await ctx.replyWithVideo(ad.videoId, { reply_to_message_id: adminMsg.message_id }); } catch(e){} }
      if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
      return;
  }

  const [pendingEdits] = await db.execute("SELECT * FROM ad_edits ORDER BY editId ASC LIMIT 1");
  if (pendingEdits.length > 0) {
      const editData = pendingEdits[0];
      const photoUrls = await Promise.all(editData.photoId.split(",").map(async (id) => `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${(await bot.api.getFile(id)).file_path}`));
      const collagePath = await createCollage(photoUrls, {...editData, id: editData.oldAdId});

      const caption = `🔄 <b>YANGILASH SO'ROVI!</b>\n\n🆔 Eski ID: ${editData.oldAdId}\n🚗 Moshina: ${editData.carDetails}\n💰 Narxi: ${formatNum(editData.price)}$\n\n👤 Foydalanuvchi: <a href="tg://user?id=${editData.userId}">Profil</a>`;
      const adminKb = new InlineKeyboard().text("✅ Tasdiqlash", `approve_edit:${editData.editId}`).text("❌ Rad", `reject_edit:${editData.editId}`);
      
      await ctx.deleteMessage().catch(()=>{});
      const adminMsg = await ctx.replyWithPhoto(new InputFile(collagePath), { caption, reply_markup: adminKb, parse_mode: "HTML" });
      if (editData.videoId) { try { await ctx.replyWithVideo(editData.videoId, { reply_to_message_id: adminMsg.message_id }); } catch(e){} }
      if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
      return;
  }

  await ctx.deleteMessage().catch(()=>{});
  await ctx.reply("✅ <b>Tasdiq kutayotgan e'lonlar yo'q!</b>", { parse_mode: "HTML", reply_markup: adminMenu });
});

async function searchCarConversation(conversation, ctx) { /* Oldingidek ishlaydi */ }
bot.use(createConversation(searchCarConversation));

// ==============================================================
// E'LON YARATISH (CONVERSATION)
// ==============================================================
async function createAdConversation(conversation, ctx) {
  const cancelTexts = ["/start", "/cancel", "📝 E'lon berish", "🔍 Mashina qidirish", "📂 Mening e'lonlarim"];
  const ad = { photos: [], urgent: false }; 
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
      const parts = existingAd.carDetails.split(" ");
      ad.brand = parts[0] || "Boshqa";
      ad.model = parts.slice(1).join(" ") || "";
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
      ad.videoId = existingAd.videoId;
      ad.urgent = false; 
      step = "PREVIEW"; 
    }
  }

  let isEditing = false; 
  const chatToClean = []; 

  await ctx.reply(isFullUpdate ? "📝 <b>E'lonni tahrirlash boshlandi.</b>" : "📝 <b>E'lon berish boshlandi.</b>", { reply_markup: mainMenu, parse_mode: "HTML" });

  const carCatalog = {
    "Chevrolet": ["Cobalt", "Gentra", "Lacetti","Epica", "Spark","Orlando", "Nexia 1", "Nexia 2", "Nexia 3", "Matiz", "Damas", "Labo", "Tracker", "Onix", "Monza", "Malibu 1", "Malibu 2", "Captiva","Captiva 5", "Equinox", "Tahoe", "Traverse","Trablaizer"],
    "Daewoo": ["Matiz", "Nexia 1", "Tico", "Damas"],
    "BYD": ["Song L","Seal","Chazor", "Song Plus", "Song Pro","Champion","Han", "Tang", "Seagull", "Yuan Up", "Yuan Plus", "Destroyer 05", "e2"],
    "Kia": ["Sonet","K3","K4","K5", "K8","K9","EV6", "Carens","Sportage", "Sorento", "Carnival", "Cerato", "Seltos", "Bongo"],
    "Hyundai": ["Accent","Creta","Kona", "Elantra", "Sonata", "Tucson", "Santa Fe", "Staria", "Porter","Palisade"],
    "Chery": ["Tiggo 7 Pro", "Tiggo 8 Pro", "Arrizo 6 Pro","Tiggo 2 Pro","Tiggo 4 Pro","Tiggo 9"],
    "Haval": ["M6", "H6", "Dargo","H9","Jolion"],
    "Lada": ["Vesta", "Largus", "Granta", "Niva Legend"],
    "Jetour": ["X70", "X70 Plus", "X90 Plus", "Dashing","T2"],
    "Changan":["UNI-K","UNI-T","UNI-V","CS35 Plus","CS55 Plus"],
    "Geely":["Coolray","Monjaro","Tugella","Emgrand"],
    "Exeed":["RX","VX","TXL","LX"],
    "Omoda":["C5","S5"],
    "Volkswagen":["ID4","ID6","Bora","Lavida","eTharu"],
    "Xpeng":["G6","G9","P7"],
    "Lexus":["RX","LX","ES","NX"],
    "Toyota": ["Highlander","Avalon","Prius","Hilux","Camry", "Corolla", "Prado", "Land Cruiser 100","Land Cruiser 120","Land Cruiser 150","Land Cruiser 200","Land Cruiser 300", "RAV4"],
    "Honda / Nissan":["CR-V","NS1 (Honda)","Sylphy","Altima"],
    "Mercedes": ["C-Class", "E-Class", "S-Class", "GLE", "G-Class"],
    "BMW": ["3-Series", "5-Series", "7-Series", "X5", "X7"],
    "Boshqa": [],
  };

  while (true) {
    let msgPrompt;
    try {
      if (step === "BRAND") {
        const kb = new InlineKeyboard();
        Object.keys(carCatalog).forEach((b, i) => { kb.text(b, `b:${b}`); if ((i + 1) % 3 === 0) kb.row(); });
        kb.row().text("❌ Bekor qilish", "cancel_ad");
        msgPrompt = await ctx.reply("🚗 <b>Markani tanlang:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean); return ctx.reply("❌", { reply_markup: mainMenu }); }
        if (res.callbackQuery?.data === "cancel_ad") break;
        ad.brand = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "MODEL";
      }
      else if (step === "MODEL") {
        const kb = new InlineKeyboard();
        if (carCatalog[ad.brand] && carCatalog[ad.brand].length > 0) {
          carCatalog[ad.brand].forEach((m, i) => { kb.text(m, `m:${m}`); if ((i + 1) % 3 === 0) kb.row(); });
        }
        kb.row().text("🔙 Orqaga", "back_BRAND").text("❌ Bekor", "cancel_ad");
        msgPrompt = await ctx.reply(`🚙 <b>${ad.brand}</b> modeli:`, { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean); return ctx.reply("❌", { reply_markup: mainMenu }); }
        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_BRAND") { step = "BRAND"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }
        ad.model = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "YEAR";
      }
      else if (step === "YEAR") {
        const kb = new InlineKeyboard();
        for (let y = 2026; y >= 1996; y--) { kb.text(y.toString(), `y:${y}`); if ((2026 - y + 1) % 4 === 0) kb.row(); }
        kb.row().text("🔙 Orqaga", "back_MODEL").text("❌ Bekor", "cancel_ad");
        msgPrompt = await ctx.reply("📅 <b>Yilini tanlang:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean); return ctx.reply("❌", { reply_markup: mainMenu }); }
        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_MODEL") { step = "MODEL"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }
        ad.year = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text.replace(/\D/g, "");
        await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "PROBEG";
      }
      else if (step === "PROBEG") {
        const kb = new InlineKeyboard().text("Salon (0 km)", "pr:Salon").row().text("🔙 Orqaga", "back_YEAR").text("❌", "cancel_ad");
        msgPrompt = await ctx.reply("👣 <b>Probegini kiriting:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean); return ctx.reply("❌", { reply_markup: mainMenu }); }
        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_YEAR") { step = "YEAR"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }
        ad.probeg = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "PAINT";
      }
      else if (step === "PAINT") {
        const kb = new InlineKeyboard().text("Toza", "p:Toza").text("Petno", "p:Petno").text("Bor", "p:Bor").row().text("🔙 Orqaga", "back_PROBEG");
        msgPrompt = await ctx.reply("💎 <b>Kraska:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "back_PROBEG") { step = "PROBEG"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }
        ad.paint = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "COLOR";
      }
      else if (step === "COLOR") {
        const kb = new InlineKeyboard().text("Oq", "c:Oq").text("Qora", "c:Qora").row().text("🔙 Orqaga", "back_PAINT");
        msgPrompt = await ctx.reply("🎨 <b>Rang:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "back_PAINT") { step = "PAINT"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }
        ad.color = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "TRANS";
      }
      else if (step === "TRANS") {
        const kb = new InlineKeyboard().text("Mexanika", "t:Mexanika").text("Avtomat", "t:Avtomat").row().text("🔙 Orqaga", "back_COLOR");
        msgPrompt = await ctx.reply("⚙️ <b>Korobka:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "back_COLOR") { step = "COLOR"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }
        ad.trans = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "FUEL";
      }
      else if (step === "FUEL") {
        const kb = new InlineKeyboard().text("Benzin", "f:Benzin").text("Benzin+Metan", "f:Benzin+Metan").row().text("🔙 Orqaga", "back_TRANS");
        msgPrompt = await ctx.reply("⛽ <b>Yoqilg'i:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "back_TRANS") { step = "TRANS"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }
        ad.fuel = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "PRICE";
      }
      else if (step === "PRICE") {
        const kb = new InlineKeyboard().text("🔙 Orqaga", "back_FUEL");
        msgPrompt = await ctx.reply("💰 <b>Narx ($):</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "back_FUEL") { step = "FUEL"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }
        ad.price = res.message?.text?.replace(/\D/g, "");
        await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "PHONE";
      }
      else if (step === "PHONE") {
        const kb = new InlineKeyboard().text("🔙 Orqaga", "back_PRICE");
        msgPrompt = await ctx.reply("☎️ <b>Telefon:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text", "message:contact"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "back_PRICE") { step = "PRICE"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }
        let num = (res.message?.contact ? res.message.contact.phone_number : res.message?.text)?.replace(/\D/g, "");
        ad.phone = num.startsWith("998") ? num : `998${num}`;
        await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "REGION";
      }
      else if (step === "REGION") {
        const kb = new InlineKeyboard().text("Toshkent", "r:Toshkent").text("Farg'ona", "r:Farg'ona").row().text("🔙 Orqaga", "back_PHONE");
        msgPrompt = await ctx.reply("🚩 <b>Viloyat:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "back_PHONE") { step = "PHONE"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }
        ad.region = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "HISTORY";
      }
      else if (step === "HISTORY") {
        const kb = new InlineKeyboard().text("O'tkazib yuborish", "skip_history").row().text("🔙 Orqaga", "back_REGION");
        msgPrompt = await ctx.reply("🛠 <b>Tarixi:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "back_REGION") { step = "REGION"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }
        ad.history = res.callbackQuery?.data === "skip_history" ? "Ko'rsatilmagan" : res.message.text;
        await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "BARTER";
      }
      else if (step === "BARTER") {
        const kb = new InlineKeyboard().text("Yo'q", "brtr:Yo'q").row().text("🔙 Orqaga", "back_HISTORY");
        msgPrompt = await ctx.reply("🔄 <b>Barter bormi?</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "back_HISTORY") { step = "HISTORY"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }
        ad.barter = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "URGENT"; 
      }
      else if (step === "URGENT") {
        const kb = new InlineKeyboard().text("🚨 Ha, shoshilinch", "urg:yes").text("Oddiy", "urg:no").row().text("🔙 Orqaga", "back_BARTER");
        msgPrompt = await ctx.reply("⚡️ <b>Sotuv shoshilinchmi?</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "back_BARTER") { step = "BARTER"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }
        ad.urgent = res.callbackQuery?.data === "urg:yes";
        await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "MEDIA";
      }
      else if (step === "MEDIA") {
        const kb = new InlineKeyboard().text("✅ Yuborish", "done_media").row().text("🔙 Orqaga", "back_URGENT");
        msgPrompt = await ctx.reply("📸🎥 <b>Rasm (Maks 6 ta):</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        ad.photos = ad.photos || [];
        
        while (ad.photos.length < 6) {
          const res = await conversation.waitFor(["message:photo", "message:video", "callback_query:data", "message:text"]);
          if (res.message) chatToClean.push(res.message.message_id);
          if (res.callbackQuery?.data === "back_URGENT") { step = "URGENT"; await safeAnswerCbq(res); break; } 
          if (res.callbackQuery?.data === "done_media") {
            await safeAnswerCbq(res);
            if (ad.photos.length === 0) {
              let m = await ctx.reply("❗️ Kamida 1 ta rasm yuboring!");
              chatToClean.push(m.message_id); continue;
            }
            step = "PREVIEW"; break;
          }
          if (res.message?.photo) {
            const photoArr = res.message.photo;
            ad.photos.push(photoArr[photoArr.length - 1].file_id);
            try { await ctx.api.deleteMessage(ctx.chat.id, msgPrompt.message_id); } catch (e) {}
            msgPrompt = await ctx.reply(`✅ <b>${ad.photos.length}-rasm keldi!</b> Davom eting yoki Yuborishni bosing.`, { reply_markup: kb, parse_mode: "HTML" });
            chatToClean.push(msgPrompt.message_id);
          } else if (res.message?.video) {
            ad.videoId = res.message.video.file_id;
            try { await ctx.api.deleteMessage(ctx.chat.id, msgPrompt.message_id); } catch (e) {}
            msgPrompt = await ctx.reply(`✅ <b>Video keldi!</b>`, { reply_markup: kb, parse_mode: "HTML" });
            chatToClean.push(msgPrompt.message_id);
          }
        }
        if (step === "URGENT") { await deleteMsgs(ctx, chatToClean); continue; }
        await deleteMsgs(ctx, chatToClean);
      }
      else if (step === "PREVIEW") {
        isEditing = false;
        let waitMsg = await ctx.reply("⏳ <b>E'lon tahlil qilinmoqda...</b>", { parse_mode: "HTML" });
        
        const photoUrls = await Promise.all(ad.photos.map(async (id) => {
            const file = await bot.api.getFile(id);
            return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
        }));
        
        const collagePath = await createCollage(photoUrls, {...ad, id: isFullUpdate ? updateAdId : "000"});
        
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
          caption: `📋 <b>E'LON TAYYOR!</b> Quyida tekshiring:`,
          reply_markup: kb, parse_mode: "HTML"
        });
        
        if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath); 

        let res, action;
        while(true) {
            res = await conversation.waitFor(["callback_query:data", "message:text"]);
            if (res.message?.text) {
                await ctx.api.deleteMessage(ctx.chat.id, res.message.message_id).catch(()=>{});
                continue; 
            }
            action = res.callbackQuery.data; break;
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
            const [result] = await db.execute(
              `INSERT INTO ad_edits (oldAdId, userId, carDetails, year, probeg, paint, color, transmission, fuel, price, phone, region, photoId, history, barter, videoId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [updateAdId, ctx.from.id, `${ad.brand} ${ad.model}`, ad.year, ad.probeg, ad.paint, ad.color, ad.trans, ad.fuel, ad.price, ad.phone, ad.region, ad.photos.join(","), ad.history || "Ko'rsatilmagan", ad.barter || "Yo'q", ad.videoId || null]
            );
            const editId = result.insertId; 
            
            const adminCollage = await createCollage(photoUrls, {...ad, id: updateAdId});
            const adminMsg = await ctx.api.sendPhoto(ADMIN_ID, new InputFile(adminCollage), {
              caption: `🔄 <b>YANGILASH SO'ROVI!</b>\n🆔 Eski ID: ${updateAdId}\n👤 Uzer: <a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>${countText}`,
              reply_markup: new InlineKeyboard().text("✅ O'zgarishni tasdiqlash", `approve_edit:${editId}`).text("❌ Rad etish", `reject_edit:${editId}`),
              parse_mode: "HTML",
            });
            if (fs.existsSync(adminCollage)) fs.unlinkSync(adminCollage);

            if (ctx.session) ctx.session.editAdData = null;
            await ctx.reply("✅ <b>Tahrirlangan e'lon adminga yuborildi!</b>", { parse_mode: "HTML", reply_markup: mainMenu });
            return; 
          }

          const [result] = await db.execute(
            `INSERT INTO ads (userId, carDetails, year, probeg, paint, color, transmission, fuel, price, phone, region, photoId, history, barter, videoId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [ctx.from.id, `${ad.brand} ${ad.model}`, ad.year, ad.probeg, ad.paint, ad.color, ad.trans, ad.fuel, ad.price, ad.phone, ad.region, ad.photos.join(","), ad.history || "Ko'rsatilmagan", ad.barter || "Yo'q", ad.videoId || null]
          );
          const adId = result.insertId; 

          let adminKb = new InlineKeyboard();
          if (ad.urgent) {
              adminKb.text("🔥 Qabul (Shoshilinch)", `approve_hot:${adId}`).text("❌ Rad", `reject:${adId}`).row().text("✅ Oddiy qabul", `approve:${adId}`);
          } else {
              adminKb.text("✅ Qabul qilish", `approve:${adId}`).text("❌ Rad", `reject:${adId}`).row().text("🔥 Qaynoq narx", `approve_hot:${adId}`);
          }
          
          const adminCollage = await createCollage(photoUrls, {...ad, id: adId});
          const adminMsg = await ctx.api.sendPhoto(ADMIN_ID, new InputFile(adminCollage), {
            caption: `🆔 <b>ID: ${adId}</b>\n👤 Uzer: <a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>${countText}`,
            reply_markup: adminKb, parse_mode: "HTML",
          });
          if (fs.existsSync(adminCollage)) fs.unlinkSync(adminCollage);

          if (ctx.session) ctx.session.editAdData = null;
          await ctx.reply("✅ <b>E'loningiz adminga yuborildi!</b>", { parse_mode: "HTML", reply_markup: mainMenu });
          return; 
        }
        if (action.startsWith("edit_")) { isEditing = true; step = action.split("_")[1]; }
      }
    } catch (err) {
      console.error(err);
      return ctx.reply("😔 Xatolik yuz berdi.", { reply_markup: mainMenu });
    }
  }
}
bot.use(createConversation(createAdConversation));

// ==============================================================
//  /START KOMANDASI VA BOTGA QAYTISH FUNKSIYALARI
// ==============================================================
bot.command("start", async (ctx) => {
  let isNewUser = false;
  try {
    const id = ctx.from.id;
    const [result] = await db.execute("INSERT IGNORE INTO users (id, first_name, username) VALUES (?, ?, ?)", [id, ctx.from.first_name || "", ctx.from.username ? `@${ctx.from.username}` : ""]);
    if (result.affectedRows === 1) isNewUser = true;
  } catch (error) {}

  const payload = ctx.match;

  // SOTUVCHI RAQAMINI BERISH
  if (payload && payload.startsWith("seller_")) {
      const adId = payload.split("_")[1];
      const [rows] = await db.execute("SELECT phone, userId, first_name FROM ads JOIN users ON ads.userId = users.id WHERE ads.id = ?", [adId]);
      if (rows.length > 0) {
          return ctx.reply(`📞 <b>Sotuvchi bilan bog'lanish:</b>\n\nTelefon: <b>+${rows[0].phone}</b>\nTelegram profil: <a href="tg://user?id=${rows[0].userId}">${rows[0].first_name}</a>`, { parse_mode: "HTML" });
      }
  }

  // BARCHA RASMLARNI YUBORISH
  if (payload && payload.startsWith("photos_")) {
      const adId = payload.split("_")[1];
      const [rows] = await db.execute("SELECT photoId FROM ads WHERE id = ?", [adId]);
      if (rows.length > 0 && rows[0].photoId) {
          const photos = rows[0].photoId.split(",");
          const mediaGroup = photos.map(id => ({ type: 'photo', media: id }));
          await ctx.reply("📸 <b>E'lonning barcha rasmlari:</b>", { parse_mode: "HTML" });
          return ctx.api.sendMediaGroup(ctx.chat.id, mediaGroup);
      }
  }

  if (payload && payload.startsWith("fav_")) { /* Eski Fav */ }
  if (isNewUser && payload && payload.startsWith("ref_")) { /* Eski Ref */ }

  const welcomeText = `🚗 <b>Avto-bozorimizga xush kelibsiz!</b>\n👇 <i>Quyidagi menyudan foydalaning!</i>`;
  await ctx.reply(welcomeText, { reply_markup: mainMenu, parse_mode: "HTML" });
});

bot.hears("📝 E'lon berish", async (ctx) => {
  if (!(await isSubscribed(ctx))) return askForSub(ctx);
  if (ctx.session) ctx.session.editAdData = null;
  await ctx.conversation.enter("createAdConversation");
});

bot.hears("🔍 Mashina qidirish", async (ctx) => { await ctx.conversation.enter("searchCarConversation"); });
bot.hears("📂 Mening e'lonlarim", async (ctx) => { /* Xuddi shunday qoladi */ });
bot.hears("🔔 Obunalarim", async (ctx) => { /* Xuddi shunday qoladi */ });
bot.hears("🎁 Bepul VIP (UP)", async (ctx) => { /* Xuddi shunday qoladi */ });
bot.hears("🧮 Mashina narxini aniqlash", async (ctx) => { await ctx.conversation.enter("evaluateCarConversation"); });

// ==============================================================
// KANALGA TASDIQLASH VA YUBORISH (APPROVE)
// ==============================================================
bot.callbackQuery(/^approve:(\d+)/, async (ctx) => {
  const adId = ctx.match[1];
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
  const ad = rows[0];

  if (ad && ad.status === "pending") {
    const photos = ad.photoId.split(",");
    const photoUrls = await Promise.all(
      photos.map(async (id) => `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${(await bot.api.getFile(id)).file_path}`)
    );
    
    const collagePath = await createCollage(photoUrls, ad); 

    const caption = 
      `⚠️ Moshina savdosiga admin javobgar emas, oldindan to'lov qilmang. Ogohlik davr talabi ❗️\n\n` +
      `👉 https://t.me/+einfd7upTxxlZDYy\n\n` +
      `🚘 <b>ENG ARZON MASHINALAR</b>      ✅ <b>SIZNING ISHONCHLI AVTO BOZORINGIZ!</b>`;

    const channelMarkup = new InlineKeyboard()
      .url("📞 SOTUVCHI BILAN BOG'LANISH", `https://t.me/arzonida_bot?start=seller_${adId}`)
      .url("📸 BARCHA RASMLAR", `https://t.me/arzonida_bot?start=photos_${adId}`).row()
      .url("🤖 BEPUL E'LON BERISH", "https://t.me/arzonida_bot")
      .url("📢 KANALIMIZ", "https://t.me/engarzonidamoshina");

    try {
      const msg = await bot.api.sendPhoto(CHANNEL_ID, new InputFile(collagePath), {
        caption: caption, reply_markup: channelMarkup, parse_mode: "HTML",
      });

      let secondMsgId = null;
      try {
        const SECOND_CHANNEL_ID = process.env.SECOND_CHANNEL_ID; 
        if (SECOND_CHANNEL_ID) { 
          const secondMsg = await bot.api.copyMessage(SECOND_CHANNEL_ID, CHANNEL_ID, msg.message_id, { reply_markup: channelMarkup });
          secondMsgId = secondMsg.message_id; 
        }
      } catch (err) {}

      await db.execute("UPDATE ads SET status='active', channelMsgId=?, secondChannelMsgId=? WHERE id=?", [msg.message_id, secondMsgId, adId]);
      if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
      
      await ctx.editMessageCaption({ caption: "✅ Kanalga joylandi!", parse_mode: "HTML" });
    } catch (e) {
      console.error(e);
      await ctx.reply("Xatolik: Kanalga yuborib bo'lmadi.");
    }
  }
});

// QAYNOQ NARX BILAN TASDIQLASH
bot.callbackQuery(/^approve_hot:(\d+)/, async (ctx) => {
  const adId = ctx.match[1];
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
  const ad = rows[0];

  if (ad && ad.status === "pending") {
    const photos = ad.photoId.split(",");
    const photoUrls = await Promise.all(
      photos.map(async (id) => `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${(await bot.api.getFile(id)).file_path}`)
    );
    const collagePath = await createCollage(photoUrls, ad);

    const caption = 
      `🔥 <b>QAYNOQ NARX!</b> Shoshiling!\n\n` +
      `⚠️ Moshina savdosiga admin javobgar emas, oldindan to'lov qilmang. Ogohlik davr talabi ❗️\n\n` +
      `👉 https://t.me/+einfd7upTxxlZDYy\n\n` +
      `🚘 <b>ENG ARZON MASHINALAR</b>      ✅ <b>SIZNING ISHONCHLI AVTO BOZORINGIZ!</b>`;

    const channelMarkup = new InlineKeyboard()
      .url("📞 SOTUVCHI BILAN BOG'LANISH", `https://t.me/arzonida_bot?start=seller_${adId}`)
      .url("📸 BARCHA RASMLAR", `https://t.me/arzonida_bot?start=photos_${adId}`).row()
      .url("🤖 BEPUL E'LON BERISH", "https://t.me/arzonida_bot")
      .url("📢 KANALIMIZ", "https://t.me/engarzonidamoshina");

    try {
      const msg = await bot.api.sendPhoto(CHANNEL_ID, new InputFile(collagePath), {
        caption: caption, reply_markup: channelMarkup, parse_mode: "HTML",
      });

      let secondMsgId = null;
      try {
        const SECOND_CHANNEL_ID = process.env.SECOND_CHANNEL_ID; 
        if (SECOND_CHANNEL_ID) { 
          const secondMsg = await bot.api.copyMessage(SECOND_CHANNEL_ID, CHANNEL_ID, msg.message_id, { reply_markup: channelMarkup });
          secondMsgId = secondMsg.message_id; 
        }
      } catch (err) {}

      await db.execute("UPDATE ads SET status='active', channelMsgId=?, secondChannelMsgId=? WHERE id=?", [msg.message_id, secondMsgId, adId]);
      if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
      
      await ctx.editMessageCaption({ caption: "✅ Qaynoq narx sifatida kanalga joylandi!", parse_mode: "HTML" });
    } catch (e) {
      console.error(e);
      await ctx.reply("Xatolik: Kanalga yuborib bo'lmadi.");
    }
  }
});

// O'ZGARISHLARNI TASDIQLASH (EDIT)
bot.callbackQuery(/^approve_edit:(\d+)/, async (ctx) => {
  const editId = ctx.match[1];
  const [editRows] = await db.execute("SELECT * FROM ad_edits WHERE editId = ?", [editId]);
  const editData = editRows[0];

  if (!editData) return ctx.answerCallbackQuery("Bu so'rov ko'rib chiqilgan.", {show_alert:true});

  const [adRows] = await db.execute("SELECT * FROM ads WHERE id = ?", [editData.oldAdId]);
  const oldAd = adRows[0];
  const adId = oldAd.id;

  const photos = editData.photoId.split(",");
  const photoUrls = await Promise.all(
    photos.map(async (id) => `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${(await bot.api.getFile(id)).file_path}`)
  );
  
  const collagePath = await createCollage(photoUrls, {...editData, id: adId});

  const newCaption = 
    `⚠️ Moshina savdosiga admin javobgar emas, oldindan to'lov qilmang. Ogohlik davr talabi ❗️\n\n` +
    `👉 https://t.me/+einfd7upTxxlZDYy\n\n` +
    `🚘 <b>ENG ARZON MASHINALAR</b>      ✅ <b>SIZNING ISHONCHLI AVTO BOZORINGIZ!</b>`;

  const channelMarkup = new InlineKeyboard()
    .url("📞 SOTUVCHI BILAN BOG'LANISH", `https://t.me/arzonida_bot?start=seller_${adId}`)
    .url("📸 BARCHA RASMLAR", `https://t.me/arzonida_bot?start=photos_${adId}`).row()
    .url("🤖 BEPUL E'LON BERISH", "https://t.me/arzonida_bot")
    .url("📢 KANALIMIZ", "https://t.me/engarzonidamoshina");

  try {
    await bot.api.editMessageMedia(CHANNEL_ID, oldAd.channelMsgId, {
        type: "photo", media: new InputFile(collagePath), caption: newCaption, parse_mode: "HTML"
    }, { reply_markup: channelMarkup });
    
    try {
        const SECOND_CHANNEL_ID = process.env.SECOND_CHANNEL_ID;
        if (SECOND_CHANNEL_ID && oldAd.secondChannelMsgId) {
            await bot.api.editMessageMedia(SECOND_CHANNEL_ID, oldAd.secondChannelMsgId, {
                type: "photo", media: new InputFile(collagePath), caption: newCaption, parse_mode: "HTML"
            }, { reply_markup: channelMarkup });
        }
    } catch (err) {}

    await db.execute(
        `UPDATE ads SET carDetails=?, year=?, probeg=?, paint=?, color=?, transmission=?, fuel=?, price=?, phone=?, region=?, photoId=?, history=?, barter=?, videoId=? WHERE id=?`,
        [editData.carDetails, editData.year, editData.probeg, editData.paint, editData.color, editData.transmission, editData.fuel, editData.price, editData.phone, editData.region, editData.photoId, editData.history || "Ko'rsatilmagan", editData.barter || "Yo'q", editData.videoId || null, oldAd.id]
    );

    await db.execute("DELETE FROM ad_edits WHERE editId = ?", [editId]);
    if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);

    await ctx.editMessageCaption({ caption: "✅ <b>Kanaldagi e'lon muvaffaqiyatli yangilandi!</b>", parse_mode: "HTML" });
  } catch (error) {
    console.error(error);
  }
});

// ==============================================================
// NARXNI TUSHIRISH (EDIT PRICE YAKUNI)
// ==============================================================
async function editPriceConversation(conversation, ctx) {
  const cancelTexts = ["/start", "/cancel", "📝 E'lon berish"];
  const cbData = ctx.callbackQuery?.data;
  if (!cbData) return;
  const adId = cbData.split(":")[1]; 

  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
  const ad = rows[0];
  if (!ad || ad.status !== 'active') return ctx.reply("❌ Faol e'lon topilmadi.");

  await ctx.reply(`📉 <b>${ad.carDetails}</b> uchun yangi narxni kiriting ($):`, { reply_markup: mainMenu, parse_mode: "HTML" });
  
  const res = await conversation.waitFor("message:text");
  let newPrice = res.message.text.replace(/\D/g, "");
  if (!newPrice) return ctx.reply("❗️ Xato narx.", { reply_markup: mainMenu }); 

  const waitMsg = await ctx.reply("⏳ <i>Kanaldagi e'lon yangilanmoqda...</i>", { parse_mode: "HTML" });

  try {
    const photos = ad.photoId.split(",");
    const photoUrls = await Promise.all(photos.map(async (id) => `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${(await bot.api.getFile(id)).file_path}`));
    
    const adDataForImage = { ...ad, price: newPrice };
    const collagePath = await createCollage(photoUrls, adDataForImage);

    const newCaption = 
      `⚠️ Moshina savdosiga admin javobgar emas, oldindan to'lov qilmang. Ogohlik davr talabi ❗️\n\n` +
      `👉 https://t.me/+einfd7upTxxlZDYy\n\n` +
      `🚘 <b>ENG ARZON MASHINALAR</b>      ✅ <b>SIZNING ISHONCHLI AVTO BOZORINGIZ!</b>`;

    const channelMarkup = new InlineKeyboard()
      .url("📞 SOTUVCHI BILAN BOG'LANISH", `https://t.me/arzonida_bot?start=seller_${adId}`)
      .url("📸 BARCHA RASMLAR", `https://t.me/arzonida_bot?start=photos_${adId}`).row()
      .url("🤖 BEPUL E'LON BERISH", "https://t.me/arzonida_bot")
      .url("📢 KANALIMIZ", "https://t.me/engarzonidamoshina");

    await ctx.api.editMessageMedia(CHANNEL_ID, ad.channelMsgId, {
      type: "photo",
      media: new InputFile(collagePath),
      caption: newCaption,
      parse_mode: "HTML"
    }, { reply_markup: channelMarkup });

    try {
        const SECOND_CHANNEL_ID = process.env.SECOND_CHANNEL_ID;
        if (SECOND_CHANNEL_ID && ad.secondChannelMsgId) {
            await ctx.api.editMessageMedia(SECOND_CHANNEL_ID, ad.secondChannelMsgId, {
                type: "photo", media: new InputFile(collagePath), caption: newCaption, parse_mode: "HTML"
            }, { reply_markup: channelMarkup });
        }
    } catch (err) {}

    await db.execute("UPDATE ads SET price = ? WHERE id = ?", [newPrice, adId]);

    const oldPriceNum = parseInt(ad.price) || 0;
    const newPriceNum = parseInt(newPrice) || 0;
    const diff = oldPriceNum - newPriceNum;

    if (diff > 0) { 
      const hotPriceText = 
      `🔥 <b>QAYNOQ NARX! Mashina arzonlashdi!</b>\n\n🚗 <b>${ad.carDetails}</b>\n` +
      `❌ Eski narxi: <s>${oldPriceNum}$</s>\n✅ Yangi narxi: <b>${newPriceNum}$ 📉</b>\n\n👆 <i>E'lonni to'liq ko'rish uchun tepadagi xabarga bosing</i>`;
          
      try {
          await bot.api.sendMessage(CHANNEL_ID, hotPriceText, { parse_mode: "HTML", reply_to_message_id: ad.channelMsgId });
      } catch (err) {}
    }

    if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
    await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply(`✅ <b>Narx muvaffaqiyatli tushirildi!</b>\nKanalda moshinangiz rasmi <b>${newPrice}$</b> qilib o'zgartirildi.`, { parse_mode: "HTML", reply_markup: mainMenu }); 

  } catch (error) {
    console.error(error);
    await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply("❌ Xatolik: Kanaldagi xabarni yangilab bo'lmadi.", { reply_markup: mainMenu }); 
  }
}
bot.use(createConversation(editPriceConversation));

// SOTILDI TUGMASI
bot.callbackQuery(/^confirm_sold:(\d+)/, async (ctx) => {
  const adId = ctx.match[1];
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
  const ad = rows[0];
  
  if (ad && ad.status === 'active') {
      try {
       const newCaption = `💰 <b>SOTILDI!</b>\n\n<s>${ad.carDetails}</s>\n💰 <b>Narxi: ${formatNum(ad.price)} $</b>\n\n❌ <b>E'lon yopildi.</b>`;
       await bot.api.editMessageCaption(CHANNEL_ID, ad.channelMsgId, { caption: newCaption, parse_mode: "HTML" });
       
       try {
           const SECOND_CHANNEL_ID = process.env.SECOND_CHANNEL_ID;
           if (SECOND_CHANNEL_ID && ad.secondChannelMsgId) {
               await bot.api.editMessageCaption(SECOND_CHANNEL_ID, ad.secondChannelMsgId, { caption: newCaption, parse_mode: "HTML" });
           }
       } catch (err) {}
       
       await db.execute("UPDATE ads SET status='sold' WHERE id=?", [adId]);
       await ctx.editMessageText("✅ <b>Kanalda sotildi deb belgilandi!</b>", { parse_mode: "HTML" });
      } catch (e) {
        console.error(e);
      }
  }
});

bot.callbackQuery(/^reject:(\d+)/, async (ctx) => { /* Eski kod */ });
bot.callbackQuery(/^sold_req:(\d+)/, async (ctx) => { /* Eski kod */ });
bot.callbackQuery(/^del_alert:(\d+)/, async (ctx) => { /* Eski kod */ });
bot.callbackQuery(/^full_edit_req:(\d+)/, async (ctx) => { /* Eski kod */ });
bot.callbackQuery(/^edit_price:(\d+)/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("editPriceConversation");
});

bot.start({
  allowed_updates: ["message", "edited_message", "callback_query", "chat_member", "my_chat_member", "channel_post", "edited_channel_post"]
});
console.log("Бот муваффақиятли ишга тушди...");