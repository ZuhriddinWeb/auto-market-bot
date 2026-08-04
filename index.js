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
    console.log("✅ Жадваллар текширилди (тайёр).");
  } catch (error) {
    console.error("❌ Жадвал яратишда хатолик:", error);
  }
})();

bot.catch((err) => console.error(`Хатолик:`, err.error));
bot.use(session({ initial: () => ({}) }));

// 1. БЛОКЛАНГАНЛАРНИ ТЕКШИРИШ
bot.use(async (ctx, next) => {
  if (ctx.from && ctx.from.id !== ADMIN_ID) {
    try {
      const [banned] = await db.execute("SELECT * FROM banned_users WHERE userId = ?", [ctx.from.id]);
      if (banned.length > 0) {
        if (ctx.callbackQuery) {
           await ctx.answerCallbackQuery({ text: "🚫 Сиз қоидабузарлик сабабли ботдан блоклангансиз!", show_alert: true });
        } else {
           await ctx.reply("🚫 <b>Кечирасиз, сиз ботдан блоклангансиз.</b> Энди эълон бера олмайсиз.", { parse_mode: "HTML", reply_markup: { remove_keyboard: true } });
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
  .text("📝 Эълон Ясаш").text("🔍 Мошина қидириш").row()
  .text("📂 Менинг эълонларим").resized();

/**
 * ✅ МАЖБУРИЙ ОБУНАНИ ТЕКШИРУВЧИ ФУНКЦИЯЛАР
 */

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
  await ctx.reply("❌ <b>Ботдан фойдаланиш учун каналимизга обуна бўлинг!</b>", {
    reply_markup: new InlineKeyboard()
      .url("📢 Каналга ўтиш", "https://t.me/engarzonidamoshina").row()
      .text("✅ Обуна бўлдим", "check_sub_ad"),
    parse_mode: "HTML"
  });
}

bot.callbackQuery("check_sub_ad", async (ctx) => {
  if (await isSubscribed(ctx)) {
    await ctx.deleteMessage();
    await ctx.reply("✅ <b>Обуна тасдиқланди!</b> Энди менюдан фойдаланишингиз мумкин.", { parse_mode: "HTML", reply_markup: mainMenu });
  } else {
    await ctx.answerCallbackQuery({ text: "❌ Ҳали обуна бўлмагансиз!", show_alert: true });
  }
});

async function safeAnswerCbq(ctx) {
  try {
    const id = ctx?.callbackQuery?.id || ctx?.update?.callback_query?.id;
    // Тугма босилганда экранининг тепасида (Toast) хабар чиқади
    if (id) await ctx.api.answerCallbackQuery(id, { text: "⏳ Илтимос кутинг, сўровингиз қайта ишланмоқда..." });
  } catch (_) {}
}
async function deleteMsgs(ctx, msgIds) {
  if (!msgIds || msgIds.length === 0) return;

  const idsToDelete = [...msgIds];
  msgIds.length = 0; 
  const chatId = ctx.chat.id; 

  // 1. Тугмани дарҳол "Кутилмоқда..." га ўзгартириш
  try {
    await ctx.api.editMessageReplyMarkup(chatId, idsToDelete[0], {
      reply_markup: new InlineKeyboard().text("⏳ Кутилмоқда...", "ignore")
    });
  } catch (e) {}

  // 2. Олтин ўрталиқ: 1.5 сония (1500 ms) кутиш.
  // Бу вақт ичида бот пастга янги саволни ташлашга бемалол улгуради.
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
  const adminMenu = new InlineKeyboard().text("📊 Статистика", "admin_stats").row().text("📢 Рассылка", "admin_broadcast").row().text("❌ Ёпиш", "admin_close");
  
  await ctx.reply("📢 <b>Рассылка учун хабарни юборинг:</b>\n<i>(Матн, расм, видео юборишингиз мумкин. Бекор қилиш учун /cancel)</i>", { parse_mode: "HTML" });
  const res = await conversation.waitFor("message");
  
  if (res.message.text === "/cancel") {
    return ctx.reply("❌ Рассылка бекор қилинди.", { reply_markup: adminMenu });
  }

  const waitMsg = await ctx.reply("⏳ <i>Хабар юборилмоқда... Бу бироз вақт олиши мумкин.</i>", { parse_mode: "HTML" });
  
  // Барча фойдаланувчиларни базадан оламиз
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
  await ctx.reply(`✅ <b>Рассылка тугади!</b>\n\n🟢 Муваффақиятли: ${success} та\n🔴 Блокланган/Хато: ${failed} та`, { parse_mode: "HTML", reply_markup: adminMenu });
}
bot.use(createConversation(broadcastConversation));

/**
 * ✅ АДМИН БУЙРУҚЛАРИ
 */
const adminMenu = new InlineKeyboard().text("📊 Статистика", "admin_stats").row().text("📢 Рассылка", "admin_broadcast").row().text("❌ Ёпиш", "admin_close");

bot.command("admin", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.reply("👨‍💻 <b>Админ панелга хуш келибсиз!</b>\nҚуйидаги менюдан керакли бўлимни танланг:", { reply_markup: adminMenu, parse_mode: "HTML" });
});
/**
 * ✅ АДМИН УЧУН БЛОКЛАШ ТИЗИМИ
 */
bot.command("ban", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const match = ctx.message.text.split(" ");
  if (match.length < 2) return ctx.reply("Қўллаш тартиби: /ban [ID рақам]");
  
  const targetId = parseInt(match[1]);
  if (!targetId) return ctx.reply("❗️ ID рақам бўлиши керак.");

  try {
    await db.execute("INSERT IGNORE INTO banned_users (userId) VALUES (?)", [targetId]);
    await ctx.reply(`✅ <b>${targetId}</b> ID эгаси қора рўйхатга тушди!`, { parse_mode: "HTML" });
    await bot.api.sendMessage(targetId, "🚫 <b>Сиз қоидабузарлик сабабли ботдан блокландингиз.</b>", { parse_mode: "HTML", reply_markup: { remove_keyboard: true } }).catch(() => {});
  } catch(e) {
    ctx.reply("Хатолик юз берди.");
  }
});

bot.command("unban", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const match = ctx.message.text.split(" ");
  if (match.length < 2) return ctx.reply("Қўллаш тартиби: /unban [ID рақам]");
  
  const targetId = parseInt(match[1]);
  try {
    await db.execute("DELETE FROM banned_users WHERE userId = ?", [targetId]);
    await ctx.reply(`✅ <b>${targetId}</b> ID эгаси блокдан чиқарилди.`, { parse_mode: "HTML" });
    await bot.api.sendMessage(targetId, "✅ <b>Блокингиз очилди.</b> Ботдан қайта фойдаланишингиз мумкин. /start", { parse_mode: "HTML" }).catch(() => {});
  } catch(e) {
    ctx.reply("Хатолик юз берди.");
  }
});
bot.callbackQuery("admin_close", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.deleteMessage();
});

bot.callbackQuery("admin_stats", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.answerCallbackQuery("⏳ Статистика юкланмоқда...");
  
  const [[userCount]] = await db.execute("SELECT COUNT(*) as count FROM users");
  const [[activeAds]] = await db.execute("SELECT COUNT(*) as count FROM ads WHERE status = 'active'");
  const [[soldAds]] = await db.execute("SELECT COUNT(*) as count FROM ads WHERE status = 'sold'");
  const [[pendingAds]] = await db.execute("SELECT COUNT(*) as count FROM ads WHERE status = 'pending'");

  const text = `📊 <b>БОТ СТАТИСТИКАСИ</b>\n\n` +
    `👥 Умумий фойдаланувчилар: <b>${userCount.count}</b> та\n` +
    `🟢 Фаол эълонлар (Каналда): <b>${activeAds.count}</b> та\n` +
    `💰 Сотилган мошиналар: <b>${soldAds.count}</b> та\n` +
    `⏳ Тасдиқ кутаётганлар: <b>${pendingAds.count}</b> та\n`;

  await ctx.editMessageText(text, { reply_markup: adminMenu, parse_mode: "HTML" });
});

bot.callbackQuery("admin_broadcast", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.deleteMessage();
  await ctx.conversation.enter("broadcastConversation");
});


/**
 * ✅ МОШИНА ҚИДИРИШ ЖАРАЁНИ
 */
/**
 * ✅ МОШИНА ҚИДИРИШ ЖАРАЁНИ (Тўғирланган)
 */
async function searchCarConversation(conversation, ctx) {
  await ctx.reply("🔍 <b>Қайси мошинани қидиряпсиз?</b>\n<i>(Масалан: Cobalt ёки Gentra)</i>\n\nБекор қилиш учун /cancel ни босинг.", { reply_markup: { remove_keyboard: true }, parse_mode: "HTML" });
  const qRes = await conversation.waitFor("message:text");
  if(qRes.message.text === "/cancel") return ctx.reply("❌ Бекор қилинди.", {reply_markup: mainMenu});
  const query = qRes.message.text.toLowerCase();

  await ctx.reply("💰 <b>Максимал нарх қанча бўлсин? ($)</b>\n<i>(Масалан: 12000)</i>\n\nБекор қилиш учун /cancel ни босинг.", { parse_mode: "HTML" });
  const pRes = await conversation.waitFor("message:text");
  if(pRes.message.text === "/cancel") return ctx.reply("❌ Бекор қилинди.", {reply_markup: mainMenu});
  const maxPrice = parseInt(pRes.message.text.replace(/\D/g, "")) || 999999;

  const waitMsg = await ctx.reply("⏳ <i>Қидирилмоқда...</i>", {parse_mode: "HTML"});

  const [ads] = await db.execute("SELECT * FROM ads WHERE status = 'active'");
  const filtered = ads.filter(ad => {
      const matchQuery = ad.carDetails.toLowerCase().includes(query);
      const price = parseInt(ad.price.replace(/\D/g,"")) || 0;
      return matchQuery && price <= maxPrice;
  });

  await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);

  // --- МАНА ШУ ЕРДА ЎЗГАРИШ БЎЛДИ ---
  if(filtered.length === 0) {
     // Агар мошина топилмаса, шунчаки хабар беради (тўхтатиб қўймайди)
     await ctx.reply(`📭 <b>${maxPrice}$</b> гача бўлган <b>${query}</b> топилмади.`, {parse_mode: "HTML", reply_markup: mainMenu});
  } else {
     // Агар топилса, уларни чиқариб беради
     await ctx.reply(`✅ <b>Топилди: ${filtered.length} та эълон!</b>\nЭнг сўнгги эълонлар:`, {parse_mode: "HTML", reply_markup: mainMenu});

     const resultsToSend = filtered.slice(-3);
     for (const ad of resultsToSend) {
         try {
            if (ad.channelMsgId) {
               await ctx.api.copyMessage(ctx.chat.id, CHANNEL_ID, ad.channelMsgId);
            } else {
               const caption = `🚗 <b>${ad.carDetails}</b>\n📅 Йили: ${ad.year}\n👣 Пробег: ${ad.probeg}\n💰 Нархи: ${ad.price}$\n☎️ Тел: +${ad.phone}`;
               const photos = ad.photoId.split(",");
               await ctx.replyWithPhoto(photos[0], {caption: caption, parse_mode: "HTML"});
            }
         } catch(e) {
            console.error("Қидирув хабарини юборишда хатолик:", e.message);
         }
     }
  }

  // ҲАР ҚАНДАЙ ҲОЛАТДА ҲАМ ОБУНА ТУГМАСИ ЧИҚАДИ
  const alertKb = new InlineKeyboard().text("🔔 Қидирувга обуна бўлиш", `al_sub:${query.substring(0, 20)}:${maxPrice}`);
  await ctx.reply(`<i>Агар шундай мошиналар сотувга чиққанда биринчилардан бўлиб хабардор бўлишни истасангиз, пастдаги тугмани босинг:</i>`, { parse_mode: "HTML", reply_markup: alertKb });
}
bot.use(createConversation(searchCarConversation));

/**
 * ✅ ЭЪЛОН ЯРАТИШ ЖАРАЁНИ
 */
async function createAdConversation(conversation, ctx) {
  const ad = { photos: [] };
  let step = "BRAND";
  let isEditing = false; 
  const chatToClean = []; 

  const carCatalog = {
    "Chevrolet": ["Cobalt", "Gentra", "Lacetti", "Spark", "Nexia 1", "Nexia 2", "Nexia 3", "Matiz", "Damas", "Labo", "Tracker", "Onix", "Monza", "Malibu 1", "Malibu 2", "Captiva", "Equinox", "Tahoe", "Traverse"],
    "Daewoo": ["Matiz", "Nexia 1", "Tico", "Damas"],
    "BYD": ["Chazor", "Song Plus", "Song Pro", "Han", "Tang", "Seagull", "Yuan Up", "Yuan Plus", "Destroyer 05", "e2"],
    "Kia": ["K5", "K8", "Sportage", "Sorento", "Carnival", "Cerato", "Seltos", "Sonet", "Bongo"],
    "Hyundai": ["Accent", "Elantra", "Sonata", "Tucson", "Santa Fe", "Staria", "Porter"],
    "Chery": ["Tiggo 7 Pro", "Tiggo 8 Pro", "Arrizo 6 Pro"],
    "Lada": ["Vesta", "Largus", "Granta", "Niva Legend"],
    "Jetour": ["X70", "X70 Plus", "X90 Plus", "Dashing"],
    "Toyota": ["Camry", "Corolla", "Prado", "Land Cruiser", "RAV4"],
    "Mercedes": ["C-Class", "E-Class", "S-Class", "GLE", "G-Class"],
    "BMW": ["3-Series", "5-Series", "7-Series", "X5", "X7"],
    "Zeekr": ["001", "007", "009", "X"],
    "Li Auto": ["L7", "L8", "L9"],
    "Tesla": ["Model 3", "Model Y", "Model S"],
    "Бошқа": [],
  };

  await ctx.reply("📝 <b>Эълон бериш бошланди.</b>", { reply_markup: { remove_keyboard: true }, parse_mode: "HTML" });

  while (true) {
    let msgPrompt;
    try {
      if (step === "BRAND") {
        const kb = new InlineKeyboard();
        Object.keys(carCatalog).forEach((b, i) => { kb.text(b, `b:${b}`); if ((i + 1) % 3 === 0) kb.row(); });
        kb.row().text("❌ Бекор қилиш", "cancel_ad");
        msgPrompt = await ctx.reply("🚗 <b>Автомобил маркасини танланг:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
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
        kb.row().text("🔙 Орқага", "back_BRAND").text("❌ Бекор қилиш", "cancel_ad");
        msgPrompt = await ctx.reply(`🚙 <b>${ad.brand}</b> моделини танланг ёки ёзинг:`, { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
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
        kb.row().text("🔙 Орқага", "back_MODEL").text("❌ Бекор қилиш", "cancel_ad");
        msgPrompt = await ctx.reply("📅 <b>Йилини танланг ёки ёзинг:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_MODEL") { step = "MODEL"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.year = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text.replace(/\D/g, "");
        if (!ad.year || ad.year.length < 4) { await ctx.reply("❗️ Хато йил киритилди."); continue; }
        
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "PROBEG";
      }

      else if (step === "PROBEG") {
        const kb = new InlineKeyboard().text("Салон (0 км)", "pr:Салон").row().text("🔙 Орқага", "back_YEAR").text("❌ Бекор", "cancel_ad");
        msgPrompt = await ctx.reply("👣 <b>Пробегини киритинг (масалан: 35000):</b>\n<i>Агар мошина янги бўлса 'Салон' ни танланг.</i>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_YEAR") { step = "YEAR"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.probeg = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "PAINT";
      }

      else if (step === "PAINT") {
        const kb = new InlineKeyboard().text("Тоза", "p:Тоза").text("Петно", "p:Петно").text("Бор", "p:Бор")
          .row().text("🔙 Орқага", "back_PROBEG").text("❌ Бекор", "cancel_ad");
        msgPrompt = await ctx.reply("💎 <b>Краскаси ҳолатини танланг ёки ёзинг:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_PROBEG") { step = "PROBEG"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.paint = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "COLOR";
      }

      else if (step === "COLOR") {
        const kb = new InlineKeyboard().text("Оқ", "c:Оқ").text("Қора", "c:Қора").text("Мокрый асфальт", "c:Мокрый асфальт")
          .row().text("Кўк", "c:Кўк").text("Қизил", "c:Қизил").text("Кумушранг (Стальной)", "c:Кумушранг")
          .row().text("🔙 Орқага", "back_PAINT").text("❌ Бекор", "cancel_ad");
        msgPrompt = await ctx.reply("🎨 <b>Мошина рангини танланг ёки ёзинг:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_PAINT") { step = "PAINT"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.color = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "TRANS";
      }

      else if (step === "TRANS") {
        const kb = new InlineKeyboard().text("Механика", "t:Механика").text("Автомат", "t:Автомат")
          .row().text("Робот", "t:Робот").text("Вариатор", "t:Вариатор")
          .row().text("🔙 Орқага", "back_COLOR").text("❌ Бекор", "cancel_ad");
        msgPrompt = await ctx.reply("⚙️ <b>Коробка турини танланг:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_COLOR") { step = "COLOR"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.trans = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "FUEL";
      }

      else if (step === "FUEL") {
        const kb = new InlineKeyboard().text("Бензин", "f:Бензин").text("Бензин+Метан", "f:Бензин+Метан")
          .row().text("Бензин+Пропан", "f:Бензин+Пропан").text("Дизель", "f:Дизель")
          .row().text("Электр", "f:Электр").text("Гибрид", "f:Гибрид")
          .row().text("🔙 Орқага", "back_TRANS").text("❌ Бекор", "cancel_ad");
        msgPrompt = await ctx.reply("⛽ <b>Ёқилғи турини танланг:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_TRANS") { step = "TRANS"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.fuel = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "PRICE";
      }

      else if (step === "PRICE") {
        const kb = new InlineKeyboard().text("🔙 Орқага", "back_FUEL").text("❌ Бекор", "cancel_ad");
        msgPrompt = await ctx.reply("💰 <b>Нархини киритинг ($):</b>\n<i>Фақат сонлардан фойдаланинг. Масалан: 7500</i>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_FUEL") { step = "FUEL"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        let numericPrice = res.message?.text?.replace(/\D/g, "");
        if (!numericPrice) { await ctx.reply("❗️ Илтимос, фақат рақам киритинг."); continue; }
        
        ad.price = numericPrice;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "PHONE";
      }

      else if (step === "PHONE") {
        const kb = new InlineKeyboard().text("🔙 Орқага", "back_PRICE").text("❌ Бекор", "cancel_ad");
        msgPrompt = await ctx.reply("☎️ <b>Телефон рақамингизни киритинг:</b>\n<i>(Масалан: 901234567 ёки 998901234567)</i>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text", "message:contact"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_PRICE") { step = "PRICE"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        let phoneText = res.message?.contact ? res.message.contact.phone_number : res.message?.text;
        let numericPhone = phoneText?.replace(/\D/g, "");
        if (!numericPhone || numericPhone.length < 7) { await ctx.reply("❗️ Тўғри рақам киритинг."); continue; }
        
        ad.phone = numericPhone.startsWith("998") ? numericPhone : `998${numericPhone}`;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "REGION";
      }

      else if (step === "REGION") {
        const regions = ["Тошкент ш.", "Тошкент вил.", "Сирдарё", "Жиззах", "Самарқанд", "Фарғона", "Наманган", "Андижон", "Қашқадарё", "Сурхондарё", "Бухоро", "Навоий", "Хоразм", "Қорақалпоғистон"];
        const kb = new InlineKeyboard();
        regions.forEach((r, i) => { kb.text(r, `r:${r}`); if ((i + 1) % 2 === 0) kb.row(); });
        kb.row().text("🔙 Орқага", "back_PHONE").text("❌ Бекор", "cancel_ad");
        msgPrompt = await ctx.reply("🚩 <b>Вилоятни танланг:</b>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_PHONE") { step = "PHONE"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.region = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "PHOTOS";
      }

      else if (step === "PHOTOS") {
        const kb = new InlineKeyboard().text("✅ Бўлди (Юбориш)", "done_photos").row().text("🔙 Орқага", "back_REGION").text("❌ Бекор", "cancel_ad");
        msgPrompt = await ctx.reply("📸 <b>Мошинангиз расмларини юборинг (1-6 та):</b>\n\n<i>Расмларни белгилаб бирданига юбориш мумкин. Барчасини юбориб бўлгач, «✅ Бўлди» ни босинг.</i>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        
        ad.photos = [];
        while (ad.photos.length < 6) {
          const res = await conversation.waitFor(["message:photo", "callback_query:data"]);
          if (res.message) chatToClean.push(res.message.message_id);
          if (res.callbackQuery?.data === "cancel_ad") { step = "CANCEL"; break; }
          if (res.callbackQuery?.data === "back_REGION") { step = "REGION"; await safeAnswerCbq(res); break; }
          
          if (res.callbackQuery?.data === "done_photos") {
            await safeAnswerCbq(res);
            if (ad.photos.length === 0) {
              let m = await ctx.reply("❗️ Камида 1 та расм юборишингиз керак!");
              chatToClean.push(m.message_id);
              continue;
            }
            step = "PREVIEW"; break;
          }
          if (res.message?.photo) {
            const photoArr = res.message.photo;
            if (Array.isArray(photoArr) && photoArr.length > 0) {
              ad.photos.push(photoArr[photoArr.length - 1].file_id);
              try { await ctx.api.deleteMessage(ctx.chat.id, msgPrompt.message_id); } catch (e) {}
              if (ad.photos.length === 6) { 
                await ctx.reply("✅ Максимал 6 та расм қабул қилинди.");
                step = "PREVIEW"; break; 
              }
              msgPrompt = await ctx.reply(`✅ <b>${ad.photos.length}-расм қабул қилинди!</b>\nЯна расм юборинг ёки «✅ Бўлди (Юбориш)» тугмасини босинг.`, { reply_markup: kb, parse_mode: "HTML" });
              chatToClean.push(msgPrompt.message_id);
            }
          }
        }
        if (step === "CANCEL") break;
        if (step === "REGION") { await deleteMsgs(ctx, chatToClean); continue; }
        await deleteMsgs(ctx, chatToClean);
      }

      else if (step === "PREVIEW") {
        isEditing = false;
        let waitMsg = await ctx.reply("⏳ <b>Эълон тайёрланмоқда, кутинг...</b>", { parse_mode: "HTML" });
        
        const photoUrls = await Promise.all(ad.photos.map(async (id) => {
            const file = await bot.api.getFile(id);
            return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
        }));
        const collagePath = await createCollage(photoUrls);
        
        const caption = 
          `🚗 <b>Мошина:</b> ${ad.brand} ${ad.model}\n` +
          `📅 <b>Йили:</b> ${ad.year}\n👣 <b>Пробег:</b> ${ad.probeg}\n` +
          `💎 <b>Краска:</b> ${ad.paint}\n🎨 <b>Ранги:</b> ${ad.color}\n` +
          `⚙️ <b>Коробка:</b> ${ad.trans}\n⛽ <b>Ёқилғи:</b> ${ad.fuel}\n` +
          `💰 <b>Нархи:</b> ${ad.price}$\n☎️ <b>Тел:</b> +${ad.phone}\n🚩 <b>Вилоят:</b> ${ad.region}`;

        const kb = new InlineKeyboard()
          .text("✅ АДМИНГА ЮБОРИШ", "submit_ad").row()
          .text("✏️ Марка", "edit_BRAND").text("✏️ Модел", "edit_MODEL").text("✏️ Йили", "edit_YEAR").row()
          .text("✏️ Пробег", "edit_PROBEG").text("✏️ Краска", "edit_PAINT").text("✏️ Ранг", "edit_COLOR").row()
          .text("✏️ Коробка", "edit_TRANS").text("✏️ Ёқилғи", "edit_FUEL").text("✏️ Нарх", "edit_PRICE").row()
          .text("✏️ Рақам", "edit_PHONE").text("✏️ Вилоят", "edit_REGION").text("📸 Расм", "edit_PHOTOS").row()
          .text("❌ Бекор қилиш", "cancel_ad");

        await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
        const previewMsg = await ctx.replyWithPhoto(new InputFile(collagePath), {
          caption: `📋 <b>ЭЪЛОН ТАЙЁР!</b> Қуйида текширинг ёки хатоси бўлса таҳрирланг:\n\n${caption}`,
          reply_markup: kb, parse_mode: "HTML"
        });
        
        if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath); 

        const res = await conversation.waitFor("callback_query:data");
        const action = res.callbackQuery.data;
        await safeAnswerCbq(res);
        await ctx.api.deleteMessage(ctx.chat.id, previewMsg.message_id); 

        if (action === "cancel_ad") break;
        
        if (action === "submit_ad") {
          const [result] = await db.execute(
            `INSERT INTO ads (userId, carDetails, year, probeg, paint, color, transmission, fuel, price, phone, region, photoId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [ctx.from.id, `${ad.brand} ${ad.model}`, ad.year, ad.probeg, ad.paint, ad.color, ad.trans, ad.fuel, ad.price, ad.phone, ad.region, ad.photos.join(",")]
          );
          const adId = result.insertId; 
          
          const adminCollage = await createCollage(photoUrls);
          await bot.api.sendPhoto(ADMIN_ID, new InputFile(adminCollage), {
            caption: `🆔 <b>ID: ${adId}</b>\n\n${caption}\n\n👤 Фойдаланувчи: <a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>`,
            reply_markup: new InlineKeyboard().text("✅ Қабул қилиш", `approve:${adId}`).text("❌ Рад этиш", `reject:${adId}`),
            parse_mode: "HTML",
          });
          if (fs.existsSync(adminCollage)) fs.unlinkSync(adminCollage);

          await ctx.reply(
            "✅ <b>Эълонингиз админга муваффақиятли юборилди!</b>\n\nТекширувдан сўнг каналга жойланади. Эълонларингизни пастдаги <b>📂 Менинг эълонларим</b> тугмаси орқали бошқаришингиз мумкин.",
            { parse_mode: "HTML", reply_markup: mainMenu }
          );
          return; 
        }

        if (action.startsWith("edit_")) {
          isEditing = true;
          step = action.split("_")[1];
        }
      }
    } catch (err) {
      console.log(err);
      await ctx.reply("Хатолик юз берди. Илтимос, /start ни босиб қайтадан уриниб кўринг.");
      break;
    }
  }
  await ctx.reply("❌ <b>Эълон бериш бекор қилинди.</b>", { parse_mode: "HTML", reply_markup: mainMenu });
  await deleteMsgs(ctx, chatToClean);
}
bot.use(createConversation(createAdConversation));

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

    const caption =
      `🆔 ID: ${ad.id}\n🚗 Мошина: ${ad.carDetails}\n📅 Йили: ${ad.year}\n👣 Пробег: ${ad.probeg}\n` +
      `💎 Краскаси: ${ad.paint}\n🎨 Ранги: ${ad.color}\n✅ Каробка: ${ad.transmission}\n` +
      `⛽ Ёқилғи: ${ad.fuel}\n💰 Нархи: ${ad.price}$\n☎️ +${ad.phone}\n🚩 #${ad.region.replace(/\s+/g, "_")}\n\n` +
      `⚠️ Мошина савдосига админ жавобгар эмас, олдиндан тўлов қилманг. Огоҳлик давр талаби ❗\n\n👉 https://t.me/engarzonidamoshina`;

    const channelMarkup = new InlineKeyboard().url("👤 ЭЪЛОН АДМИНИ", "https://t.me/uzdev75").row()
      .url("🤖 ЭЪЛОН БЕРИШ (Текин)", "https://t.me/arzonida_bot").url("📢 КАНАЛИМИЗ", "https://t.me/engarzonidamoshina");

    try {
      const msg = await bot.api.sendPhoto(CHANNEL_ID, new InputFile(collagePath), {
        caption: caption, reply_markup: channelMarkup, parse_mode: "HTML",
      });

      await db.execute("UPDATE ads SET status='active', channelMsgId=? WHERE id=?", [msg.message_id, adId]);
      if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
      
      await ctx.editMessageCaption({ caption: "✅ Каналга жойланди!", parse_mode: "HTML" });
      await bot.api.sendMessage(ad.userId, `🎉 <b>Табриклаймиз!</b>\n\nСизнинг <b>${ad.carDetails}</b> эълонингиз каналга жойланди.\n\nКанални кўриш: https://t.me/engarzonidamoshina`, { parse_mode: "HTML", reply_markup: mainMenu });
      try {
        const [alerts] = await db.execute("SELECT * FROM alerts");
        const adPrice = parseInt(ad.price.replace(/\D/g, "")) || 0;
        const adDetails = ad.carDetails.toLowerCase();

        for (const alert of alerts) {
            if (adDetails.includes(alert.query) && adPrice <= alert.maxPrice) {
                try {
                    await bot.api.sendMessage(alert.userId, `🔔 <b>СИЗ ҚИДИРАЁТГАН МОШИНА ЧИҚДИ!</b>\n\nБизнинг каналга сизнинг талабингизга мос мошина жойланди:`, { parse_mode: "HTML" });
                    await bot.api.copyMessage(alert.userId, CHANNEL_ID, msg.message_id);
                } catch(e) {}
            }
        }
      } catch(e) { console.error("Хабарнома юборишда хато:", e); }
    } catch (e) {
      await ctx.reply("Хатолик: Каналга юбориб бўлмади. Бот каналда админ эканлигини текширинг.");
    }
  } else {
     await ctx.answerCallbackQuery("Бу эълон аллақачон кўриб чиқилган.");
  }
});

bot.callbackQuery(/^reject:(\d+)/, async (ctx) => {
  const adId = ctx.match[1];
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
  const ad = rows[0];
  
  if (ad && ad.status === "pending") {
    await db.execute("UPDATE ads SET status='rejected' WHERE id=?", [adId]);
    await ctx.editMessageCaption({ caption: "❌ <b>Эълон рад этилди.</b>", parse_mode: "HTML" });
    try {
        await bot.api.sendMessage(ad.userId, `❌ <b>Эълонингиз рад этилди.</b>\n\nСизнинг <b>${ad.carDetails}</b> эълонингиз қоидаларга мос келмаганлиги сабабли рад этилди. Илтимос, маълумотларни тўғрилаб қайтадан эълон беринг.`, { parse_mode: "HTML", reply_markup: mainMenu });
    } catch (e) {}
  } else {
      await ctx.answerCallbackQuery("Бу эълон аллақачон кўриб чиқилган.");
  }
});

bot.callbackQuery(/^sold_req:(\d+)/, async (ctx) => {
  const adId = ctx.match[1];
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
  const ad = rows[0];

  if (ad && ad.status === 'active') {
      await bot.api.sendMessage(ADMIN_ID, `💰 <b>СОТИЛДИ ХАБАРИ!</b>\n\n🆔 <b>ID: ${adId}</b>\n🚗 <b>Мошина: ${ad.carDetails}</b>\n👤 <b>Узер:</b> <a href="tg://user?id=${ad.userId}">${ctx.from.first_name}</a>`, {
          reply_markup: new InlineKeyboard().text("✅ Тасдиқлаш (Каналда белгилаш)", `confirm_sold:${adId}`), parse_mode: "HTML",
      });
      await ctx.answerCallbackQuery({ text: "Сўров админга юборилди." });
      await ctx.editMessageText(`🆔 <b>ID: ${ad.id}</b>\n🚗 <b>Мошина: ${ad.carDetails}</b>\n\n⏳ <i>Сотилди деб белгилаш бўйича сўров админга юборилди...</i>`, { parse_mode: "HTML" });
  } else {
      await ctx.answerCallbackQuery({ text: "Бу эълон аллақачон ёпилган ёки топилмади.", show_alert: true });
  }
});

bot.callbackQuery(/^confirm_sold:(\d+)/, async (ctx) => {
  const adId = ctx.match[1];
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
  const ad = rows[0];
  
  if (ad && ad.status === 'active') {
      try {
        const newCaption = `💰 <b>СОТИЛДИ!</b>\n\n<s>${ad.carDetails}</s>\n💰 <b>Нархи: ${ad.price}$</b>\n\n❌ <b>Эълон ёпилди.</b>`;
        await bot.api.editMessageCaption(CHANNEL_ID, ad.channelMsgId, { caption: newCaption, parse_mode: "HTML" });
        await db.execute("UPDATE ads SET status='sold' WHERE id=?", [adId]);
        await ctx.editMessageText("✅ <b>Каналда сотилди деб белгиланди!</b>", { parse_mode: "HTML" });
        await bot.api.sendMessage(ad.userId, `🎉 <b>Табриклаймиз!</b>\n\nСизнинг <b>${ad.carDetails}</b> эълонингиз каналда "СОТИЛДИ" деб белгиланди.`, { parse_mode: "HTML" });
      } catch (e) {
        await ctx.reply("Хатолик: Каналдаги хабарни таҳрирлаб бўлмади.");
      }
  } else {
      await ctx.answerCallbackQuery("Бу эълон аллақачон сотилган ёки фаол эмас.");
  }
});

/**
 * ✅ АСОСИЙ КНОПКАЛАР (ВА ФОЙДАЛАНУВЧИНИ БАЗАГА ҚЎШИШ)
 */
/**
 * ✅ АСОСИЙ КНОПКАЛАР (ВА ФОЙДАЛАНУВЧИНИ БАЗАГА ҚЎШИШ)
 */
bot.command("start", async (ctx) => {
  // Фойдаланувчини автоматик тарзда users базасига қўшиш ёки янгилаш
  try {
    const id = ctx.from.id;
    const first_name = ctx.from.first_name || "";
    const username = ctx.from.username ? `@${ctx.from.username}` : "";
    await db.execute(
      "INSERT IGNORE INTO users (id, first_name, username) VALUES (?, ?, ?)", 
      [id, first_name, username]
    );
  } catch (error) {
    console.error("Узерни сақлашда хатолик:", error);
  }

  const welcomeText = 
    `🚗 <b>Авто-бозоримизга хуш келибсиз!</b>\n\n` +
    `Бу бот орқали сиз мошинангизни тез ва осон сотишингиз ёки ўзингизга мос автомобиль топишингиз мумкин.\n\n` +
    `🤖 <b>Ботнинг асосий имкониятлари:</b>\n` +
    `➖ <b>Текин эълон бериш:</b> Мошинангиз маълумотлари ва расмларини юборинг, бот автоматик тарзда чиройли коллаж ясаб каналга жойлайди.\n` +
    `➖ <b>Ақлли қидирув:</b> Ўзингиз излаётган марка ва нархни киритинг, бот каналдаги энг яхши вариантларни топиб беради.\n` +
    `➖ <b>Билдиришнома (Обуна):</b> Сиз излаётган мошина сотувга чиққан заҳоти бот сизга дарҳол хабар беради.\n` +
    `➖ <b>Эълонларни бошқариш:</b> Мошинангиз сотилса ёки нархини туширмоқчи бўлсангиз, эски хабарни ўчирмасдан осонгина янгилашингиз мумкин.\n\n` +
    `👇 <i>Қуйидаги меню орқали ўзингизга керакли бўлимни танланг!</i>`;

  await ctx.reply(welcomeText, {
    reply_markup: mainMenu, 
    parse_mode: "HTML",
  });
});

bot.hears("📝 Эълон Ясаш", async (ctx) => {
  // 1. Обунани текшириш
  if (!(await isSubscribed(ctx))) return askForSub(ctx);

  // ФАҚАТ АДМИН БЎЛМАГАНЛАР УЧУН ЧЕКЛОВЛАР (Админдан буларни сўрамайди)
  if (ctx.from.id !== ADMIN_ID) {
    // 2. Анти-спам: Тасдиқ кутаётган эълони борлигини текшириш
    const [[pendingAds]] = await db.execute(
      "SELECT COUNT(*) as count FROM ads WHERE userId = ? AND status = 'pending'",
      [ctx.from.id]
    );
    
    if (pendingAds.count > 0) {
      return ctx.reply("⏳ <b>Сизнинг олдинги эълонингиз ҳали админлар томонидан кўриб чиқилмоқда.</b>\n\nИлтимос, у тасдиқлангунча ёки рад этилгунча кутиб туринг.", { parse_mode: "HTML" });
    }

    // 3. Лимит: Бир вақтнинг ўзида нечта фаол эълони бўлиши мумкинлиги (масалан, 3 та)
    const [[activeAds]] = await db.execute(
      "SELECT COUNT(*) as count FROM ads WHERE userId = ? AND status = 'active'",
      [ctx.from.id]
    );
    
    if (activeAds.count >= 3) {
      return ctx.reply("❗️ <b>Сизда чеклов мавжуд!</b>\n\nБир вақтнинг ўзида энг кўпи билан <b>3 та</b> фаол эълонингиз бўлиши мумкин. Янги эълон бериш учун '📂 Менинг эълонларим' бўлимидан эскиларини 'Сотилди' деб белгиланг.", { parse_mode: "HTML" });
    }
  }

  // Ҳаммаси жойида бўлса ёки АДМИН бўлса, эълон бериш жараёнини бошлаш
  await ctx.conversation.enter("createAdConversation");
});

bot.hears("🔍 Мошина қидириш", async (ctx) => {
  if (!(await isSubscribed(ctx))) return askForSub(ctx);
  await ctx.conversation.enter("searchCarConversation");
});

bot.hears("📂 Менинг эълонларим", async (ctx) => {
  if (!(await isSubscribed(ctx))) return askForSub(ctx);
  const [ads] = await db.execute("SELECT * FROM ads WHERE userId = ? AND status = 'active'", [ctx.from.id]);
  if (ads.length === 0) return ctx.reply("📭 <b>Сизда ҳозирда фаол эълонлар йўқ.</b>", { parse_mode: "HTML" });

  for (const ad of ads) {
    // 2 ТА ТУГМА ҚЎШИЛДИ: Сотилди ва Нархни тушириш
    const kb = new InlineKeyboard()
      .text("💰 Сотилди", `sold_req:${ad.id}`)
      .text("📉 Нархни тушириш", `edit_price:${ad.id}`);

    await ctx.reply(`🆔 <b>ID: ${ad.id}</b>\n🚗 <b>Мошина: ${ad.carDetails}</b>\n💰 <b>Нархи: ${ad.price}$</b>`, {
      reply_markup: kb, parse_mode: "HTML",
    });
  }
});
/**
 * ✅ НАРХНИ ПАСАЙТИРИШ ЖАРАЁНИ
 */
/**
 * ✅ НАРХНИ ПАСАЙТИРИШ ЖАРАЁНИ (ЯНГИЛАНГАН ВА ТЎҒИРЛАНГАН)
 */
async function editPriceConversation(conversation, ctx) {
  // Session ўрнига ID ни тўғридан-тўғри тугмадан (callback_query) оламиз
  const cbData = ctx.callbackQuery?.data;
  if (!cbData) return;
  const adId = cbData.split(":")[1]; // "edit_price:12" ичидан 12 ни ажратиб олади

  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
  const ad = rows[0];
  
  if (!ad || ad.status !== 'active') {
     return ctx.reply("❌ Бу эълон фаол эмас ёки аллақачон ёпилган.");
  }

  await ctx.reply(`📉 <b>${ad.carDetails}</b> учун янги нархни киритинг ($):\n<i>(Масалан: 8500)</i>\n\nБекор қилиш учун /cancel ни босинг.`, { parse_mode: "HTML" });
  
  const res = await conversation.waitFor("message:text");
  if (res.message.text === "/cancel") {
    return ctx.reply("❌ Нарх ўзгартириш бекор қилинди.", { reply_markup: mainMenu }); //
  }

  let newPrice = res.message.text.replace(/\D/g, "");
  if (!newPrice) {
    return ctx.reply("❗️ Хато нарх киритилди. Амалиёт бекор қилинди.", { reply_markup: mainMenu }); //
  }

  const waitMsg = await ctx.reply("⏳ <i>Каналдаги эълон янгиланмоқда...</i>", { parse_mode: "HTML" });

  try {
    // Каналдаги хабарни таҳрирлаш (Эски нархни чизиб ташлаб, янгисини ёзиш)
    const newCaption = 
      `🆔 ID: ${ad.id}\n🚗 Мошина: ${ad.carDetails}\n📅 Йили: ${ad.year}\n👣 Пробег: ${ad.probeg}\n` +
      `💎 Краскаси: ${ad.paint}\n🎨 Ранги: ${ad.color}\n✅ Каробка: ${ad.transmission}\n` +
      `⛽ Ёқилғи: ${ad.fuel}\n💰 Нархи: <s>${ad.price}$</s> <b>${newPrice}$ 📉</b>\n☎️ +${ad.phone}\n🚩 #${ad.region.replace(/\s+/g, "_")}\n\n` +
      `⚠️ Мошина савдосига админ жавобгар эмас, олдиндан тўлов қилманг. Огоҳлик давр талаби ❗\n\n👉 https://t.me/engarzonidamoshina`;

    const channelMarkup = new InlineKeyboard().url("👤 ЭЪЛОН АДМИНИ", "https://t.me/uzdev75").row()
      .url("🤖 ЭЪЛОН БЕРИШ (Текин)", "https://t.me/arzonida_bot").url("📢 КАНАЛИМИЗ", "https://t.me/engarzonidamoshina");

    await bot.api.editMessageCaption(CHANNEL_ID, ad.channelMsgId, {
      caption: newCaption,
      reply_markup: channelMarkup,
      parse_mode: "HTML"
    });

    // Базада янги нархни сақлаб қўйиш
    await db.execute("UPDATE ads SET price = ? WHERE id = ?", [newPrice, adId]);

    await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply(`✅ <b>Нарх муваффақиятли туширилди!</b>\nКаналда мошинангиз нархи <b>${newPrice}$</b> бўлиб ўзгарди.`, { parse_mode: "HTML", reply_markup: mainMenu }); //

  } catch (error) {
    console.error(error);
    await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply("❌ Хатолик: Каналдаги хабарни янгилаб бўлмади. Эҳтимол эски хабар каналдан ўчирилган бўлиши мумкин.", { reply_markup: mainMenu }); //
  }
}
bot.use(createConversation(editPriceConversation));

// "Нархни тушириш" тугмаси босилганда ишлайдиган код
bot.callbackQuery(/^edit_price:(\d+)/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("editPriceConversation");
});
/**
 * ✅ АҚЛЛИ ХАБАРНОМАГА ОБУНА БЎЛИШ
 */
bot.callbackQuery(/^al_sub:(.+):(\d+)$/, async (ctx) => {
  const query = ctx.match[1];
  const maxPrice = parseInt(ctx.match[2]);
  
  try {
    await db.execute("INSERT INTO alerts (userId, query, maxPrice) VALUES (?, ?, ?)", [ctx.from.id, query, maxPrice]);
    await ctx.editMessageText(`✅ <b>Қидирувга обуна бўлдингиз!</b>\n\nЭнди ботга <b>${maxPrice}$</b> гача бўлган <b>${query}</b> қўшилса ва админ тасдиқласа, сизга автоматик тарзда хабар бераман.`, { parse_mode: "HTML" });
  } catch(e) {
    await ctx.answerCallbackQuery({ text: "Хатолик юз берди.", show_alert: true });
  }
});
bot.start();
console.log("Бот муваффақиятли ишга тушди...");