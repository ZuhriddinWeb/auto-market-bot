require("dotenv").config();
const { Bot, session, InlineKeyboard, InputFile } = require("grammy");
const { conversations, createConversation } = require("@grammyjs/conversations");
const db = require("./database"); 
const fs = require("fs");
const { createCollage, mainMenu } = require("./utils");
const {
  broadcastConversation,
  searchCarConversation,
  createAdConversation,
  editPriceConversation
} = require("./conversations");

const bot = new Bot(process.env.BOT_TOKEN);
const ADMIN_ID = Number(process.env.ADMIN_ID);
const CHANNEL_ID = process.env.CHANNEL_ID.startsWith("@") ? process.env.CHANNEL_ID : `@${process.env.CHANNEL_ID}`;

// ================= БАЗАНИ ЯРАТИШ =================
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
        userId BIGINT, query VARCHAR(255), maxPrice INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS banned_users (
        userId BIGINT PRIMARY KEY, banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ad_edits (
        editId BIGINT AUTO_INCREMENT PRIMARY KEY,
        oldAdId BIGINT, userId BIGINT, carDetails VARCHAR(255), year INT, probeg VARCHAR(255),
        paint VARCHAR(255), color VARCHAR(255), transmission VARCHAR(255), fuel VARCHAR(255),
        price VARCHAR(255), phone VARCHAR(255), region VARCHAR(255), photoId TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    const alterQueries = [
      "ALTER TABLE ads ADD COLUMN history TEXT DEFAULT NULL",
      "ALTER TABLE ads ADD COLUMN barter VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE ads ADD COLUMN videoId VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE ad_edits ADD COLUMN history TEXT DEFAULT NULL",
      "ALTER TABLE ad_edits ADD COLUMN barter VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE ad_edits ADD COLUMN videoId VARCHAR(255) DEFAULT NULL"
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

// ================= MIDDLEWARE (Чеклов ва Ҳолатлар) =================
bot.use(session({ initial: () => ({}) }));
bot.use(async (ctx, next) => {
  if (ctx.from && ctx.from.id !== ADMIN_ID) {
    try {
      const [banned] = await db.execute("SELECT * FROM banned_users WHERE userId = ?", [ctx.from.id]);
      if (banned.length > 0) {
        if (ctx.callbackQuery) return ctx.answerCallbackQuery({ text: "🚫 Сиз ботдан блоклангансиз!", show_alert: true });
        return ctx.reply("🚫 <b>Кечирасиз, сиз ботдан блоклангансиз.</b>", { parse_mode: "HTML", reply_markup: { remove_keyboard: true } });
      }
    } catch(e) {}
  }
  await next();
});
bot.use(async (ctx, next) => {
  if (ctx.message || ctx.callbackQuery) ctx.api.sendChatAction(ctx.chat?.id, "typing").catch(() => {});
  await next();
});

// Жараёнларни улаш
bot.use(conversations());
bot.use(createConversation(broadcastConversation));
bot.use(createConversation(searchCarConversation));
bot.use(createConversation(createAdConversation));
bot.use(createConversation(editPriceConversation));

// ================= ОБУНАНИ ТЕКШИРИШ =================
async function isSubscribed(ctx) {
  if (!ctx.from || ctx.from.id === ADMIN_ID) return true;
  try {
    const member = await ctx.api.getChatMember(CHANNEL_ID, ctx.from.id);
    return ["creator", "administrator", "member"].includes(member.status);
  } catch (e) { return false; }
}
async function askForSub(ctx) {
  await ctx.reply("❌ <b>Ботдан фойдаланиш учун каналимизга обуна бўлинг!</b>", {
    reply_markup: new InlineKeyboard().url("📢 Каналга ўтиш", "https://t.me/engarzonidamoshina").row().text("✅ Обуна бўлдим", "check_sub_ad"),
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

// ================= УМУМИЙ БУЙРУҚ ВА ТУГМАЛАР =================
bot.command("start", async (ctx) => {
  try {
    const username = ctx.from.username ? `@${ctx.from.username}` : "";
    await db.execute("INSERT IGNORE INTO users (id, first_name, username) VALUES (?, ?, ?)", [ctx.from.id, ctx.from.first_name || "", username]);
  } catch (error) {}

  const welcomeText = `🚗 <b>Авто-бозоримизга хуш келибсиз!</b>\n\n` +
    `Бу бот орқали сиз мошинангизни тез ва осон сотишингиз ёки ўзингизга мос автомобиль топишингиз мумкин.\n\n` +
    `👇 <i>Қуйидаги меню орқали ўзингизга керакли бўлимни танланг!</i>`;
  await ctx.reply(welcomeText, { reply_markup: mainMenu, parse_mode: "HTML" });
});

bot.hears("📝 Эълон Ясаш", async (ctx) => {
  if (!(await isSubscribed(ctx))) return askForSub(ctx);
  if (ctx.from.id !== ADMIN_ID) {
    const [[pendingAds]] = await db.execute("SELECT COUNT(*) as count FROM ads WHERE userId = ? AND status = 'pending'", [ctx.from.id]);
    if (pendingAds.count > 0) return ctx.reply("⏳ <b>Олдинги эълонингиз кўриб чиқилмоқда.</b>", { parse_mode: "HTML" });

    const [[activeAds]] = await db.execute("SELECT COUNT(*) as count FROM ads WHERE userId = ? AND status = 'active'", [ctx.from.id]);
    if (activeAds.count >= 3) return ctx.reply("❗️ <b>Лимит:</b> Бир вақтда кўпи билан 3 та эълон бериш мумкин.", { parse_mode: "HTML" });
  }
  ctx.session.editAdData = null;
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
    const kb = new InlineKeyboard()
      .text("💰 Сотилди", `sold_req:${ad.id}`)
      .text("📉 Нархни тушириш", `edit_price:${ad.id}`).row()
      .text("✏️ Тўлиқ таҳрирлаш", `full_edit_req:${ad.id}`);
    await ctx.reply(`🆔 <b>ID: ${ad.id}</b>\n🚗 <b>Мошина: ${ad.carDetails}</b>\n💰 <b>Нархи: ${ad.price}$</b>`, { reply_markup: kb, parse_mode: "HTML" });
  }
});

// ================= БОШҚА ЖАРАЁНЛАР УЧУН CALLBACK'ЛАР =================
bot.callbackQuery(/^full_edit_req:(\d+)/, async (ctx) => {
  await ctx.answerCallbackQuery("⏳ Маълумотлар юкланмоқда...");
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [ctx.match[1]]);
  if (rows.length > 0) {
    ctx.session.editAdData = rows[0]; 
    await ctx.conversation.enter("createAdConversation");
  } else {
    await ctx.answerCallbackQuery({text: "❌ Эълон топилмади.", show_alert: true});
  }
});

bot.callbackQuery(/^edit_price:(\d+)/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("editPriceConversation");
});

bot.callbackQuery(/^al_sub:(.+):(\d+)$/, async (ctx) => {
  try {
    await db.execute("INSERT INTO alerts (userId, query, maxPrice) VALUES (?, ?, ?)", [ctx.from.id, ctx.match[1], parseInt(ctx.match[2])]);
    await ctx.editMessageText(`✅ <b>Қидирувга обуна бўлдингиз!</b>`, { parse_mode: "HTML" });
  } catch(e) {
    await ctx.answerCallbackQuery({ text: "Хатолик юз берди.", show_alert: true });
  }
});

// ================= АДМИН БУЙРУҚЛАРИ =================
const adminMenu = new InlineKeyboard().text("📊 Статистика", "admin_stats").row().text("📢 Рассылка", "admin_broadcast").row().text("❌ Ёпиш", "admin_close");

bot.command("admin", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.reply("👨‍💻 <b>Админ панелга хуш келибсиз!</b>", { reply_markup: adminMenu, parse_mode: "HTML" });
});

bot.command("ban", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const match = ctx.message.text.split(" ");
  if (match.length < 2) return ctx.reply("Қўллаш тартиби: /ban [ID рақам]");
  const targetId = parseInt(match[1]);
  try {
    await db.execute("INSERT IGNORE INTO banned_users (userId) VALUES (?)", [targetId]);
    await ctx.reply(`✅ <b>${targetId}</b> ID эгаси блокланди!`, { parse_mode: "HTML" });
  } catch(e) {}
});

bot.command("unban", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const match = ctx.message.text.split(" ");
  if (match.length < 2) return ctx.reply("Қўллаш тартиби: /unban [ID рақам]");
  const targetId = parseInt(match[1]);
  try {
    await db.execute("DELETE FROM banned_users WHERE userId = ?", [targetId]);
    await ctx.reply(`✅ <b>${targetId}</b> блокдан чиқарилди.`, { parse_mode: "HTML" });
  } catch(e) {}
});

bot.command("up", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const match = ctx.message.text.split(" ");
  if (match.length < 2) return ctx.reply("📝 <b>Қўллаш тартиби:</b> /up [ID рақам]", { parse_mode: "HTML" });
  
  const adId = parseInt(match[1]);
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ? AND status = 'active'", [adId]);
  const ad = rows[0];
  if (!ad) return ctx.reply("❌ Фаол эълон топилмади.");

  const waitMsg = await ctx.reply(`⏳ <i>${adId}-ID ли эълон қайта кўтарилмоқда...</i>`, { parse_mode: "HTML" });

  try {
    const channelMarkup = new InlineKeyboard().url("👤 ЭЪЛОН АДМИНИ", "https://t.me/uzdev75").row().url("🤖 БЕПУЛ ЭЪЛОН", "https://t.me/arzonida_bot").url("📢 КАНАЛИМИЗ", "https://t.me/engarzonidamoshina");
    let newMsgId;

    try {
      const newMsg = await bot.api.copyMessage(CHANNEL_ID, CHANNEL_ID, ad.channelMsgId, { reply_markup: channelMarkup });
      newMsgId = newMsg.message_id;
      if (ad.videoId) { try { await bot.api.sendVideo(CHANNEL_ID, ad.videoId, { reply_to_message_id: newMsgId }); } catch(e){} }
      await bot.api.deleteMessage(CHANNEL_ID, ad.channelMsgId).catch(() => {});
    } catch (copyErr) {
      const photoUrls = await Promise.all(ad.photoId.split(",").map(async (id) => `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${(await bot.api.getFile(id)).file_path}`));
      const collagePath = await createCollage(photoUrls);
      
      let caption = `🆔 ID: ${ad.id}\n🚗 Мошина: ${ad.carDetails}\n📅 Йили: ${ad.year}\n👣 Пробег: ${ad.probeg}\n💎 Краскаси: ${ad.paint}\n🎨 Ранги: ${ad.color}\n✅ Каробка: ${ad.transmission}\n⛽ Ёқилғи: ${ad.fuel}\n`;
      if (ad.history && ad.history !== "Кўрсатилмаган") caption += `🛠 Тарихи: ${ad.history}\n`;
      if (ad.barter && ad.barter !== "Йўқ") caption += `🔄 Бартер: ${ad.barter}\n`;
      caption += `💰 Нархи: ${ad.price}$\n☎️ +${ad.phone}\n🚩 #${ad.region.replace(/\s+/g, "_")}\n\n⚠️ Мошина савдосига админ жавобгар эмас!\n\n👉 https://t.me/engarzonidamoshina`;

      const sentMsg = await bot.api.sendPhoto(CHANNEL_ID, new InputFile(collagePath), { caption: caption, reply_markup: channelMarkup, parse_mode: "HTML" });
      newMsgId = sentMsg.message_id;
      if (ad.videoId) { try { await bot.api.sendVideo(CHANNEL_ID, ad.videoId, { reply_to_message_id: newMsgId }); } catch(e){} }
      if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
    }
    
    await db.execute("UPDATE ads SET channelMsgId = ? WHERE id = ?", [newMsgId, adId]);
    await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
    await ctx.reply(`✅ <b>${adId}-ID</b> муваффақиятли кўтарилди!`, { parse_mode: "HTML" });
  } catch (err) {
    await ctx.reply("❌ Эълонни қайта кўтариб бўлмади.");
  }
});

bot.callbackQuery("admin_close", async (ctx) => { if (ctx.from.id === ADMIN_ID) await ctx.deleteMessage(); });
bot.callbackQuery("admin_broadcast", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.deleteMessage();
  await ctx.conversation.enter("broadcastConversation");
});
bot.callbackQuery("admin_stats", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const [[u]] = await db.execute("SELECT COUNT(*) as count FROM users");
  const [[a]] = await db.execute("SELECT COUNT(*) as count FROM ads WHERE status = 'active'");
  const [[s]] = await db.execute("SELECT COUNT(*) as count FROM ads WHERE status = 'sold'");
  const [[p]] = await db.execute("SELECT COUNT(*) as count FROM ads WHERE status = 'pending'");
  await ctx.editMessageText(`📊 <b>СТАТИСТИКА</b>\n👥 Умумий: ${u.count}\n🟢 Фаол: ${a.count}\n💰 Сотилган: ${s.count}\n⏳ Кутаётган: ${p.count}`, { reply_markup: adminMenu, parse_mode: "HTML" });
});

// ================= АДМИН ТАСДИҚЛАШЛАРИ (Каналга жўнатиш) =================
bot.callbackQuery(/^approve:(\d+)/, async (ctx) => {
  const adId = ctx.match[1];
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [adId]);
  const ad = rows[0];

  if (ad && ad.status === "pending") {
    const photoUrls = await Promise.all(ad.photoId.split(",").map(async (id) => `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${(await bot.api.getFile(id)).file_path}`));
    const collagePath = await createCollage(photoUrls);

    let caption = `🆔 ID: ${ad.id}\n🚗 Мошина: ${ad.carDetails}\n📅 Йили: ${ad.year}\n👣 Пробег: ${ad.probeg}\n💎 Краскаси: ${ad.paint}\n🎨 Ранги: ${ad.color}\n✅ Каробка: ${ad.transmission}\n⛽ Ёқилғи: ${ad.fuel}\n`;
    if (ad.history && ad.history !== "Кўрсатилмаган") caption += `🛠 Тарихи: ${ad.history}\n`;
    if (ad.barter && ad.barter !== "Йўқ") caption += `🔄 Бартер: ${ad.barter}\n`;
    caption += `💰 Нархи: ${ad.price}$\n☎️ +${ad.phone}\n🚩 #${ad.region.replace(/\s+/g, "_")}\n\n⚠️ Мошина савдосига админ жавобгар эмас, олдиндан тўлов қилманг.\n\n👉 https://t.me/engarzonidamoshina`;

    const channelMarkup = new InlineKeyboard().url("👤 ЭЪЛОН АДМИНИ", "https://t.me/uzdev75").row().url("🤖 БЕПУЛ ЭЪЛОН", "https://t.me/arzonida_bot").url("📢 КАНАЛИМИЗ", "https://t.me/engarzonidamoshina");

    try {
      const msg = await bot.api.sendPhoto(CHANNEL_ID, new InputFile(collagePath), { caption: caption, reply_markup: channelMarkup, parse_mode: "HTML" });
      if (ad.videoId) { try { await bot.api.sendVideo(CHANNEL_ID, ad.videoId, { reply_to_message_id: msg.message_id }); } catch(e){} }
      
      await db.execute("UPDATE ads SET status='active', channelMsgId=? WHERE id=?", [msg.message_id, adId]);
      if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
      
      await ctx.editMessageCaption({ caption: "✅ Каналга жойланди!", parse_mode: "HTML" });
      await bot.api.sendMessage(ad.userId, `🎉 <b>Табриклаймиз!</b>\n\nСизнинг <b>${ad.carDetails}</b> эълонингиз каналга жойланди.`, { parse_mode: "HTML" });
      
      try { // Alerts
        const [alerts] = await db.execute("SELECT * FROM alerts");
        const adPrice = parseInt(ad.price.replace(/\D/g, "")) || 0;
        for (const alert of alerts) {
          if (ad.carDetails.toLowerCase().includes(alert.query) && adPrice <= alert.maxPrice) {
            try {
              await bot.api.sendMessage(alert.userId, `🔔 <b>СИЗ ҚИДИРАЁТГАН МОШИНА ЧИҚДИ!</b>`, { parse_mode: "HTML" });
              await bot.api.copyMessage(alert.userId, CHANNEL_ID, msg.message_id);
            } catch(e) {}
          }
        }
      } catch(e) {}
    } catch (e) { await ctx.reply("Хатолик: Каналга юбориб бўлмади."); }
  } else { await ctx.answerCallbackQuery("Бу эълон аллақачон кўриб чиқилган."); }
});

bot.callbackQuery(/^approve_edit:(\d+)/, async (ctx) => {
  const editId = ctx.match[1];
  const [editRows] = await db.execute("SELECT * FROM ad_edits WHERE editId = ?", [editId]);
  if (!editRows[0]) return ctx.answerCallbackQuery("Бу сўров аллақачон кўриб чиқилган.", {show_alert:true});
  const editData = editRows[0];
  const [adRows] = await db.execute("SELECT * FROM ads WHERE id = ?", [editData.oldAdId]);
  const oldAd = adRows[0];

  if (!oldAd || oldAd.status !== 'active') {
      await db.execute("DELETE FROM ad_edits WHERE editId = ?", [editId]);
      return ctx.answerCallbackQuery("Хато: Асл эълон каналда фаол эмас.", {show_alert:true});
  }

  const photoUrls = await Promise.all(editData.photoId.split(",").map(async (id) => `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${(await bot.api.getFile(id)).file_path}`));
  const collagePath = await createCollage(photoUrls);

  let newCaption = `🆔 ID: ${oldAd.id}\n🚗 Мошина: ${editData.carDetails}\n📅 Йили: ${editData.year}\n👣 Пробег: ${editData.probeg}\n💎 Краскаси: ${editData.paint}\n🎨 Ранги: ${editData.color}\n✅ Каробка: ${editData.transmission}\n⛽ Ёқилғи: ${editData.fuel}\n`;
  if (editData.history && editData.history !== "Кўрсатилмаган") newCaption += `🛠 Тарихи: ${editData.history}\n`;
  if (editData.barter && editData.barter !== "Йўқ") newCaption += `🔄 Бартер: ${editData.barter}\n`;
  newCaption += `💰 Нархи: ${editData.price}$\n☎️ +${editData.phone}\n🚩 #${editData.region.replace(/\s+/g, "_")}\n\n⚠️ Мошина савдосига админ жавобгар эмас!\n\n👉 https://t.me/engarzonidamoshina`;

  const channelMarkup = new InlineKeyboard().url("👤 ЭЪЛОН АДМИНИ", "https://t.me/uzdev75").row().url("🤖 БЕПУЛ ЭЪЛОН", "https://t.me/arzonida_bot").url("📢 КАНАЛИМИЗ", "https://t.me/engarzonidamoshina");

  try {
    await bot.api.editMessageMedia(CHANNEL_ID, oldAd.channelMsgId, { type: "photo", media: new InputFile(collagePath), caption: newCaption, parse_mode: "HTML" }, { reply_markup: channelMarkup });
    if (editData.videoId) { try { await bot.api.sendVideo(CHANNEL_ID, editData.videoId, { reply_to_message_id: oldAd.channelMsgId }); } catch (e) {} }

    await db.execute(
      `UPDATE ads SET carDetails=?, year=?, probeg=?, paint=?, color=?, transmission=?, fuel=?, price=?, phone=?, region=?, photoId=?, history=?, barter=?, videoId=? WHERE id=?`,
      [editData.carDetails, editData.year, editData.probeg, editData.paint, editData.color, editData.transmission, editData.fuel, editData.price, editData.phone, editData.region, editData.photoId, editData.history || "Кўрсатилмаган", editData.barter || "Йўқ", editData.videoId || null, oldAd.id]
    );

    await db.execute("DELETE FROM ad_edits WHERE editId = ?", [editId]);
    if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);

    await ctx.editMessageCaption({ caption: "✅ <b>Муваффақиятли янгиланди!</b>", parse_mode: "HTML" });
    await bot.api.sendMessage(editData.userId, `🎉 <b>Табриклаймиз!</b>\n\nЭълонингиз каналда янгиланди.`, { parse_mode: "HTML" });
  } catch (error) { await ctx.reply("❌ Каналдаги эълонни янгилаб бўлмади."); }
});

bot.callbackQuery(/^reject(?:_edit)?:(\d+)/, async (ctx) => {
  const isEdit = ctx.callbackQuery.data.includes("reject_edit");
  const id = ctx.match[1];
  const table = isEdit ? "ad_edits" : "ads";
  const idColumn = isEdit ? "editId" : "id";

  const [rows] = await db.execute(`SELECT * FROM ${table} WHERE ${idColumn} = ?`, [id]);
  if (rows[0]) {
    if (isEdit) { await db.execute("DELETE FROM ad_edits WHERE editId = ?", [id]); } 
    else { await db.execute("UPDATE ads SET status='rejected' WHERE id=?", [id]); }
    await ctx.editMessageCaption({ caption: "❌ <b>Эълон рад этилди.</b>", parse_mode: "HTML" });
    try { await bot.api.sendMessage(rows[0].userId, `❌ <b>Эълон (ёки янгилаш) рад этилди.</b> Илтимос, маълумотларни тўғрилаб қайтадан юборинг.`, { parse_mode: "HTML" }); } catch (e) {}
  }
});

// ================= СОТИЛГАНЛИКНИ БЕЛГИЛАШ =================
bot.callbackQuery(/^sold_req:(\d+)/, async (ctx) => {
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [ctx.match[1]]);
  if (rows[0] && rows[0].status === 'active') {
      await bot.api.sendMessage(ADMIN_ID, `💰 <b>СОТИЛДИ ХАБАРИ!</b>\n\n🆔 <b>ID: ${rows[0].id}</b>\n🚗 <b>Мошина: ${rows[0].carDetails}</b>\n👤 <b>Узер:</b> <a href="tg://user?id=${rows[0].userId}">${ctx.from.first_name}</a>`, {
          reply_markup: new InlineKeyboard().text("✅ Тасдиқлаш (Каналда белгилаш)", `confirm_sold:${rows[0].id}`), parse_mode: "HTML",
      });
      await ctx.editMessageText(`🆔 <b>ID: ${rows[0].id}</b>\n🚗 <b>Мошина: ${rows[0].carDetails}</b>\n\n⏳ <i>Сотилди деб белгилаш сўрови админга юборилди...</i>`, { parse_mode: "HTML" });
  }
});

bot.callbackQuery(/^confirm_sold:(\d+)/, async (ctx) => {
  const [rows] = await db.execute("SELECT * FROM ads WHERE id = ?", [ctx.match[1]]);
  const ad = rows[0];
  if (ad && ad.status === 'active') {
      try {
        const newCaption = `💰 <b>СОТИЛДИ!</b>\n\n<s>${ad.carDetails}</s>\n💰 <b>Нархи: ${ad.price}$</b>\n\n❌ <b>Эълон ёпилди.</b>`;
        await bot.api.editMessageCaption(CHANNEL_ID, ad.channelMsgId, { caption: newCaption, parse_mode: "HTML" });
        await db.execute("UPDATE ads SET status='sold' WHERE id=?", [ad.id]);
        await ctx.editMessageText("✅ <b>Каналда сотилди деб белгиланди!</b>", { parse_mode: "HTML" });
        await bot.api.sendMessage(ad.userId, `🎉 <b>Табриклаймиз!</b>\n\nСизнинг <b>${ad.carDetails}</b> эълонингиз каналда "СОТИЛДИ" деб белгиланди.`, { parse_mode: "HTML" });
      } catch (e) { await ctx.reply("Хатолик: Каналдаги хабарни таҳрирлаб бўлмади."); }
  }
});

bot.start();
console.log("Бот муваффақиятли ишга тушди...");