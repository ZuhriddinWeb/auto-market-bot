// =====================================================================
// 📢 KANAL UCHUN YANGI IMKONIYATLAR (har biri admin paneldan alohida yoqiladi / o'chiriladi)
//   quiz        — 🎯 «Narxini top» viktorinasi (18:00), javob 21:00 da
//   fan_choice  — 🏆 «Obunachilar tanlovi»: hafta davomida eng ko'p 🔥 olgan e'lonlar (shanba 12:00)
//   sold_prices — 🤝 «Haqiqatda qanchaga sotildi» (juma 16:00)
//   tips        — 💡 Foydali maslahatlar seriyasi (chorshanba 11:00, rasm bilan)
//   smooth_post — ⏱ Postlarni tekis tarqatish: tasdiqlangan e'lonlar navbat bilan, kechasi — 07:00 dan
//   digest      — ☀️ Ertalabki dayjest (08:00)
//   toc         — 📌 Qadalgan mundarija: modellar bo'yicha e'lonlar soni (har kuni 06:00 yangilanadi)
//   comment_notify / comment_spam — 💬 Izohlar: sotuvchiga xabar, havola/raqamli spamni o'chirish
//   suggested   — 💸 Pullik taklif postlari (kanal DM orqali) — admin tasdiqlaydi
//   story       — 📲 Story uchun 9:16 rasm (har kuni 08:30 adminga yuboriladi)
//   regional    — 🗺 Viloyat kanallari: e'lon shu viloyat kanaliga ham nusxalanadi
//   adm_warn    — 🛡 Moderatsiyada avto-ogohlantirishlar (narx juda past, rasm takrori, bloklangan raqam)
// =====================================================================
const REGIONS = ["Toshkent sh.", "Toshkent vil.", "Sirdaryo", "Jizzax", "Samarqand", "Farg'ona", "Namangan", "Andijon", "Qashqadaryo", "Surxondaryo", "Buxoro", "Navoiy", "Xorazm", "Qoraqalpog'iston"];
const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"];
const WEEKDAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];

// Admin paneldagi ro'yxat (index.js dagi AUTO_POSTS ga qo'shiladi). Hammasi sukut bo'yicha O'CHIQ.
const FEATURES = [
  { key: "digest", group: "yangi", btn: "Ertalabki dayjest · 08:00", title: "☀️ Ertalabki dayjest: kechagi yangi e'lonlar, eng arzonlari, sotilganlar", when: "har kuni 08:00", runnable: true },
  { key: "quiz", group: "yangi", btn: "«Narxini top» · 18:00", title: "🎯 «Narxini top» viktorinasi (rasm + 4 variant), javob 21:00 da", when: "har kuni 18:00", runnable: true },
  { key: "fan_choice", group: "yangi", btn: "Obunachilar tanlovi", title: "🏆 «Obunachilar tanlovi» — hafta davomida eng ko'p 🔥 olgan e'lonlar", when: "shanba 12:00", runnable: true },
  { key: "sold_prices", group: "yangi", btn: "Qanchaga sotildi", title: "🤝 «Haqiqatda qanchaga sotildi» — so'ralgan va sotilgan narx", when: "juma 16:00", runnable: true },
  { key: "tips", group: "yangi", btn: "Maslahatlar seriyasi", title: "💡 Foydali maslahat (24 ta tayyor post, navbat bilan, rasmli)", when: "chorshanba 11:00", runnable: true },
  { key: "toc", group: "yangi", btn: "Qadalgan mundarija", title: "📌 Qadalgan mundarija: modellar bo'yicha e'lonlar soni", when: "har kuni 06:00 yangilanadi", runnable: true },
  { key: "story", group: "yangi", btn: "Story rasmi (9:16)", title: "📲 Story uchun 9:16 rasm (Kunning TOP-3) — adminga yuboriladi, o'zingiz joylaysiz", when: "har kuni 08:30", runnable: true },
  { key: "smooth_post", group: "tizim", btn: "Postlarni tekis tarqatish", title: "⏱ Tasdiqlangan e'lonlar navbat bilan chiqadi (oraliq sozlanadi), 23:00–07:00 da tasdiqlanganlari — 07:00 dan", when: "e'lon tasdiqlanganda" },
  { key: "comment_notify", group: "tizim", btn: "Izoh → sotuvchiga xabar", title: "💬 E'lon ostiga izoh yozilsa, sotuvchiga bot xabar beradi", when: "kanalga muhokama guruhi ulangan bo'lsa" },
  { key: "comment_spam", group: "tizim", btn: "Izohlardagi spamni o'chirish", title: "🧹 Izohlardagi havola, @username va telefon raqamli spam o'chiriladi (sotuvchi va admin bundan mustasno)", when: "muhokama guruhida, bot admin bo'lsa" },
  { key: "suggested", group: "tizim", btn: "Pullik taklif postlari", title: "💸 Kanal DM orqali kelgan pullik (⭐/TON) post takliflari adminga keladi — ✅/❌", when: "kanalda «Xabarlar» (DM) yoqilgan bo'lsa" },
  { key: "regional", group: "tizim", btn: "Viloyat kanallari", title: "🗺 E'lon o'z viloyati kanaliga ham nusxalanadi (sotilsa — o'chiriladi)", when: "/viloyat buyrug'i bilan kanal ulangan bo'lsa" },
  { key: "adm_warn", group: "tizim", btn: "Moderatsiya ogohlantirishlari", title: "🛡 Tekshiruvda avto-ogohlantirish: narx juda past/baland, rasm takrori, bloklangan raqam", when: "e'lon tekshiruvga kelganda" },
];
const DEFAULT_OFF = FEATURES.filter((f) => f.key !== "adm_warn").map((f) => f.key);

// Jadval: soat:daqiqa (Toshkent), days — hafta kunlari (0 = yakshanba), bo'lmasa har kuni
const JOBS = [
  { key: "toc", h: 6, m: 0 },
  { key: "digest", h: 8, m: 0 },
  { key: "story", h: 8, m: 30 },
  { key: "tips", h: 11, m: 0, days: [3] },
  { key: "fan_choice", h: 12, m: 0, days: [6] },
  { key: "sold_prices", h: 16, m: 0, days: [5] },
  { key: "quiz", h: 18, m: 0 },
];

// 💡 Maslahatlar seriyasi — navbat bilan chiqadi
const TIPS = [
  { t: "Mashinani ko'rmasdan pul o'tkazmang", b: "Zakalat, «bron» yoki «yo'l kirasi» so'rashsa — bu firibgarlik belgisi. Pul faqat mashinani ko'rib, hujjatlarni tekshirgandan keyin beriladi.", i: "shield" },
  { t: "Kraskani tekshirishning oddiy usuli", b: "Tolshinometr bo'lmasa, magnitni salfetkaga o'rab kuzov bo'ylab yuring. Shpaklyovka bor joyda magnit yaxshi yopishmaydi.", i: "car" },
  { t: "Probegni qanday aniqlash mumkin", b: "Rul, ruchka, pedal va o'rindiq yeyilishiga qarang. 50 ming km dagi mashinaning rul charmi yaltirab qolmaydi.", i: "info" },
  { t: "Hujjatlarni solishtiring", b: "Texpasportdagi kuzov va dvigatel raqami mashinadagi raqam bilan bir xil bo'lishi shart. Ishonchnomada muddat va huquqlarni o'qing.", i: "check" },
  { t: "Sovuq dvigatelni eshiting", b: "Ko'rishga kelishdan oldin sotuvchidan mashinani qizdirmaslikni so'rang. Sovuq holatda taqillash va tutun yaxshi bilinadi.", i: "alert" },
  { t: "Narxni to'g'ri qo'ying", b: "Bozordan 5–10% arzon e'lon 2–3 barobar tez sotiladi. Ilovadagi «Narxni baholash» bo'limida bozor narxini bilib oling.", i: "tag" },
  { t: "Yaxshi rasm — tez sotuv", b: "Kunduzi, toza mashinani 8–10 burchakdan suratga oling: old, orqa, yon, salon, panel, dvigatel, g'ildiraklar.", i: "star" },
  { t: "Test-drayvda nimaga e'tibor berish kerak", b: "Rul to'g'ri yo'lda tortmasin, tormozda titrash bo'lmasin, korobka zarbasiz o'tsin. Notekis yo'lda shovqinlarni eshiting.", i: "car" },
  { t: "Avtomat korobkani tekshirish", b: "P–R–N–D ga o'tkazganda kuchli zarba bo'lmasligi kerak. Moyi qora yoki kuygan hidli bo'lsa — ehtiyot bo'ling.", i: "info" },
  { t: "Diagnostikaga pulni ayamang", b: "Servisdagi 100–200 ming so'mlik tekshiruv keyinchalik millionlab xarajatdan saqlaydi. Halol sotuvchi diagnostikaga qarshi bo'lmaydi.", i: "check" },
  { t: "Barter qilayotganda", b: "Ikkala mashinaga ham alohida bozor narxini bilib oling. Farqni naqd yoki kartaga o'tkazishni hujjatda yozib qo'ying.", i: "money" },
  { t: "Nasiyaga olishdan oldin", b: "Oylik to'lov, umumiy summa va mashina kimning nomida turishini yozma kelishing. Shartnomasiz nasiyaga rozi bo'lmang.", i: "money" },
  { t: "E'lonni yangilab turing", b: "Narx o'zgarsa yoki mashina sotilsa — botda belgilang. Sotilgan mashinalar «Qanchaga sotildi» ro'yxatiga tushadi va bozorga foyda beradi.", i: "bell" },
  { t: "Avariyadan keyingi mashinani qanday bilish mumkin", b: "Eshik, kapot va bagaj oralig'idagi tirqishlar bir xil bo'lishi kerak. Rezina zichlagichlarda bo'yoq izi bo'lsa — bo'yalgan.", i: "alert" },
  { t: "Gaz ballon o'rnatilgan bo'lsa", b: "Ballon sertifikati va o'rnatish hujjatini so'rang. Ro'yxatdan o'tmagan gaz uskunasi bilan texko'rikdan o'tib bo'lmaydi.", i: "info" },
  { t: "Shina va disklarga qarang", b: "Bir tomondan yeyilgan shina — razval yoki osma muammosi belgisi. Bu ham narxni tushirishga sabab bo'ladi.", i: "car" },
  { t: "Salon hidi ko'p narsani aytadi", b: "Namlik yoki mog'or hidi — suv kirgan bo'lishi mumkin. Gilam ostini va bagaj tagini tekshiring.", i: "info" },
  { t: "Savdolashish odobi", b: "Avval mashinani ko'rib, kamchiliklarni aniq aytib, keyin narx taklif qiling. Ilovadagi «💬 Narx taklif» orqali ham yozishingiz mumkin.", i: "chat" },
  { t: "Qayerda uchrashish xavfsiz", b: "Kunduzi, odam ko'p joyda yoki servis oldida uchrashing. Katta pulni naqd olib yurmang — bank orqali o'tkazish xavfsizroq.", i: "shield" },
  { t: "Mashina tarixini so'rang", b: "Nechta egasi bo'lgan, qaysi servisda xizmat ko'rgan, oxirgi moy almashtirish qachon — javoblari aniq bo'lsa, yaxshi belgi.", i: "check" },
  { t: "Konditsionerni tekshiring", b: "Yozgacha kutmang: hozir 2–3 daqiqa yoqib ko'ring. Sovuq havo bermasa, ta'mirlash qimmatga tushishi mumkin.", i: "info" },
  { t: "Akkumulyator yoshi", b: "Akkumulyator ustidagi sana 4–5 yildan oshgan bo'lsa, tez orada almashtirishga tayyorlaning va buni narxda hisobga oling.", i: "info" },
  { t: "Sotishdan oldin yuvib qo'ying", b: "Yuvilgan va changyutgich bilan tozalangan mashina rasmda ham, ko'rishda ham qimmatroq ko'rinadi. Bu eng arzon «tuning».", i: "star" },
  { t: "Ishonchnoma bilan sotib olish xavfi", b: "Bosh ishonchnoma ham egalik emas. Imkon bo'lsa, rasmiy qayta rasmiylashtirishni talab qiling.", i: "alert" },
];

function createKanal(d) {
  const { db, bot, CHANNEL_ID, CHANNEL_USER, ADMIN_ID, isAutoOn, getSetting, setSetting, market, formatNum, escapeHtml, InlineKeyboard, InputFile, sharp, PM } = d;
  const esc = escapeHtml;
  const log = (...a) => console.error("[kanal]", ...a);
  const priceNum = (v) => parseInt(String(v == null ? "" : v).replace(/\D/g, ""), 10) || 0;
  const sp = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const tz = (dt = new Date()) => new Date(dt.getTime() + 5 * 3600e3); // Toshkent (UTC+5)
  const dayStr = (dt = new Date()) => tz(dt).toISOString().slice(0, 10);
  const dateLabel = (dt = new Date()) => { const t = tz(dt); return `${t.getUTCDate()}-${UZ_MONTHS[t.getUTCMonth()]}`; };
  const hhmm = (dt) => { const t = tz(dt); return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`; };
  const postLink = (msgId) => `https://t.me/${CHANNEL_USER}/${msgId}`;
  const adName = (ad) => `${esc(ad.carDetails)}${ad.year ? `, ${esc(ad.year)}` : ""}`;
  const sellKb = () => {
    const kb = new InlineKeyboard();
    if (d.WEBAPP_URL) kb.url("📱 Ilovada ko'rish", d.miniAppLink("deal"));
    return kb.url("➕ Bepul e'lon berish", `https://t.me/${d.BOT_LINK_USERNAME}`);
  };
  async function firstPhotoBuffer(ad) {
    try { const id = String(ad.photoId || "").split(",")[0]; return id ? await d.fileBuffer(id) : null; } catch (e) { return null; }
  }

  async function init() {
    const q = [
      `CREATE TABLE IF NOT EXISTS channel_games (id INT AUTO_INCREMENT PRIMARY KEY, kind VARCHAR(20), ad_id BIGINT, photo_msg BIGINT, poll_msg BIGINT,
        answer INT, reveal_at DATETIME, revealed TINYINT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      "CREATE TABLE IF NOT EXISTS comment_map (group_msg BIGINT PRIMARY KEY, channel_msg BIGINT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
    ];
    for (const s of q) await db.execute(s).catch((e) => log("jadval:", e.message));
    for (const s of ["ALTER TABLE ads ADD COLUMN queued_at TIMESTAMP NULL", "ALTER TABLE ads ADD COLUMN region_ch VARCHAR(64) NULL", "ALTER TABLE ads ADD COLUMN region_msg BIGINT NULL"])
      await db.execute(s).catch(() => {});
  }

  // ===================================================================
  // 🛡 MODERATSIYA OGOHLANTIRISHLARI
  // ===================================================================
  async function adWarnings(ad) {
    if (!isAutoOn("adm_warn") || !ad) return [];
    const out = [];
    try {
      const c = await market.compareAd(ad);
      if (c && c.confident) {
        if (c.diff < -35) out.push({ level: "bad", text: `narx bozordan ${Math.abs(c.diff)}% past — tekshiring` });
        else if (c.diff >= 45) out.push({ level: "warn", text: `narx bozordan ${c.diff}% baland` });
        else if (c.diff <= -5) out.push({ level: "ok", text: `bozordan −${Math.abs(c.diff)}%` });
      }
    } catch (e) {}
    try {
      const ids = String(ad.photoId || "").split(",").filter(Boolean).slice(0, 3);
      for (const fid of ids) {
        const [[r]] = await db.execute("SELECT id, userId FROM ads WHERE id <> ? AND FIND_IN_SET(?, photoId) > 0 ORDER BY id DESC LIMIT 1", [ad.id, fid]);
        if (r) { out.push({ level: Number(r.userId) === Number(ad.userId) ? "warn" : "bad", text: `rasm takrori (#${r.id}${Number(r.userId) === Number(ad.userId) ? ", o'zining" : ", boshqa odamniki"})` }); break; }
      }
    } catch (e) {}
    try {
      const ph = String(ad.phone || "").replace(/\D/g, "");
      if (ph.length >= 9) {
        const [[b]] = await db.execute("SELECT a.userId FROM ads a JOIN banned_users b ON b.userId = a.userId WHERE a.phone = ? LIMIT 1", [ad.phone]);
        if (b) out.push({ level: "bad", text: "bloklangan odamning raqami" });
        else {
          const [[o]] = await db.execute("SELECT COUNT(DISTINCT userId) AS c FROM ads WHERE phone = ? AND userId <> ? AND status IN ('active','sold')", [ad.phone, ad.userId]);
          if (o && Number(o.c) > 0) out.push({ level: "warn", text: `raqam ${o.c} ta boshqa akkauntda` });
        }
      }
    } catch (e) {}
    return out;
  }
  const warnText = (ws) => ws.filter((w) => w.level !== "ok").map((w) => `${w.level === "bad" ? "🔴" : "🟠"} ${w.text}`).join("\n");

  // ===================================================================
  // ⏱ POSTLARNI TEKIS TARQATISH
  // ===================================================================
  let lastAdPostAt = 0;
  const markPosted = () => { lastAdPostAt = Date.now(); };
  const smoothGap = () => { const n = parseInt(getSetting("smooth:gap"), 10); return [3, 5, 7, 10, 15, 20, 30].includes(n) ? n : 7; };
  const isNight = (dt = new Date()) => { const h = tz(dt).getUTCHours(); return h < 7 || h >= 23; };
  async function queuedCount() { const [[r]] = await db.execute("SELECT COUNT(*) AS c FROM ads WHERE status = 'queued'"); return Number(r.c) || 0; }
  async function shouldQueue() {
    if (!isAutoOn("smooth_post")) return false;
    if (isNight()) return true;
    if (await queuedCount()) return true;
    return Date.now() - lastAdPostAt < smoothGap() * 60e3;
  }
  // Taxminiy chiqish vaqti: navbatdagi o'rni × oraliq (kechasi — 07:00 dan)
  function etaFor(pos) {
    let start = Math.max(Date.now(), lastAdPostAt + smoothGap() * 60e3);
    if (isNight(new Date(start))) {
      const t = tz(new Date(start)); const add = t.getUTCHours() >= 23 ? 1 : 0;
      start = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + add, 7, 0) - 5 * 3600e3;
    }
    return new Date(start + (pos - 1) * smoothGap() * 60e3);
  }
  async function queueAd(ad) {
    const [r] = await db.execute("UPDATE ads SET status = 'queued', queued_at = NOW() WHERE id = ? AND status = 'pending'", [ad.id]);
    if (!r || !r.affectedRows) return null;
    const pos = await queuedCount();
    return { pos, eta: hhmm(etaFor(pos)) };
  }
  let queueBusy = false, queueFails = 0;
  async function queueTick() {
    if (queueBusy) return;
    queueBusy = true;
    try {
      const on = isAutoOn("smooth_post");
      if (on && isNight()) return;
      if (on && Date.now() - lastAdPostAt < smoothGap() * 60e3) return;
      const [[ad]] = await db.execute("SELECT id FROM ads WHERE status = 'queued' ORDER BY queued_at, id LIMIT 1");
      if (!ad) return;
      const [u] = await db.execute("UPDATE ads SET status = 'pending' WHERE id = ? AND status = 'queued'", [ad.id]);
      if (!u || !u.affectedRows) return;
      const r = await d.publishApprovedAd(ad.id).catch((e) => ({ ok: false, error: e.message }));
      if (r && r.ok) { queueFails = 0; return; }
      await db.execute("UPDATE ads SET status = 'queued', queued_at = NOW() WHERE id = ? AND status = 'pending'", [ad.id]).catch(() => {});
      if (++queueFails === 3) bot.api.sendMessage(ADMIN_ID, `⚠️ Navbatdagi e'lon (#${ad.id}) kanalga chiqmayapti: ${esc((r && r.error) || "")}\nBot kanalda admin ekanini tekshiring. Navbat: /navbat`, { parse_mode: "HTML" }).catch(() => {});
    } catch (e) { log("navbat:", e.message); }
    finally { queueBusy = false; }
  }
  async function flushQueue() {
    const [rows] = await db.execute("SELECT id FROM ads WHERE status = 'queued' ORDER BY queued_at, id LIMIT 50");
    let ok = 0;
    for (const r of rows) {
      const [u] = await db.execute("UPDATE ads SET status = 'pending' WHERE id = ? AND status = 'queued'", [r.id]);
      if (!u || !u.affectedRows) continue;
      const res = await d.publishApprovedAd(r.id).catch((e) => ({ ok: false, error: e.message }));
      if (res && res.ok) ok++; else await db.execute("UPDATE ads SET status = 'queued' WHERE id = ? AND status = 'pending'", [r.id]).catch(() => {});
      await new Promise((s) => setTimeout(s, 3000));
    }
    return ok;
  }
  async function queueList() {
    const [rows] = await db.execute("SELECT id, carDetails, price, queued_at FROM ads WHERE status = 'queued' ORDER BY queued_at, id LIMIT 50");
    return rows.map((r, i) => ({ id: Number(r.id), title: r.carDetails, price: priceNum(r.price), eta: hhmm(etaFor(i + 1)) }));
  }
  function queueView(list) {
    let text = `⏱ <b>POSTLAR NAVBATI</b>\n\nHolat: <b>${isAutoOn("smooth_post") ? "yoqilgan" : "o'chiq"}</b> · oraliq: <b>${smoothGap()} daqiqa</b>\n<i>23:00–07:00 da tasdiqlangan e'lonlar 07:00 dan boshlab chiqadi.</i>\n\n`;
    text += list.length ? list.map((x, i) => `${i + 1}. #${x.id} ${esc(x.title)} — ${formatNum(x.price)}$ · ~${x.eta}`).join("\n") : "Navbat bo'sh.";
    const kb = new InlineKeyboard();
    [3, 5, 7, 10, 15, 30].forEach((n) => kb.text(`${n === smoothGap() ? "✅ " : ""}${n} daq`, `sq_gap:${n}`));
    kb.row().text(isAutoOn("smooth_post") ? "⛔️ O'chirish" : "✅ Yoqish", "ap_t:smooth_post");
    if (list.length) kb.text("🚀 Hammasini hozir chiqarish", "sq_flush");
    return { text, kb: kb.row().text("🔙 Orqaga", "admin_back") };
  }
  bot.command("navbat", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const v = queueView(await queueList());
    await ctx.reply(v.text, { parse_mode: "HTML", reply_markup: v.kb });
  });
  bot.callbackQuery(/^sq_gap:(\d+)$/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCallbackQuery().catch(() => {});
    await setSetting("smooth:gap", ctx.match[1]);
    await ctx.answerCallbackQuery({ text: `Oraliq: ${ctx.match[1]} daqiqa` }).catch(() => {});
    const v = queueView(await queueList());
    await ctx.editMessageText(v.text, { parse_mode: "HTML", reply_markup: v.kb }).catch(() => {});
  });
  bot.callbackQuery("sq_flush", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCallbackQuery().catch(() => {});
    await ctx.answerCallbackQuery({ text: "🚀 Chiqarilmoqda..." }).catch(() => {});
    const n = await flushQueue();
    await ctx.reply(`✅ Navbatdan ${n} ta e'lon kanalga chiqarildi.`);
  });

  // ===================================================================
  // ☀️ ERTALABKI DAYJEST
  // ===================================================================
  async function buildDigest() {
    const [rows] = await db.execute("SELECT * FROM ads WHERE status = 'active' AND channelMsgId IS NOT NULL AND posted_at >= NOW() - INTERVAL 24 HOUR ORDER BY id DESC LIMIT 300");
    const [[sold]] = await db.execute("SELECT COUNT(*) AS c FROM ads WHERE status = 'sold' AND sold_at >= NOW() - INTERVAL 24 HOUR");
    if (!rows.length) return null;
    const scored = [], bad = new Set();
    for (const ad of rows.slice(0, 150)) {
      const c = await market.compareAd(ad).catch(() => null);
      const st = d.dealStatus(ad, c); // faqat ishonchli arzonlar: 7–35%, nasiyasiz
      if (st === "trusted") scored.push({ ad, pct: Math.abs(c.diff) });
      else if (st === "suspicious") bad.add(ad.id);
    }
    scored.sort((a, b) => b.pct - a.pct);
    const models = new Map();
    rows.forEach((a) => { const n = d.modelTagName(a); if (n) models.set(n, (models.get(n) || 0) + 1); });
    const topModels = [...models.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const t = tz();
    let text = `☀️ <b>Xayrli tong!</b> · ${dateLabel()}, ${WEEKDAYS[t.getUTCDay()]}\n\n` +
      `Oxirgi 24 soatda kanalga <b>${rows.length} ta</b> yangi mashina qo'shildi` + (Number(sold.c) ? `, <b>${sold.c} ta</b> sotildi` : "") + ".\n";
    if (scored.length) {
      text += `\n🔥 <b>Bozordan arzonlari:</b>\n`;
      scored.slice(0, 5).forEach(({ ad, pct }, i) => { text += `${i + 1}. <a href="${postLink(ad.channelMsgId)}">${adName(ad)}</a> — <b>${sp(priceNum(ad.price))}$</b> (−${pct}%)\n`; });
    } else {
      const cheap = rows.filter((a) => priceNum(a.price) >= 300 && !bad.has(a.id)).sort((a, b) => priceNum(a.price) - priceNum(b.price)).slice(0, 5);
      text += `\n💰 <b>Eng arzonlari:</b>\n`;
      cheap.forEach((ad, i) => { text += `${i + 1}. <a href="${postLink(ad.channelMsgId)}">${adName(ad)}</a> — <b>${sp(priceNum(ad.price))}$</b>\n`; });
    }
    if (topModels.length) text += `\n📊 Eng ko'p: ${topModels.map(([n, c]) => `${esc(n)} (${c})`).join(" · ")}\n`;
    text += `\nYaxshi kun va omadli savdo! 🚗`;
    return { text: text.slice(0, 4000), kb: sellKb() };
  }
  async function postDigest() {
    const p = await buildDigest();
    if (!p) return { ok: false, error: "Oxirgi 24 soatda yangi e'lon yo'q" };
    const m = await bot.api.sendMessage(CHANNEL_ID, p.text, { parse_mode: "HTML", reply_markup: p.kb, link_preview_options: { is_disabled: true } });
    return { ok: true, msgId: m.message_id };
  }

  // ===================================================================
  // 🎯 «NARXINI TOP» VIKTORINASI
  // ===================================================================
  const niceStep = (p) => { const raw = p * 0.15; const s = raw >= 5000 ? 1000 : raw >= 2000 ? 500 : raw >= 800 ? 200 : 100; return Math.max(s, Math.round(raw / s) * s); };
  async function pickQuizAd() {
    const [rows] = await db.execute(
      `SELECT a.* FROM ads a LEFT JOIN channel_games g ON g.ad_id = a.id AND g.kind = 'quiz'
       WHERE a.status = 'active' AND a.channelMsgId IS NOT NULL AND a.photoId IS NOT NULL AND g.id IS NULL
         AND a.posted_at >= NOW() - INTERVAL 14 DAY ORDER BY RAND() LIMIT 40`);
    for (const ad of rows) { const p = priceNum(ad.price); if (p >= 2000 && p <= 150000) return ad; }
    return null;
  }
  async function postQuiz() {
    const ad = await pickQuizAd();
    if (!ad) return { ok: false, error: "Mos e'lon topilmadi (oxirgi 14 kun, rasmli, narxi 2 000$ dan)" };
    const price = Math.round(priceNum(ad.price) / 100) * 100, step = niceStep(price);
    const k = Math.floor(Math.random() * 4);
    let opts = [0, 1, 2, 3].map((i) => price + (i - k) * step);
    if (opts[0] <= 0) { opts = opts.map((v) => v + (1 - Math.floor(opts[0] / step)) * step); }
    const correct = opts.indexOf(price);
    const fid = String(ad.photoId).split(",")[0];
    const caption = `🎯 <b>NARXINI TOP!</b>\n\n🚗 <b>${esc(ad.carDetails)}</b>, ${esc(ad.year || "")}\n` +
      `👣 ${esc(String(ad.probeg || "—"))} · ⚙️ ${esc(ad.transmission || "—")} · 🚩 ${esc(ad.region || "—")}\n\n` +
      `Sizningcha, sotuvchi qancha so'rayapti? Pastda ovoz bering 👇\n<i>To'g'ri javob va e'lon soat 21:00 da.</i>`;
    const ph = await bot.api.sendPhoto(CHANNEL_ID, fid, { caption, parse_mode: "HTML" });
    const poll = await bot.api.raw.sendPoll({
      chat_id: CHANNEL_ID, question: "Bu mashina narxi qancha?", options: opts.map((v) => ({ text: `${sp(v)} $` })),
      type: "quiz", correct_option_id: correct, is_anonymous: true,
      explanation: `Sotuvchi so'rayotgan narx: ${sp(price)} $`.slice(0, 200),
      reply_parameters: { message_id: ph.message_id },
    });
    await db.execute("INSERT INTO channel_games (kind, ad_id, photo_msg, poll_msg, answer, reveal_at) VALUES ('quiz', ?, ?, ?, ?, ?)",
      [ad.id, ph.message_id, poll.message_id, price, revealTime()]);
    return { ok: true, msgId: ph.message_id };
  }
  function revealTime() {
    const t = tz(); let at = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 21, 0) - 5 * 3600e3;
    if (at - Date.now() < 60 * 60e3) at = Date.now() + 3 * 3600e3; // qo'lda kechroq yuborilsa — 3 soatdan keyin
    return new Date(at);
  }
  async function revealDue() {
    const [rows] = await db.execute("SELECT g.*, a.carDetails, a.year, a.channelMsgId, a.status FROM channel_games g LEFT JOIN ads a ON a.id = g.ad_id WHERE g.kind = 'quiz' AND g.revealed = 0 AND g.reveal_at <= NOW() LIMIT 3");
    for (const g of rows) {
      await db.execute("UPDATE channel_games SET revealed = 1 WHERE id = ?", [g.id]);
      let total = 0, right = 0;
      try {
        const poll = await bot.api.stopPoll(CHANNEL_ID, Number(g.poll_msg));
        total = poll.total_voter_count || 0;
        const opt = poll.options[poll.correct_option_id != null ? poll.correct_option_id : -1];
        right = opt ? opt.voter_count : 0;
      } catch (e) {}
      let text = `✅ <b>To'g'ri javob: ${sp(g.answer)} $</b>\n\n`;
      if (total) text += `👥 ${total} kishi qatnashdi, <b>${Math.round((right / total) * 100)}%</b> i topdi.\n`;
      text += g.status === "active" && g.channelMsgId ? `🚗 E'lonni ko'rish: <a href="${postLink(g.channelMsgId)}">${adName(g)}</a>` : g.status === "sold" ? "🤝 Bu mashina allaqachon sotildi!" : "";
      text += `\n\n🎯 Keyingi o'yin — ertaga 18:00 da!`;
      await bot.api.sendMessage(CHANNEL_ID, text, { parse_mode: "HTML", reply_parameters: { message_id: Number(g.photo_msg), allow_sending_without_reply: true }, link_preview_options: { is_disabled: true } }).catch((e) => log("javob:", e.message));
    }
  }

  // ===================================================================
  // 🏆 OBUNACHILAR TANLOVI
  // ===================================================================
  async function postFanChoice() {
    const [rows] = await db.execute(
      `SELECT a.*, r.fire, r.total FROM ad_reactions r JOIN ads a ON a.id = r.ad_id
       WHERE r.updated_at >= NOW() - INTERVAL 7 DAY AND a.channelMsgId IS NOT NULL AND r.fire > 0 AND a.status IN ('active','sold')
       ORDER BY r.fire DESC, r.total DESC LIMIT 3`);
    if (!rows.length) return { ok: false, error: "Bu hafta 🔥 reaksiyasi olgan e'lon yo'q" };
    const medals = ["🥇", "🥈", "🥉"];
    let text = `🏆 <b>OBUNACHILAR TANLOVI</b> · hafta yakuni\n\nSiz eng ko'p 🔥 «arzon» degan e'lonlar:\n\n`;
    rows.forEach((ad, i) => {
      text += `${medals[i]} <a href="${postLink(ad.channelMsgId)}">${adName(ad)}</a> — <b>${sp(priceNum(ad.price))}$</b>\n      🔥 ${ad.fire} ta${ad.status === "sold" ? " · 🤝 sotildi" : ""}\n`;
    });
    text += `\n👇 E'lonlar ostida 🔥 · 👍 · 🤔 bosib narxga baho bering — keyingi haftaning g'olibini siz tanlaysiz!`;
    const m = await bot.api.sendMessage(CHANNEL_ID, text, { parse_mode: "HTML", reply_markup: sellKb(), link_preview_options: { is_disabled: true } });
    const win = rows[0];
    bot.api.sendMessage(win.userId, `🏆 <b>Tabriklaymiz!</b>\n\nSizning <b>${esc(win.carDetails)}</b> e'loningiz bu hafta obunachilar tanlovida 1-o'rinni oldi (🔥 ${win.fire} ta).\n👉 ${postLink(m.message_id)}`, { parse_mode: "HTML" }).catch(() => {});
    return { ok: true, msgId: m.message_id };
  }

  // ===================================================================
  // 🤝 HAQIQATDA QANCHAGA SOTILDI
  // ===================================================================
  async function postSoldPrices() {
    const [rows] = await db.execute("SELECT id, carDetails, year, price, sold_price, region FROM ads WHERE status = 'sold' AND sold_price IS NOT NULL AND sold_at >= NOW() - INTERVAL 7 DAY ORDER BY sold_at DESC LIMIT 12");
    const list = rows.map((r) => ({ ...r, ask: priceNum(r.price), got: priceNum(r.sold_price) })).filter((r) => r.ask >= 300 && r.got >= 300 && r.got <= r.ask * 1.5);
    if (list.length < 2) return { ok: false, error: "Bu hafta sotilgan narxi yozilgan e'lon 2 tadan kam" };
    let text = `🤝 <b>HAQIQATDA QANCHAGA SOTILDI?</b>\n<i>Oxirgi 7 kunda kanalimiz orqali sotilgan mashinalar</i>\n\n`;
    let sumPct = 0;
    for (const r of list.slice(0, 10)) {
      const pct = Math.round(((r.got - r.ask) / r.ask) * 100); sumPct += pct;
      text += `• <b>${adName(r)}</b>\n   so'ralgan ${sp(r.ask)}$ → sotildi <b>${sp(r.got)}$</b>${pct ? ` (${pct > 0 ? "+" : "−"}${Math.abs(pct)}%)` : " (o'z narxida)"}\n`;
    }
    const avg = Math.round(sumPct / Math.min(list.length, 10));
    text += `\n📉 O'rtacha savdolashuv: <b>${avg ? `${avg > 0 ? "+" : "−"}${Math.abs(avg)}%` : "deyarli yo'q"}</b>\n\n💡 Mashinangiz sotilsa, botda «Sotildi» deb narxini yozing — bozor hamma uchun shaffof bo'ladi.`;
    const m = await bot.api.sendMessage(CHANNEL_ID, text.slice(0, 4000), { parse_mode: "HTML", reply_markup: sellKb(), link_preview_options: { is_disabled: true } });
    return { ok: true, msgId: m.message_id };
  }

  // ===================================================================
  // 💡 MASLAHATLAR SERIYASI
  // ===================================================================
  const tipIndex = () => { const n = parseInt(getSetting("tips:idx"), 10); return Number.isFinite(n) && n >= 0 ? n % TIPS.length : 0; };
  async function buildTip(idx = tipIndex()) {
    const tip = TIPS[idx % TIPS.length];
    const colors = ["blue", "green", "orange", "dark"];
    const png = await PM.renderPost(sharp, { tpl: "notice", color: colors[idx % colors.length], icon: tip.i, tag: `Maslahat #${idx + 1}`, title: tip.t, body: tip.b, bot: d.BOT_LINK_USERNAME });
    const caption = `💡 <b>Maslahat #${idx + 1}: ${esc(tip.t)}</b>\n\n${esc(tip.b)}\n\n#maslahat · Har chorshanba yangi maslahat`;
    return { png, caption, kb: sellKb() };
  }
  async function postTip() {
    const idx = tipIndex();
    const p = await buildTip(idx);
    const m = await bot.api.sendPhoto(CHANNEL_ID, new InputFile(p.png, "maslahat.jpg"), { caption: p.caption, parse_mode: "HTML", reply_markup: p.kb });
    await setSetting("tips:idx", String((idx + 1) % TIPS.length));
    return { ok: true, msgId: m.message_id };
  }

  // ===================================================================
  // 📌 QADALGAN MUNDARIJA
  // ===================================================================
  async function buildToc() {
    const [rows] = await db.execute("SELECT id, model_id, carDetails, region FROM ads WHERE status = 'active'");
    const models = new Map();
    for (const a of rows) {
      const name = d.modelTagName(a); if (!name) continue;
      const m = models.get(name) || { name, n: 0, id: a.model_id || null }; m.n++; if (!m.id && a.model_id) m.id = a.model_id; models.set(name, m);
    }
    const top = [...models.values()].sort((a, b) => b.n - a.n);
    const regions = new Map(); rows.forEach((a) => a.region && regions.set(a.region, (regions.get(a.region) || 0) + 1));
    const withTags = d.postStyle() !== "0";
    let text = `📌 <b>MUNDARIJA — kerakli mashinani tez toping</b>\n\nHozir kanalda <b>${rows.length} ta</b> faol e'lon.\n\n`;
    text += `🚗 <b>Modellar:</b>\n` + top.slice(0, 30).map((m) => `${withTags ? d.hashTag(m.name) || esc(m.name) : esc(m.name)} — ${m.n}`).join(" · ") + "\n";
    if (regions.size) text += `\n🚩 <b>Viloyatlar:</b>\n` + [...regions.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${withTags ? d.hashTag(r) || esc(r) : esc(r)} — ${n}`).join(" · ") + "\n";
    text += `\n${withTags ? "👆 Hashtegni bosing — shu modeldagi e'lonlar chiqadi.\n" : ""}${d.WEBAPP_URL ? "👇 Tugmani bosing — ilovada shu model e'lonlari ochiladi.\n" : ""}\n🔄 Yangilandi: ${dateLabel()} ${hhmm(new Date())}`;
    const kb = new InlineKeyboard();
    if (d.WEBAPP_URL) {
      top.filter((m) => m.id).slice(0, 12).forEach((m, i) => { kb.url(`${m.name} · ${m.n}`, d.miniAppLink(`m_${m.id}`)); if (i % 3 === 2) kb.row(); });
      kb.row().url("🔎 Barcha e'lonlar", d.miniAppLink(""));
    }
    kb.url("➕ E'lon berish", `https://t.me/${d.BOT_LINK_USERNAME}`);
    return { text: text.slice(0, 4000), kb };
  }
  async function updateToc() {
    const p = await buildToc();
    const id = parseInt(getSetting("toc:msg"), 10);
    if (id) {
      try { await bot.api.editMessageText(CHANNEL_ID, id, p.text, { parse_mode: "HTML", reply_markup: p.kb, link_preview_options: { is_disabled: true } }); return { ok: true, msgId: id, edited: true }; }
      catch (e) { if (/not modified/i.test(e.description || e.message)) return { ok: true, msgId: id, edited: true }; }
    }
    const m = await bot.api.sendMessage(CHANNEL_ID, p.text, { parse_mode: "HTML", reply_markup: p.kb, link_preview_options: { is_disabled: true } });
    await bot.api.pinChatMessage(CHANNEL_ID, m.message_id, { disable_notification: true }).catch(() => {});
    await setSetting("toc:msg", String(m.message_id));
    return { ok: true, msgId: m.message_id };
  }

  // ===================================================================
  // 📲 STORY UCHUN 9:16 RASM
  // ===================================================================
  async function buildStory() {
    const p = await d.buildTop3Post();
    if (!p || !p.png) return null;
    const W = 1080, H = 1920, IW = 960, IH = 1200, top = 330;
    const card = await sharp(p.png).resize(IW, IH, { fit: "cover" })
      .composite([{ input: Buffer.from(`<svg width="${IW}" height="${IH}"><rect width="${IW}" height="${IH}" rx="40" fill="#fff"/></svg>`), blend: "dest-in" }]).png().toBuffer();
    const F = "Inter, DejaVu Sans, sans-serif";
    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f1a2b"/><stop offset="1" stop-color="#1667d9"/></linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
      <text x="${W / 2}" y="170" font-family="${F}" font-size="72" font-weight="800" text-anchor="middle"><tspan fill="#fff">Avto</tspan><tspan fill="#8cbcff">Bozor</tspan></text>
      <text x="${W / 2}" y="250" font-family="${F}" font-size="40" font-weight="600" fill="#cfe0ff" text-anchor="middle">Kunning eng yaxshi takliflari · ${esc(dateLabel())}</text>
      <rect x="${(W - 760) / 2}" y="1610" width="760" height="120" rx="60" fill="#fff"/>
      <text x="${W / 2}" y="1688" font-family="${F}" font-size="44" font-weight="800" fill="#1667d9" text-anchor="middle">@${esc(CHANNEL_USER)}</text>
      <text x="${W / 2}" y="1810" font-family="${F}" font-size="34" font-weight="500" fill="#cfe0ff" text-anchor="middle">Barcha e'lonlar kanalda — bepul e'lon bering</text></svg>`;
    return sharp(Buffer.from(svg)).composite([{ input: card, top, left: (W - IW) / 2 }]).jpeg({ quality: 90 }).toBuffer();
  }
  async function sendStory(chatId = ADMIN_ID) {
    const img = await buildStory();
    if (!img) return { ok: false, error: "Oxirgi 24 soatda e'lon yo'q — story rasmi chiqmadi" };
    await bot.api.sendDocument(chatId, new InputFile(img, `story-${dayStr()}.jpg`), {
      caption: `📲 <b>Story uchun tayyor rasm</b> (9:16)\n\nKanal → profil rasmi → «Story qo'shish» → shu rasmni tanlang. Havola sifatida kanal manzilini qo'shing: t.me/${esc(CHANNEL_USER)}\n<i>Telegram botlarga kanal story'sini joylashga ruxsat bermaydi, shuning uchun bir bosishda o'zingiz joylaysiz.</i>`,
      parse_mode: "HTML",
    });
    return { ok: true };
  }

  // ===================================================================
  // 🗺 VILOYAT KANALLARI
  // ===================================================================
  const regionChannel = (region) => getSetting(`region_ch:${region}`) || null;
  function regionMap() { const o = {}; REGIONS.forEach((r) => { const v = regionChannel(r); if (v) o[r] = v; }); return o; }
  async function setRegionChannel(region, ch) {
    if (!REGIONS.includes(region)) return { ok: false, error: "Bunday viloyat yo'q" };
    ch = String(ch || "").trim();
    if (!ch || ch === "-") { await setSetting(`region_ch:${region}`, ""); return { ok: true, removed: true }; }
    if (!/^(@[A-Za-z0-9_]{4,64}|-100\d{6,16})$/.test(ch)) return { ok: false, error: "Kanal @username yoki -100… ID ko'rinishida bo'lsin" };
    try {
      const me = await bot.api.getChatMember(ch, bot.botInfo.id);
      if (!["administrator", "creator"].includes(me.status)) return { ok: false, error: "Bot bu kanalda admin emas" };
    } catch (e) { return { ok: false, error: "Kanal topilmadi yoki bot admin emas" }; }
    await setSetting(`region_ch:${region}`, ch);
    return { ok: true };
  }
  async function copyRegional(ad, msgId, markup) {
    if (!isAutoOn("regional") || !ad.region) return;
    const ch = regionChannel(ad.region);
    if (!ch) return;
    try {
      const m = await bot.api.copyMessage(ch, CHANNEL_ID, msgId, { reply_markup: markup });
      await db.execute("UPDATE ads SET region_ch = ?, region_msg = ? WHERE id = ?", [ch, m.message_id, ad.id]);
    } catch (e) { log(`viloyat kanali (${ad.region}):`, e.description || e.message); }
  }
  async function cleanRegional() {
    try {
      const [rows] = await db.execute("SELECT id, region_ch, region_msg FROM ads WHERE region_msg IS NOT NULL AND status <> 'active' LIMIT 30");
      for (const r of rows) {
        await bot.api.deleteMessage(r.region_ch, Number(r.region_msg)).catch(() => {});
        await db.execute("UPDATE ads SET region_msg = NULL WHERE id = ?", [r.id]);
      }
    } catch (e) {}
  }
  function regionsView() {
    const m = regionMap();
    return `🗺 <b>VILOYAT KANALLARI</b> (${isAutoOn("regional") ? "yoqilgan" : "o'chiq"})\n\n` + REGIONS.map((r) => `${m[r] ? "✅" : "▫️"} ${esc(r)}${m[r] ? ` → ${esc(m[r])}` : ""}`).join("\n") +
      `\n\n<b>Ulash:</b> <code>/viloyat Farg'ona @kanal_nomi</code>\n<b>Uzish:</b> <code>/viloyat Farg'ona -</code>\n<i>Bot o'sha kanalda admin bo'lishi kerak. Yoqish/o'chirish: «⏰ Avto-xabarlar».</i>`;
  }
  bot.command("viloyat", async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const arg = String(ctx.match || "").trim();
    if (!arg) return ctx.reply(regionsView(), { parse_mode: "HTML" });
    const m = /^(.+?)\s+(\S+)$/.exec(arg);
    const region = m && REGIONS.find((r) => r.toLowerCase() === m[1].trim().toLowerCase());
    if (!region) return ctx.reply("❗️ Viloyat nomini ro'yxatdagidek yozing: " + REGIONS.join(", "));
    const r = await setRegionChannel(region, m[2]);
    return ctx.reply(r.ok ? (r.removed ? `▫️ ${region} kanali uzildi.` : `✅ ${region} → ${m[2]} ulandi.`) : `❗️ ${r.error}`);
  });

  // ===================================================================
  // 💬 IZOHLAR (muhokama guruhi) va 💸 PULLIK TAKLIF POSTLARI (kanal DM)
  // ===================================================================
  let discussionId = null, discussionUser = null, dmChatId = null, chatInfoAt = 0, channelNumId = null;
  const stats = { spamDeleted: 0, commentsNotified: 0 };
  async function refreshChatInfo(force = false) {
    if (!force && Date.now() - chatInfoAt < 60 * 60e3) return;
    chatInfoAt = Date.now();
    try {
      const c = await bot.api.getChat(CHANNEL_ID);
      channelNumId = c.id;
      discussionId = c.linked_chat_id || null;
      dmChatId = c.direct_messages_chat_id || c.linked_direct_messages_chat_id || dmChatId;
      if (discussionId) { try { const g = await bot.api.getChat(discussionId); discussionUser = g.username || null; } catch (e) {} }
    } catch (e) { log("kanal ma'lumoti:", e.message); }
  }
  const SPAM_RE = /(https?:\/\/|www\.|t\.me\/|telegram\.me\/|@[a-z0-9_]{4,})|(\+?998[\s-]?\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2})|(\b\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b)/i;
  function isSpam(msg) {
    const t = `${msg.text || ""} ${msg.caption || ""}`;
    const ents = (msg.entities || []).concat(msg.caption_entities || []);
    return SPAM_RE.test(t) || ents.some((e) => ["url", "text_link", "mention", "text_mention", "phone_number"].includes(e.type));
  }
  const notifyAt = new Map();
  async function onDiscussion(ctx) {
    const msg = ctx.message;
    if (msg.is_automatic_forward) {
      const o = msg.forward_origin;
      const ch = (o && o.message_id) || msg.forward_from_message_id;
      if (ch) await db.execute("INSERT IGNORE INTO comment_map (group_msg, channel_msg) VALUES (?, ?)", [msg.message_id, ch]).catch(() => {});
      return;
    }
    const rt = msg.reply_to_message;
    let channelMsg = rt && rt.is_automatic_forward ? ((rt.forward_origin && rt.forward_origin.message_id) || rt.forward_from_message_id) : null;
    const root = msg.message_thread_id || (rt && rt.message_id);
    if (!channelMsg && root) { const [[r]] = await db.execute("SELECT channel_msg FROM comment_map WHERE group_msg = ?", [root]).catch(() => [[null]]); channelMsg = r && r.channel_msg; }
    if (!channelMsg) return;
    const [[ad]] = await db.execute("SELECT id, userId, carDetails FROM ads WHERE channelMsgId = ? LIMIT 1", [channelMsg]).catch(() => [[null]]);
    const fromId = msg.from && msg.from.id;
    const fromChannel = !!msg.sender_chat && (String(msg.sender_chat.id) === String(channelNumId) || msg.sender_chat.id === msg.chat.id);
    const privileged = fromId === ADMIN_ID || fromChannel || (ad && Number(ad.userId) === Number(fromId));
    if (isAutoOn("comment_spam") && !privileged && (isSpam(msg) || (msg.sender_chat && !fromChannel))) {
      try { await bot.api.deleteMessage(msg.chat.id, msg.message_id); stats.spamDeleted++; } catch (e) {}
      return;
    }
    if (isAutoOn("comment_notify") && ad && !privileged && Number(ad.userId) !== ADMIN_ID) {
      const last = notifyAt.get(ad.id) || 0;
      if (Date.now() - last < 5 * 60e3) return;
      notifyAt.set(ad.id, Date.now());
      const who = esc([msg.from && msg.from.first_name, msg.from && msg.from.last_name].filter(Boolean).join(" ") || "Foydalanuvchi");
      const body = esc(String(msg.text || msg.caption || "📎 media").slice(0, 300));
      const link = `https://t.me/${CHANNEL_USER}/${channelMsg}?comment=${msg.message_id}`;
      await bot.api.sendMessage(ad.userId, `💬 <b>E'loningizga izoh yozishdi</b>\n🚗 ${esc(ad.carDetails)}\n\n«${body}»\n— ${who}\n\n👉 <a href="${link}">Javob berish</a>`, { parse_mode: "HTML", link_preview_options: { is_disabled: true } })
        .then(() => stats.commentsNotified++).catch(() => {});
    }
  }
  async function onDirect(ctx) {
    const msg = ctx.message;
    dmChatId = msg.chat.id;
    if (!msg.suggested_post_info || !isAutoOn("suggested")) return;
    const info = msg.suggested_post_info;
    if (info.state && info.state !== "pending") return;
    const pr = info.price ? `${info.price.amount} ${info.price.currency === "XTR" ? "⭐ Stars" : info.price.currency}` : "bepul";
    const who = esc([msg.from && msg.from.first_name, msg.from && msg.from.username ? `@${msg.from.username}` : ""].filter(Boolean).join(" "));
    try { await bot.api.copyMessage(ADMIN_ID, msg.chat.id, msg.message_id); } catch (e) {}
    const kb = new InlineKeyboard().text("✅ Tasdiqlash va chiqarish", `sg_a:${msg.message_id}`).row().text("❌ Rad etish", `sg_d:${msg.message_id}`);
    await bot.api.sendMessage(ADMIN_ID, `💸 <b>Pullik post taklifi</b>\n\n👤 ${who}\n💰 Narx: <b>${esc(pr)}</b>${info.send_date ? `\n🕒 So'ralgan vaqt: ${hhmm(new Date(info.send_date * 1000))}` : ""}\n\nYuqoridagi post kanalga shunday chiqadi. Tasdiqlasangiz, to'lov kanal hisobiga o'tadi.`, { parse_mode: "HTML", reply_markup: kb }).catch(() => {});
  }
  bot.callbackQuery(/^sg_([ad]):(\d+)$/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCallbackQuery().catch(() => {});
    if (!dmChatId) await refreshChatInfo(true);
    if (!dmChatId) return ctx.answerCallbackQuery({ text: "Kanal DM chati topilmadi", show_alert: true }).catch(() => {});
    const approve = ctx.match[1] === "a", id = Number(ctx.match[2]);
    try {
      if (approve) await bot.api.raw.approveSuggestedPost({ chat_id: dmChatId, message_id: id });
      else await bot.api.raw.declineSuggestedPost({ chat_id: dmChatId, message_id: id, comment: "Kechirasiz, bu post kanal mavzusiga mos emas." });
    } catch (e) { return ctx.answerCallbackQuery({ text: "Bajarib bo'lmadi: " + (e.description || e.message).slice(0, 150), show_alert: true }).catch(() => {}); }
    await ctx.answerCallbackQuery({ text: approve ? "✅ Tasdiqlandi" : "❌ Rad etildi" }).catch(() => {});
    await ctx.editMessageText(approve ? "✅ Pullik post tasdiqlandi — kanalga chiqadi." : "❌ Pullik post rad etildi.").catch(() => {});
  });
  // index.js da conversations() dan oldin ulanadi
  async function mw(ctx, next) {
    const msg = ctx.message;
    if (msg && msg.chat && msg.chat.type !== "private") {
      try {
        if (msg.chat.is_direct_messages || (dmChatId && msg.chat.id === dmChatId)) { await onDirect(ctx); return; }
        await refreshChatInfo();
        if (discussionId && msg.chat.id === discussionId) { await onDiscussion(ctx); return; }
      } catch (e) { log("guruh xabari:", e.message); }
    }
    return next();
  }

  // ===================================================================
  // ⏰ JADVAL
  // ===================================================================
  const RUN = { digest: postDigest, quiz: postQuiz, fan_choice: postFanChoice, sold_prices: postSoldPrices, tips: postTip, toc: updateToc, story: () => sendStory() };
  async function runNow(key) {
    const f = RUN[key];
    if (!f) return { ok: false, error: "Bu imkoniyatni qo'lda ishga tushirib bo'lmaydi" };
    try { return (await f()) || { ok: true }; } catch (e) { log(key, e.description || e.message); return { ok: false, error: e.description || e.message }; }
  }
  // 👁 Kanalga yubormasdan — adminga namuna
  async function previewTo(chatId, key) {
    const opt = { parse_mode: "HTML", link_preview_options: { is_disabled: true } };
    if (key === "digest") { const p = await buildDigest(); if (!p) return { ok: false, error: "Oxirgi 24 soatda e'lon yo'q" }; await bot.api.sendMessage(chatId, p.text, { ...opt, reply_markup: p.kb }); return { ok: true }; }
    if (key === "toc") { const p = await buildToc(); await bot.api.sendMessage(chatId, p.text, { ...opt, reply_markup: p.kb }); return { ok: true }; }
    if (key === "tips") { const p = await buildTip(); await bot.api.sendPhoto(chatId, new InputFile(p.png, "maslahat.jpg"), { caption: p.caption, parse_mode: "HTML", reply_markup: p.kb }); return { ok: true }; }
    if (key === "story") return sendStory(chatId);
    return { ok: false, error: "Bu post uchun namuna yo'q — «▶️ Hozir» bilan kanalga yuboring" };
  }
  bot.callbackQuery(/^kn_prev:(\w+)$/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCallbackQuery().catch(() => {});
    await ctx.answerCallbackQuery({ text: "⏳ Tayyorlanmoqda..." }).catch(() => {});
    const r = await previewTo(ADMIN_ID, ctx.match[1]).catch((e) => ({ ok: false, error: e.message }));
    await ctx.reply(r.ok ? "👁 Namuna yuqorida — kanalga hech narsa yuborilmadi." : `❗️ ${r.error}`);
  });
  let ticking = false;
  async function tick(now = new Date()) {
    if (ticking) return; ticking = true;
    try {
      const t = tz(now), h = t.getUTCHours(), mi = t.getUTCMinutes(), wd = t.getUTCDay(), day = dayStr(now);
      for (const j of JOBS) {
        if (h !== j.h || mi < j.m || mi >= j.m + 30) continue;
        if (j.days && !j.days.includes(wd)) continue;
        const k = `kanal:last:${j.key}`;
        if (getSetting(k) === day) continue;
        await setSetting(k, day);
        if (!isAutoOn(j.key)) continue;
        const r = await runNow(j.key);
        if (r && r.ok === false) log(`${j.key}: ${r.error}`);
      }
      await revealDue();
      await queueTick();
      if (mi % 10 === 0) await cleanRegional();
    } catch (e) { log("taymer:", e.message); }
    finally { ticking = false; }
  }
  function start() {
    init().then(() => refreshChatInfo(true));
    setInterval(() => tick().catch(() => {}), 60 * 1000).unref();
  }

  // Bugungi kanal jadvali (admin panel uchun). base — index.js dagi eski postlar
  function todayTimeline(base = [], now = new Date()) {
    const t = tz(now), wd = t.getUTCDay(), md = t.getUTCDate();
    const list = [];
    for (const b of base) if ((!b.days || b.days.includes(wd)) && (!b.monthDay || b.monthDay === md)) list.push({ time: b.time, title: b.title, key: b.key, on: isAutoOn(b.key) });
    const F = Object.fromEntries(FEATURES.map((f) => [f.key, f]));
    for (const j of JOBS) if (!j.days || j.days.includes(wd)) list.push({ time: `${String(j.h).padStart(2, "0")}:${String(j.m).padStart(2, "0")}`, title: F[j.key].btn.replace(/ · \d\d:\d\d$/, ""), key: j.key, on: isAutoOn(j.key), admin: j.key === "story" });
    if (isAutoOn("quiz")) list.push({ time: "21:00", title: "«Narxini top» javobi", key: "quiz", on: true });
    return list.sort((a, b) => a.time.localeCompare(b.time));
  }
  let subsCache = { at: 0, n: null };
  async function subscribers() {
    if (Date.now() - subsCache.at < 10 * 60e3 && subsCache.n != null) return subsCache.n;
    try { subsCache = { at: Date.now(), n: await bot.api.getChatMemberCount(CHANNEL_ID) }; } catch (e) {}
    return subsCache.n;
  }
  function status() {
    return { discussion: !!discussionId, discussionUser, dm: !!dmChatId, smoothGap: smoothGap(), regions: regionMap(), stats: { ...stats }, tipNext: tipIndex() + 1, tipsTotal: TIPS.length };
  }

  return {
    FEATURES, DEFAULT_OFF, REGIONS, TIPS, start, tick, mw, runNow, previewTo, adWarnings, warnText,
    shouldQueue, queueAd, queueList, queueView, flushQueue, markPosted, smoothGap, copyRegional, setRegionChannel, regionsView,
    todayTimeline, subscribers, status, refreshChatInfo,
    _t: { setSetting, buildDigest, buildToc, buildTip, buildStory, postQuiz, revealDue, postFanChoice, postSoldPrices, onDiscussion, onDirect, isSpam, etaFor, niceStep, queueTick },
  };
}

module.exports = { createKanal, FEATURES, JOBS, TIPS, REGIONS };
