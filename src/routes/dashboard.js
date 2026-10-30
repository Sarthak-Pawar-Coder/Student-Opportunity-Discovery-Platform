const express = require('express');
const router = express.Router();
const { getDb } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { scoreOpportunity, rankOpportunitiesForUser } = require('../services/recommendationEngine');
const { analyzeSkillGaps } = require('../services/skillGapAdvisor');

// GET & POST /dashboard (handles redirects from POST forms cleanly)
router.all('/dashboard', requireAuth, async (req, res) => {
  const db = getDb();
  const user = res.locals.currentUser;

  // Fetch all active opportunities
  const rawOppsRes = await db.execute("SELECT * FROM opportunities WHERE deadline >= DATE('now')");
  const rawOpps = rawOppsRes.rows;

  const allOpps = rawOpps.map(rawOpp => {
    const opp = { ...rawOpp };
    try { opp.required_skills = JSON.parse(opp.required_skills || '[]'); } catch (e) { opp.required_skills = []; }
    try { opp.tags = JSON.parse(opp.tags || '[]'); } catch (e) { opp.tags = []; }
    return opp;
  });

  // Calculate days remaining & match scores
  const rankedOpps = rankOpportunitiesForUser(user, allOpps);

  // Top 6 recommendations
  const topRecommendations = rankedOpps.slice(0, 6);

  // Stat metrics
  const totalBookmarksRes = await db.execute({
    sql: "SELECT COUNT(*) as count FROM bookmarks WHERE user_id = ?",
    args: [user.id]
  });
  const totalBookmarks = totalBookmarksRes.rows[0] ? Number(totalBookmarksRes.rows[0].count) : 0;
  
  const closingSoonRes = await db.execute(`
    SELECT COUNT(*) as count 
    FROM opportunities 
    WHERE deadline >= DATE('now') AND deadline <= DATE('now', '+7 days')
  `);
  const closingSoonCount = closingSoonRes.rows[0] ? Number(closingSoonRes.rows[0].count) : 0;

  // Compute Skill Gap Advisor (⭐ WOW Feature 1)
  const skillGapAnalysis = analyzeSkillGaps(user, allOpps);

  // Save/cache top missing skill to skill_gap_cache table
  if (skillGapAnalysis && skillGapAnalysis.topSkill) {
    try {
      await db.execute({
        sql: `INSERT INTO skill_gap_cache (user_id, missing_skill, frequency_count, updated_at)
              VALUES (?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(user_id, missing_skill) DO UPDATE SET
                frequency_count = excluded.frequency_count,
                updated_at = CURRENT_TIMESTAMP`,
        args: [user.id, skillGapAnalysis.topSkill, skillGapAnalysis.unlockedCount]
      });
    } catch (e) {
      console.error('Error caching skill gap:', e.message);
    }
  }

  // Category breakdown metrics (for pure CSS chart)
  const categoryCounts = {
    hackathon: 0,
    internship: 0,
    scholarship: 0,
    certification: 0,
    competition: 0,
    workshop: 0,
    course: 0
  };

  allOpps.forEach(o => {
    const cat = (o.category || '').toLowerCase();
    if (categoryCounts.hasOwnProperty(cat)) {
      categoryCounts[cat]++;
    }
  });

  const totalOppsCount = allOpps.length || 1;
  const categoryPercentages = {};
  Object.keys(categoryCounts).forEach(cat => {
    categoryPercentages[cat] = Math.round((categoryCounts[cat] / totalOppsCount) * 100);
  });

  const addedSkill = req.query.addedSkill || null;

  res.render('dashboard', {
    user,
    totalBookmarks,
    closingSoonCount,
    topRecommendations,
    skillGapAnalysis,
    categoryCounts,
    categoryPercentages,
    addedSkill,
    pageTitle: 'Student Dashboard - OpportuNest'
  });
});

module.exports = router;
