const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
require('dotenv').config();
const { createClient } = require('@libsql/client');

let client = null;

function getDb() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url || !authToken) {
      console.warn('⚠️ Warning: TURSO_DATABASE_URL or TURSO_AUTH_TOKEN is missing in environment variables.');
    }

    client = createClient({
      url,
      authToken
    });

    // Enhance execute to seamlessly accept both execute({ sql, args }) and execute(sql, args)
    const origExecute = client.execute.bind(client);
    client.execute = function (stmt, args) {
      if (typeof stmt === 'string' && args !== undefined) {
        return origExecute({ sql: stmt, args: Array.isArray(args) ? args : [args] });
      }
      return origExecute(stmt);
    };
  }
  return client;
}

// Pre-initialize client instance
client = getDb();

async function initDatabase() {
  const db = getDb();
  try {
    await db.execute('SELECT 1');
    console.log('✅ Connected to Turso Cloud database.');
  } catch (err) {
    console.error('❌ Turso Cloud database connection error:', err.message);
  }
  return db;
}

module.exports = {
  getDb,
  initDatabase,
  db: client
};
