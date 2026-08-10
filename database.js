const mysql = require("mysql2/promise");
require("dotenv").config();

// MySQL bazasiga ulanish (Railway yoki VPS dagi MYSQL_URL ni .env dan oladi)
const pool = mysql.createPool({
  uri: process.env.MYSQL_URL,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  idleTimeout: 60000 // <--- ЭНГ МУҲИМ ҚЎШИМЧА: 60 сониядан кейин бўш алоқани тозалайди
});

async function initDB() {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS ads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT,
        carDetails VARCHAR(255),
        year VARCHAR(10),
        probeg VARCHAR(50),
        paint VARCHAR(50),
        color VARCHAR(50),
        transmission VARCHAR(50),
        fuel VARCHAR(50),
        price VARCHAR(50),
        phone VARCHAR(20),
        region VARCHAR(100),
        photoId TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        channelMsgId BIGINT
      )
    `);
    console.log("✅ MySQL bazasiga muvaffaqiyatli ulandi va jadval tayyor!");
  } catch (err) {
    console.error("❌ MySQL ulanishida xatolik:", err.message);
  }
}

initDB();

module.exports = pool;