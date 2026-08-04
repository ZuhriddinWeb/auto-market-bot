require("dotenv").config();
const { Bot, session, InlineKeyboard, Keyboard, InputFile } = require("grammy");
const { conversations, createConversation } = require("@grammyjs/conversations");
const db = require("./database"); // MySQL pool ulangan bo'lishi kerak
const sharp = require("sharp");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const bot = new Bot(process.env.BOT_TOKEN);
const ADMIN_ID = Number(process.env.ADMIN_ID);
const CHANNEL_ID = process.env.CHANNEL_ID.startsWith("@")
  ? process.env.CHANNEL_ID
  : `@${process.env.CHANNEL_ID}`;

// Расмларни сақлаш учун алоҳида папка яратиш
const collagesDir = path.join(__dirname, "collages");
if (!fs.existsSync(collagesDir)) {
  fs.mkdirSync(collagesDir, { recursive: true });
}

bot.catch((err) => console.error(`Хатолик:`, err.error));
bot.use(session({ initial: () => ({}) }));
bot.use(conversations());

/**
 * ✅ АСОСИЙ МЕНЮ (Қидирув қўшилди)
 */
const mainMenu = new Keyboard()
  .text("📝 Эълон Ясаш").text("🔍 Мошина қидириш").row()
  .text("📂 Менинг эълонларим").resized();

/**
 * ✅ МАЖБУРИЙ ОБУНАНИ ТЕКШИРУВЧИ ФУНКЦИЯЛАР
 */
async function isSubscribed(ctx) {
  if (!ctx.from) return true;
  if (ctx.from.id === ADMIN_ID) return true; // Админдан сўрамайди
  try {
    const member = await ctx.api.getChatMember(CHANNEL_ID, ctx.from.id);
    return ["creator", "administrator", "member"].includes(member.status);
  } catch (e) {
    return false; // Агар бот каналда админ бўлмаса ёки узер аъзо бўлмаса
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

/**
 * ✅ Callback'ni xavfsiz answer qilish
 */
async function safeAnswerCbq(ctx) {
  try {
    const id = ctx?.callbackQuery?.id || ctx?.update?.callback_query?.id;
    if (id) await ctx.api.answerCallbackQuery(id);
  } catch (_) {}
}

/**
 * ✅ Хабарларни тозалаш
 */
async function deleteMsgs(ctx, msgIds) {
  for (const id of msgIds) {
    try {
      if (id) await ctx.api.deleteMessage(ctx.chat.id, id);
    } catch (e) {}
  }
  msgIds.length = 0; 
}

/**
 * ✅ Расмларни монтиж қилиш (Коллаж + ВАТЕРМАРКА)
 */
async function createCollage(photoUrls) {
  const buffers = await Promise.all(
    photoUrls.map((url) => axios.get(url, { responseType: "arraybuffer" }).then((res) => res.data))
  );

  const resizedImages = await Promise.all(
    buffers.map((buf) => sharp(buf).resize(600, 600, { fit: "cover" }).toBuffer())
  );

  const columns = 2;
  const rows = Math.ceil(resizedImages.length / columns);
  const canvasWidth = columns * 600;
  const canvasHeight = rows * 600;

  const composites = resizedImages.map((input, index) => ({
    input,
    top: Math.floor(index / columns) * 600,
    left: (index % columns) * 600,
  }));

  // Ватермарка яратиш (Хира текст)
  const watermarkSvg = `
    <svg width="${canvasWidth}" height="${canvasHeight}">
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="${Math.floor(canvasWidth * 0.05)}" fill="rgba(255, 255, 255, 0.45)" stroke="rgba(0, 0, 0, 0.3)" stroke-width="2" font-weight="bold">
        @engarzonidamoshina
      </text>
    </svg>`;

  composites.push({
    input: Buffer.from(watermarkSvg),
    top: 0,
    left: 0
  });

  const collagePath = path.join(collagesDir, `collage_${Date.now()}.jpg`);
  await sharp({
    create: { width: canvasWidth, height: canvasHeight, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toFile(collagePath);

  return collagePath;
}

/**
 * ✅ МОШИНА ҚИДИРИШ ЖАРАЁНИ (ЯНГИ)
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

  // MySQL'дан фаол эълонларни тортиб олиб фильтрлаш
  const [ads] = await db.execute("SELECT * FROM ads WHERE status = 'active'");
  const filtered = ads.filter(ad => {
      const matchQuery = ad.carDetails.toLowerCase().includes(query);
      const price = parseInt(ad.price.replace(/\D/g,"")) || 0;
      return matchQuery && price <= maxPrice;
  });

  await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);

  if(filtered.length === 0) {
     return ctx.reply(`📭 <b>${maxPrice}$</b> гача бўлган <b>${query}</b> топилмади.`, {parse_mode: "HTML", reply_markup: mainMenu});
  }

  await ctx.reply(`✅ <b>Топилди: ${filtered.length} та эълон!</b>\nЭнг сўнгги эълонлар:`, {parse_mode: "HTML", reply_markup: mainMenu});

  // Топилганларидан фақат охирги 3 тасини расми билан жўнатиш
  const resultsToSend = filtered.slice(-3);
  for(const ad of resultsToSend) {
     const caption = `🚗 <b>${ad.carDetails}</b>\n📅 Йили: ${ad.year}\n👣 Пробег: ${ad.probeg}\n💰 Нархи: ${ad.price}$\n☎️ Тел: +${ad.phone}`;
     const photos = ad.photoId.split(",");
     try {
        await ctx.replyWithPhoto(photos[0], {caption: caption, parse_mode: "HTML"});
     } catch(e) {}
  }
}
bot.use(createConversation(searchCarConversation));

/**
 * ✅ ЭЪЛОН ЯРАТИШ ЖАРАЁНИ (PRO - STATE MACHINE)
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
            "✅ <b>Эълонингиз админга муваффақиятли юборилди!</b>\n\n" +
            "Текширувдан сўнг каналга жойланади. Эълонларингизни пастдаги <b>📂 Менинг эълонларим</b> тугмаси орқали бошқаришингиз мумкин.",
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
 * ✅ АДМИН ТАСДИҚЛАШИ
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
    } catch (e) {
      await ctx.reply("Хатолик: Каналга юбориб бўлмади. Бот каналда админ эканлигини текширинг.");
    }
  } else {
     await ctx.answerCallbackQuery("Бу эълон аллақачон кўриб чиқилган.");
  }
});

/**
 * ✅ АДМИН РАД ЭТИШИ
 */
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

/**
 * ✅ МЕНИНГ ЭЪЛОНЛАРИМ ВА СОТИЛДИ ХАБАРЛАРИ
 */
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
 * ✅ АСОСИЙ КНОПКАЛАР УШЛАГИЧЛАРИ (ОБУНА ТЕКШИРУВИ БИЛАН)
 */
bot.command("start", (ctx) => {
  ctx.reply("🌟 <b>Хуш келибсиз!</b>\n\nЭълон бериш ёки ўз эълонларингизни бошқариш учун пастки тугмалардан фойдаланинг.", {
    reply_markup: mainMenu, parse_mode: "HTML",
  });
});

bot.hears("📝 Эълон Ясаш", async (ctx) => {
  if (!(await isSubscribed(ctx))) return askForSub(ctx);
  ctx.conversation.enter("createAdConversation");
});

bot.hears("🔍 Мошина қидириш", async (ctx) => {
  if (!(await isSubscribed(ctx))) return askForSub(ctx);
  ctx.conversation.enter("searchCarConversation");
});

bot.hears("📂 Менинг эълонларим", async (ctx) => {
  if (!(await isSubscribed(ctx))) return askForSub(ctx);
  const [ads] = await db.execute("SELECT * FROM ads WHERE userId = ? AND status = 'active'", [ctx.from.id]);
  if (ads.length === 0) return ctx.reply("📭 <b>Сизда ҳозирда фаол эълонлар йўқ.</b>", { parse_mode: "HTML" });

  for (const ad of ads) {
    await ctx.reply(`🆔 <b>ID: ${ad.id}</b>\n🚗 <b>Мошина: ${ad.carDetails}</b>\n💰 <b>Нархи: ${ad.price}$</b>`, {
      reply_markup: new InlineKeyboard().text("💰 Сотилди", `sold_req:${ad.id}`), parse_mode: "HTML",
    });
  }
});

bot.start();
console.log("Бот муваффақиятли ишга тушди...");