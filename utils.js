const { Keyboard } = require("grammy");
const axios = require("axios");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

// Асосий меню
const mainMenu = new Keyboard()
  .text("📝 Эълон Ясаш").text("🔍 Мошина қидириш").row()
  .text("📂 Менинг эълонларим").resized();

// Коллажлар учун папка
const collagesDir = path.join(__dirname, "collages");
if (!fs.existsSync(collagesDir)) {
  fs.mkdirSync(collagesDir, { recursive: true });
}

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

async function safeAnswerCbq(ctx) {
  try {
    const id = ctx?.callbackQuery?.id || ctx?.update?.callback_query?.id;
    if (id) await ctx.api.answerCallbackQuery(id, { text: "⏳ Илтимос кутинг, сўровингиз қайта ишланмоқда..." });
  } catch (_) {}
}

async function deleteMsgs(ctx, msgIds) {
  if (!msgIds || msgIds.length === 0) return;

  const idsToDelete = [...msgIds];
  msgIds.length = 0; 
  const chatId = ctx.chat.id; 

  try {
    await ctx.api.editMessageReplyMarkup(chatId, idsToDelete[0], {
      reply_markup: new InlineKeyboard().text("⏳ Кутилмоқда...", "ignore")
    });
  } catch (e) {}

  setTimeout(async () => {
    for (const id of idsToDelete) {
      try {
        await ctx.api.deleteMessage(chatId, id);
      } catch (e) {}
    }
  }, 1500); 
}

module.exports = { mainMenu, createCollage, safeAnswerCbq, deleteMsgs };