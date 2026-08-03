require("dotenv").config();
const { Bot, session, InlineKeyboard, Keyboard, InputFile } = require("grammy");
const { conversations, createConversation } = require("@grammyjs/conversations");
const db = require("./database");
const sharp = require("sharp");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const bot = new Bot(process.env.BOT_TOKEN);
const ADMIN_ID = Number(process.env.ADMIN_ID);
const CHANNEL_ID = process.env.CHANNEL_ID.startsWith("@")
  ? process.env.CHANNEL_ID
  : `@${process.env.CHANNEL_ID}`;

bot.catch((err) => console.error(`Хатолик:`, err.error));
bot.use(session({ initial: () => ({}) }));
bot.use(conversations());

/**
 * ✅ АСОСИЙ МЕНЮ
 */
const mainMenu = new Keyboard().text("📝 Эълон Ясаш").row().text("📂 Менинг эълонларим").resized();

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
 * ✅ Расмларни монтиж қилиш (Collage)
 */
async function createCollage(photoUrls) {
  const buffers = await Promise.all(
    photoUrls.map((url) =>
      axios.get(url, { responseType: "arraybuffer" }).then((res) => res.data)
    )
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

  const collagePath = path.join(__dirname, `collage_${Date.now()}.jpg`);
  await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toFile(collagePath);

  return collagePath;
}

/**
 * ✅ ЭЪЛОН ЯРАТИШ ЖАРАЁНИ (Conversation)
 */
async function createAdConversation(conversation, ctx) {
  const adData = {};

  await ctx.reply(
    "📝 <b>Эълон бериш жараёни бошланди.</b>\n\nИсталган вақтда жараённи бекор қилиш ва асосий менюга қайтиш учун <b>/cancel</b> сўзини ёзинг.", 
    { parse_mode: "HTML", reply_markup: { remove_keyboard: true } }
  );

  // --- ҚАДАМ 1: Бренд ва Модель ---
  const carCatalog = {
    Chevrolet: ["Matiz", "Spark", "Nexia 1", "Nexia 2", "Nexia 3", "Cobalt", "Gentra", "Lacetti", "Damas", "Tracker", "Malibu 1", "Malibu 2", "Captiva", "Equinox", "Tahoe"],
    BYD: ["Chazor", "Song Plus", "Song Pro", "Han", "Tang", "Seagull"],
    Kia: ["K5", "K8", "Sportage", "Seltos", "Carnival", "Sorento", "Cerato", "Bongo"],
    Chery: ["Tiggo 7 Pro", "Tiggo 8 Pro", "Arrizo 6 Pro"],
    Hyundai: ["Accent", "Elantra", "Sonata", "Tucson", "Santa Fe"],
    Lada: ["Vesta", "Largus", "Niva Legend"],
    Boshqa: [],
  };

  const brandK = new InlineKeyboard();
  Object.keys(carCatalog).forEach((b, i) => {
    brandK.text(b, `brand:${b}`);
    if ((i + 1) % 3 === 0) brandK.row();
  });

  await ctx.reply("🚗 <b>Автомобил маркасини танланг:</b>", { reply_markup: brandK, parse_mode: "HTML" });
  let bRes = await conversation.waitFor(["callback_query:data", "message:text"]);
  if (bRes.message?.text === "/cancel") return ctx.reply("❌ Бекор қилинди.", { reply_markup: mainMenu });

  if (bRes.callbackQuery) {
    adData.brand = bRes.callbackQuery.data.split(":")[1];
    await safeAnswerCbq(bRes);
  } else {
    adData.brand = bRes.message.text;
  }

  if (carCatalog[adData.brand] && carCatalog[adData.brand].length > 0) {
    const modelK = new InlineKeyboard();
    carCatalog[adData.brand].forEach((m, i) => {
      modelK.text(m, `model:${m}`);
      if ((i + 1) % 3 === 0) modelK.row();
    });

    await ctx.reply(`🚙 <b>${adData.brand}</b> моделини танланг:`, { reply_markup: modelK, parse_mode: "HTML" });
    let mRes = await conversation.waitFor(["callback_query:data", "message:text"]);
    if (mRes.message?.text === "/cancel") return ctx.reply("❌ Бекор қилинди.", { reply_markup: mainMenu });

    adData.model = mRes.callbackQuery ? mRes.callbackQuery.data.split(":")[1] : mRes.message.text;
    await safeAnswerCbq(mRes);
  } else {
    await ctx.reply("✍️ <b>Модель номини ёзинг:</b>", { parse_mode: "HTML" });
    let mRes = await conversation.waitFor("message:text");
    if (mRes.message.text === "/cancel") return ctx.reply("❌ Бекор қилинди.", { reply_markup: mainMenu });
    adData.model = mRes.message.text;
  }

  // --- ҚАДАМ 2: Йили ---
  const yK = new InlineKeyboard();
  for (let y = 2026; y >= 1996; y--) {
    yK.text(y.toString(), `y:${y}`);
    if ((2026 - y + 1) % 4 === 0) yK.row();
  }

  await ctx.reply("📅 <b>Йилини танланг ёки ёзинг:</b>", { reply_markup: yK, parse_mode: "HTML" });
  while (true) {
    let yRes = await conversation.waitFor(["callback_query:data", "message:text"]);
    if (yRes.message?.text === "/cancel") return ctx.reply("❌ Бекор қилинди.", { reply_markup: mainMenu });

    if (yRes.callbackQuery) {
      adData.year = yRes.callbackQuery.data.split(":")[1];
      await safeAnswerCbq(yRes);
      break;
    } else {
      let typedYear = parseInt(yRes.message.text);
      if (typedYear > 1900 && typedYear <= 2026) {
        adData.year = typedYear.toString();
        break;
      }
      await ctx.reply("❗️ Илтимос, йилини тўғри киритинг (мас: 2018):");
    }
  }

  // --- ҚАДАМ 3: Пробег ---
  await ctx.reply("👣 <b>Пробегини киритинг (масалан: 35000 ёки Салон):</b>", { parse_mode: "HTML" });
  let probegRes = await conversation.waitFor("message:text");
  if (probegRes.message.text === "/cancel") return ctx.reply("❌ Бекор қилинди.", { reply_markup: mainMenu });
  adData.probeg = probegRes.message.text;

  // --- ҚАДАМ 4: Краска ---
  const pK = new InlineKeyboard().text("Тоза", "p:Тоза").text("Петно", "p:Петно").text("Бор", "p:Бор");
  await ctx.reply("💎 <b>Краскаси ҳолатини танланг ёки ёзинг:</b>", { reply_markup: pK, parse_mode: "HTML" });
  let krRes = await conversation.waitFor(["callback_query:data", "message:text"]);
  if (krRes.message?.text === "/cancel") return ctx.reply("❌ Бекор қилинди.", { reply_markup: mainMenu });
  adData.paint = krRes.callbackQuery ? krRes.callbackQuery.data.split(":")[1] : krRes.message.text;
  await safeAnswerCbq(krRes);

  // --- ҚАДАМ 5: Ранги ---
  await ctx.reply("🎨 <b>Мошина рангини ёзинг:</b>", { parse_mode: "HTML" });
  let colorRes = await conversation.waitFor("message:text");
  if (colorRes.message.text === "/cancel") return ctx.reply("❌ Бекор қилинди.", { reply_markup: mainMenu });
  adData.color = colorRes.message.text;

  // --- ҚАДАМ 6: Каробка ---
  const tK = new InlineKeyboard()
    .text("Mexanika", "t:Mexanika").text("Avtomat", "t:Avtomat").row()
    .text("Robot", "t:Robot").text("Variator", "t:Variator");

  await ctx.reply("⚙️ <b>Коробка турини танланг:</b>", { reply_markup: tK, parse_mode: "HTML" });
  let trRes = await conversation.waitFor(["callback_query:data", "message:text"]);
  if (trRes.message?.text === "/cancel") return ctx.reply("❌ Бекор қилинди.", { reply_markup: mainMenu });
  adData.trans = trRes.callbackQuery ? trRes.callbackQuery.data.split(":")[1] : trRes.message.text;
  await safeAnswerCbq(trRes);

  // --- ҚАДАМ 7: Ёқилғи ---
  const fK = new InlineKeyboard()
    .text("Benzin", "f:Benzin").text("Benzin+Metan", "f:Benzin+Metan").row()
    .text("Benzin+Propan", "f:Benzin+Propan").text("Gibrid", "f:Gibrid").row()
    .text("Elektr", "f:Elektr");

  await ctx.reply("⛽ <b>Ёқилғи турини танланг:</b>", { reply_markup: fK, parse_mode: "HTML" });
  let flRes = await conversation.waitFor(["callback_query:data", "message:text"]);
  if (flRes.message?.text === "/cancel") return ctx.reply("❌ Бекор қилинди.", { reply_markup: mainMenu });
  adData.fuel = flRes.callbackQuery ? flRes.callbackQuery.data.split(":")[1] : flRes.message.text;
  await safeAnswerCbq(flRes);

  // --- ҚАДАМ 8: Нархи (Валидация билан) ---
  await ctx.reply("💰 <b>Нархини киритинг ($):</b>\n<i>Фақат сонлардан фойдаланинг. Масалан: 7500</i>", { parse_mode: "HTML" });
  while (true) {
    let priceRes = await conversation.waitFor("message:text");
    if (priceRes.message.text === "/cancel") return ctx.reply("❌ Бекор қилинди.", { reply_markup: mainMenu });
    
    let numericPrice = priceRes.message.text.replace(/\D/g, ""); // Фақат рақамларни ажратиб олиш
    if (numericPrice.length > 0) {
      adData.price = numericPrice;
      break;
    }
    await ctx.reply("❗️ Илтимос, нархни фақат рақамларда киритинг (мас: 7500):");
  }

  // --- ҚАДАМ 9: Телефон рақам (Актив контакт сўраш) ---
  const phoneKeyboard = new Keyboard().requestContact("📱 Рақамимни юбориш").resized().oneTime();
  await ctx.reply("☎️ <b>Телефон рақамингизни юборинг ёки киритинг:</b>\n<i>(Масалан: 998901234567)</i>", { 
    reply_markup: phoneKeyboard, 
    parse_mode: "HTML" 
  });
  
  while (true) {
    let phoneRes = await conversation.waitFor(["message:contact", "message:text"]);
    if (phoneRes.message?.text === "/cancel") return ctx.reply("❌ Бекор қилинди.", { reply_markup: mainMenu });

    if (phoneRes.message?.contact) {
      adData.phone = phoneRes.message.contact.phone_number.replace(/\D/g, "");
      break;
    } else if (phoneRes.message?.text) {
      let numericPhone = phoneRes.message.text.replace(/\D/g, "");
      if (numericPhone.length >= 7) {
        adData.phone = numericPhone;
        break;
      }
    }
    await ctx.reply("❗️ Илтимос, тўғри телефон рақамини киритинг:");
  }
  await ctx.reply("✅ Рақам қабул қилинди.", { reply_markup: { remove_keyboard: true } });

  // --- ҚАДАМ 10: Вилоятлар ---
  const regions = [
    "Тошкент ш.", "Тошкент вил.", "Сирдарё", "Жиззах", "Самарқанд", "Фарғона", "Наманган", 
    "Андижон", "Қашқадарё", "Сурхондарё", "Бухоро", "Навоий", "Хоразм", "Қорақалпоғистон",
  ];
  const regK = new InlineKeyboard();
  regions.forEach((r, i) => {
    regK.text(r, `r:${r}`);
    if ((i + 1) % 2 === 0) regK.row();
  });

  await ctx.reply("🚩 <b>Вилоятни танланг:</b>", { reply_markup: regK, parse_mode: "HTML" });
  let rgRes = await conversation.waitFor(["callback_query:data", "message:text"]);
  if (rgRes.message?.text === "/cancel") return ctx.reply("❌ Бекор қилинди.", { reply_markup: mainMenu });
  adData.region = rgRes.callbackQuery ? rgRes.callbackQuery.data.split(":")[1] : rgRes.message.text;
  await safeAnswerCbq(rgRes);

  // --- ҚАДАМ 11: Расмлар (Альбомни тўғри қабул қилиш) ---
  const photoIds = [];
  const doneK = new InlineKeyboard().text("✅ Бўлди (Юбориш)", "done_photos");

  await ctx.reply(
    "📸 <b>Мошинангиз расмларини юборинг (1-6 та):</b>\n\n<i>Расмларни белгилаб бирданига юборишингиз мумкин. Барча расмларни юбориб бўлгач, пастдаги «✅ Бўлди» тугмасини босинг.</i>",
    { parse_mode: "HTML", reply_markup: doneK }
  );

  while (photoIds.length < 6) {
    const pCtx = await conversation.waitFor(["message:photo", "callback_query:data", "message:text"]);

    if (pCtx.message?.text === "/cancel") return ctx.reply("❌ Бекор қилинди.", { reply_markup: mainMenu });

    if (pCtx.callbackQuery?.data === "done_photos") {
      await safeAnswerCbq(pCtx);
      if (photoIds.length === 0) {
        await ctx.reply("❗️ Камида 1 та расм юборишингиз керак!", { reply_markup: doneK });
        continue;
      }
      break;
    }

    if (pCtx.message?.photo) {
      const photoArr = pCtx.message.photo;
      if (Array.isArray(photoArr) && photoArr.length > 0) {
        const lastPhoto = photoArr[photoArr.length - 1]; // eng kattasi
        photoIds.push(lastPhoto.file_id);
        
        if (photoIds.length === 6) {
          await ctx.reply("✅ Максимал 6 та расм қабул қилинди.");
          break;
        }
      }
    } else {
        await ctx.reply("📸 Илтимос, фақат <b>расм</b> юборинг ёки «✅ Бўлди» ни босинг.", { reply_markup: doneK, parse_mode: "HTML" });
    }
  }

  if (photoIds.length === 0) return ctx.reply("❌ Расм юборилмади. Эълон бекор қилинди.", { reply_markup: mainMenu });

  await ctx.reply("⏳ <b>Маълумотлар тайёрланмоқда, кутинг...</b>", { parse_mode: "HTML" });

  const photoUrls = await Promise.all(
    photoIds.map(async (id) => {
      const file = await bot.api.getFile(id);
      return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    })
  );

  const collagePath = await createCollage(photoUrls);
  
  // Тел рақамни форматлаш (+998 бўлмаса қўшиш)
  let finalPhone = adData.phone.startsWith("998") ? adData.phone : `998${adData.phone}`;

  const caption =
    `🚗 <b>Мошина: ${adData.brand} ${adData.model}</b>\n📅 <b>Йили: ${adData.year}</b>\n👣 <b>Пробег: ${adData.probeg}</b>\n` +
    `💎 <b>Краска: ${adData.paint}</b>\n🎨 <b>Ранги: ${adData.color}</b>\n⚙️ <b>Коробка: ${adData.trans}</b>\n` +
    `⛽ <b>Ёқилғи: ${adData.fuel}</b>\n💰 <b>Нархи: ${adData.price}$</b>\n☎️ <b>Тел: +${finalPhone}</b>\n🚩 <b>Вилоят: ${adData.region}</b>`;

  await ctx.replyWithPhoto(new InputFile(collagePath), {
    caption: `📝 <b>Сизнинг эълонингиз:</b>\n\n${caption}`,
    reply_markup: new InlineKeyboard().text("✅ Тасдиқлаш ва Юбориш", "confirm").text("❌ Бекор қилиш", "cancel_ad"),
    parse_mode: "HTML",
  });

  const choice = await conversation.waitFor("callback_query:data");
  await safeAnswerCbq(choice);

  if (choice.callbackQuery.data === "confirm") {
    const info = db.prepare(
        `INSERT INTO ads (userId, carDetails, year, probeg, paint, color, transmission, fuel, price, phone, region, photoId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        ctx.from.id, `${adData.brand} ${adData.model}`, adData.year, adData.probeg, adData.paint, 
        adData.color, adData.trans, adData.fuel, adData.price, finalPhone, adData.region, photoIds.join(",")
      );

    const adId = info.lastInsertRowid;

    await bot.api.sendPhoto(ADMIN_ID, new InputFile(collagePath), {
      caption: `🆔 <b>ID: ${adId}</b>\n\n${caption}\n\n👤 Фойдаланувчи: <a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>`,
      reply_markup: new InlineKeyboard().text("✅ Қабул қилиш", `approve:${adId}`).text("❌ Рад этиш", `reject:${adId}`),
      parse_mode: "HTML",
    });

    await ctx.reply(
      "✅ <b>Эълонингиз админга юборилди!</b>\n\n" +
      "Тасдиқланганидан сўнг каналда эълон қилинади. " +
      "Агар машинангиз сотилса, пастки <b>📂 Менинг эълонларим</b> тугмаси орқали эълонингизни топиб, <b>💰 Сотилди</b> тугмасини босишни унутманг!",
      { parse_mode: "HTML", reply_markup: mainMenu }
    );
  } else {
    await ctx.reply("❌ <b>Эълон бекор қилинди.</b>", { parse_mode: "HTML", reply_markup: mainMenu });
  }

  if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
}

bot.use(createConversation(createAdConversation));

/**
 * ✅ АДМИН ТАСДИҚЛАШИ (Каналга юбориш)
 */
bot.callbackQuery(/^approve:(\d+)/, async (ctx) => {
  const adId = ctx.match[1];
  const ad = db.prepare("SELECT * FROM ads WHERE id = ?").get(adId);

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
      `🆔 ID: ${ad.id}\n` +
      `🚗 Мошина: ${ad.carDetails}\n` +
      `📅 Йили: ${ad.year}\n` +
      `👣 Пробег: ${ad.probeg}\n` +
      `💎 Краскаси: ${ad.paint}\n` +
      `🎨 Ранги: ${ad.color}\n` +
      `✅ Каробка: ${ad.transmission}\n` +
      `⛽ Ёқилғи: ${ad.fuel}\n` +
      `💰 Нархи: ${ad.price}$\n` +
      `☎️ +${ad.phone}\n` +
      `🚩 #${ad.region.replace(/\s+/g, "_")}\n\n` +
      `⚠️ Мошина савдосига админ жавобгар эмас, олдиндан тўлов қилманг. Огоҳлик давр талаби ❗\n\n` +
      `👉 https://t.me/engarzonidamoshina`;

    const channelMarkup = new InlineKeyboard()
      .url("👤 ЭЪЛОН АДМИНИ", "https://t.me/uzdev75")
      .row()
      .url("🤖 ЭЪЛОН БЕРИШ (Текин)", "https://t.me/arzonida_bot")
      .url("📢 КАНАЛИМИЗ", "https://t.me/engarzonidamoshina");

    try {
      const msg = await bot.api.sendPhoto(CHANNEL_ID, new InputFile(collagePath), {
        caption: caption,
        reply_markup: channelMarkup,
        parse_mode: "HTML",
      });

      db.prepare("UPDATE ads SET status='active', channelMsgId=? WHERE id=?").run(msg.message_id, adId);
      if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
      
      await ctx.editMessageCaption({ caption: "✅ Каналга жойланди!", parse_mode: "HTML" });
      
      // Фойдаланувчига эълон чиққанини хабар қилиш
      await bot.api.sendMessage(
        ad.userId, 
        `🎉 <b>Табриклаймиз!</b>\n\nСизнинг <b>${ad.carDetails}</b> эълонингиз каналга жойланди.\n\nКанални кўриш: https://t.me/engarzonidamoshina`,
        { parse_mode: "HTML", reply_markup: mainMenu }
      );
    } catch (e) {
      console.error(e);
      await ctx.reply("Хатолик: Каналга юбориб бўлмади. Бот каналда админ эканлигини текширинг.");
    }
  } else {
     await ctx.answerCallbackQuery("Бу эълон аллақачон кўриб чиқилган.");
  }
});

/**
 * ✅ АДМИН РАД ЭТИШИ (Фойдаланувчига хабар юбориш билан)
 */
bot.callbackQuery(/^reject:(\d+)/, async (ctx) => {
  const adId = ctx.match[1];
  const ad = db.prepare("SELECT * FROM ads WHERE id = ?").get(adId);
  
  if (ad && ad.status === "pending") {
    db.prepare("UPDATE ads SET status='rejected' WHERE id=?").run(adId);
    await ctx.editMessageCaption({ caption: "❌ <b>Эълон рад этилди.</b>", parse_mode: "HTML" });
    
    try {
        await bot.api.sendMessage(
            ad.userId,
            `❌ <b>Эълонингиз рад этилди.</b>\n\nСизнинг <b>${ad.carDetails}</b> учун берган эълонингиз қоидаларга мос келмаганлиги ёки маълумотлари нотўғри бўлганлиги сабабли админ томонидан рад этилди.\n\nИлтимос, маълумотларни текшириб, қайтадан эълон беринг.`,
            { parse_mode: "HTML", reply_markup: mainMenu }
        );
    } catch (e) {
        console.log("Foydalanuvchiga xabar yuborib bo'lmadi");
    }
  } else {
      await ctx.answerCallbackQuery("Бу эълон аллақачон кўриб чиқилган.");
  }
});

/**
 * ✅ МЕНИНГ ЭЪЛОНЛАРИМ
 */
bot.hears("📂 Менинг эълонларим", async (ctx) => {
  const ads = db.prepare("SELECT * FROM ads WHERE userId = ? AND status = 'active'").all(ctx.from.id);
  if (ads.length === 0) return ctx.reply("📭 <b>Сизда ҳозирда фаол эълонлар йўқ.</b>", { parse_mode: "HTML" });

  for (const ad of ads) {
    await ctx.reply(`🆔 <b>ID: ${ad.id}</b>\n🚗 <b>Мошина: ${ad.carDetails}</b>\n💰 <b>Нархи: ${ad.price}$</b>`, {
      reply_markup: new InlineKeyboard().text("💰 Сотилди", `sold_req:${ad.id}`),
      parse_mode: "HTML",
    });
  }
});

bot.callbackQuery(/^sold_req:(\d+)/, async (ctx) => {
  const adId = ctx.match[1];
  const ad = db.prepare("SELECT * FROM ads WHERE id = ?").get(adId);

  if (ad && ad.status === 'active') {
      await bot.api.sendMessage(
        ADMIN_ID,
        `💰 <b>СОТИЛДИ ХАБАРИ!</b>\n\n🆔 <b>ID: ${adId}</b>\n🚗 <b>Мошина: ${ad.carDetails}</b>\n👤 <b>Узер:</b> <a href="tg://user?id=${ad.userId}">${ctx.from.first_name}</a>`,
        {
          reply_markup: new InlineKeyboard().text("✅ Тасдиқлаш (Каналда белгилаш)", `confirm_sold:${adId}`),
          parse_mode: "HTML",
        }
      );

      await ctx.answerCallbackQuery({ text: "Сўров админга юборилди." });
      await ctx.editMessageText(`🆔 <b>ID: ${ad.id}</b>\n🚗 <b>Мошина: ${ad.carDetails}</b>\n\n⏳ <i>Сотилди деб белгилаш бўйича сўров админга юборилди...</i>`, {
        parse_mode: "HTML",
      });
  } else {
      await ctx.answerCallbackQuery({ text: "Бу эълон аллақачон ёпилган ёки топилмади.", show_alert: true });
  }
});

bot.callbackQuery(/^confirm_sold:(\d+)/, async (ctx) => {
  const adId = ctx.match[1];
  const ad = db.prepare("SELECT * FROM ads WHERE id = ?").get(adId);

  if (ad && ad.status === 'active') {
      try {
        const newCaption = `💰 <b>СОТИЛДИ!</b>\n\n<s>${ad.carDetails}</s>\n💰 <b>Нархи: ${ad.price}$</b>\n\n❌ <b>Эълон ёпилди.</b>`;
        await bot.api.editMessageCaption(CHANNEL_ID, ad.channelMsgId, { caption: newCaption, parse_mode: "HTML" });
        db.prepare("UPDATE ads SET status='sold' WHERE id=?").run(adId);
        await ctx.editMessageText("✅ <b>Каналда сотилди деб белгиланди!</b>", { parse_mode: "HTML" });
        
        // Foydalanuvchiga xabar yuborish
        await bot.api.sendMessage(
            ad.userId, 
            `🎉 <b>Табриклаймиз!</b>\n\nСизнинг <b>${ad.carDetails}</b> эълонингиз каналда "СОТИЛДИ" деб белгиланди.`,
            { parse_mode: "HTML" }
        );
      } catch (e) {
        await ctx.reply("Хатолик: Каналдаги хабарни таҳрирлаб бўлмади.");
      }
  } else {
      await ctx.answerCallbackQuery("Бу эълон аллақачон сотилган ёки фаол эмас.");
  }
});

/**
 * ✅ СТАРТ
 */
bot.command("start", (ctx) => {
  ctx.reply("🌟 <b>Хуш келибсиз!</b>\n\nЭълон бериш ёки ўз эълонларингизни бошқариш учун пастки тугмалардан фойдаланинг.", {
    reply_markup: mainMenu,
    parse_mode: "HTML",
  });
});

bot.hears("📝 Эълон Ясаш", (ctx) => ctx.conversation.enter("createAdConversation"));

bot.start();
console.log("Бот муваффақиятли ишга тушди...");