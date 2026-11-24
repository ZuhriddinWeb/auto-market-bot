// =====================================================================
// 💬 NARX TAKLIF QILISH
// Xaridor ilovadagi e'londan narx taklif qiladi → bot sotuvchiga yetkazadi:
//   [✅ Qabul qilish] [🔁 Qarshi taklif] [❌ Rad etish]
// Qarshi taklif bo'lsa — xaridorga: [✅ Roziman] [❌ Yo'q]
// Kelishilgach xaridorga sotuvchining raqami yuboriladi, sotuvchiga — «xaridor qo'ng'iroq qiladi».
// Ikki tomonning ismi va Telegram profili bir-biriga ko'rsatilmaydi.
// Javobsiz takliflar 48 soatdan keyin yopiladi.
// Admin joylagan e'lonlarda (sotuvchi botda yo'q) taklif tugmasi chiqmaydi.
// =====================================================================
const OPEN = ["pending", "countered"];
const DAILY_LIMIT = 10;
const EXPIRE_HOURS = 48;

const priceNum = (v) => parseInt(String(v == null ? "" : v).replace(/\D/g, ""), 10) || 0;

function createOffers({ db, deliverNotice, market, isOn, ADMIN_ID, formatNum, escapeHtml, InlineKeyboard, adLink, onLog }) {
  const money = (n) => `${formatNum(n)}$`;
  const title = (ad) => `${escapeHtml(ad.carDetails || "")}${ad.year ? `, ${ad.year}` : ""}`;
  const pct = (amount, price) => Math.round(((price - amount) / price) * 100);
  const phone = (ad) => { const d = String(ad.phone || "").replace(/\D/g, ""); return d ? `+${d}` : ""; };
  const log = (who, text) => { try { if (onLog) onLog(who, text); } catch (e) {} };
  const viewKb = (ad) => { const k = new InlineKeyboard(); const u = adLink(ad); if (u) k.url("📱 E'lonni ko'rish", u); return k; };

  async function loadAd(id) { const [[ad]] = await db.execute("SELECT * FROM ads WHERE id = ?", [id]); return ad || null; }
  async function loadOffer(id) { const [[o]] = await db.execute("SELECT * FROM offers WHERE id = ?", [id]); return o || null; }
  // Shu e'longa taklif qilsa bo'ladimi (tugmani ko'rsatish uchun)
  function allowedFor(ad, userId) {
    return !!(isOn() && ad && ad.status === "active" && Number(ad.userId) !== Number(userId) && Number(ad.userId) !== Number(ADMIN_ID));
  }

  async function create({ adId, buyer, amount }) {
    if (!isOn()) return { ok: false, error: "Narx taklif qilish hozircha o'chirilgan." };
    const ad = await loadAd(adId);
    if (!ad || ad.status !== "active") return { ok: false, error: "E'lon topilmadi yoki sotilgan." };
    if (Number(ad.userId) === Number(buyer.id)) return { ok: false, error: "O'z e'loningizga taklif qila olmaysiz." };
    if (Number(ad.userId) === Number(ADMIN_ID)) return { ok: false, error: "Bu e'lon bo'yicha sotuvchiga to'g'ridan-to'g'ri qo'ng'iroq qiling." };
    const [ban] = await db.execute("SELECT userId FROM banned_users WHERE userId = ?", [buyer.id]);
    if (ban.length) return { ok: false, error: "Siz botdan bloklangansiz." };
    const price = priceNum(ad.price), amt = priceNum(amount);
    if (!price) return { ok: false, error: "Bu e'londa narx ko'rsatilmagan." };
    if (!amt) return { ok: false, error: "Taklif narxini yozing." };
    if (amt >= price) return { ok: false, error: `Taklif e'lon narxidan (${money(price)}) past bo'lishi kerak.` };
    if (amt < Math.ceil(price * 0.5)) return { ok: false, error: `Taklif juda past — kamida ${money(Math.ceil(price * 0.5))} bo'lsin.` };
    const [open] = await db.execute("SELECT id FROM offers WHERE adId = ? AND buyerId = ? AND status IN ('pending', 'countered')", [ad.id, buyer.id]);
    if (open.length) return { ok: false, error: "Bu e'longa taklifingiz bor — sotuvchi javobini kuting." };
    const [[d]] = await db.execute("SELECT COUNT(*) AS c FROM offers WHERE buyerId = ? AND created_at > NOW() - INTERVAL 1 DAY", [buyer.id]);
    if (Number(d && d.c) >= DAILY_LIMIT) return { ok: false, error: `Bir kunda ko'pi bilan ${DAILY_LIMIT} ta taklif yuborish mumkin.` };

    const [ins] = await db.execute("INSERT INTO offers (adId, buyerId, sellerId, amount, status) VALUES (?, ?, ?, ?, 'pending')", [ad.id, buyer.id, ad.userId, amt]);
    const id = ins && ins.insertId;
    let hint = "";
    try { const c = market && (await market.compareAd(ad)); if (c && c.confident) hint = `\n📊 Bozor narxi: ~${money(c.median)}`; } catch (e) {}
    const kb = new InlineKeyboard().text("✅ Qabul qilish", `of_a:${id}`).text("❌ Rad etish", `of_r:${id}`).row().text("🔁 Qarshi taklif", `of_c:${id}`);
    await deliverNotice(ad.userId, { kind: "text", extra: { reply_markup: kb },
      text: `💬 <b>Yangi narx taklifi</b>\n\n🚗 <b>${title(ad)}</b> (#${ad.id})\nSizning narxingiz: ${money(price)}\nXaridor taklifi: <b>${money(amt)}</b> (−${pct(amt, price)}%)${hint}\n\n` +
        `<i>Qabul qilsangiz, xaridorga raqamingiz yuboriladi va u sizga qo'ng'iroq qiladi. Taklif ${EXPIRE_HOURS} soat amal qiladi.</i>` });
    log(buyer, `Narx taklif qildi 💬: #${ad.id} ${ad.carDetails} — ${money(amt)} (e'lon narxi ${money(price)})`);
    return { ok: true, id };
  }

  // Kelishildi: xaridorga raqam, sotuvchiga — xabar
  async function agreed(o, ad, final, byBuyer) {
    await deliverNotice(o.buyerId, { kind: "text", extra: { reply_markup: viewKb(ad) },
      text: `✅ <b>Kelishildi!</b>\n\n🚗 <b>${title(ad)}</b>\nKelishilgan narx: <b>${money(final)}</b>\n📞 Sotuvchi: ${phone(ad)}\n\n` +
        `Tezroq qo'ng'iroq qiling — mashinani boshqalar ham ko'ryapti. ⚠️ Mashinani ko'rmasdan oldindan pul o'tkazmang.` });
    if (byBuyer) await deliverNotice(o.sellerId, { kind: "text",
      text: `✅ <b>Xaridor ${money(final)} ga rozi bo'ldi!</b>\n\n🚗 ${title(ad)} (#${ad.id})\nUnga raqamingiz yuborildi — tez orada qo'ng'iroq qiladi.` });
  }

  // Sotuvchi javobi: action = accept | reject | counter
  async function respond({ offerId, sellerId, action, counter }) {
    const o = await loadOffer(offerId);
    if (!o || Number(o.sellerId) !== Number(sellerId)) return { ok: false, error: "Taklif topilmadi." };
    if (o.status !== "pending") return { ok: false, error: o.status === "expired" ? "Taklif muddati o'tgan." : "Bu taklifga allaqachon javob berilgan." };
    const ad = await loadAd(o.adId);
    if (!ad || ad.status !== "active") return { ok: false, error: "E'lon faol emas." };
    const price = priceNum(ad.price);
    if (action === "counter") {
      const c = priceNum(counter);
      if (!c || c <= o.amount || c >= price) return { ok: false, error: `Qarshi taklif ${money(o.amount)} dan yuqori va ${money(price)} dan past bo'lsin.` };
      const [u] = await db.execute("UPDATE offers SET status = 'countered', counter = ?, updated_at = NOW() WHERE id = ? AND status = 'pending'", [c, o.id]);
      if (!u || !u.affectedRows) return { ok: false, error: "Bu taklifga allaqachon javob berilgan." };
      const kb = new InlineKeyboard().text(`✅ Roziman — ${money(c)}`, `ofb_a:${o.id}`).text("❌ Yo'q", `ofb_r:${o.id}`);
      await deliverNotice(o.buyerId, { kind: "text", extra: { reply_markup: kb },
        text: `🔁 <b>Sotuvchi qarshi taklif qildi</b>\n\n🚗 <b>${title(ad)}</b>\nSiz taklif qilgan: ${money(o.amount)}\nSotuvchi rozi bo'ladigan narx: <b>${money(c)}</b>\n\n<i>Rozi bo'lsangiz, sotuvchining raqami yuboriladi.</i>` });
      return { ok: true, status: "countered", counter: c, offer: o, ad };
    }
    const status = action === "accept" ? "accepted" : action === "reject" ? "rejected" : null;
    if (!status) return { ok: false, error: "Noma'lum amal." };
    const [u] = await db.execute("UPDATE offers SET status = ?, updated_at = NOW() WHERE id = ? AND status = 'pending'", [status, o.id]);
    if (!u || !u.affectedRows) return { ok: false, error: "Bu taklifga allaqachon javob berilgan." };
    if (status === "accepted") await agreed(o, ad, o.amount, false);
    else await deliverNotice(o.buyerId, { kind: "text", extra: { reply_markup: viewKb(ad) },
      text: `❌ Sotuvchi <b>${money(o.amount)}</b> taklifingizni qabul qilmadi.\n\n🚗 ${title(ad)} — e'lon narxi ${money(price)}\nBoshqa narx taklif qilishingiz yoki to'g'ridan-to'g'ri qo'ng'iroq qilishingiz mumkin.` });
    return { ok: true, status, offer: o, ad };
  }

  // Xaridor javobi (qarshi taklifga): action = accept | reject
  async function buyerRespond({ offerId, buyerId, action }) {
    const o = await loadOffer(offerId);
    if (!o || Number(o.buyerId) !== Number(buyerId)) return { ok: false, error: "Taklif topilmadi." };
    if (o.status !== "countered") return { ok: false, error: o.status === "expired" ? "Taklif muddati o'tgan." : "Bu taklifga allaqachon javob berilgan." };
    const ad = await loadAd(o.adId);
    if (!ad || ad.status !== "active") return { ok: false, error: "E'lon faol emas." };
    const status = action === "accept" ? "accepted" : action === "reject" ? "rejected" : null;
    if (!status) return { ok: false, error: "Noma'lum amal." };
    const [u] = await db.execute("UPDATE offers SET status = ?, updated_at = NOW() WHERE id = ? AND status = 'countered'", [status, o.id]);
    if (!u || !u.affectedRows) return { ok: false, error: "Bu taklifga allaqachon javob berilgan." };
    if (status === "accepted") await agreed(o, ad, o.counter, true);
    else await deliverNotice(o.sellerId, { kind: "text", text: `ℹ️ Xaridor ${money(o.counter)} qarshi taklifingizga rozi bo'lmadi.\n🚗 ${title(ad)} (#${ad.id})` });
    return { ok: true, status, offer: o, ad };
  }

  // Muddati o'tganlarni yopish (javob kutayotgan xaridorga xabar)
  async function expire() {
    try {
      const [rows] = await db.execute(`SELECT o.*, a.carDetails, a.year, a.status AS adStatus, a.channelMsgId FROM offers o JOIN ads a ON a.id = o.adId
        WHERE o.status IN ('pending', 'countered') AND o.created_at < NOW() - INTERVAL ${EXPIRE_HOURS} HOUR LIMIT 200`);
      for (const r of rows) {
        const [u] = await db.execute("UPDATE offers SET status = 'expired', updated_at = NOW() WHERE id = ? AND status IN ('pending', 'countered')", [r.id]);
        if (!u || !u.affectedRows || r.status !== "pending" || r.adStatus !== "active") continue;
        await deliverNotice(r.buyerId, { kind: "text", text: `⏳ Sotuvchi ${EXPIRE_HOURS} soat ichida ${money(r.amount)} taklifingizga javob bermadi.\n🚗 ${title(r)}\nTo'g'ridan-to'g'ri qo'ng'iroq qilib ko'ring.` });
      }
    } catch (e) { console.error("Takliflar muddatini tekshirishda xato:", e.message); }
  }

  const pub = (o) => o && { id: Number(o.id), amount: Number(o.amount), counter: o.counter ? Number(o.counter) : null, status: o.status, at: o.updated_at || o.created_at };
  // Xaridorning shu e'longa oxirgi taklifi (7 kun ichida)
  async function forBuyer(adId, buyerId) {
    const [[o]] = await db.execute("SELECT * FROM offers WHERE adId = ? AND buyerId = ? AND created_at > NOW() - INTERVAL 7 DAY ORDER BY id DESC LIMIT 1", [adId, buyerId]);
    return pub(o) || null;
  }
  // Sotuvchiga: e'loniga kelgan takliflar (xaridor kimligi ko'rsatilmaydi)
  async function forSeller(adId, sellerId) {
    const [rows] = await db.execute("SELECT * FROM offers WHERE adId = ? AND sellerId = ? ORDER BY id DESC LIMIT 20", [adId, sellerId]);
    return rows.map(pub);
  }
  // Sotuvchining e'lonlari bo'yicha javob kutayotgan takliflar soni: Map(adId → n)
  async function pendingCounts(adIds) {
    const m = new Map();
    if (!adIds.length) return m;
    try {
      const [rows] = await db.execute(`SELECT adId, COUNT(*) AS c FROM offers WHERE status = 'pending' AND adId IN (${adIds.map(() => "?").join(",")}) GROUP BY adId`, adIds);
      rows.forEach((r) => m.set(Number(r.adId), Number(r.c)));
    } catch (e) {}
    return m;
  }
  async function get(id) { return loadOffer(id); }

  return { create, respond, buyerRespond, expire, forBuyer, forSeller, pendingCounts, allowedFor, get, isOn, OPEN };
}

module.exports = { createOffers };
