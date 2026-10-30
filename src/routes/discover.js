const express = require('express');
const router = express.Router();
const { getDb } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { rankOpportunitiesForUser } = require('../services/recommendationEngine');

// GET /discover
router.get('/discover', requireAuth, async (req, res) => {
  const db = getDb();
  const user = res.locals.currentUser;

  const rawOppsRes = await db.execute("SELECT * FROM opportunities WHERE deadline >= DATE('now')");
  const rawOpps = rawOppsRes.rows;

  const now = new Date();
  const opportunities = rawOpps.map(rawOpp => {
    const opp = { ...rawOpp };
    try { opp.required_skills = JSON.parse(opp.required_skills || '[]'); } catch (e) { opp.required_skills = []; }
    try { opp.tags = JSON.parse(opp.tags || '[]'); } catch (e) { opp.tags = []; }

    const deadlineDate = new Date(opp.deadline + 'T23:59:59');
    const diffTime = deadlineDate - now;
    opp.daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    opp.isExpired = diffTime < 0;
    opp.isBookmarked = res.locals.userBookmarkIds.has(opp.id);
    return opp;
  });

  const rankedDeck = rankOpportunitiesForUser(user, opportunities);

  res.render('discover', {
    deck: rankedDeck,
    pageTitle: 'Discover Mode (Swipe Deck) - OpportuNest'
  });
});

module.exports = router;
