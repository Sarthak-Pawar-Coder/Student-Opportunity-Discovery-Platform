const bcrypt = require('bcryptjs');
const { getDb } = require('../config/database');
const sampleOpportunities = require('./seedData');

async function seedDatabase() {
  const db = getDb();
  
  try {
    // Check count of opportunities
    const countRes = await db.execute("SELECT COUNT(*) as count FROM opportunities");
    const countRow = countRes.rows[0];
    const count = countRow ? Number(countRow.count) : 0;

    if (count === 0) {
      console.log('Seeding initial 26 opportunities...');
      for (const opp of sampleOpportunities) {
        await db.execute({
          sql: `INSERT INTO opportunities (title, organization, category, description, required_skills, tags, eligibility, deadline, external_link, location)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            opp.title,
            opp.organization,
            opp.category,
            opp.description,
            JSON.stringify(opp.required_skills),
            JSON.stringify(opp.tags),
            opp.eligibility,
            opp.deadline,
            opp.external_link,
            opp.location
          ]
        });
      }
      console.log('Opportunities successfully seeded!');
    } else {
      console.log(`Database already has ${count} opportunities.`);
    }

    // Check demo user
    const demoUserRes = await db.execute({
      sql: "SELECT id FROM users WHERE email = ?",
      args: ['alex@student.edu']
    });
    if (demoUserRes.rows.length === 0) {
      console.log('Seeding initial demo student account...');
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync('password123', salt);

      await db.execute({
        sql: `INSERT INTO users (name, email, password_hash, education_level, field_of_study, skills, interests, preferred_categories)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'Alex Rivera',
          'alex@student.edu',
          hash,
          'Undergraduate',
          'Computer Science',
          JSON.stringify(['Python', 'React', 'Node.js', 'SQL', 'Git']),
          JSON.stringify(['Artificial Intelligence', 'Web Development', 'Data Science', 'Hackathon']),
          JSON.stringify(['hackathon', 'internship', 'scholarship', 'workshop'])
        ]
      });
      console.log('Demo student account created: alex@student.edu / password123');
    }
  } catch (err) {
    console.warn('⚠️ Seeder note:', err.message);
  }
}

if (require.main === module) {
  const { initDatabase } = require('../config/database');
  (async () => {
    try {
      await initDatabase();
      await seedDatabase();
      console.log('Seeding command completed successfully.');
      process.exit(0);
    } catch (err) {
      console.error('Seeding error:', err);
      process.exit(1);
    }
  })();
}

module.exports = seedDatabase;
