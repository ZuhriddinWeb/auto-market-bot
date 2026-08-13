require("dotenv").config();
const { Bot, session, InlineKeyboard, Keyboard, InputFile } = require("grammy");
const { conversations, createConversation } = require("@grammyjs/conversations");
const db = require("./database"); // MySQL pool
const sharp = require("sharp");
const axios = require("axios");
const fs = require("fs");
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

      "ALTER TABLE ads ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP", // <--- ШУ ҚАТОР ҚЎШИЛДИ
      "ALTER TABLE ads ADD COLUMN history TEXT DEFAULT NULL",
      "ALTER TABLE ads ADD COLUMN barter VARCHAR(255) DEFAULT NULL",
    ];
    for (const q of alterQueries) {
      try { await db.execute(q); } catch (e) {} // Устун бор бўлса, инкор қилади
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
  .text("🧮 Mashina narxini aniqlash").resized();

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

async function createCollage(photoUrls) {
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

  const collagePath = path.join(__dirname, `collage_${Date.now()}.jpg`);
  
  await sharp({
    create: { width: canvasWidth, height: canvasHeight, channels: 3, background: { r: 255, g: 255, b: 255 } },
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
/**
 * ✅ АДМИН УЧУН БЛОКЛАШ ТИЗИМИ
 */
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
    const channelMarkup = new InlineKeyboard()
      .url("👤 KANAL ADMINI", "https://t.me/uzdev75").row()
      .url("❤️ Saqlash (Narx tushsa bilish)", `https://t.me/arzonida_bot?start=fav_${ad.id}`).row()
      .url("🤖 BEPUL E'LON BERISH", "https://t.me/arzonida_bot")
      .url("📢 KANALIMIZ", "https://t.me/engarzonidamoshina");

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

      const caption =
        `🆔 ID: ${ad.id}\n🚗 Moshina: ${ad.carDetails}\n📅 Yili: ${ad.year}\n👣 Probeg: ${ad.probeg}\n` +
        `💎 Kraskasi: ${ad.paint}\n🎨 Rangi: ${ad.color}\n✅ Karobka: ${ad.transmission}\n` +
        `⛽ Yoqilg'i: ${ad.fuel}\n💰 Narxi: ${ad.price}$\n☎️ +${ad.phone}\n🚩 #${ad.region.replace(/\s+/g, "_")}\n\n` +
        `⚠️ Moshina savdosiga admin javobgar emas, oldindan to'lov qilmang. Ogohlik davr talabi ❗\n\n👉 https://t.me/engarzonidamoshina`;

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

bot.callbackQuery("admin_close", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.deleteMessage();
});

bot.callbackQuery("admin_stats", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.answerCallbackQuery("⏳ Statistika yuklanmoqda...");
  
  const [[userCount]] = await db.execute("SELECT COUNT(*) as count FROM users");
  const [[activeAds]] = await db.execute("SELECT COUNT(*) as count FROM ads WHERE status = 'active'");
  const [[soldAds]] = await db.execute("SELECT COUNT(*) as count FROM ads WHERE status = 'sold'");
  const [[pendingAds]] = await db.execute("SELECT COUNT(*) as count FROM ads WHERE status = 'pending'");

  const text = `📊 <b>BOT STATISTIKASI</b>\n\n` +
    `👥 Umumiy foydalanuvchilar: <b>${userCount.count}</b> ta\n` +
    `🟢 Faol e'lonlar (Kanalda): <b>${activeAds.count}</b> ta\n` +
    `💰 Sotilgan moshinalar: <b>${soldAds.count}</b> ta\n` +
    `⏳ Tasdiq kutayotganlar: <b>${pendingAds.count}</b> ta\n`;

try {
      await ctx.editMessageText(text, { reply_markup: adminMenu, parse_mode: "HTML" });
  } catch(e) {}
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

      let caption = `🆔 <b>ID: ${ad.id}</b>\n🚗 Moshina: ${ad.carDetails}\n📅 Yili: ${ad.year}\n👣 Probeg: ${ad.probeg}\n💎 Kraskasi: ${ad.paint}\n🎨 Rangi: ${ad.color}\n✅ Karobka: ${ad.transmission}\n⛽ Yoqilg'i: ${ad.fuel}\n`;
      if (ad.history && ad.history !== "Ko'rsatilmagan") caption += `🛠 Tarixi: ${ad.history}\n`;
      if (ad.barter && ad.barter !== "Yo'q") caption += `🔄 Barter: ${ad.barter}\n`;
      caption += `💰 Narxi: ${ad.price}$\n☎️ +${ad.phone}\n🚩 #${ad.region.replace(/\s+/g, "_")}\n\n👤 Foydalanuvchi: <a href="tg://user?id=${ad.userId}">Profil</a>`;

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

      let caption = `🔄 <b>E'LONNI YANGILASH SO'ROVI!</b>\n\n🆔 Eski ID: ${editData.oldAdId}\n🚗 Moshina: ${editData.carDetails}\n📅 Yili: ${editData.year}\n👣 Probeg: ${editData.probeg}\n💎 Kraskasi: ${editData.paint}\n🎨 Rangi: ${editData.color}\n✅ Karobka: ${editData.transmission}\n⛽ Yoqilg'i: ${editData.fuel}\n`;
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
async function searchCarConversation(conversation, ctx) {
  const cancelTexts = ["/start", "/cancel", "📝 E'lon berish", "🔍 Mashina qidirish", "📂 Mening e'lonlarim"];
  
  await ctx.reply("🔍 <b>Qaysi moshinani qidiryapsiz?</b>\n<i>(Masalan: Cobalt yoki Gentra)</i>\n\nBekor qilish uchun pastdagi menyudan foydalaning.", { reply_markup: mainMenu, parse_mode: "HTML" });
  const qRes = await conversation.waitFor("message:text");
  if(cancelTexts.includes(qRes.message.text)) return ctx.reply("❌ Qidiruv bekor qilindi.", {reply_markup: mainMenu});
  const query = qRes.message.text.toLowerCase();

  await ctx.reply("💰 <b>Maksimal narx qancha bo'lsin? ($)</b>\n<i>(Masalan: 12000)</i>\n\nBekor qilish uchun pastdagi menyudan foydalaning.", { reply_markup: mainMenu, parse_mode: "HTML" });
  const pRes = await conversation.waitFor("message:text");
  if(cancelTexts.includes(pRes.message.text)) return ctx.reply("❌ Qidiruv bekor qilindi.", {reply_markup: mainMenu});
  const maxPrice = parseInt(pRes.message.text.replace(/\D/g, "")) || 999999;

  const waitMsg = await ctx.reply("⏳ <i>Qidirilmoqda...</i>", {parse_mode: "HTML"});

  const [ads] = await db.execute("SELECT * FROM ads WHERE status = 'active'");
  const filtered = ads.filter(ad => {
      const matchQuery = ad.carDetails.toLowerCase().includes(query);
      const price = parseInt(ad.price.replace(/\D/g,"")) || 0;
      return matchQuery && price <= maxPrice;
  });

  await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);

  if(filtered.length === 0) {
     await ctx.reply(`📭 <b>${maxPrice}$</b> gacha bo'lgan <b>${query}</b> topilmadi.`, {parse_mode: "HTML", reply_markup: mainMenu});
  } else {
     await ctx.reply(`✅ <b>Topildi: ${filtered.length} ta e'lon!</b>\nEng so'nggi e'lonlar:`, {parse_mode: "HTML", reply_markup: mainMenu});

     const resultsToSend = filtered.slice(-3);
     for (const ad of resultsToSend) {
         try {
            if (ad.channelMsgId) {
               await ctx.api.copyMessage(ctx.chat.id, CHANNEL_ID, ad.channelMsgId);
            } else {
               const caption = `🚗 <b>${ad.carDetails}</b>\n📅 Yili: ${ad.year}\n👣 Probeg: ${ad.probeg}\n💰 Narxi: ${ad.price}$\n☎️ Tel: +${ad.phone}`;
               const photos = ad.photoId.split(",");
               await ctx.replyWithPhoto(photos[0], {caption: caption, parse_mode: "HTML"});
            }
         } catch(e) {
            console.error("Qidiruv xabarini yuborishda xatolik:", e.message);
         }
     }
  }

  const alertKb = new InlineKeyboard().text("🔔 Qidiruvga obuna bo'lish", `al_sub:${query.substring(0, 20)}:${maxPrice}`);
  await ctx.reply(`<i>Agar shunday moshinalar sotuvga chiqqanda birinchilardan bo'lib xabardor bo'lishni istasangiz, pastdagi tugmani bosing:</i>`, { parse_mode: "HTML", reply_markup: alertKb });
}
bot.use(createConversation(searchCarConversation));

/**
 * ✅ ЭЪЛОН ЯРАТИШ ЖАРАЁНИ
 */
async function createAdConversation(conversation, ctx) {
  const cancelTexts = ["/start", "/cancel", "📝 E'lon berish", "🔍 Mashina qidirish", "📂 Mening e'lonlarim"];
  const ad = { photos: [], urgent: false }; // urgent (shoshilinch) holati qo'shildi
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
      ad.urgent = false; // Tahrirlashda avvaliga false bo'ladi
      
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
    "Zeekr": ["001", "007", "009", "X"],
    "Li Auto": ["L7", "L8", "L9"],
    "Tesla": ["Model 3", "Model Y", "Model S"],
    "Boshqa": [],
  };

  while (true) {
    let msgPrompt;
    try {
      if (step === "BRAND") {
        const kb = new InlineKeyboard();
        Object.keys(carCatalog).forEach((b, i) => { kb.text(b, `b:${b}`); if ((i + 1) % 3 === 0) kb.row(); });
        kb.row().text("❌ Bekor qilish", "cancel_ad");
        msgPrompt = await ctx.reply("🚗 <b>Avtomobil markasini tanlang:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean); return ctx.reply("❌ <b>Jarayon to'xtatildi.</b> Bosh menyudasiz.", { reply_markup: mainMenu, parse_mode: "HTML" }); }
        
        if (res.callbackQuery?.data === "cancel_ad") break;
        ad.brand = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "MODEL";
      }

      else if (step === "MODEL") {
        const kb = new InlineKeyboard();
        if (carCatalog[ad.brand] && carCatalog[ad.brand].length > 0) {
          carCatalog[ad.brand].forEach((m, i) => { kb.text(m, `m:${m}`); if ((i + 1) % 3 === 0) kb.row(); });
        }
        kb.row().text("🔙 Orqaga", "back_BRAND").text("❌ Bekor qilish", "cancel_ad");
        msgPrompt = await ctx.reply(`🚙 <b>${ad.brand}</b> modelini tanlang yoki yozing:`, { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean); return ctx.reply("❌ <b>Jarayon to'xtatildi.</b> Bosh menyudasiz.", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_BRAND") { step = "BRAND"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.model = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
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
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean); return ctx.reply("❌ <b>Jarayon to'xtatildi.</b> Bosh menyudasiz.", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_MODEL") { step = "MODEL"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.year = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text.replace(/\D/g, "");
        if (!ad.year || ad.year.length < 4) { await ctx.reply("❗️ Xato yil kiritildi."); continue; }
        
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "PROBEG";
      }

      else if (step === "PROBEG") {
        const kb = new InlineKeyboard().text("Salon (0 km)", "pr:Salon").row().text("🔙 Orqaga", "back_YEAR").text("❌ Bekor", "cancel_ad");
        msgPrompt = await ctx.reply("👣 <b>Probegini kiriting (masalan: 35000):</b>\n<i>Agar moshina yangi bo'lsa 'Salon' ni tanlang.</i>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean); return ctx.reply("❌ <b>Jarayon to'xtatildi.</b> Bosh menyudasiz.", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_YEAR") { step = "YEAR"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.probeg = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "PAINT";
      }

      else if (step === "PAINT") {
        const kb = new InlineKeyboard().text("Toza", "p:Toza").text("Petno", "p:Petno").text("Bor", "p:Bor").row().text("🔙 Orqaga", "back_PROBEG").text("❌ Bekor", "cancel_ad");
        msgPrompt = await ctx.reply("💎 <b>Kraskasi holatini tanlang yoki yozing:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean); return ctx.reply("❌ <b>Jarayon to'xtatildi.</b> Bosh menyudasiz.", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_PROBEG") { step = "PROBEG"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.paint = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "COLOR";
      }

      else if (step === "COLOR") {
        const kb = new InlineKeyboard().text("Oq", "c:Oq").text("Qora", "c:Qora").text("Mokriy asfalt", "c:Mokriy asfalt").row().text("Ko'k", "c:Ko'k").text("Qizil", "c:Qizil").text("Kumushrang (Stalnoy)", "c:Kumushrang").row().text("🔙 Orqaga", "back_PAINT").text("❌ Bekor", "cancel_ad");
        msgPrompt = await ctx.reply("🎨 <b>Moshina rangini tanlang yoki yozing:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean); return ctx.reply("❌ <b>Jarayon to'xtatildi.</b> Bosh menyudasiz.", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_PAINT") { step = "PAINT"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.color = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "TRANS";
      }

      else if (step === "TRANS") {
        const kb = new InlineKeyboard().text("Mexanika", "t:Mexanika").text("Avtomat", "t:Avtomat").row().text("Robot", "t:Robot").text("Variator", "t:Variator").row().text("🔙 Orqaga", "back_COLOR").text("❌ Bekor", "cancel_ad");
        msgPrompt = await ctx.reply("⚙️ <b>Korobka turini tanlang:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean); return ctx.reply("❌ <b>Jarayon to'xtatildi.</b> Bosh menyudasiz.", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_COLOR") { step = "COLOR"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.trans = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "FUEL";
      }

      else if (step === "FUEL") {
        const kb = new InlineKeyboard().text("Benzin", "f:Benzin").text("Benzin+Metan", "f:Benzin+Metan").row().text("Benzin+Propan", "f:Benzin+Propan").text("Dizel", "f:Dizel").row().text("Elektr", "f:Elektr").text("Gibrid", "f:Gibrid").row().text("🔙 Orqaga", "back_TRANS").text("❌ Bekor", "cancel_ad");
        msgPrompt = await ctx.reply("⛽ <b>Yoqilg'i turini tanlang:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean); return ctx.reply("❌ <b>Jarayon to'xtatildi.</b> Bosh menyudasiz.", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_TRANS") { step = "TRANS"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.fuel = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
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
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean); return ctx.reply("❌ <b>Jarayon to'xtatildi.</b> Bosh menyudasiz.", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_FUEL") { step = "FUEL"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        let numericPrice = res.message?.text?.replace(/\D/g, "");
        if (!numericPrice) { await ctx.reply("❗️ Iltimos, faqat raqam kiriting."); continue; }
        
        ad.price = numericPrice;
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
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean); return ctx.reply("❌ <b>Jarayon to'xtatildi.</b> Bosh menyudasiz.", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_PRICE") { step = "PRICE"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        let phoneText = res.message?.contact ? res.message.contact.phone_number : res.message?.text;
        let numericPhone = phoneText?.replace(/\D/g, "");
        if (!numericPhone || numericPhone.length < 7) { await ctx.reply("❗️ To'g'ri raqam kiriting."); continue; }
        
        ad.phone = numericPhone.startsWith("998") ? numericPhone : `998${numericPhone}`;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "REGION";
      }

      else if (step === "REGION") {
        const regions = ["Toshkent sh.", "Toshkent vil.", "Sirdaryo", "Jizzax", "Samarqand", "Farg'ona", "Namangan", "Andijon", "Qashqadaryo", "Surxondaryo", "Buxoro", "Navoiy", "Xorazm", "Qoraqalpog'iston"];
        const kb = new InlineKeyboard();
        regions.forEach((r, i) => { kb.text(r, `r:${r}`); if ((i + 1) % 2 === 0) kb.row(); });
        kb.row().text("🔙 Orqaga", "back_PHONE").text("❌ Bekor", "cancel_ad");
        msgPrompt = await ctx.reply("🚩 <b>Viloyatni tanlang:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean); return ctx.reply("❌ <b>Jarayon to'xtatildi.</b> Bosh menyudasiz.", { reply_markup: mainMenu, parse_mode: "HTML" }); }

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
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean); return ctx.reply("❌ <b>Jarayon to'xtatildi.</b> Bosh menyudasiz.", { reply_markup: mainMenu, parse_mode: "HTML" }); }

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
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean); return ctx.reply("❌ <b>Jarayon to'xtatildi.</b> Bosh menyudasiz.", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_HISTORY") { step = "HISTORY"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.barter = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        
        // ================= O'ZGARISH: URGENT qadamiga o'tamiz =================
        step = isEditing ? "PREVIEW" : "URGENT"; 
      }

      // ================= YANGI QADAM: URGENT (SHOSHILINCH) =================
      else if (step === "URGENT") {
        const kb = new InlineKeyboard()
          .text("🚨 Ha, shoshilinch", "urg:yes")
          .text("Oddiy sotuv", "urg:no").row()
          .text("🔙 Orqaga", "back_BARTER").text("❌ Bekor", "cancel_ad");
          
        msgPrompt = await ctx.reply("⚡️ <b>Sotuv shoshilinchmi?</b>\n\n<i>Agar moshinani bozor narxidan arzonroq va tezroq sotmoqchi bo'lsangiz «Ha, shoshilinch» ni tanlang. E'loningiz kanalga maxsus maqomda joylanadi!</i>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        
        if (res.message?.text && cancelTexts.includes(res.message.text)) { await deleteMsgs(ctx, chatToClean); return ctx.reply("❌ <b>Jarayon to'xtatildi.</b> Bosh menyudasiz.", { reply_markup: mainMenu, parse_mode: "HTML" }); }

        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_BARTER") { step = "BARTER"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.urgent = res.callbackQuery?.data === "urg:yes";
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "MEDIA";
      }
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
                  return ctx.reply("❌ <b>Jarayon to'xtatildi.</b> Bosh menyudasiz.", { reply_markup: mainMenu, parse_mode: "HTML" });
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
        
        const numericPrice = parseInt(ad.price) || 0;
        let priceBadge = "";
        
        try {
            const [avgRows] = await db.execute("SELECT AVG(CAST(price AS UNSIGNED)) as avgPrice FROM ads WHERE carDetails LIKE ? AND status = 'active'", [`%${ad.model}%`]);
            const avgPrice = avgRows[0].avgPrice;
            
            if (avgPrice && numericPrice < avgPrice * 0.95) { 
                priceBadge = " 🔥 (Qaynoq narx)";
            } else if (avgPrice && numericPrice > avgPrice * 1.1) {
                priceBadge = " 📈 (Bozordan biroz qimmat)";
            }
        } catch (e) {
            console.error("Narx analitikasi xatosi:", e);
        }

        const photoUrls = await Promise.all(ad.photos.map(async (id) => {
            const file = await bot.api.getFile(id);
            return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
        }));
        const collagePath = await createCollage(photoUrls);
        
        // ================= YANGI: Agar shoshilinch bo'lsa PREVIEW da ko'rsatiladi =================
        let caption = "";
        if (ad.urgent) {
            caption += `🚨 <b>SHOSHILINCH SOTILADI!</b>\n\n`;
        }
        caption += 
          `🚗 <b>Moshina:</b> ${ad.brand} ${ad.model}\n` +
          `📅 <b>Yili:</b> ${ad.year}\n👣 <b>Probeg:</b> ${ad.probeg}\n` +
          `💎 <b>Kraska:</b> ${ad.paint}\n🎨 <b>Rangi:</b> ${ad.color}\n` +
          `⚙️ <b>Korobka:</b> ${ad.trans}\n⛽ <b>Yoqilg'i:</b> ${ad.fuel}\n`;

        if (ad.history && ad.history !== "Ko'rsatilmagan") caption += `🛠 <b>Tarixi:</b> ${ad.history}\n`;
        if (ad.barter && ad.barter !== "Yo'q") caption += `🔄 <b>Barter:</b> ${ad.barter}\n`;

        caption += `💰 <b>Narxi:</b> ${ad.price}$${priceBadge}\n☎️ <b>Tel:</b> +${ad.phone}\n🚩 <b>Viloyat:</b> ${ad.region}`;
        if (ad.videoId) caption += `\n🎥 <i>(Ushbu e'londa video-obzor mavjud!)</i>`;

        // ================= O'ZGARISH: edit_URGENT tugmasi qo'shildi =================
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
                    return ctx.reply("❌ <b>Jarayon to'xtatildi.</b> Bosh menyudasiz.", { reply_markup: mainMenu, parse_mode: "HTML" });
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
            let urgentTextEdit = ad.urgent ? "\n\n🚨 <b>Diqqat: Foydalanuvchi buni SHOSHILINCH sotmoqchi!</b>" : "";
            
            const [result] = await db.execute(
              `INSERT INTO ad_edits (oldAdId, userId, carDetails, year, probeg, paint, color, transmission, fuel, price, phone, region, photoId, history, barter, videoId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [updateAdId, ctx.from.id, `${ad.brand} ${ad.model}`, ad.year, ad.probeg, ad.paint, ad.color, ad.trans, ad.fuel, ad.price, ad.phone, ad.region, ad.photos.join(","), ad.history || "Ko'rsatilmagan", ad.barter || "Yo'q", ad.videoId || null]
            );
            const editId = result.insertId; 
            
            const adminCollage = await createCollage(photoUrls);
            const adminMsg = await ctx.api.sendPhoto(ADMIN_ID, new InputFile(adminCollage), {
              caption: `🔄 <b>E'LONNI YANGILASH SO'ROVI!</b>\n\n🆔 <b>Eski ID: ${updateAdId}</b>\n\n${caption}\n\n👤 Foydalanuvchi: <a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>${countText}${urgentTextEdit}`,
              reply_markup: new InlineKeyboard().text("✅ O'zgarishni tasdiqlash", `approve_edit:${editId}`).text("❌ Rad etish", `reject_edit:${editId}`),
              parse_mode: "HTML",
            });
            if (fs.existsSync(adminCollage)) fs.unlinkSync(adminCollage);

            if (ad.videoId) {
                await ctx.api.sendVideo(ADMIN_ID, ad.videoId, { reply_to_message_id: adminMsg.message_id });
            }

            if (ctx.session) ctx.session.editAdData = null;
            await ctx.reply("✅ <b>Tahrirlangan e'lon adminga muvaffaqiyatli yuborildi!</b>\n\nTekshiruvdan so'ng kanaldagi e'lon yangilanadi.", { parse_mode: "HTML", reply_markup: mainMenu });
            return; 
          }

          // ================= TO'G'RILANGAN QISM =================

          // 1. Avval bazaga saqlaymiz va adId ni aniqlaymiz
          const [result] = await db.execute(
            `INSERT INTO ads (userId, carDetails, year, probeg, paint, color, transmission, fuel, price, phone, region, photoId, history, barter, videoId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [ctx.from.id, `${ad.brand} ${ad.model}`, ad.year, ad.probeg, ad.paint, ad.color, ad.trans, ad.fuel, ad.price, ad.phone, ad.region, ad.photos.join(","), ad.history || "Ko'rsatilmagan", ad.barter || "Yo'q", ad.videoId || null]
          );
          const adId = result.insertId; 

          // 2. Endi adId malum bo'ldi, klaviaturani yasaymiz
          let urgentTextNew = ad.urgent ? "\n\n🚨 <b>DIQQAT: Ushbu e'lon foydalanuvchi tomonidan SHOSHILINCH (Qaynoq narx) deb belgilangan!</b>" : "";
          
          let adminKb = new InlineKeyboard();
          if (ad.urgent) {
              adminKb.text("🔥 Qabul (Shoshilinch)", `approve_hot:${adId}`).text("❌ Rad etish", `reject:${adId}`).row()
                     .text("✅ Oddiy qabul qilish", `approve:${adId}`);
          } else {
              adminKb.text("✅ Qabul qilish", `approve:${adId}`).text("❌ Rad etish", `reject:${adId}`).row()
                     .text("🔥 Qaynoq narxda qabul qilish", `approve_hot:${adId}`);
          }
          
          // 3. Adminga yuboramiz
          const adminCollage = await createCollage(photoUrls);
          const adminMsg = await ctx.api.sendPhoto(ADMIN_ID, new InputFile(adminCollage), {
            caption: `🆔 <b>ID: ${adId}</b>\n\n${caption}\n\n👤 Foydalanuvchi: <a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>${countText}${urgentTextNew}`,
            reply_markup: adminKb, 
            parse_mode: "HTML",
          });
          if (fs.existsSync(adminCollage)) fs.unlinkSync(adminCollage);

          if (ad.videoId) {
              await ctx.api.sendVideo(ADMIN_ID, ad.videoId, { reply_to_message_id: adminMsg.message_id });
          }

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

  const carCatalog = {
    "Chevrolet": ["Cobalt", "Gentra", "Lacetti", "Spark", "Nexia 1", "Nexia 2", "Nexia 3", "Matiz", "Damas", "Labo", "Tracker", "Onix", "Monza", "Malibu 1", "Malibu 2", "Captiva", "Captiva 5", "Equinox", "Tahoe", "Traverse", "Epica", "Orlando"],
    "Daewoo": ["Matiz", "Nexia 1", "Tico", "Damas"],
    "BYD": ["Chazor", "Song Plus", "Song Pro", "Song L", "Han", "Tang", "Seal", "Seagull", "Yuan Up", "Yuan Plus", "Destroyer 05", "e2"],
    "Kia": ["Sonet", "K3", "K4", "K5", "K8", "K9", "Sportage", "Sorento", "Carnival", "Cerato", "Seltos", "EV6", "Bongo"],
    "Hyundai": ["Accent", "Elantra", "Sonata", "Tucson", "Santa Fe", "Staria", "Porter", "Palisade", "Creta", "Kona"],
    "Chery": ["Tiggo 2 Pro", "Tiggo 4 Pro", "Tiggo 7 Pro", "Tiggo 8 Pro", "Tiggo 9", "Arrizo 6 Pro"],
    "Haval": ["Jolion", "M6", "H6", "Dargo", "H9"],
    "Changan": ["UNI-K", "UNI-T", "UNI-V", "CS35 Plus", "CS55 Plus", "CS75 Plus", "Eado"],
    "Geely": ["Coolray", "Monjaro", "Tugella", "Okavango", "Emgrand", "Geometry C"],
    "Exeed": ["RX", "VX", "TXL", "LX"],
    "Omoda": ["C5", "S5"],
    "Jetour": ["X70", "X70 Plus", "X90 Plus", "Dashing", "T2"],
    "Lada": ["Vesta", "Largus", "Granta", "Niva Legend", "Niva Travel", "XRAY"],
    "Toyota": ["Camry", "Corolla", "Avalon", "Prado", "Land Cruiser 100", "Land Cruiser 200", "Land Cruiser 300", "RAV4", "Highlander", "Hilux", "Prius"],
    "Lexus": ["LX", "RX", "ES", "NX", "GX"],
    "Mercedes": ["C-Class", "E-Class", "S-Class", "GLE", "GLS", "G-Class"],
    "BMW": ["3-Series", "5-Series", "7-Series", "X3", "X5", "X6", "X7"],
    "Volkswagen": ["ID.4", "ID.6", "Bora", "Lavida", "Passat", "Tiguan", "Touareg"],
    "Honda": ["CR-V", "Civic", "Accord", "e:NS1"],
    "Nissan": ["Sylphy", "Altima", "X-Trail", "Qashqai"],
    "Zeekr": ["001", "007", "009", "X"],
    "Li Auto": ["L7", "L8", "L9", "Mega"],
    "Xpeng": ["G6", "G9", "P7"],
    "Tesla": ["Model 3", "Model Y", "Model S", "Model X"],
    "Boshqa": [],
  };

  await ctx.reply("🧮 <b>Aqlli baholash tizimiga xush kelibsiz!</b>\n\nMoshinangizning bozordagi real narxini ma'lumotlar bazamizdagi e'lonlar asosida hisoblab beramiz.", { reply_markup: mainMenu, parse_mode: "HTML" });

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
        if (res.callbackQuery?.data === "cancel_ad") break;

        ad.brand = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = "MODEL";
      }
      else if (step === "MODEL") {
        const kb = new InlineKeyboard();
        if (carCatalog[ad.brand] && carCatalog[ad.brand].length > 0) {
          carCatalog[ad.brand].forEach((m, i) => { kb.text(m, `m:${m}`); if ((i + 1) % 3 === 0) kb.row(); });
        }
        kb.row().text("🔙 Orqaga", "back_BRAND").text("❌ Bekor qilish", "cancel_ad");
        msgPrompt = await ctx.reply(`🚙 <b>${ad.brand}</b> modelini tanlang:`, { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_BRAND") { step = "BRAND"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.model = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
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
            // Bazadan faol yoki sotilgan o'xshash modellarni qidiramiz
            const [rows] = await db.execute(
                "SELECT price, year FROM ads WHERE carDetails LIKE ? AND status IN ('active', 'sold')",
                [`%${ad.model}%`]
            );

            const targetYear = parseInt(ad.year);
            // Aniqroq natija uchun yili yaqin bo'lganlarni (+/- 2 yil) filtrlaymiz
            const relevantAds = rows.filter(r => {
                const y = parseInt(r.year) || 0;
                return Math.abs(y - targetYear) <= 2;
            });

            // Narxlarni tozalab faqat raqamlarni olamiz (1000$ dan 200,000$ gacha bo'lganlarni real deb qabul qilamiz)
            let validPrices = relevantAds.map(r => parseInt(r.price.replace(/\D/g, ""))).filter(p => p > 1000 && p < 200000);

            await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(()=>{});

            if (validPrices.length === 0) {
                await ctx.reply(`📭 <b>Kechirasiz, bazamizda ${ad.year} yil ${ad.brand} ${ad.model} uchun yetarli ma'lumot yo'q.</b>\n\nMoshinangizning narxi holatiga qarab turlicha bo'lishi mumkin.`, { parse_mode: "HTML", reply_markup: mainMenu });
            } else {
                const sum = validPrices.reduce((a, b) => a + b, 0);
                const avg = sum / validPrices.length;

                // Bazaviy hisoblash: O'rtacha narxning -6% va +6% oralig'ini (minimum va maksimum) hisoblaymiz
                const minPrice = Math.round((avg * 0.94) / 100) * 100;
                const maxPrice = Math.round((avg * 1.06) / 100) * 100;

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
 * ✅ АДМИН ТАСДИҚЛАШИ (Каналга юбориш)
 */
bot.callbackQuery(/^approve:(\d+)/, async (ctx) => {
  const adId = ctx.match[1];
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
  const ad = rows[0];

  if (ad && ad.status === "pending") {
    const photos = ad.photoId.split(",");
    const photoUrls = await Promise.all(
      photos.map(async (id) => {
        const file = await bot.api.getFile(id);
        return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
      })
    );
    const collagePath = await createCollage(photoUrls);

    let caption =
      `🆔 ID: ${ad.id}\n🚗 Moshina: ${ad.carDetails}\n📅 Yili: ${ad.year}\n👣 Probeg: ${ad.probeg}\n` +
      `💎 Kraskasi: ${ad.paint}\n🎨 Rangi: ${ad.color}\n✅ Karobka: ${ad.transmission}\n` +
      `⛽ Yoqilg'i: ${ad.fuel}\n`;

    if (ad.history && ad.history !== "Ko'rsatilmagan") {
      caption += `🛠 Tarixi: ${ad.history}\n`;
    }
    if (ad.barter && ad.barter !== "Yo'q") {
      caption += `🔄 Barter: ${ad.barter}\n`;
    }

    caption += `💰 Narxi: ${ad.price}$\n☎️ +${ad.phone}\n🚩 #${ad.region.replace(/\s+/g, "_")}\n\n` +
      `⚠️ Moshina savdosiga admin javobgar emas, oldindan to'lov qilmang. Ogohlik davr talabi ❗\n\n👉 https://t.me/engarzonidamoshina`;

    const channelMarkup = new InlineKeyboard().url("👤 KANAL ADMINI", "https://t.me/uzdev75").row()
    .url("❤️ Saqlash (Narx tushsa bilish)", `https://t.me/arzonida_bot?start=fav_${ad.id}`).row()
      .url("🤖 BEPUL E'LON BERISH", "https://t.me/arzonida_bot").url("📢 KANALIMIZ", "https://t.me/engarzonidamoshina");

    try {
      const msg = await bot.api.sendPhoto(CHANNEL_ID, new InputFile(collagePath), {
        caption: caption, reply_markup: channelMarkup, parse_mode: "HTML",
      });
      
      // YANGI: Terminalda e'lon qaysi kanalga ketganini aniq ko'rsatadi
      console.log(`✅ YANGI E'LON KANALGA TUSHDI! Kanal: ${CHANNEL_ID}, Xabar ID: ${msg.message_id}`);

      if (ad.videoId) {
        try {
          await bot.api.sendVideo(CHANNEL_ID, ad.videoId, { reply_to_message_id: msg.message_id });
        } catch (vidErr) {
          console.error("Videoni kanalga yuborishda xatolik:", vidErr);
        }
      }

      await db.execute("UPDATE ads SET status='active', channelMsgId=? WHERE id=?", [msg.message_id, adId]);
      // ================= YANGI: 2-KANALGA HAM NUSXALASH =================
      try {
        const SECOND_CHANNEL_ID = process.env.SECOND_CHANNEL_ID; 
        
        if (SECOND_CHANNEL_ID) { 
          const secondMsg = await bot.api.copyMessage(SECOND_CHANNEL_ID, CHANNEL_ID, msg.message_id, {
            reply_markup: channelMarkup
          });
          
          if (vidMsg) {
            await bot.api.copyMessage(SECOND_CHANNEL_ID, CHANNEL_ID, vidMsg.message_id, {
              reply_to_message_id: secondMsg.message_id
            });
          }
        }
      } catch (err) {
        console.error("2-kanalga nusxalashda xato yuz berdi:", err);
      }
      // ==================================================================
      if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
      
      await ctx.editMessageCaption({ caption: "✅ Kanalga joylandi!", parse_mode: "HTML", reply_markup: new InlineKeyboard().text("➡️ Keyingisini ko'rish", "admin_pending") });
      
      // YANGI: Agar uzer botni blok qilib qo'ygan bo'lsa, dastur qulab tushmasligi uchun himoya (try-catch)
      try {
          await bot.api.sendMessage(ad.userId, `🎉 <b>Tabriklaymiz!</b>\n\nSizning <b>${ad.carDetails}</b> e'loningiz kanalga joylandi.\n\n💡 <b>Eslatma:</b> Agar moshinangiz sotilsa, pastdagi <b>«📂 Mening e'lonlarim»</b> bo'limiga kirib <b>«Sotildi»</b> deb belgilab qo'yishni unutmang. Shuningdek, o'sha yerdan e'lon narxini pasaytirishingiz ham mumkin!\n\nKanalni ko'rish: https://t.me/engarzonidamoshina`, { parse_mode: "HTML", reply_markup: mainMenu });
      } catch (e) {
        console.log(`⚠️ ${ad.userId} ID egasi botni blok qilgani sababli xabar bormadi.`);
      }
      
      try {
        const [alerts] = await db.execute("SELECT * FROM alerts");
        const adPrice = parseInt(ad.price.replace(/\D/g, "")) || 0;
        const adDetails = ad.carDetails.toLowerCase();

        for (const alert of alerts) {
            if (adDetails.includes(alert.query) && adPrice <= alert.maxPrice) {
                try {
                    await bot.api.sendMessage(alert.userId, `🔔 <b>SIZ Qidirayotgan moshina chiqdi!</b>\n\nBizning kanalga sizning talabingizga mos moshina joylandi:`, { parse_mode: "HTML" });
                    await bot.api.copyMessage(alert.userId, CHANNEL_ID, msg.message_id);
                } catch(e) {}
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
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
  const ad = rows[0];

  if (ad && ad.status === "pending") {
    const photos = ad.photoId.split(",");
    const photoUrls = await Promise.all(
      photos.map(async (id) => {
        const file = await bot.api.getFile(id);
        return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
      })
    );
    const collagePath = await createCollage(photoUrls);

    // ================= YANGI: MATN TEPASIGA QAYNOQ NARX QO'SHILDI =================
    let caption =
      `🔥 <b>QAYNOQ NARX!</b>\n\n` +
      `🆔 ID: ${ad.id}\n🚗 Moshina: ${ad.carDetails}\n📅 Yili: ${ad.year}\n👣 Probeg: ${ad.probeg}\n` +
      `💎 Kraskasi: ${ad.paint}\n🎨 Rangi: ${ad.color}\n✅ Karobka: ${ad.transmission}\n` +
      `⛽ Yoqilg'i: ${ad.fuel}\n`;

    if (ad.history && ad.history !== "Ko'rsatilmagan") {
      caption += `🛠 Tarixi: ${ad.history}\n`;
    }
    if (ad.barter && ad.barter !== "Yo'q") {
      caption += `🔄 Barter: ${ad.barter}\n`;
    }

    caption += `💰 Narxi: ${ad.price}$\n☎️ +${ad.phone}\n🚩 #${ad.region.replace(/\s+/g, "_")}\n\n` +
      `⚠️ Moshina savdosiga admin javobgar emas, oldindan to'lov qilmang. Ogohlik davr talabi ❗\n\n👉 https://t.me/engarzonidamoshina`;
    // ==============================================================================

    const channelMarkup = new InlineKeyboard().url("👤 KANAL ADMINI", "https://t.me/uzdev75").row()
    .url("❤️ Saqlash (Narx tushsa bilish)", `https://t.me/arzonida_bot?start=fav_${ad.id}`).row()
      .url("🤖 BEPUL E'LON BERISH", "https://t.me/arzonida_bot").url("📢 KANALIMIZ", "https://t.me/engarzonidamoshina");

    try {
      const msg = await bot.api.sendPhoto(CHANNEL_ID, new InputFile(collagePath), {
        caption: caption, reply_markup: channelMarkup, parse_mode: "HTML",
      });
      
      if (ad.videoId) {
        try { await bot.api.sendVideo(CHANNEL_ID, ad.videoId, { reply_to_message_id: msg.message_id }); } catch (e) {}
      }

      await db.execute("UPDATE ads SET status='active', channelMsgId=? WHERE id=?", [msg.message_id, adId]);
      try {
        const SECOND_CHANNEL_ID = process.env.SECOND_CHANNEL_ID; 
        
        if (SECOND_CHANNEL_ID) { 
          const secondMsg = await bot.api.copyMessage(SECOND_CHANNEL_ID, CHANNEL_ID, msg.message_id, {
            reply_markup: channelMarkup
          });
          
          if (vidMsg) {
            await bot.api.copyMessage(SECOND_CHANNEL_ID, CHANNEL_ID, vidMsg.message_id, {
              reply_to_message_id: secondMsg.message_id
            });
          }
        }
      } catch (err) {
        console.error("2-kanalga nusxalashda xato yuz berdi:", err);
      }
      if (require('fs').existsSync(collagePath)) require('fs').unlinkSync(collagePath);
      
      await ctx.editMessageCaption({ caption: "✅ Qaynoq narx sifatida kanalga joylandi!", parse_mode: "HTML", reply_markup: new InlineKeyboard().text("➡️ Keyingisini ko'rish", "admin_pending") });
      
     try {
          await bot.api.sendMessage(ad.userId, 
            `🎉 <b>Tabriklaymiz!</b>\n\n` +
            `Sizning <b>${ad.carDetails}</b> e'loningiz kanalga <b>"🔥 QAYNOQ NARX"</b> maqomida joylandi!\n\n` +
            `Kanalni ko'rish: https://t.me/engarzonidamoshina\n\n` +
            `📌 <b>Eslatma:</b> Agar moshinangiz sotilsa, pastdagi «📂 Mening e'lonlarim» bo'limiga kirib «Sotildi» deb belgilab qo'yishni unutmang. Shuningdek, o'sha yerdan e'lon narxini pasaytirishingiz ham mumkin!`, 
            { parse_mode: "HTML", reply_markup: mainMenu }
          );
      } catch (e) {}
      
      // Alert xabarnomalari...
      try {
        const [alerts] = await db.execute("SELECT * FROM alerts");
        const adPrice = parseInt(ad.price.replace(/\D/g, "")) || 0;
        const adDetails = ad.carDetails.toLowerCase();

        for (const alert of alerts) {
            if (adDetails.includes(alert.query) && adPrice <= alert.maxPrice) {
                try {
                    await bot.api.sendMessage(alert.userId, `🔔 <b>SIZ Qidirayotgan moshina chiqdi!</b>`, { parse_mode: "HTML" });
                    await bot.api.copyMessage(alert.userId, CHANNEL_ID, msg.message_id);
                } catch(e) {}
            }
        }
      } catch(e) {}
      
    } catch (e) {
      await ctx.reply("Xatolik: Kanalga yuborib bo'lmadi.");
    }
  } else {
     await ctx.answerCallbackQuery("Bu e'lon allaqachon ko'rib chiqilgan.");
  }
});
//Shu yergacha lotinga o'zgardi


bot.callbackQuery(/^reject:(\d+)/, async (ctx) => {
  const adId = ctx.match[1];
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
  const ad = rows[0];
  
  if (ad && ad.status === "pending") {
    await db.execute("UPDATE ads SET status='rejected' WHERE id=?", [adId]);
    await ctx.editMessageCaption({ caption: "❌ <b>E'lon rad etildi.</b>", parse_mode: "HTML", reply_markup: new InlineKeyboard().text("➡️ Keyingisini ko'rish", "admin_pending") });
    try {
        await bot.api.sendMessage(ad.userId, `❌ <b>E'loningiz rad etildi.</b>\n\nSizning <b>${ad.carDetails}</b> e'loningiz qoidalarga mos kelmaganligi sababli rad etildi. Iltimos, ma'lumotlarni to'g'rilab qaytadan e'lon bering.`, { parse_mode: "HTML", reply_markup: mainMenu });
    } catch (e) {}
  } else {
      await ctx.answerCallbackQuery("Bu e'lon allaqachon ko'rib chiqilgan.");
  }
});

bot.callbackQuery(/^sold_req:(\d+)/, async (ctx) => {
  const adId = ctx.match[1];
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
  const ad = rows[0];

  if (ad && ad.status === 'active') {
      await bot.api.sendMessage(ADMIN_ID, `💰 <b>SOTILDI XABARI!</b>\n\n🆔 <b>ID: ${adId}</b>\n🚗 <b>Moshina: ${ad.carDetails}</b>\n👤 <b>Uzer:</b> <a href="tg://user?id=${ad.userId}">${ctx.from.first_name}</a>`, {
          reply_markup: new InlineKeyboard().text("✅ Tasdiqlash (Kanalda belgilash)", `confirm_sold:${adId}`), parse_mode: "HTML",
      });
      await ctx.answerCallbackQuery({ text: "So'rov adminga yuborildi." });
      
      try {
          await ctx.editMessageText(`🆔 <b>ID: ${ad.id}</b>\n🚗 <b>Moshina: ${ad.carDetails}</b>\n\n⏳ <i>Sotildi deb belgilash bo'yicha so'rov adminga yuborildi...</i>`, { parse_mode: "HTML" });
      } catch (e) {
          // Tugma 2-marta bosilsa, xatolikni inkor qilamiz (message is not modified)
      }
  } else {
      await ctx.answerCallbackQuery({ text: "Bu e'lon allaqachon yopilgan yoki topilmadi.", show_alert: true });
  }
});

bot.callbackQuery(/^confirm_sold:(\d+)/, async (ctx) => {
  const adId = ctx.match[1];
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
  const ad = rows[0];
  
  if (ad && ad.status === 'active') {
      try {
        const newCaption = `💰 <b>SOTILDI!</b>\n\n<s>${ad.carDetails}</s>\n💰 <b>Narxi: ${ad.price}$</b>\n\n❌ <b>E'lon yopildi.</b>`;
        await bot.api.editMessageCaption(CHANNEL_ID, ad.channelMsgId, { caption: newCaption, parse_mode: "HTML" });
        await db.execute("UPDATE ads SET status='sold' WHERE id=?", [adId]);
        await ctx.editMessageText("✅ <b>Kanalda sotildi deb belgilandi!</b>", { parse_mode: "HTML" });
        await bot.api.sendMessage(ad.userId, `🎉 <b>Tabriklaymiz!</b>\n\nSizning <b>${ad.carDetails}</b> e'loningiz kanalda "SOTILDI" deb belgilandi.`, { parse_mode: "HTML" });

        // ================= YANGI: AVTOMATIK TABRIKNOMA (REKLAMA) =================
        const congratsText = 
          `🎉 <b>TABRIKLAYMIZ!</b>\n\n` +
          `Navbatdagi avtomobil ham kanalimiz va botimiz orqali juda tez o'z xaridorini topdi! Sotuvchi va oluvchiga barakasini bersin. 🤝\n\n` +
          `🚘 <i>Siz ham moshinangizni qisqa fursatda, maklerlarsiz va mutlaqo BEPUL sotmoqchimisiz?</i>\n\n` +
          `👇 <b>Unda hoziroq botimiz orqali e'lon joylang:</b>\n` +
          `🤖 @arzonida_bot`;

        await bot.api.sendMessage(CHANNEL_ID, congratsText, {
            parse_mode: "HTML",
            reply_to_message_id: ad.channelMsgId // <--- Kanaldagi moshina e'loniga "Reply" qiladi
        });
        // =========================================================================

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
              await db.execute("UPDATE users SET referral_count = referral_count + 1 WHERE id = ?", [referrerId]);
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
    `👇 <i>Quyidagi menyu orqali o'zingizga kerakli bo'limni tanlang!</i>`;

  await ctx.reply(welcomeText, {
    reply_markup: mainMenu, 
    parse_mode: "HTML",
  });
});

bot.hears("📝 E'lon berish", async (ctx) => {
  // 1. Obunani tekshirish
  if (!(await isSubscribed(ctx))) return askForSub(ctx);

  // FAQAT ADMIN BO'LMAGANLAR UCHUN CHEKLOVLAR (Admindan bularni so'ramaydi)
  if (ctx.from.id !== ADMIN_ID) {
    // 2. Anti-spam: Tasdiq kutayotgan e'loni borligini tekshirish
    const [[pendingAds]] = await db.execute(
      "SELECT COUNT(*) as count FROM ads WHERE userId = ? AND status = 'pending'",
      [ctx.from.id]
    );
    
    if (pendingAds.count > 0) {
      return ctx.reply("⏳ <b>Sizning oldingi e'loningiz hali adminlar tomonidan ko'rib chiqilmoqda.</b>\n\nIltimos, u tasdiqlanguncha yoki rad etilguncha kutib turing.", { parse_mode: "HTML" });
    }

    // 3. Limit: Bir vaqtning o'zida nechta faol e'loni bo'lishi mumkinligi (masalan, 3 ta)
    const [[activeAds]] = await db.execute(
      "SELECT COUNT(*) as count FROM ads WHERE userId = ? AND status = 'active'",
      [ctx.from.id]
    );
    
    if (activeAds.count >= 3) {
      return ctx.reply("❗️ <b>Sizda cheklov mavjud!</b>\n\nBir vaqtning o'zida eng ko'pi bilan <b>3 ta</b> faol e'loningiz bo'lishi mumkin. Yangi e'lon berish uchun '📂 Mening e'lonlarim' bo'limidan eskilarini 'Sotildi' deb belgilang.", { parse_mode: "HTML" });
    }
  }
if (ctx.session) ctx.session.editAdData = null;
await ctx.conversation.enter("createAdConversation");
});

bot.hears("🔍 Mashina qidirish", async (ctx) => {
  if (!(await isSubscribed(ctx))) return askForSub(ctx);
  await ctx.conversation.enter("searchCarConversation");
});

bot.hears("📂 Mening e'lonlarim", async (ctx) => {
  if (!(await isSubscribed(ctx))) return askForSub(ctx);
  const [ads] = await db.execute("SELECT * FROM ads WHERE userId = ? AND status = 'active'", [ctx.from.id]);
  if (ads.length === 0) return ctx.reply("📭 <b>Sizda hozirda faol e'lonlar yo'q.</b>", { parse_mode: "HTML" });

  const [[u]] = await db.execute("SELECT free_ups FROM users WHERE id = ?", [ctx.from.id]);
  const freeUps = u ? u.free_ups : 0;

  for (const ad of ads) {
    const kb = new InlineKeyboard()
      .text("💰 Sotildi", `sold_req:${ad.id}`)
      .text("📉 Narxni tushirish", `edit_price:${ad.id}`).row()
      .text("✏️ To'liq tahrirlash", `full_edit_req:${ad.id}`); // <--- YANGI TUGMA QO'SHILDI

      if (freeUps > 0) {
        kb.row().text(`🚀 BEPUL UP (VIP) (${freeUps} ta bor)`, `free_up_req:${ad.id}`);
    }

    await ctx.reply(`🆔 <b>ID: ${ad.id}</b>\n🚗 <b>Moshina: ${ad.carDetails}</b>\n💰 <b>Narxi: ${ad.price}$</b>`, {
      reply_markup: kb, parse_mode: "HTML",
    });
  }
});
bot.hears("🎁 Bepul VIP (UP)", async (ctx) => {
  if (!(await isSubscribed(ctx))) return askForSub(ctx);

  const [rows] = await db.execute("SELECT referral_count, free_ups FROM users WHERE id = ?", [ctx.from.id]);
  const user = rows[0];
  if (!user) return;

  const botInfo = await bot.api.getMe();
  const refLink = `https://t.me/${botInfo.username}?start=ref_${ctx.from.id}`;
  const qoldi = 5 - (user.referral_count % 5);

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

 const shareMessage = 
    "🚗 O'zbekistondagi eng qulay onlayn Avto-Bozor!\n\n" +
    "💸 E'lon berish mutlaqo BEPUL.\n" +
    "🔍 O'zingiz izlagan moshinani juda oson toping.\n\n" +
    "👇 Hoziroq botga kirib ko'ring:\n" + 
    refLink;

  const shareText = encodeURIComponent(shareMessage);
  // Bu yerda 'url=' olib tashlandi, hammasi 'text=' ichiga joylandi
  const kb = new InlineKeyboard().url("📤 Do'stlarga yuborish", `https://t.me/share/url?text=${shareText}`);
  
  await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
});
bot.hears("🧮 Mashina narxini aniqlash", async (ctx) => {
  if (!(await isSubscribed(ctx))) return askForSub(ctx);
  await ctx.conversation.enter("evaluateCarConversation");
});
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

  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
  const ad = rows[0];
  
  if (!ad || ad.status !== 'active') {
     return ctx.reply("❌ Bu e'lon faol emas yoki allaqachon yopilgan.");
  }

  await ctx.reply(`📉 <b>${ad.carDetails}</b> uchun yangi narxni kiriting ($):\n<i>(Masalan: 8500)</i>\n\nBekor qilish uchun pastdagi menyudan foydalaning.`, { reply_markup: mainMenu, parse_mode: "HTML" });
  
  const res = await conversation.waitFor("message:text");
  if (res.message?.text && cancelTexts.includes(res.message.text)) {
    return ctx.reply("❌ Narx o'zgartirish bekor qilindi.", { reply_markup: mainMenu }); 
  }

  let newPrice = res.message.text.replace(/\D/g, "");
  if (!newPrice) {
    return ctx.reply("❗️ Xato narx kiritildi. Amaliyot bekor qilindi.", { reply_markup: mainMenu }); 
  }

  const waitMsg = await ctx.reply("⏳ <i>Kanaldagi e'lon yangilanmoqda...</i>", { parse_mode: "HTML" });

  try {
    const newCaption = 
      `🆔 ID: ${ad.id}\n🚗 Moshina: ${ad.carDetails}\n📅 Yili: ${ad.year}\n👣 Probeg: ${ad.probeg}\n` +
      `💎 Kraskasi: ${ad.paint}\n🎨 Rangi: ${ad.color}\n✅ Karobka: ${ad.transmission}\n` +
      `⛽ Yoqilg'i: ${ad.fuel}\n💰 Narxi: <s>${ad.price}$</s> <b>${newPrice}$ 📉</b>\n☎️ +${ad.phone}\n🚩 #${ad.region.replace(/\s+/g, "_")}\n\n` +
      `⚠️ Moshina savdosiga admin javobgar emas, oldindan to'lov qilmang. Ogohlik davr talabi ❗\n\n👉 https://t.me/engarzonidamoshina`;

    const channelMarkup = new InlineKeyboard().url("👤 KANAL ADMINI", "https://t.me/uzdev75").row()
    .url("❤️ Saqlash (Narx tushsa bilish)", `https://t.me/arzonida_bot?start=fav_${ad.id}`).row()
      .url("🤖 BEPUL E'LON BERISH", "https://t.me/arzonida_bot").url("📢 KANALIMIZ", "https://t.me/engarzonidamoshina");

    await ctx.api.editMessageCaption(CHANNEL_ID, ad.channelMsgId, {
      caption: newCaption,
      reply_markup: channelMarkup,
      parse_mode: "HTML"
    });

    await db.execute("UPDATE ads SET price = ? WHERE id = ?", [newPrice, adId]);

    try {
      const oldPriceNum = parseInt(ad.price) || 0;
      const newPriceNum = parseInt(newPrice) || 0;
      const diff = oldPriceNum - newPriceNum;

      if (diff > 0) { // FAQAT NARX TUSHGANDA ISHLAYDI
        
        // ================= YANGI: KANALGA "QAYNOQ NARX" TASHALANADI =================
        try {
            const hotPriceText = 
            `🔥 <b>QAYNOQ NARX! Mashina arzonlashdi!</b>\n\n` +
            `🚗 <b>${ad.carDetails}</b>\n` +
            `❌ Eski narxi: <s>${oldPriceNum}$</s>\n` +
            `✅ Yangi narxi: <b>${newPriceNum}$ 📉</b>\n\n` +
            `👆 <i>E'lonni to'liq ko'rish uchun tepadagi xabarga bosing</i>`;
                
            await bot.api.sendMessage(CHANNEL_ID, hotPriceText, {
                parse_mode: "HTML",
                reply_to_message_id: ad.channelMsgId // Kanaldagi o'sha moshinaga reply qiladi
            });
        } catch (err) {
            console.error("Kanalga qaynoq narx xabarini yuborishda xato:", err);
        }
        // ============================================================================

        // Saqlab olganlarga (Favorites) xabar yuborish
        const [favs] = await db.execute("SELECT userId FROM favorites WHERE adId = ?", [adId]);
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
           } catch(e) { }
        }
      }
    } catch (error) { console.error("Xabarnoma yuborishda xatolik:", error); }

    await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply(`✅ <b>Narx muvaffaqiyatli tushirildi!</b>\nKanalda moshinangiz narxi <b>${newPrice}$</b> bo'lib o'zgardi.`, { parse_mode: "HTML", reply_markup: mainMenu }); 

  } catch (error) {
    console.error(error);
    await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply("❌ Xatolik: Kanaldagi xabarni yangilab bo'lmadi. Ehtimol eski xabar kanaldan o'chirilgan bo'lishi mumkin.", { reply_markup: mainMenu }); 
  }
}
bot.use(createConversation(editPriceConversation));

// "Нархни тушириш" тугмаси босилганда ишлайдиган код
bot.callbackQuery(/^edit_price:(\d+)/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("editPriceConversation");
});

bot.callbackQuery(/^free_up_req:(\d+)/, async (ctx) => {
  await ctx.answerCallbackQuery("⏳ E'lon kanalga qayta ko'tarilmoqda...");
  const adId = parseInt(ctx.match[1]);

  // 1. Bonus hali borligini tekshiramiz
  const [[user]] = await db.execute("SELECT free_ups FROM users WHERE id = ?", [ctx.from.id]);
  if (!user || user.free_ups <= 0) {
      return ctx.editMessageText("❌ Sizda bepul UP bonusi tugagan. Do'stlaringizni taklif qilib yangisini oling!", { parse_mode: "HTML" });
  }

  // 2. E'lonni topamiz
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ? AND userId = ? AND status = 'active'", [adId, ctx.from.id]);
  const ad = rows[0];
  if (!ad) return ctx.reply("❌ Bu e'lon faol emas yoki topilmadi.");

  try {
    const channelMarkup = new InlineKeyboard()
      .url("👤 E'LON ADMINI", "https://t.me/uzdev75").row()
      .url("❤️ Saqlash (Narx tushsa bilish)", `https://t.me/arzonida_bot?start=fav_${ad.id}`).row()
      .url("🤖 BEPUL E'LON BERISH", "https://t.me/arzonida_bot").url("📢 KANALIMIZ", "https://t.me/engarzonidamoshina");

    let newMsgId;

    try {
      // Kanaldagi eski xabarni o'chirib, eng pastga yangi nusxasini joylaymiz
      const newMsg = await bot.api.copyMessage(CHANNEL_ID, CHANNEL_ID, ad.channelMsgId, { reply_markup: channelMarkup });
      newMsgId = newMsg.message_id;
      if (ad.videoId) {
        try { await bot.api.sendVideo(CHANNEL_ID, ad.videoId, { reply_to_message_id: newMsgId }); } catch(e){}
      }
      await bot.api.deleteMessage(CHANNEL_ID, ad.channelMsgId).catch(() => {});
    } catch (copyErr) {
      // Agar kanaldan xabar o'chirilgan bo'lsa (yoki topilmasa) xatolik beramiz
      return ctx.reply("❌ Kanaldagi e'lon topilmadi. Bepul UP amalga oshmadi.");
    }

    // 3. Bazada e'lonning ID sini yangilaymiz va bonusdan 1 ta ayirib tashlaymiz
    await db.execute("UPDATE ads SET channelMsgId = ? WHERE id = ?", [newMsgId, adId]);
    await db.execute("UPDATE users SET free_ups = free_ups - 1 WHERE id = ?", [ctx.from.id]);

    await ctx.deleteMessage().catch(()=>{});
    await ctx.reply(`✅ <b>E'loningiz muvaffaqiyatli ko'tarildi!</b>\n\nMoshinangiz kanalda eng so'nggi xabarlar qatoriga chiqdi.`, { parse_mode: "HTML" });

  } catch (err) {
    console.error(err);
    await ctx.reply("❌ Xatolik yuz berdi: E'lonni ko'tarib bo'lmadi.");
  }
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

  // ================= O'ZGARGAN QISM: Kapsion dinamik yasaladi =================
  let newCaption =
    `🆔 ID: ${oldAd.id}\n🚗 Moshina: ${editData.carDetails}\n📅 Yili: ${editData.year}\n👣 Probeg: ${editData.probeg}\n` +
    `💎 Kraskasi: ${editData.paint}\n🎨 Rangi: ${editData.color}\n✅ Karobka: ${editData.transmission}\n` +
    `⛽ Yoqilg'i: ${editData.fuel}\n`;

  if (editData.history && editData.history !== "Кўрсатилмаган") {
    newCaption += `🛠 Tarixi: ${editData.history}\n`;
  }
  if (editData.barter && editData.barter !== "Йўқ") {
    newCaption += `🔄 Barter: ${editData.barter}\n`;
  }

  newCaption += `💰 Narxi: ${editData.price}$\n☎️ +${editData.phone}\n🚩 #${editData.region.replace(/\s+/g, "_")}\n\n` +
    `⚠️ Moshina savdosiga admin javobgar emas, oldindan to'lov qilmang. Ogohlik davr talabi ❗\n\n👉 https://t.me/engarzonidamoshina`;
  // =========================================================================

  const channelMarkup = new InlineKeyboard().url("👤 KANAL ADMINI", "https://t.me/uzdev75").row()
  .url("❤️ Saqlash (Narx tushsa bilish)", `https://t.me/arzonida_bot?start=fav_${oldAd.id}`).row()
    .url("🤖 BEPUL E'LON BERISH", "https://t.me/arzonida_bot").url("📢 KANALIMIZ", "https://t.me/engarzonidamoshina");

  try {
    // Kanaldagi XABARNI va RASMNI (Kollajni) almashtirish
    await bot.api.editMessageMedia(CHANNEL_ID, oldAd.channelMsgId, {
        type: "photo",
        media: new InputFile(collagePath),
        caption: newCaption,
        parse_mode: "HTML"
    }, { reply_markup: channelMarkup });

    // ================= O'ZGARGAN QISM: Video bo'lsa kanalga jo'natiladi =================
    if (editData.videoId) {
      try {
        await bot.api.sendVideo(CHANNEL_ID, editData.videoId, { reply_to_message_id: oldAd.channelMsgId });
      } catch (vidErr) {
        console.error("Yangi videoni kanalga yuborishda xatolik:", vidErr);
      }
    }
    // =========================================================================

    // ================= O'ZGARGAN QISM: UPDATE so'roviga history, barter, videoId qo'shildi =================
    await db.execute(
        `UPDATE ads SET carDetails=?, year=?, probeg=?, paint=?, color=?, transmission=?, fuel=?, price=?, phone=?, region=?, photoId=?, history=?, barter=?, videoId=? WHERE id=?`,
        [editData.carDetails, editData.year, editData.probeg, editData.paint, editData.color, editData.transmission, editData.fuel, editData.price, editData.phone, editData.region, editData.photoId, editData.history || "Кўрсатилмаган", editData.barter || "Йўқ", editData.videoId || null, oldAd.id]
    );
    // =========================================================================

    // Vaqtinchalik jadvaldan o'chirib tashlash
    await db.execute("DELETE FROM ad_edits WHERE editId = ?", [editId]);
    if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);

    await ctx.editMessageCaption({ caption: "✅ <b>Kanaldagi e'lon muvaffaqiyatli yangilandi!</b>", parse_mode: "HTML", reply_markup: new InlineKeyboard().text("➡️ Keyingisini ko'rish", "admin_pending") });
    await bot.api.sendMessage(editData.userId, `🎉 <b>Tabriklaymiz!</b>\n\nSizning e'loningiz kanalda muvaffaqiyatli yangilandi.`, { parse_mode: "HTML", reply_markup: mainMenu });

  } catch (error) {
    console.error("Kanalda xabarni yangilashda xatolik:", error);
    await ctx.reply("❌ Kanaldagi e'lonni yangilab bo'lmadi. Xabar o'chirilgan bo'lishi mumkin.");
  }
});

bot.callbackQuery(/^reject_edit:(\d+)/, async (ctx) => {
  const editId = ctx.match[1];
  const [editRows] = await db.execute("SELECT * FROM ad_edits WHERE editId = ?", [editId]);
  const editData = editRows[0];

  if (editData) {
    await db.execute("DELETE FROM ad_edits WHERE editId = ?", [editId]);
    await ctx.editMessageCaption({ caption: "❌ <b>E'lonni yangilash rad etildi.</b>", parse_mode: "HTML", reply_markup: new InlineKeyboard().text("➡️ Keyingisini ko'rish", "admin_pending") });
    try {
        await bot.api.sendMessage(editData.userId, `❌ <b>E'lonni yangilash rad etildi.</b>\n\nAdminlar o'zgarishni qoidalarga mos emas deb topdi va kanaldagi eski e'loningiz o'zgarishsiz qoldi.`, { parse_mode: "HTML", reply_markup: mainMenu });
    } catch (e) {}
  } else {
      await ctx.answerCallbackQuery("Bu so'rov allaqachon ko'rib chiqilgan.", {show_alert:true});
  }
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

// ⏰ Таймер: Ҳар 30 минутда вақтни текшириб туради
let lastAnalyticsDate = null;
setInterval(() => {
    const now = new Date();
    // 0 = Якшанба, 10 = Соат 10:xx 
    if (now.getDay() === 0 && now.getHours() === 10) {
        const dateStr = now.toISOString().split('T')[0]; // "2026-08-09" шаклида
        // Бугун учун ҳали жўнатилмаган бўлсагина жўнатади
        if (lastAnalyticsDate !== dateStr) {
            lastAnalyticsDate = dateStr;
            sendWeeklyAnalytics();
            console.log("✅ Ҳафталик аналитика каналга юборилди!");
        }
    }
}, 60 * 1000 * 30); // Ҳар 30 минутда айланади
// =====================================================================
bot.start();
console.log("Бот муваффақиятли ишга тушди...");