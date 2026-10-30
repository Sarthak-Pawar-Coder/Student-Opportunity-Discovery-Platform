const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
const http = require('http');
const querystring = require('querystring');
const app = require('../app');
const { initDatabase } = require('../config/database');
const seedDatabase = require('../seed/seeder');

function request(baseUrl, path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function runE2ETest() {
  console.log('--- Starting Full System End-to-End Verification ---');

  // Initialize DB and seed
  await initDatabase();
  await seedDatabase();

  // Start test server on an ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Ephemeral test server running on ${baseUrl}`);

  let failedTests = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
    } else {
      console.error(`❌ FAIL: ${message}`);
      failedTests++;
    }
  }

  try {
    // 1. Landing Page
    const landing = await request(baseUrl, '/');
    assert(landing.statusCode === 200 && landing.body.includes('OpportuNest'), '1. Landing Page GET /');

    // 2. Signup
    const uniqueEmail = `sarah.${Date.now()}@university.edu`;
    const signupData = querystring.stringify({
      name: 'Sarah Chen',
      email: uniqueEmail,
      password: 'password123',
      education_level: 'Undergraduate',
      field_of_study: 'Data Science'
    });

    const signupRes = await request(baseUrl, '/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(signupData)
      }
    }, signupData);

    const rawCookieHeader = signupRes.headers['set-cookie'];
    const cookieStr = rawCookieHeader ? rawCookieHeader.map(c => c.split(';')[0]).join('; ') : '';
    assert([302, 303].includes(signupRes.statusCode) && cookieStr.length > 0, '2. Signup POST /signup');

    // 3. Profile Update
    const profileData = querystring.stringify({
      education_level: 'Undergraduate',
      field_of_study: 'Data Science',
      skills: 'Python, SQL, Pandas, Tableau',
      interests: 'Machine Learning, Data Analytics',
      preferred_categories: 'internship'
    });

    const profileRes = await request(baseUrl, '/profile', {
      method: 'POST',
      headers: {
        'Cookie': cookieStr,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(profileData)
      }
    }, profileData);
    assert(profileRes.statusCode === 200 && profileRes.body.includes('Profile updated successfully'), '3. Profile Update POST /profile');

    // 4. Dashboard
    const dashRes = await request(baseUrl, '/dashboard', {
      headers: { 'Cookie': cookieStr }
    });
    assert(dashRes.statusCode === 200 && dashRes.body.includes('Student Dashboard') && dashRes.body.includes('Sarah Chen'), '4. Dashboard GET /dashboard');

    // 5. Bookmark Toggle (Save & Unsave)
    const bookmarkRes = await request(baseUrl, '/opportunities/1/bookmark', {
      method: 'POST',
      headers: {
        'Cookie': cookieStr,
        'Accept': 'application/json'
      }
    });
    const bookmarkJson = JSON.parse(bookmarkRes.body || '{}');
    assert(bookmarkRes.statusCode === 200 && bookmarkJson.success && bookmarkJson.bookmarked === true, '5. Bookmark Toggle AJAX POST /opportunities/1/bookmark');

    // 6. Bookmarks Page
    const bookmarksPage = await request(baseUrl, '/bookmarks', {
      headers: { 'Cookie': cookieStr }
    });
    assert(bookmarksPage.statusCode === 200 && bookmarksPage.body.includes('My Saved Bookmarks'), '6. Bookmarks Page GET /bookmarks');

    // 7. Discover Page (Swipe Deck)
    const discoverPage = await request(baseUrl, '/discover', {
      headers: { 'Cookie': cookieStr }
    });
    assert(discoverPage.statusCode === 200 && discoverPage.body.includes('Interactive Opportunity Deck'), '7. Discover Deck GET /discover');

    // 8. Search & Filters
    const searchPage = await request(baseUrl, '/opportunities?category=internship&location=remote&sort=relevance', {
      headers: { 'Cookie': cookieStr }
    });
    assert(searchPage.statusCode === 200 && searchPage.body.includes('Explore Opportunities'), '8. Search & Filter GET /opportunities');

    // 9. Opportunity Detail
    const detailPage = await request(baseUrl, '/opportunities/1', {
      headers: { 'Cookie': cookieStr }
    });
    assert(detailPage.statusCode === 200 && detailPage.body.includes('About this Opportunity'), '9. Opportunity Detail GET /opportunities/1');

    // 10. Application Gateway Page
    const applyPage = await request(baseUrl, '/opportunities/1/apply', {
      headers: { 'Cookie': cookieStr }
    });
    assert(applyPage.statusCode === 200 && applyPage.body.includes('Application Gateway'), '10. Application Gateway GET /opportunities/1/apply');

    // 11. Application Submission
    const submitApply = await request(baseUrl, '/opportunities/1/apply', {
      method: 'POST',
      headers: {
        'Cookie': cookieStr,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    assert([302, 303].includes(submitApply.statusCode), '11. Application Submission POST /opportunities/1/apply');

    // 12. Add Skill CTA
    const addSkillData = querystring.stringify({ skill: 'Docker' });
    const addSkillRes = await request(baseUrl, '/profile/add-skill', {
      method: 'POST',
      headers: {
        'Cookie': cookieStr,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      }
    }, addSkillData);
    const addSkillJson = JSON.parse(addSkillRes.body || '{}');
    assert(addSkillRes.statusCode === 200 && addSkillJson.success && addSkillJson.addedSkill === 'Docker', '12. Skill Gap Add Skill POST /profile/add-skill');

    // 13. Evaluator Instant Demo Login
    const demoLoginData = querystring.stringify({
      email: 'alex@student.edu',
      password: 'password123'
    });
    const demoLoginRes = await request(baseUrl, '/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(demoLoginData)
      }
    }, demoLoginData);
    assert([302, 303].includes(demoLoginRes.statusCode), '13. Evaluator 1-Click Demo Login POST /login');

    console.log(`\n--- Verification Summary: ${failedTests === 0 ? 'ALL PASSED ✅' : `${failedTests} TESTS FAILED ❌`} ---`);
  } finally {
    server.close();
  }

  if (failedTests > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runE2ETest().catch(err => {
    console.error('Fatal error during E2E verification:', err);
    process.exit(1);
  });
}

module.exports = runE2ETest;
