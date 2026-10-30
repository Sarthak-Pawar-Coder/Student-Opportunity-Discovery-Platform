/**
 * OpportuNest - Student Opportunity Discovery Platform
 * Main Server Entry Point
 * 
 * Author: Saksham Sachin Gaikwad
 * Roll No: AD1351 | Div C
 * Department: First Year AI & Data Science
 * College: Zeal College of Engineering and Research, Pune
 */

const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
require('dotenv').config();
const app = require('./src/app');
const { initDatabase } = require('./src/config/database');
const seedDatabase = require('./src/seed/seeder');

const PORT = process.env.PORT || 8080;

async function start() {
  try {
    console.log('🔄 Initializing database and loading data...');
    await initDatabase();
    await seedDatabase();
    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`🚀 OpportuNest Server running on: http://localhost:${PORT}`);
      console.log(`🎓 Author: Saksham Sachin Gaikwad (Roll No: AD1351)`);
      console.log(`📍 Department: First Year AI & Data Science, Div C`);
      console.log(`🏫 Zeal College of Engineering and Research, Pune`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

// If executed directly (e.g. node server.js)
if (require.main === module) {
  start();
}

module.exports = app;
