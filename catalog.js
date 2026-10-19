// ==============================================================
// 🚗 MOSHINA KATALOGI (MARKA / MODEL) — BAZADA SAQLANADI
// --------------------------------------------------------------
// Bot ham, Mini App ham marka va modellarni shu yerdan oladi.
// Har bir marka va model bazada o'z ID siga ega, e'lonlar
// (ads.brand_id, ads.model_id) shu ID lar orqali bog'lanadi.
// Shu sababli "Lexus RX" va "Exeed RX" yoki "Chevrolet Matiz"
// va "Daewoo Matiz" endi qidiruvda aralashib ketmaydi.
// ==============================================================

// Asosiy ro'yxat. Bot har ishga tushganda bazada YO'Q bo'lganlarini
// qo'shadi (hech narsani o'chirmaydi). Yangi model qo'shish uchun bu
// yerga yozish yoki botda /model_qosh buyrug'idan foydalanish kifoya.
// { name, aliases } — aliases: eski e'lonlarda boshqacha yozilgan nomlar.
const MASTER_CATALOG = [
  { brand: "Chevrolet", models: ["Cobalt", "Gentra", "Lacetti", "Epica", "Spark", "Orlando", "Nexia 1", "Nexia 2", "Nexia 3", "Matiz", "Damas", "Labo", "Tracker", "Onix", "Monza", "Malibu 1", "Malibu 2", "Captiva", "Captiva 5", "Equinox", "Tahoe", "Traverse", { name: "Trailblazer", aliases: ["Trablaizer"] }] },
  { brand: "Daewoo", models: ["Matiz", "Nexia 1", "Tico", "Damas"] },
  { brand: "BYD", models: ["Song L", "Seal", "Chazor", "Song Plus", "Song Pro", "Champion", "Han", "Tang", "Seagull", "Yuan Up", "Yuan Plus", "Destroyer 05", "e2"] },
  { brand: "Kia", models: ["Sonet", "K3", "K4", "K5", "K8", "K9", "EV6", "Carens", "Sportage", "Sorento", "Carnival", "Cerato", "Seltos", "Bongo"] },
  { brand: "Hyundai", models: ["Accent", "Creta", "Kona", "Elantra", "Sonata", "Tucson", "Santa Fe", "Staria", "Porter", "Palisade"] },
  { brand: "Chery", models: ["Tiggo 7 Pro", "Tiggo 8 Pro", "Arrizo 6 Pro", "Tiggo 2 Pro", "Tiggo 4 Pro", "Tiggo 9"] },
  { brand: "Haval", models: ["M6", "H6", "Dargo", "H9", "Jolion"] },
  { brand: "Lada", models: ["Vesta", "Largus", "Granta", "Niva Legend", "Niva Travel", "XRAY"] },
  { brand: "Jetour", models: ["X70", "X70 Plus", "X90 Plus", "Dashing", "T2"] },
  { brand: "Changan", models: ["UNI-K", "UNI-T", "UNI-V", "CS35 Plus", "CS55 Plus", "CS75 Plus", "Eado"] },
  { brand: "Geely", models: ["Coolray", "Monjaro", "Tugella", "Emgrand", "Okavango", "Geometry C"] },
  { brand: "Exeed", models: ["RX", "VX", "TXL", "LX"] },
  { brand: "Omoda", models: ["C5", "S5"] },
  { brand: "Volkswagen", models: [{ name: "ID.4", aliases: ["ID4"] }, { name: "ID.6", aliases: ["ID6"] }, "Bora", "Lavida", "eTharu", "Passat", "Tiguan", "Touareg"] },
  { brand: "Xpeng", models: ["G6", "G9", "P7"] },
  { brand: "Lexus", models: ["RX", "LX", "ES", "NX", "GX"] },
  { brand: "Toyota", models: ["Highlander", "Avalon", "Prius", "Hilux", "Camry", "Corolla", "Prado", "Land Cruiser 100", "Land Cruiser 120", "Land Cruiser 150", "Land Cruiser 200", "Land Cruiser 300", "RAV4"] },
  { brand: "Honda", models: ["CR-V", { name: "e:NS1", aliases: ["NS1 (Honda)", "NS1"] }, "Civic", "Accord"] },
  { brand: "Nissan", models: ["Sylphy", "Altima", "X-Trail", "Qashqai"] },
  { brand: "Mercedes", aliases: ["Mercedes-Benz"], models: ["C-Class", "E-Class", "S-Class", "GLE", "GLS", "G-Class"] },
  { brand: "BMW", models: ["3-Series", "5-Series", "7-Series", "X3", "X5", "X6", "X7"] },
  { brand: "Zeekr", models: ["001", "007", "009", "X"] },
  { brand: "Li Auto", models: ["L7", "L8", "L9", "Mega"] },
  { brand: "Tesla", models: ["Model 3", "Model Y", "Model S", "Model X"] },
];

// Eski botda "Honda / Nissan" bitta tugma edi — eski e'lonlarni to'g'ri bog'lash uchun
const LEGACY_BRAND_GROUPS = { "Honda / Nissan": ["Honda", "Nissan"] };

// E'lon formasidagi tanlovlar (bot va Mini App bir xil ro'yxatdan foydalanadi)
const AD_OPTIONS = {
  regions: ["Toshkent sh.", "Toshkent vil.", "Sirdaryo", "Jizzax", "Samarqand", "Farg'ona", "Namangan", "Andijon", "Qashqadaryo", "Surxondaryo", "Buxoro", "Navoiy", "Xorazm", "Qoraqalpog'iston"],
  paints: ["Toza", "Petno", "Bor"],
  colors: ["Oq", "Qora", "Mokriy asfalt", "Ko'k", "Qizil", "Kumushrang"],
  transmissions: ["Mexanika", "Avtomat", "Robot", "Variator"],
  fuels: ["Benzin", "Benzin+Metan", "Benzin+Propan", "Dizel", "Elektr", "Gibrid"],
};

// Xotiradagi nusxa (har so'rovda bazaga bormaslik uchun)
let cache = { brands: [] };
let brandsById = new Map();
let modelsById = new Map();
let brandMatchers = []; // [{ key, brandIds }]
let allModels = [];     // [{ id, brandId, name, keys }]

// Taqqoslash uchun nomni soddalashtiramiz: "Nexia-3" == "nexia 3" == "NEXIA3"
function norm(s) {
  return String(s || "").toLowerCase().replace(/[^0-9a-zа-яёўқғҳ]+/gi, "");
}

function splitAliases(str) {
  return String(str || "").split("|").map(s => s.trim()).filter(Boolean);
}

async function ensureSchema(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS car_brands (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      aliases VARCHAR(255) DEFAULT NULL,
      sort_order INT DEFAULT 0,
      UNIQUE KEY uq_brand_name (name)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS car_models (
      id INT AUTO_INCREMENT PRIMARY KEY,
      brand_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      aliases VARCHAR(255) DEFAULT NULL,
      sort_order INT DEFAULT 0,
      UNIQUE KEY uq_brand_model (brand_id, name)
    )
  `);

  const alters = [
    "ALTER TABLE ads ADD COLUMN brand_id INT DEFAULT NULL",
    "ALTER TABLE ads ADD COLUMN model_id INT DEFAULT NULL",
    "ALTER TABLE ads ADD COLUMN source VARCHAR(20) DEFAULT 'bot'",
    "ALTER TABLE ads ADD INDEX idx_ads_model (model_id)",
    "ALTER TABLE ad_edits ADD COLUMN brand_id INT DEFAULT NULL",
    "ALTER TABLE ad_edits ADD COLUMN model_id INT DEFAULT NULL",
    "ALTER TABLE alerts ADD COLUMN model_id INT DEFAULT NULL",
    "ALTER TABLE search_logs ADD COLUMN model_id INT DEFAULT NULL",
  ];
  for (const q of alters) {
    try { await db.execute(q); } catch (e) { /* ustun/indeks allaqachon bor */ }
  }
}

// Asosiy ro'yxatdagi bazada yo'q marka/modellarni qo'shadi
async function seedFromMaster(db) {
  const [brandRows] = await db.execute("SELECT id, name, aliases, sort_order FROM car_brands");
  const brandByNorm = new Map(brandRows.map(b => [norm(b.name), b]));

  for (let i = 0; i < MASTER_CATALOG.length; i++) {
    const item = MASTER_CATALOG[i];
    const aliases = (item.aliases || []).join("|") || null;
    let row = brandByNorm.get(norm(item.brand));
    if (!row) {
      const [res] = await db.execute("INSERT INTO car_brands (name, aliases, sort_order) VALUES (?, ?, ?)", [item.brand, aliases, i + 1]);
      row = { id: res.insertId, name: item.brand, aliases, sort_order: i + 1 };
      brandByNorm.set(norm(item.brand), row);
    } else if (row.sort_order !== i + 1 || (row.aliases || null) !== aliases) {
      await db.execute("UPDATE car_brands SET sort_order = ?, aliases = ? WHERE id = ?", [i + 1, aliases, row.id]);
    }
    item._id = row.id;
  }

  const [modelRows] = await db.execute("SELECT id, brand_id, name, aliases, sort_order FROM car_models");
  const modelKey = (brandId, name) => `${brandId}:${norm(name)}`;
  const modelByKey = new Map(modelRows.map(m => [modelKey(m.brand_id, m.name), m]));

  for (const item of MASTER_CATALOG) {
    for (let j = 0; j < item.models.length; j++) {
      const def = typeof item.models[j] === "string" ? { name: item.models[j] } : item.models[j];
      const aliases = (def.aliases || []).join("|") || null;
      const existing = modelByKey.get(modelKey(item._id, def.name));
      if (!existing) {
        const [res] = await db.execute("INSERT INTO car_models (brand_id, name, aliases, sort_order) VALUES (?, ?, ?, ?)", [item._id, def.name, aliases, j + 1]);
        modelByKey.set(modelKey(item._id, def.name), { id: res.insertId });
      } else if (existing.sort_order !== j + 1 || (existing.aliases || null) !== aliases) {
        await db.execute("UPDATE car_models SET sort_order = ?, aliases = ? WHERE id = ?", [j + 1, aliases, existing.id]);
      }
    }
  }
}

// Bazadan xotiraga yuklaydi
async function reload(db) {
  const [brandRows] = await db.execute("SELECT id, name, aliases FROM car_brands ORDER BY sort_order, name");
  const [modelRows] = await db.execute("SELECT id, brand_id, name, aliases FROM car_models ORDER BY sort_order, name");

  const brands = brandRows.map(b => ({ id: b.id, name: b.name, aliases: splitAliases(b.aliases), models: [] }));
  const nextBrandsById = new Map(brands.map(b => [b.id, b]));
  const nextModelsById = new Map();
  const nextAllModels = [];

  for (const m of modelRows) {
    const brand = nextBrandsById.get(m.brand_id);
    if (!brand) continue;
    const model = { id: m.id, name: m.name, brandId: brand.id, brandName: brand.name };
    brand.models.push({ id: m.id, name: m.name });
    nextModelsById.set(m.id, model);
    const keys = [m.name, ...splitAliases(m.aliases)].map(norm).filter(Boolean);
    nextAllModels.push({ ...model, keys });
  }

  const matchers = [];
  for (const b of brands) {
    for (const key of [b.name, ...b.aliases].map(norm).filter(Boolean)) matchers.push({ key, brandIds: [b.id] });
  }
  for (const [legacy, names] of Object.entries(LEGACY_BRAND_GROUPS)) {
    const ids = names.map(n => brands.find(b => norm(b.name) === norm(n))?.id).filter(Boolean);
    if (ids.length) matchers.push({ key: norm(legacy), brandIds: ids });
  }
  matchers.sort((a, b) => b.key.length - a.key.length); // uzun nom birinchi tekshiriladi

  cache = { brands: brands.map(b => ({ id: b.id, name: b.name, models: b.models })) };
  brandsById = nextBrandsById;
  modelsById = nextModelsById;
  allModels = nextAllModels;
  brandMatchers = matchers;
}

// Berilgan markalar ichidan model topadi (aniq moslik, keyin boshlanishi bo'yicha)
function matchModelIn(brandIds, restNorm) {
  if (!restNorm) return null;
  const pool = brandIds ? allModels.filter(m => brandIds.includes(m.brandId)) : allModels;

  const exact = pool.filter(m => m.keys.includes(restNorm));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null; // ikki xil markada bir xil nom — taxmin qilmaymiz

  let best = null, bestLen = 0, tie = false;
  for (const m of pool) {
    for (const k of m.keys) {
      if (k.length < 2 || !restNorm.startsWith(k)) continue;
      if (k.length > bestLen) { best = m; bestLen = k.length; tie = false; }
      else if (k.length === bestLen && best && best.id !== m.id) tie = true;
    }
  }
  return tie ? null : best;
}

// "Chevrolet Nexia 3" kabi matndan { brandId, modelId } ni aniqlaydi
function matchCarDetails(carDetails) {
  const n = norm(carDetails);
  if (!n) return { brandId: null, modelId: null };

  for (const bm of brandMatchers) {
    if (!n.startsWith(bm.key)) continue;
    const model = matchModelIn(bm.brandIds, n.slice(bm.key.length));
    if (model) return { brandId: model.brandId, modelId: model.id };
    return { brandId: bm.brandIds.length === 1 ? bm.brandIds[0] : null, modelId: null };
  }
  // Marka yozilmagan bo'lsa (masalan "Boshqa" orqali "Nexia 3" deb yozilgan)
  const model = matchModelIn(null, n);
  return model ? { brandId: model.brandId, modelId: model.id } : { brandId: null, modelId: null };
}

// Eski e'lon va obunalarni ID ga bog'laydi (faqat hali bog'lanmaganlarini)
async function backfill(db) {
  const result = { ads: 0, edits: 0, alerts: 0 };

  const [ads] = await db.execute("SELECT id, carDetails FROM ads WHERE brand_id IS NULL AND carDetails IS NOT NULL");
  for (const row of ads) {
    const m = matchCarDetails(row.carDetails);
    if (!m.brandId) continue;
    await db.execute("UPDATE ads SET brand_id = ?, model_id = ? WHERE id = ?", [m.brandId, m.modelId, row.id]);
    result.ads++;
  }

  const [edits] = await db.execute("SELECT editId, carDetails FROM ad_edits WHERE brand_id IS NULL AND carDetails IS NOT NULL");
  for (const row of edits) {
    const m = matchCarDetails(row.carDetails);
    if (!m.brandId) continue;
    await db.execute("UPDATE ad_edits SET brand_id = ?, model_id = ? WHERE editId = ?", [m.brandId, m.modelId, row.editId]);
    result.edits++;
  }

  // Obunalarda faqat model nomi saqlangan ("nexia 3") — faqat bir ma'noli bo'lsa bog'laymiz
  const [alerts] = await db.execute("SELECT id, query FROM alerts WHERE model_id IS NULL AND query IS NOT NULL");
  for (const row of alerts) {
    const model = matchModelIn(null, norm(row.query));
    if (!model || !model.keys.includes(norm(row.query))) continue;
    await db.execute("UPDATE alerts SET model_id = ? WHERE id = ?", [model.id, row.id]);
    result.alerts++;
  }
  return result;
}

async function init(db) {
  await ensureSchema(db);
  await seedFromMaster(db);
  await reload(db);
  const filled = await backfill(db);
  const modelCount = allModels.length;
  console.log(`✅ Katalog tayyor: ${cache.brands.length} marka, ${modelCount} model. Bog'landi: ${filled.ads} e'lon, ${filled.edits} tahrir, ${filled.alerts} obuna.`);
}

// Admin uchun: yangi model (kerak bo'lsa yangi marka ham) qo'shish
async function addModel(db, brandName, modelName) {
  brandName = String(brandName || "").trim();
  modelName = String(modelName || "").trim();
  if (!brandName || !modelName) throw new Error("Marka va model nomi kerak");

  let brand = cache.brands.find(b => norm(b.name) === norm(brandName));
  let brandCreated = false;
  if (!brand) {
    const [[mx]] = await db.execute("SELECT COALESCE(MAX(sort_order), 0) AS mx FROM car_brands");
    const [res] = await db.execute("INSERT INTO car_brands (name, sort_order) VALUES (?, ?)", [brandName, Math.max(mx.mx, 100) + 1]);
    brand = { id: res.insertId, name: brandName, models: [] };
    brandCreated = true;
  }

  const exists = brand.models.find(m => norm(m.name) === norm(modelName));
  if (exists) return { brand, model: exists, brandCreated, created: false };

  const [res] = await db.execute("INSERT INTO car_models (brand_id, name, sort_order) VALUES (?, ?, ?)", [brand.id, modelName, 1000]);
  await reload(db);
  return { brand, model: { id: res.insertId, name: modelName }, brandCreated, created: true };
}

// ---------- O'qish uchun yordamchilar ----------
function get() { return cache; }
function brandById(id) { const b = brandsById.get(Number(id)); return b ? { id: b.id, name: b.name, models: b.models } : null; }
function modelById(id) { return modelsById.get(Number(id)) || null; }
function findBrand(text) {
  const n = norm(text);
  if (!n) return null;
  const hit = brandMatchers.find(bm => bm.key === n && bm.brandIds.length === 1);
  return hit ? brandById(hit.brandIds[0]) : null;
}
function findModel(brandId, text) {
  const n = norm(text);
  if (!n) return null;
  return allModels.find(m => m.brandId === Number(brandId) && m.keys.includes(n)) || null;
}

// Moshinaning to'liq nomi: "Chevrolet Cobalt" (Boshqa bo'lsa faqat yozilgan matn)
function carName(brandName, modelName) {
  if (!brandName || brandName === "Boshqa") return String(modelName || "").trim();
  return `${brandName} ${modelName || ""}`.trim();
}

// SQL filtri: model ID bo'yicha, ID siz eski e'lonlar uchun esa matn bo'yicha
function modelFilter(modelId, fallbackText) {
  if (modelId) {
    return { sql: "(model_id = ? OR (model_id IS NULL AND carDetails LIKE ?))", params: [Number(modelId), `%${fallbackText || ""}%`] };
  }
  return { sql: "carDetails LIKE ?", params: [`%${fallbackText || ""}%`] };
}

module.exports = {
  init, reload, addModel, backfill,
  get, brandById, modelById, findBrand, findModel,
  matchCarDetails, carName, modelFilter, norm,
  AD_OPTIONS, MASTER_CATALOG,
};
