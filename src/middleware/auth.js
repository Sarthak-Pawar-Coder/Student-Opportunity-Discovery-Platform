const { getDb } = require('../config/database');

async function attachUser(req, res, next) {
  let userId = null;
  if (req.session && req.session.user && req.session.user.id) {
    userId = req.session.user.id;
  } else if (req.signedCookies && req.signedCookies.auth_user_id) {
    userId = parseInt(req.signedCookies.auth_user_id, 10);
  }

  if (userId) {
    try {
      const db = getDb();
      const userRes = await db.execute({
        sql: "SELECT * FROM users WHERE id = ?",
        args: [userId]
      });
      const freshUser = userRes.rows[0];
      if (freshUser) {
        const userObj = { ...freshUser };
        try { userObj.skills = JSON.parse(userObj.skills || '[]'); } catch (e) { userObj.skills = []; }
        try { userObj.interests = JSON.parse(userObj.interests || '[]'); } catch (e) { userObj.interests = []; }
        try { userObj.preferred_categories = JSON.parse(userObj.preferred_categories || '[]'); } catch (e) { userObj.preferred_categories = []; }
        
        delete userObj.password_hash;
        
        let score = 0;
        if (userObj.name) score += 10;
        if (userObj.email) score += 10;
        if (userObj.education_level) score += 20;
        if (userObj.field_of_study) score += 20;
        if (userObj.skills && userObj.skills.length > 0) score += 20;
        if (userObj.interests && userObj.interests.length > 0) score += 10;
        if (userObj.preferred_categories && userObj.preferred_categories.length > 0) score += 10;
        userObj.completionPercentage = Math.min(score, 100);

        if (req.session) {
          req.session.user = { id: userObj.id, name: userObj.name, email: userObj.email };
        }
        res.locals.currentUser = userObj;

        const bookmarksRes = await db.execute({
          sql: "SELECT opportunity_id FROM bookmarks WHERE user_id = ?",
          args: [userObj.id]
        });
        res.locals.userBookmarkIds = new Set(bookmarksRes.rows.map(b => b.opportunity_id));
        return next();
      }
    } catch (e) {
      console.error('attachUser lookup error:', e.message);
    }
  }

  if (req.session) {
    req.session.user = null;
  }
  res.locals.currentUser = null;
  res.locals.userBookmarkIds = new Set();
  next();
}

function requireAuth(req, res, next) {
  const hasUser = res.locals.currentUser || (req.session && req.session.user) || (req.signedCookies && req.signedCookies.auth_user_id);
  if (!hasUser) {
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return res.redirect('/login');
  }
  next();
}

module.exports = { attachUser, requireAuth };
