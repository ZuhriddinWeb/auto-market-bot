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
 * ✅ Хабарларни тозалаш (чатни ифлослантирмаслик учун)
 */
async function deleteMsgs(ctx, msgIds) {
  for (const id of msgIds) {
    try {
      if (id) await ctx.api.deleteMessage(ctx.chat.id, id);
    } catch (e) {}
  }
  msgIds.length = 0; // Arrayni tozalash
}

/**
 * ✅ Расмларни монтиж қилиш (Collage)
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
 * ✅ ЭЪЛОН ЯРАТИШ ЖАРАЁНИ (PRO - STATE MACHINE)
 */
async function createAdConversation(conversation, ctx) {
  const ad = { photos: [] };
  let step = "BRAND";
  let isEditing = false; // Tahrirlash rejimida ekanligini bilish uchun
  const chatToClean = []; // O'chirilishi kerak bo'lgan xabarlar ID si

  // Кенгайтирилган Авто-каталог
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
      // ----------------------------------------------------
      // 1. BRAND (МАРКА)
      // ----------------------------------------------------
      if (step === "BRAND") {
        const kb = new InlineKeyboard();
        Object.keys(carCatalog).forEach((b, i) => {
          kb.text(b, `b:${b}`);
          if ((i + 1) % 3 === 0) kb.row();
        });
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

      // ----------------------------------------------------
      // 2. MODEL (МОДЕЛ)
      // ----------------------------------------------------
      else if (step === "MODEL") {
        const kb = new InlineKeyboard();
        if (carCatalog[ad.brand] && carCatalog[ad.brand].length > 0) {
          carCatalog[ad.brand].forEach((m, i) => {
            kb.text(m, `m:${m}`);
            if ((i + 1) % 3 === 0) kb.row();
          });
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

      // ----------------------------------------------------
      // 3. YEAR (ЙИЛ)
      // ----------------------------------------------------
      else if (step === "YEAR") {
        const kb = new InlineKeyboard();
        for (let y = 2026; y >= 2011; y--) { kb.text(y.toString(), `y:${y}`); if ((2026 - y + 1) % 4 === 0) kb.row(); }
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

      // ----------------------------------------------------
      // 4. PROBEG (ПРОБЕГ)
      // ----------------------------------------------------
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

      // ----------------------------------------------------
      // 5. PAINT (КРАСКА)
      // ----------------------------------------------------
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

      // ----------------------------------------------------
      // 6. COLOR (РАНГ)
      // ----------------------------------------------------
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

      // ----------------------------------------------------
      // 7. TRANSMISSION (КАРОБКА)
      // ----------------------------------------------------
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

      // ----------------------------------------------------
      // 8. FUEL (ЁҚИЛҒИ)
      // ----------------------------------------------------
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

      // ----------------------------------------------------
      // 9. PRICE (НАРХ)
      // ----------------------------------------------------
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

      // ----------------------------------------------------
      // 10. PHONE (ТЕЛЕФОН)
      // ----------------------------------------------------
      else if (step === "PHONE") {
        const kb = new InlineKeyboard().text("🔙 Орқага", "back_PRICE").text("❌ Бекор", "cancel_ad");
        // Eslatma: InlineKeyboard bilan contact so'rab bo'lmaydi, shuning uchun faqat yozishni so'raymiz
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

      // ----------------------------------------------------
      // 11. REGION (ВИЛОЯТ)
      // ----------------------------------------------------
      else if (step === "REGION") {
        const regions = ["Тошкент ш.", "Тошкент вил.", "Сирдарё", "Жиззах", "Самарқанд", "Фарғона", "Наманган", "Андижон", "Қашқадарё", "Сурхондарё", "Бухоро", "Навоий", "Хоразм", "Қорақалпоғистон"];
        const kb = new InlineKeyboard();
        regions.forEach((r, i) => {
          kb.text(r, `r:${r}`);
          if ((i + 1) % 2 === 0) kb.row();
        });
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

      // ----------------------------------------------------
      // 12. PHOTOS (РАСМЛАР)
      // ----------------------------------------------------
      else if (step === "PHOTOS") {
        const kb = new InlineKeyboard().text("✅ Бўлди (Юбориш)", "done_photos").row().text("🔙 Орқага", "back_REGION").text("❌ Бекор", "cancel_ad");
        
        msgPrompt = await ctx.reply("📸 <b>Мошинангиз расмларини юборинг (1-6 та):</b>\n\n<i>Расмларни белгилаб бирданига юбориш мумкин. Барчасини юбориб бўлгач, «✅ Бўлди» ни босинг.</i>", { reply_markup: kb, parse_mode: "HTML" });
        chatToClean.push(msgPrompt.message_id);
        
        ad.photos = []; // Rasmlarni qayta boshlash

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
            step = "PREVIEW";
            break;
          }

          if (res.message?.photo) {
            const photoArr = res.message.photo;
            if (Array.isArray(photoArr) && photoArr.length > 0) {
              ad.photos.push(photoArr[photoArr.length - 1].file_id);
              if (ad.photos.length === 6) { step = "PREVIEW"; break; }
            }
          }
        }
        
        if (step === "CANCEL") break;
        if (step === "REGION") { await deleteMsgs(ctx, chatToClean); continue; }
        
        await deleteMsgs(ctx, chatToClean);
        // Step allaqachon PREVIEW ga o'zgargan
      }

      // ----------------------------------------------------
      // 13. PREVIEW & EDIT (ОЛДИНДАН КЎРИШ ВА ТАҲРИРЛАШ)
      // ----------------------------------------------------
      else if (step === "PREVIEW") {
        isEditing = false; // Normal holatga qaytamiz
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
        
        if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath); // Rasmni o'chiramiz

        const res = await conversation.waitFor("callback_query:data");
        const action = res.callbackQuery.data;
        await safeAnswerCbq(res);
        await ctx.api.deleteMessage(ctx.chat.id, previewMsg.message_id); // Preview xabarni o'chirish

        if (action === "cancel_ad") break;
        
        if (action === "submit_ad") {
          // BAZAGA SAQLASH VA ADMINGA YUBORISH
          const info = db.prepare(`INSERT INTO ads (userId, carDetails, year, probeg, paint, color, transmission, fuel, price, phone, region, photoId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(ctx.from.id, `${ad.brand} ${ad.model}`, ad.year, ad.probeg, ad.paint, ad.color, ad.trans, ad.fuel, ad.price, ad.phone, ad.region, ad.photos.join(","));
          
          const adId = info.lastInsertRowid;
          
          // Adminga qayta rasm yasab yuboramiz (shart emas, bazadan o'qiydigan callback bor, lekin tezlik uchun)
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
          return; // Conversation tugadi
        }

        // Tahrirlash bosilganda
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

  // Break bo'lganda keladigan joy (Cancel)
  await ctx.reply("❌ <b>Эълон бериш бекор қилинди.</b>", { parse_mode: "HTML", reply_markup: mainMenu });
  await deleteMsgs(ctx, chatToClean);
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

      db.prepare("UPDATE ads SET status='active', channelMsgId=? WHERE id=?").run(msg.message_id, adId);
      if (fs.existsSync(collagePath)) fs.unlinkSync(collagePath);
      
      await ctx.editMessageCaption({ caption: "✅ Каналга жойланди!", parse_mode: "HTML" });
      await bot.api.sendMessage(ad.userId, `🎉 <b>Табриклаймиз!</b>\n\nСизнинг <b>${ad.carDetails}</b> эълонингиз каналга жойланди.\n\nКанални кўриш: https://t.me/engarzonidamoshina`, { parse_mode: "HTML", reply_markup: mainMenu });
    } catch (e) {
      console.error(e);
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
  const ad = db.prepare("SELECT * FROM ads WHERE id = ?").get(adId);
  if (ad && ad.status === "pending") {
    db.prepare("UPDATE ads SET status='rejected' WHERE id=?").run(adId);
    await ctx.editMessageCaption({ caption: "❌ <b>Эълон рад этилди.</b>", parse_mode: "HTML" });
    try {
        await bot.api.sendMessage(ad.userId, `❌ <b>Эълонингиз рад этилди.</b>\n\nСизнинг <b>${ad.carDetails}</b> эълонингиз қоидаларга мос келмаганлиги сабабли рад этилди. Илтимос, маълумотларни тўғрилаб қайтадан эълон беринг.`, { parse_mode: "HTML", reply_markup: mainMenu });
    } catch (e) {}
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
      reply_markup: new InlineKeyboard().text("💰 Сотилди", `sold_req:${ad.id}`), parse_mode: "HTML",
    });
  }
});

bot.callbackQuery(/^sold_req:(\d+)/, async (ctx) => {
  const adId = ctx.match[1];
  const ad = db.prepare("SELECT * FROM ads WHERE id = ?").get(adId);

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
  const ad = db.prepare("SELECT * FROM ads WHERE id = ?").get(adId);
  if (ad && ad.status === 'active') {
      try {
        const newCaption = `💰 <b>СОТИЛДИ!</b>\n\n<s>${ad.carDetails}</s>\n💰 <b>Нархи: ${ad.price}$</b>\n\n❌ <b>Эълон ёпилди.</b>`;
        await bot.api.editMessageCaption(CHANNEL_ID, ad.channelMsgId, { caption: newCaption, parse_mode: "HTML" });
        db.prepare("UPDATE ads SET status='sold' WHERE id=?").run(adId);
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
 * ✅ СТАРТ
 */
bot.command("start", (ctx) => {
  ctx.reply("🌟 <b>Хуш келибсиз!</b>\n\nЭълон бериш ёки ўз эълонларингизни бошқариш учун пастки тугмалардан фойдаланинг.", {
    reply_markup: mainMenu, parse_mode: "HTML",
  });
});

bot.hears("📝 Эълон Ясаш", (ctx) => ctx.conversation.enter("createAdConversation"));
bot.start();
console.log("Бот муваффақиятли ишга тушди...");