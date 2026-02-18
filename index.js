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
 * ✅ Callback'ni xavfsiz answer qilish (har doim xato bermaydi)
 */
async function safeAnswerCbq(ctx) {
  try {
    const id = ctx?.callbackQuery?.id || ctx?.update?.callback_query?.id;
    if (id) await ctx.api.answerCallbackQuery(id);
  } catch (_) {
    // jim
  }
}

/**
 * Расмларни монтиж қилиш (Collage)
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
 * ЭЪЛОН ЯРАТИШ ЖАРАЁНИ
 */
async function createAdConversation(conversation, ctx) {
  const adData = {};

  // 1. Бренд ва Модель
  const carCatalog = {
    Chevrolet: [
      "Matiz",
      "Spark",
      "Nexia 1",
      "Nexia 2",
      "Nexia 3",
      "Cobalt",
      "Gentra",
      "Lacetti",
      "Damas",
      "Labo",
      "Tracker",
      "Malibu 1",
      "Malibu 2",
      "Captiva",
      "Equinox",
      "Traverse",
      "Tahoe",
      "Orlando",
    ],
    BYD: ["Chazor", "Song Plus", "Song Pro", "Han", "Tang", "Seal", "Seagull", "Yuan Plus", "Destroyer 05"],
    Kia: ["K5", "K8", "Sportage", "Seltos", "Carnival", "Sorento", "Stinger", "Cerato", "EV6", "Bongo"],
    Chery: ["Tiggo 7 Pro", "Tiggo 8 Pro", "Tiggo 8 Pro Max", "Arrizo 6 Pro", "Omoda E5"],
    Hyundai: ["Accent", "Elantra", "Sonata", "Tucson", "Santa Fe", "Palisade", "Staria", "Bayon", "Creta"],
    Jetour: ["X70", "X70 Plus", "X90 Plus", "Dashing"],
    Skoda: ["Kodiaq", "Octavia"],
    Volkswagen: ["ID.4", "ID.6", "Teramont", "Tayron"],
    Toyota: ["Corolla", "Camry", "Prado", "Land Cruiser 300", "RAV4", "Hilux"],
    "Mercedes-Benz": ["C-Class", "E-Class", "S-Class", "GLE", "GLS"],
    BMW: ["X5", "X7", "3-Series", "5-Series", "7-Series"],
    Lada: ["Vesta", "X-Ray", "Largus", "Niva Legend", "Niva Travel"],
    Exeed: ["LX", "TXL", "VX"],
    Haval: ["Jolion", "H6", "M6", "Dargo"],
    Zeekr: ["001", "X", "009"],
    Geely: ["Coolray", "Monjaro", "Tugella"],
    Boshqa: [],
  };

  const brandK = new InlineKeyboard();
  Object.keys(carCatalog).forEach((b, i) => {
    brandK.text(b, `brand:${b}`);
    if ((i + 1) % 3 === 0) brandK.row();
  });

  await ctx.reply("🚗 <b>Автомобил маркасини танланг:</b>", { reply_markup: brandK, parse_mode: "HTML" });
  const bRes = await conversation.waitFor(["callback_query:data", "message:text"]);

  if (bRes.callbackQuery) {
    adData.brand = bRes.callbackQuery.data.split(":")[1];
    await safeAnswerCbq(bRes);
  } else {
    adData.brand = bRes.message.text;
  }

  if (carCatalog[adData.brand]) {
    const modelK = new InlineKeyboard();
    carCatalog[adData.brand].forEach((m, i) => {
      modelK.text(m, `model:${m}`);
      if ((i + 1) % 3 === 0) modelK.row();
    });

    await ctx.reply(`🚙 <b>${adData.brand}</b> моделини танланг:`, { reply_markup: modelK, parse_mode: "HTML" });
    const mRes = await conversation.waitFor(["callback_query:data", "message:text"]);

    adData.model = mRes.callbackQuery ? mRes.callbackQuery.data.split(":")[1] : mRes.message.text;
    await safeAnswerCbq(mRes);
  } else {
    await ctx.reply("✍️ <b>Модель номини ёзинг:</b>", { parse_mode: "HTML" });
    adData.model = (await conversation.waitFor("message:text")).message.text;
  }

  // 2. Йили
  const yK = new InlineKeyboard();
  for (let y = 2026; y >= 1996; y--) {
    yK.text(y.toString(), `y:${y}`);
    if ((2026 - y + 1) % 4 === 0) yK.row();
  }

  await ctx.reply("📅 <b>Йилини танланг:</b>", { reply_markup: yK, parse_mode: "HTML" });
  const yRes = await conversation.waitFor(["callback_query:data", "message:text"]);
  adData.year = yRes.callbackQuery ? yRes.callbackQuery.data.split(":")[1] : yRes.message.text;
  await safeAnswerCbq(yRes);

  // 3. Пробег
  await ctx.reply("👣 <b>Пробегини киритинг (масалан: 35,000 км):</b>", { parse_mode: "HTML" });
  adData.probeg = (await conversation.waitFor("message:text")).message.text;

  // 4. Краска
  const pK = new InlineKeyboard().text("Тоза", "p:Тоза").text("Петно", "p:Петно").text("Бор", "p:Бор");
  await ctx.reply("💎 <b>Краскаси ҳолатини танланг:</b>", { reply_markup: pK, parse_mode: "HTML" });
  const krRes = await conversation.waitFor(["callback_query:data", "message:text"]);
  adData.paint = krRes.callbackQuery ? krRes.callbackQuery.data.split(":")[1] : krRes.message.text;
  await safeAnswerCbq(krRes);

  // 5. Ранги
  await ctx.reply("🎨 <b>Мошина рангини ёзинг:</b>", { parse_mode: "HTML" });
  adData.color = (await conversation.waitFor("message:text")).message.text;

  // 6. Каробка
  const tK = new InlineKeyboard()
    .text("Mexanika", "t:Mexanika")
    .text("Avtomat", "t:Avtomat")
    .row()
    .text("Robot", "t:Robot")
    .text("Variator", "t:Variator");

  await ctx.reply("⚙️ <b>Коробка турини танланг:</b>", { reply_markup: tK, parse_mode: "HTML" });
  const trRes = await conversation.waitFor(["callback_query:data", "message:text"]);
  adData.trans = trRes.callbackQuery ? trRes.callbackQuery.data.split(":")[1] : trRes.message.text;
  await safeAnswerCbq(trRes);

  // 7. Ёқилғи
  const fK = new InlineKeyboard()
    .text("Benzin", "f:Benzin")
    .text("Benzin+Metan", "f:Benzin+Metan")
    .row()
    .text("Benzin+Propan", "f:Benzin+Propan")
    .text("Gibrid", "f:Gibrid")
    .row()
    .text("Elektr", "f:Elektr");

  await ctx.reply("⛽ <b>Ёқилғи турини танланг:</b>", { reply_markup: fK, parse_mode: "HTML" });
  const flRes = await conversation.waitFor(["callback_query:data", "message:text"]);
  adData.fuel = flRes.callbackQuery ? flRes.callbackQuery.data.split(":")[1] : flRes.message.text;
  await safeAnswerCbq(flRes);

  // 8. Нархи ва Тел
  await ctx.reply("💰 <b>Нархини киритинг ($):</b>", { parse_mode: "HTML" });
  adData.price = (await conversation.waitFor("message:text")).message.text;

  await ctx.reply("☎️ <b>Телефон (901234567):</b>", { parse_mode: "HTML" });
  adData.phone = (await conversation.waitFor("message:text")).message.text;

  // 9. Вилоятлар
  const regions = [
    "Тошкент ш.",
    "Тошкент вил.",
    "Сирдарё",
    "Жиззах",
    "Самарқанд",
    "Фарғона",
    "Наманган",
    "Андижон",
    "Қашқадарё",
    "Сурхондарё",
    "Бухоро",
    "Навоий",
    "Хоразм",
    "Қорақалпоғистон",
  ];

  const regK = new InlineKeyboard();
  regions.forEach((r, i) => {
    regK.text(r, `r:${r}`);
    if ((i + 1) % 2 === 0) regK.row();
  });

  await ctx.reply("🚩 <b>Вилоятни танланг:</b>", { reply_markup: regK, parse_mode: "HTML" });
  const rgRes = await conversation.waitFor(["callback_query:data", "message:text"]);
  adData.region = rgRes.callbackQuery ? rgRes.callbackQuery.data.split(":")[1] : rgRes.message.text;
  await safeAnswerCbq(rgRes);

  // 10. Расмлар
  const photoIds = [];
  const doneK = new InlineKeyboard().text("✅ Бўлди", "done_photos");

  // ✅ doneK'ni boshida ham chiqaramiz
  await ctx.reply("📸 <b>Мошинангиз расмларини юборинг (1-6 та):</b>", {
    parse_mode: "HTML",
    reply_markup: doneK,
  });

  while (photoIds.length < 6) {
    const pCtx = await conversation.waitFor(["message:photo", "callback_query:data"]);

    if (pCtx.callbackQuery?.data === "done_photos") {
      await safeAnswerCbq(pCtx);
      break;
    }

if (pCtx.message) {
    const photoArr = pCtx.message.photo;

    // ✅ faqat photo bo'lsa va ichida element bo'lsa
    if (Array.isArray(photoArr) && photoArr.length > 0) {
        const lastPhoto = photoArr[photoArr.length - 1]; // eng kattasi
        if (lastPhoto?.file_id) {
            photoIds.push(lastPhoto.file_id);

            await ctx.reply(
                `✅ <b>${photoIds.length}-расм олинди.</b>\nЯна юборасизми ёки тугатасизми?`,
                { reply_markup: doneK, parse_mode: "HTML" }
            );
        } else {
            await ctx.reply("❗️Расмни ўқиб бўлмади, қайта юборинг (фаќат расм).", {
                reply_markup: doneK,
                parse_mode: "HTML",
            });
        }
    } else {
        // ❗️rasm bo'lmagan xabar
        await ctx.reply("📸 Илтимос, фақат <b>расм</b> юборинг. (1-6 та)\nТугатиш учун ✅ Бўлди", {
            reply_markup: doneK,
            parse_mode: "HTML",
        });
    }
}

  }

  if (photoIds.length === 0) return ctx.reply("❌ Расм юборилмади. Эълон бекор қилинди.");

  await ctx.reply("⏳ <b>Расмлар қайта ишланяпти, кутинг...</b>", { parse_mode: "HTML" });

  const photoUrls = await Promise.all(
    photoIds.map(async (id) => {
      const file = await bot.api.getFile(id);
      return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    })
  );

  const collagePath = await createCollage(photoUrls);

  const caption =
    `🚗 <b>Мошина: ${adData.brand} ${adData.model}</b>\n📅 <b>Йили: ${adData.year}</b>\n👣 <b>Пробег: ${adData.probeg}</b>\n` +
    `💎 <b>Краска: ${adData.paint}</b>\n🎨 <b>Ранги: ${adData.color}</b>\n⚙️ <b>Коробка: ${adData.trans}</b>\n` +
    `⛽ <b>Ёқилғи: ${adData.fuel}</b>\n💰 <b>Нархи: ${adData.price}$</b>\n☎️ <b>Тел: +998${adData.phone}</b>\n🚩 <b>Вилоят: ${adData.region}</b>`;

  await ctx.replyWithPhoto(new InputFile(collagePath), {
    caption: `📝 <b>Сизнинг эълонингиз:</b>\n\n${caption}`,
    reply_markup: new InlineKeyboard().text("✅ Юбориш", "confirm").text("❌ Бекор қилиш", "cancel"),
    parse_mode: "HTML",
  });

  const choice = await conversation.waitFor("callback_query:data");

  if (choice.callbackQuery.data === "confirm") {
    await safeAnswerCbq(choice);

    const info = db
      .prepare(
        `INSERT INTO ads (userId, carDetails, year, probeg, paint, color, transmission, fuel, price, phone, region, photoId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        ctx.from.id,
        `${adData.brand} ${adData.model}`,
        adData.year,
        adData.probeg,
        adData.paint,
        adData.color,
        adData.trans,
        adData.fuel,
        adData.price,
        adData.phone,
        adData.region,
        photoIds.join(",")
      );

    const adId = info.lastInsertRowid;

    await bot.api.sendPhoto(ADMIN_ID, new InputFile(collagePath), {
      caption: `🆔 <b>ID: ${adId}</b>\n\n${caption}`,
      reply_markup: new InlineKeyboard().text("✅ Тасдиқлаш", `approve:${adId}`).text("❌ Рад этиш", `reject:${adId}`),
      parse_mode: "HTML",
    });

    const successKeyboard = new InlineKeyboard().url("📢 Каналга обуна бўлиш", "https://t.me/engarzonidamoshina");

    await ctx.reply(
      "✅ <b>Эълонингиз админга юборилди!</b>\n\n" +
        "Тасдиқланганидан сўнг эълонингиз каналда эълон қилинади. " +
        "Ҳозироқ каналимизни кузатиб боринг ва янги эълонлардан хабардор бўлинг! 👇",
      {
        reply_markup: successKeyboard,
        parse_mode: "HTML",
      }
    );

    // ЭСЛАТМА ҚЎШИЛГАН ЯКУНИЙ ЖАВОБ
    await ctx.reply(
      "✅ <b>Эълонингиз админга юборилди!</b>\n\n" +
        "Тасдиқланганидан сўнг каналда эълон қилинади. " +
        "Агар машинангиз сотилса, пастки <b>📂 Менинг эълонларим</b> тугмаси орқали эълонингизни топиб, <b>💰 Сотилди</b> тугмасини босишни унутманг!",
      { parse_mode: "HTML" }
    );
  } else {
    await safeAnswerCbq(choice);
    await ctx.reply("❌ <b>Бекор қилинди.</b>", { parse_mode: "HTML" });
  }

  if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
}

bot.use(createConversation(createAdConversation));

/**
 * АДМИН ТАСДИҚЛАШИ
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
      `☎️ +998${ad.phone}\n` +
      `🚩 #${ad.region.replace(/\s+/g, "_")}\n\n` +
      `⚠️ Мошина савдосига админ жавобгар эмас, олдиндан ҳеч кимга тўлов қилманг. Огоҳлик давр талаби ❗\n\n` +
      `👉 https://t.me/engarzonidamoshina`;

    const channelMarkup = new InlineKeyboard()
      .url("👤 ЭЪЛОН АДМИНИ", "https://t.me/uzdev75")
      .row()
      .url("🤖 ЭЪЛОН ЖОЙЛАШ", "https://t.me/arzonida_bot")
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
      await bot.api.sendMessage(ad.userId, "✅ Сизнинг эълонингиз тасдиқланди ва каналга жойланди!");
    } catch (e) {
      console.error(e);
      await ctx.reply("Хатолик: Каналга юбориб бўлмади. Бот каналда админ эканлигини текширинг.");
    }
  }
});

bot.callbackQuery(/^reject:(\d+)/, async (ctx) => {
  const adId = ctx.match[1];
  db.prepare("UPDATE ads SET status='rejected' WHERE id=?").run(adId);
  await ctx.editMessageCaption({ caption: "❌ <b>Эълон рад этилди.</b>", parse_mode: "HTML" });
});

/**
 * МЕНИНГ ЭЪЛОНЛАРИМ
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

  await bot.api.sendMessage(
    ADMIN_ID,
    `💰 <b>СОТИЛДИ ХАБАРИ!</b>\n\n🆔 <b>ID: ${adId}</b>\n🚗 <b>Мошина: ${ad.carDetails}</b>\n👤 <b>Узер:</b> <a href="tg://user?id=${ad.userId}">${ctx.from.first_name}</a>`,
    {
      reply_markup: new InlineKeyboard().text("✅ Тасдиқлаш (Каналда белгилаш)", `confirm_sold:${adId}`),
      parse_mode: "HTML",
    }
  );

  // ✅ bu callbackQuery handler ichida — xato bo‘lmaydi
  await ctx.answerCallbackQuery({ text: "Сўров админга юборилди." });

  await ctx.reply("✅ <b>Сўров юборилди. Админ тасдиқлагач, каналда 'СОТИЛДИ' белгиси чиқади.</b>", {
    parse_mode: "HTML",
  });
});

bot.callbackQuery(/^confirm_sold:(\d+)/, async (ctx) => {
  const adId = ctx.match[1];
  const ad = db.prepare("SELECT * FROM ads WHERE id = ?").get(adId);

  try {
    const newCaption = `💰 <b>СОТИЛДИ!</b>\n\n<s>${ad.carDetails}</s>\n💰 <b>Нархи: ${ad.price}$</b>\n\n❌ <b>Эълон ёпилди.</b>`;
    await bot.api.editMessageCaption(CHANNEL_ID, ad.channelMsgId, { caption: newCaption, parse_mode: "HTML" });
    db.prepare("UPDATE ads SET status='sold' WHERE id=?").run(adId);
    await ctx.editMessageText("✅ <b>Каналда сотилди деб белгиланди!</b>", { parse_mode: "HTML" });
  } catch (e) {
    await ctx.reply("Хатолик: Каналдаги хабарни таҳрирлаб бўлмади.");
  }
});

/**
 * СТАРТ
 */
bot.command("start", (ctx) => {
  const mainMenu = new Keyboard().text("📝 Эълон Ясаш").row().text("📂 Менинг эълонларим").resized();

  ctx.reply("🌟 <b>Хуш келибсиз!</b>\n\nЭълон бериш ёки ўз эълонларингизни бошқариш учун пастки тугмалардан фойдаланинг.", {
    reply_markup: mainMenu,
    parse_mode: "HTML",
  });
});

bot.hears("📝 Эълон Ясаш", (ctx) => ctx.conversation.enter("createAdConversation"));

bot.start();
console.log("Бот муваффақиятли ишга тушди...");
