require("dotenv").config();
const { InlineKeyboard, InputFile } = require("grammy");
const fs = require("fs");
const db = require("./database");
const { createCollage, safeAnswerCbq, deleteMsgs, mainMenu } = require("./utils");

const ADMIN_ID = Number(process.env.ADMIN_ID);
const CHANNEL_ID = process.env.CHANNEL_ID.startsWith("@") ? process.env.CHANNEL_ID : `@${process.env.CHANNEL_ID}`;

// ================= АДМИН РАССЫЛКА =================
async function broadcastConversation(conversation, ctx) {
  const adminMenu = new InlineKeyboard().text("📊 Статистика", "admin_stats").row().text("📢 Рассылка", "admin_broadcast").row().text("❌ Ёпиш", "admin_close");
  await ctx.reply("📢 <b>Рассылка учун хабарни юборинг:</b>\n<i>(Матн, расм, видео юборишингиз мумкин. Бекор қилиш учун /cancel)</i>", { parse_mode: "HTML" });
  const res = await conversation.waitFor("message");
  
  if (res.message.text === "/cancel") return ctx.reply("❌ Рассылка бекор қилинди.", { reply_markup: adminMenu });

  const waitMsg = await ctx.reply("⏳ <i>Хабар юборилмоқда... Бу бироз вақт олиши мумкин.</i>", { parse_mode: "HTML" });
  const [users] = await db.execute("SELECT id FROM users");
  let success = 0, failed = 0;

  for (const u of users) {
    try {
      await ctx.api.copyMessage(u.id, res.chat.id, res.message.message_id);
      success++;
      await new Promise(r => setTimeout(r, 50));
    } catch (error) { failed++; }
  }
  await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
  await ctx.reply(`✅ <b>Рассылка тугади!</b>\n\n🟢 Муваффақиятли: ${success} та\n🔴 Блокланган/Хато: ${failed} та`, { parse_mode: "HTML", reply_markup: adminMenu });
}

// ================= ҚИДИРУВ =================
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
  const filtered = ads.filter(ad => ad.carDetails.toLowerCase().includes(query) && (parseInt(ad.price.replace(/\D/g,"")) || 0) <= maxPrice);

  await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);

  if(filtered.length === 0) {
     await ctx.reply(`📭 <b>${maxPrice}$</b> гача бўлган <b>${query}</b> топилмади.`, {parse_mode: "HTML", reply_markup: mainMenu});
  } else {
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
         } catch(e) {}
     }
  }
  const alertKb = new InlineKeyboard().text("🔔 Қидирувга обуна бўлиш", `al_sub:${query.substring(0, 20)}:${maxPrice}`);
  await ctx.reply(`<i>Агар шундай мошиналар сотувга чиққанда биринчилардан бўлиб хабардор бўлишни истасангиз, пастдаги тугмани босинг:</i>`, { parse_mode: "HTML", reply_markup: alertKb });
}

// ================= НАРХ ТУШИРИШ =================
async function editPriceConversation(conversation, ctx) {
  const cbData = ctx.callbackQuery?.data;
  if (!cbData) return;
  const adId = cbData.split(":")[1];

  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
  const ad = rows[0];
  if (!ad || ad.status !== 'active') return ctx.reply("❌ Бу эълон фаол эмас ёки аллақачон ёпилган.");

  await ctx.reply(`📉 <b>${ad.carDetails}</b> учун янги нархни киритинг ($):\n<i>(Масалан: 8500)</i>\n\nБекор қилиш учун /cancel ни босинг.`, { parse_mode: "HTML" });
  
  const res = await conversation.waitFor("message:text");
  if (res.message.text === "/cancel") return ctx.reply("❌ Нарх ўзгартириш бекор қилинди.", { reply_markup: mainMenu });

  let newPrice = res.message.text.replace(/\D/g, "");
  if (!newPrice) return ctx.reply("❗️ Хато нарх киритилди. Амалиёт бекор қилинди.", { reply_markup: mainMenu });

  const waitMsg = await ctx.reply("⏳ <i>Каналдаги эълон янгиланмоқда...</i>", { parse_mode: "HTML" });

  try {
    const newCaption = `🆔 ID: ${ad.id}\n🚗 Мошина: ${ad.carDetails}\n📅 Йили: ${ad.year}\n👣 Пробег: ${ad.probeg}\n` +
      `💎 Краскаси: ${ad.paint}\n🎨 Ранги: ${ad.color}\n✅ Каробка: ${ad.transmission}\n` +
      `⛽ Ёқилғи: ${ad.fuel}\n💰 Нархи: <s>${ad.price}$</s> <b>${newPrice}$ 📉</b>\n☎️ +${ad.phone}\n🚩 #${ad.region.replace(/\s+/g, "_")}\n\n` +
      `⚠️ Мошина савдосига админ жавобгар эмас, олдиндан тўлов қилманг. Огоҳлик давр талаби ❗\n\n👉 https://t.me/engarzonidamoshina`;

    const channelMarkup = new InlineKeyboard().url("👤 ЭЪЛОН АДМИНИ", "https://t.me/uzdev75").row()
      .url("🤖 БЕПУЛ ЭЪЛОН", "https://t.me/arzonida_bot").url("📢 КАНАЛИМИЗ", "https://t.me/engarzonidamoshina");

    await ctx.api.editMessageCaption(CHANNEL_ID, ad.channelMsgId, { caption: newCaption, reply_markup: channelMarkup, parse_mode: "HTML" });
    await db.execute("UPDATE ads SET price = ? WHERE id = ?", [newPrice, adId]);

    await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply(`✅ <b>Нарх муваффақиятли туширилди!</b>\nКаналда мошинангиз нархи <b>${newPrice}$</b> бўлиб ўзгарди.`, { parse_mode: "HTML", reply_markup: mainMenu });
  } catch (error) {
    await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply("❌ Хатолик: Каналдаги хабарни янгилаб бўлмади. Эҳтимол эски хабар каналдан ўчирилган бўлиши мумкин.", { reply_markup: mainMenu });
  }
}

// ================= ЭЪЛОН ЯРАТИШ =================
async function createAdConversation(conversation, ctx) {
  const ad = { photos: [] };
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
      ad.brand = parts[0] || "Бошқа";
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
      step = "PREVIEW";
    }
  }

  let isEditing = false; 
  const chatToClean = []; 
  await ctx.reply(isFullUpdate ? "📝 <b>Эълонни таҳрирлаш бошланди.</b>" : "📝 <b>Эълон бериш бошланди.</b>", { reply_markup: { remove_keyboard: true }, parse_mode: "HTML" });

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
        step = isEditing ? "PREVIEW" : "HISTORY";
      }

      else if (step === "HISTORY") {
        const kb = new InlineKeyboard().text("Ўтказиб юбориш", "skip_history").row().text("🔙 Орқага", "back_REGION").text("❌ Бекор", "cancel_ad");
        msgPrompt = await ctx.reply(
          "🛠 <b>Мошина тарихи ва хизмат кўрсатиш ҳолати:</b>\n\n" +
          "<i>Харидорлар ишончини ошириш учун мошинага қандай қаралганини ёзинг. Масалан:\n" +
          "«2 йил олдин LPG ўрнатилган, ҳар 7500 км да Liqui Moly Molygen 5w-30 қуйилган, 46 минг км да каробка мойи алмаштирилган.»</i>\n\n" +
          "Ёзишни истамасангиз «Ўтказиб юбориш» ни босинг.", { reply_markup: kb, parse_mode: "HTML" }
        );
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_REGION") { step = "REGION"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.history = res.callbackQuery?.data === "skip_history" ? "Кўрсатилмаган" : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "BARTER";
      }

      else if (step === "BARTER") {
        const kb = new InlineKeyboard().text("Йўқ, фақат нақд", "brtr:Йўқ").row().text("🔙 Орқага", "back_HISTORY").text("❌ Бекор", "cancel_ad");
        msgPrompt = await ctx.reply("🔄 <b>Бартер (Айирбошлаш) борми?</b>\n\n<i>Агар бор бўлса, қайси мошиналарга алмашишингизни ёзинг. Агар йўқ бўлса тугмани босинг.</i>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        const res = await conversation.waitFor(["callback_query:data", "message:text"]);
        if (res.message) chatToClean.push(res.message.message_id);
        if (res.callbackQuery?.data === "cancel_ad") break;
        if (res.callbackQuery?.data === "back_HISTORY") { step = "HISTORY"; await safeAnswerCbq(res); await deleteMsgs(ctx, chatToClean); continue; }

        ad.barter = res.callbackQuery ? res.callbackQuery.data.split(":")[1] : res.message.text;
        await safeAnswerCbq(res);
        await deleteMsgs(ctx, chatToClean);
        step = isEditing ? "PREVIEW" : "MEDIA";
      }

      else if (step === "MEDIA") {
        const kb = new InlineKeyboard().text("✅ Бўлди (Юбориш)", "done_media").row().text("🔙 Орқага", "back_BARTER").text("❌ Бекор", "cancel_ad");
        msgPrompt = await ctx.reply("📸🎥 <b>Расм ва қисқа Видео юборинг (Макс 6 та расм, 1 та видео):</b>\n\n<i>Видео юбориш мажбурий эмас, лекин мошинани 30 сониялик видеога олиб юборсангиз, тезроқ сотилади!</i>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        
        ad.photos = ad.photos || [];
        ad.videoId = ad.videoId || null;

        while (ad.photos.length < 6 || !ad.videoId) {
          const res = await conversation.waitFor(["message:photo", "message:video", "callback_query:data"]);
          if (res.message) chatToClean.push(res.message.message_id);
          if (res.callbackQuery?.data === "cancel_ad") { step = "CANCEL"; break; }
          if (res.callbackQuery?.data === "back_BARTER") { step = "BARTER"; await safeAnswerCbq(res); break; }
          
          if (res.callbackQuery?.data === "done_media") {
            await safeAnswerCbq(res);
            if (ad.photos.length === 0) {
              let m = await ctx.reply("❗️ Камида 1 та расм юборишингиз керак!");
              chatToClean.push(m.message_id);
              continue;
            }
            step = "PREVIEW"; break;
          }

          if (res.message?.photo) {
            if (ad.photos.length >= 6) { await ctx.reply("❗️ 6 та расм тўлди."); continue; }
            const photoArr = res.message.photo;
            ad.photos.push(photoArr[photoArr.length - 1].file_id);
            try { await ctx.api.deleteMessage(ctx.chat.id, msgPrompt.message_id); } catch (e) {}
            msgPrompt = await ctx.reply(`✅ <b>${ad.photos.length}-расм қабул қилинди!</b>\nЯна расм/видео юборинг ёки «✅ Бўлди» ни босинг.`, { reply_markup: kb, parse_mode: "HTML" });
            chatToClean.push(msgPrompt.message_id);
          } else if (res.message?.video) {
            if (ad.videoId) { await ctx.reply("❗️ Сиз аллақачон видео юбордингиз."); continue; }
            ad.videoId = res.message.video.file_id;
            try { await ctx.api.deleteMessage(ctx.chat.id, msgPrompt.message_id); } catch (e) {}
            msgPrompt = await ctx.reply(`✅ <b>Видео қабул қилинди!</b>\nРасм юборишда давом этинг ёки «✅ Бўлди» ни босинг.`, { reply_markup: kb, parse_mode: "HTML" });
            chatToClean.push(msgPrompt.message_id);
          }
        }
        if (step === "CANCEL") break;
        if (step === "BARTER") { await deleteMsgs(ctx, chatToClean); continue; }
        await deleteMsgs(ctx, chatToClean);
      }

      else if (step === "PREVIEW") {
        isEditing = false;
        let waitMsg = await ctx.reply("⏳ <b>Ақлли тизим эълонни таҳлил қилмоқда...</b>", { parse_mode: "HTML" });
        
        const numericPrice = parseInt(ad.price) || 0;
        let priceBadge = "";
        
        try {
            const [avgRows] = await db.execute("SELECT AVG(CAST(price AS UNSIGNED)) as avgPrice FROM ads WHERE carDetails LIKE ? AND status = 'active'", [`%${ad.model}%`]);
            const avgPrice = avgRows[0].avgPrice;
            
            if (avgPrice && numericPrice < avgPrice * 0.95) { 
                priceBadge = " 🔥 (Қайноқ нарх)";
            } else if (avgPrice && numericPrice > avgPrice * 1.1) {
                priceBadge = " 📈 (Бозордан бироз қиммат)";
            }
        } catch (e) {
            console.error("Нарх аналитикаси хатоси:", e);
        }

        const photoUrls = await Promise.all(ad.photos.map(async (id) => {
            const file = await ctx.api.getFile(id);
            return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
        }));
        const collagePath = await createCollage(photoUrls);
        
        let caption = 
          `🚗 <b>Мошина:</b> ${ad.brand} ${ad.model}\n` +
          `📅 <b>Йили:</b> ${ad.year}\n👣 <b>Пробег:</b> ${ad.probeg}\n` +
          `💎 <b>Краска:</b> ${ad.paint}\n🎨 <b>Ранги:</b> ${ad.color}\n` +
          `⚙️ <b>Коробка:</b> ${ad.trans}\n⛽ <b>Ёқилғи:</b> ${ad.fuel}\n`;

        if (ad.history && ad.history !== "Кўрсатилмаган") caption += `🛠 <b>Тарихи:</b> ${ad.history}\n`;
        if (ad.barter && ad.barter !== "Йўқ") caption += `🔄 <b>Бартер:</b> ${ad.barter}\n`;

        caption += `💰 <b>Нархи:</b> ${ad.price}$${priceBadge}\n☎️ <b>Тел:</b> +${ad.phone}\n🚩 <b>Вилоят:</b> ${ad.region}`;
        if (ad.videoId) caption += `\n🎥 <i>(Ушбу эълонда видео-обзор мавжуд!)</i>`;

        const kb = new InlineKeyboard()
          .text("✅ АДМИНГА ЮБОРИШ", "submit_ad").row()
          .text("✏️ Марка", "edit_BRAND").text("✏️ Модел", "edit_MODEL").text("✏️ Йили", "edit_YEAR").row()
          .text("✏️ Пробег", "edit_PROBEG").text("✏️ Краска", "edit_PAINT").text("✏️ Ранг", "edit_COLOR").row()
          .text("✏️ Коробка", "edit_TRANS").text("✏️ Ёқилғи", "edit_FUEL").text("✏️ Нарх", "edit_PRICE").row()
          .text("✏️ Рақам", "edit_PHONE").text("✏️ Вилоят", "edit_REGION")
          .text("📸🎥 Расм/Видео", "edit_MEDIA").row()
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
          if (isFullUpdate) {
            const [result] = await db.execute(
              `INSERT INTO ad_edits (oldAdId, userId, carDetails, year, probeg, paint, color, transmission, fuel, price, phone, region, photoId, history, barter, videoId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [updateAdId, ctx.from.id, `${ad.brand} ${ad.model}`, ad.year, ad.probeg, ad.paint, ad.color, ad.trans, ad.fuel, ad.price, ad.phone, ad.region, ad.photos.join(","), ad.history || "Кўрсатилмаган", ad.barter || "Йўқ", ad.videoId || null]
            );
            const editId = result.insertId; 
            
            const adminCollage = await createCollage(photoUrls);
            const adminMsg = await ctx.api.sendPhoto(ADMIN_ID, new InputFile(adminCollage), {
              caption: `🔄 <b>ЭЪЛОННИ ЯНГИЛАШ СЎРОВИ!</b>\n\n🆔 <b>Эски ID: ${updateAdId}</b>\n\n${caption}\n\n👤 Фойдаланувчи: <a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>`,
              reply_markup: new InlineKeyboard().text("✅ Ўзгаришни тасдиқлаш", `approve_edit:${editId}`).text("❌ Рад этиш", `reject_edit:${editId}`),
              parse_mode: "HTML",
            });
            if (fs.existsSync(adminCollage)) fs.unlinkSync(adminCollage);

            if (ad.videoId) {
                await ctx.api.sendVideo(ADMIN_ID, ad.videoId, { reply_to_message_id: adminMsg.message_id });
            }

            ctx.session.editAdData = null; 
            await ctx.reply("✅ <b>Таҳрирланган эълон админга муваффақиятли юборилди!</b>\n\nТекширувдан сўнг каналдаги эълон янгиланади.", { parse_mode: "HTML", reply_markup: mainMenu });
            return; 
          }

          const [result] = await db.execute(
            `INSERT INTO ads (userId, carDetails, year, probeg, paint, color, transmission, fuel, price, phone, region, photoId, history, barter, videoId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [ctx.from.id, `${ad.brand} ${ad.model}`, ad.year, ad.probeg, ad.paint, ad.color, ad.trans, ad.fuel, ad.price, ad.phone, ad.region, ad.photos.join(","), ad.history || "Кўрсатилмаган", ad.barter || "Йўқ", ad.videoId || null]
          );
          const adId = result.insertId; 
          
          const adminCollage = await createCollage(photoUrls);
          const adminMsg = await ctx.api.sendPhoto(ADMIN_ID, new InputFile(adminCollage), {
            caption: `🆔 <b>ID: ${adId}</b>\n\n${caption}\n\n👤 Фойдаланувчи: <a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>`,
            reply_markup: new InlineKeyboard().text("✅ Қабул қилиш", `approve:${adId}`).text("❌ Рад этиш", `reject:${adId}`),
            parse_mode: "HTML",
          });
          if (fs.existsSync(adminCollage)) fs.unlinkSync(adminCollage);

          if (ad.videoId) {
              await ctx.api.sendVideo(ADMIN_ID, ad.videoId, { reply_to_message_id: adminMsg.message_id });
          }

          ctx.session.editAdData = null; 
          await ctx.reply("✅ <b>Эълонингиз админга муваффақиятли юборилди!</b>\n\nТекширувдан сўнг каналга жойланади.", { parse_mode: "HTML", reply_markup: mainMenu });
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
  
  ctx.session.editAdData = null; 
  await ctx.reply("❌ <b>Эълон бериш бекор қилинди.</b>", { parse_mode: "HTML", reply_markup: mainMenu });
  await deleteMsgs(ctx, chatToClean);
}

module.exports = {
  broadcastConversation,
  searchCarConversation,
  editPriceConversation,
  createAdConversation
};