const Database = require('better-sqlite3');
const db = new Database('auto_market.db');

db.prepare(`
  CREATE TABLE IF NOT EXISTS ads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId BIGINT,
    carDetails TEXT,
    year TEXT,
    probeg TEXT,
    paint TEXT,
    color TEXT,
    transmission TEXT,
    fuel TEXT,
    price TEXT,
    phone TEXT,
    region TEXT,
    photoId TEXT, -- Bu yerda barcha rasm IDlari vergul bilan saqlanadi
    status TEXT DEFAULT 'pending',
    channelMsgId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

module.exports = db;