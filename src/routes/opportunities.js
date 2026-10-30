const express = require('express');
const router = express.Router();
const { getDb } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { scoreOpportunity } = require('../services/recommendationEngine');

// GET /opportunities
router.get('/opportunities', async (req, res) => {
  const db = getDb();
  const { search, category, location, deadline, skill, sort } = req.query;

  let query = "SELECT * FROM opportunities WHERE 1=1";
  const params = [];

  if (search && search.trim()) {
    const searchTerm = `%${search.trim()}%`;
    query += " AND (title LIKE ? OR organization LIKE ? OR description LIKE ?)";
    params.push(searchTerm, searchTerm, searchTerm);
  }

  if (category && category.trim() && category !== 'all') {
    query += " AND LOWER(category) = ?";
    params.push(category.trim().toLowerCase());
  }

  if (location && location.trim() && location !== 'all') {
    if (location.toLowerCase() === 'remote') {
      query += " AND LOWER(location) LIKE '%remote%'";
    } else {
      query += " AND LOWER(location) NOT LIKE '%remote%'";
    }
  }

  const now = new Date();
  if (deadline && deadline.trim() && deadline !== 'all') {
    if (deadline === 'soon_7') {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 7);
      query += " AND deadline >= DATE('now') AND deadline <= DATE(?)";
      params.push(targetDate.toISOString().split('T')[0]);
    } else if (deadline === 'soon_14') {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 14);
      query += " AND deadline >= DATE('now') AND deadline <= DATE(?)";
      params.push(targetDate.toISOString().split('T')[0]);
    } else if (deadline === 'soon_30') {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 30);
      query += " AND deadline >= DATE('now') AND deadline <= DATE(?)";
      params.push(targetDate.toISOString().split('T')[0]);
    } else if (deadline === 'active') {
      query += " AND deadline >= DATE('now')";
    } else if (deadline === 'expired') {
      query += " AND deadline < DATE('now')";
    }
  }

  const rawOpportunitiesRes = await db.execute({ sql: query, args: params });
  const rawOpportunities = rawOpportunitiesRes.rows;

  // Parse JSON fields
  let opportunities = rawOpportunities.map(rawOpp => {
    const opp = { ...rawOpp };
    let reqSkills = [];
    let tags = [];
    try { reqSkills = JSON.parse(opp.required_skills || '[]'); } catch (e) { reqSkills = []; }
    try { tags = JSON.parse(opp.tags || '[]'); } catch (e) { tags = []; }

    // Calculate days remaining (using end of day so current date is not expired prematurely)
    const deadlineDate = new Date(opp.deadline + 'T23:59:59');
    const diffTime = deadlineDate - now;
    const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    const isExpired = diffTime < 0;

    let matchDetails = null;
    let matchScore = 0;

    if (res.locals.currentUser) {
      matchDetails = scoreOpportunity(res.locals.currentUser, opp);
      matchScore = matchDetails.score;
    }

    return {
      ...opp,
      required_skills: reqSkills,
      tags,
      daysRemaining,
      isExpired,
      matchDetails,
      matchScore
    };
  });

  // Filter by skill if selected
  if (skill && skill.trim()) {
    const filterSkillLower = skill.trim().toLowerCase();
    opportunities = opportunities.filter(opp => 
      opp.required_skills.some(s => s.toLowerCase().includes(filterSkillLower))
    );
  }

  // Sorting
  const sortBy = sort || (res.locals.currentUser ? 'relevance' : 'deadline');

  if (sortBy === 'deadline') {
    opportunities.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  } else if (sortBy === 'relevance' && res.locals.currentUser) {
    opportunities.sort((a, b) => (b.matchScore - a.matchScore) || (new Date(a.deadline) - new Date(b.deadline)));
  } else if (sortBy === 'newest') {
    opportunities.sort((a, b) => new Date(b.posted_at) - new Date(a.posted_at));
  }

  // Get list of all available unique skills for filter dropdown
  const allOppsRes = await db.execute("SELECT required_skills FROM opportunities");
  const allOpps = allOppsRes.rows;
  const allSkillsSet = new Set();
  allOpps.forEach(o => {
    try {
      const arr = JSON.parse(o.required_skills || '[]');
      arr.forEach(s => allSkillsSet.add(s));
    } catch(e) {}
  });

  res.render('opportunities', {
    opportunities,
    totalCount: opportunities.length,
    allSkills: Array.from(allSkillsSet).sort(),
    filters: {
      search: search || '',
      category: category || 'all',
      location: location || 'all',
      deadline: deadline || 'all',
      skill: skill || '',
      sort: sortBy
    },
    pageTitle: 'Explore Opportunities - OpportuNest'
  });
});

// GET /opportunities/:id
router.get('/opportunities/:id', async (req, res) => {
  const db = getDb();
  const oppRes = await db.execute({
    sql: "SELECT * FROM opportunities WHERE id = ?",
    args: [req.params.id]
  });
  const rawOpp = oppRes.rows[0];

  if (!rawOpp) {
    return res.status(404).render('index', {
      error: 'Opportunity not found.',
      pageTitle: 'Not Found - OpportuNest'
    });
  }

  const opp = { ...rawOpp };
  try { opp.required_skills = JSON.parse(opp.required_skills || '[]'); } catch (e) { opp.required_skills = []; }
  try { opp.tags = JSON.parse(opp.tags || '[]'); } catch (e) { opp.tags = []; }

  const now = new Date();
  const deadlineDate = new Date(opp.deadline + 'T23:59:59');
  const diffTime = deadlineDate - now;
  opp.daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  opp.isExpired = diffTime < 0;

  let matchDetails = null;
  if (res.locals.currentUser) {
    matchDetails = scoreOpportunity(res.locals.currentUser, opp);
  }

  const isBookmarked = res.locals.userBookmarkIds.has(opp.id);

  let hasApplied = false;
  if (res.locals.currentUser) {
    const appRes = await db.execute({
      sql: "SELECT id FROM applications WHERE user_id = ? AND opportunity_id = ?",
      args: [res.locals.currentUser.id, opp.id]
    });
    hasApplied = !!appRes.rows[0];
  }

  // Fetch 3 related opportunities in same category
  const relatedRes = await db.execute({
    sql: "SELECT * FROM opportunities WHERE category = ? AND id != ? LIMIT 3",
    args: [opp.category, opp.id]
  });
  const related = relatedRes.rows.map(r => {
    const item = { ...r };
    try { item.required_skills = JSON.parse(item.required_skills || '[]'); } catch (e) { item.required_skills = []; }
    try { item.tags = JSON.parse(item.tags || '[]'); } catch (e) { item.tags = []; }
    return item;
  });

  res.render('detail', {
    opportunity: opp,
    matchDetails,
    isBookmarked,
    hasApplied,
    related,
    pageTitle: `${opp.title} - OpportuNest`
  });
});

// GET /opportunities/:id/apply - Application Gateway & Direct Submission
router.get('/opportunities/:id/apply', async (req, res) => {
  const db = getDb();
  const oppRes = await db.execute({
    sql: "SELECT * FROM opportunities WHERE id = ?",
    args: [req.params.id]
  });
  const rawOpp = oppRes.rows[0];

  if (!rawOpp) {
    return res.status(404).render('index', {
      error: 'Opportunity not found.',
      pageTitle: 'Not Found - OpportuNest'
    });
  }

  const opp = { ...rawOpp };
  try { opp.required_skills = JSON.parse(opp.required_skills || '[]'); } catch (e) { opp.required_skills = []; }
  try { opp.tags = JSON.parse(opp.tags || '[]'); } catch (e) { opp.tags = []; }

  const now = new Date();
  const deadlineDate = new Date(opp.deadline + 'T23:59:59');
  const diffTime = deadlineDate - now;
  opp.daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  opp.isExpired = diffTime < 0;

  let matchDetails = null;
  if (res.locals.currentUser) {
    matchDetails = scoreOpportunity(res.locals.currentUser, opp);
  }

  let hasApplied = false;
  if (res.locals.currentUser) {
    const appRes = await db.execute({
      sql: "SELECT id FROM applications WHERE user_id = ? AND opportunity_id = ?",
      args: [res.locals.currentUser.id, opp.id]
    });
    hasApplied = !!appRes.rows[0];
  }

  res.render('apply', {
    opportunity: opp,
    matchDetails,
    hasApplied,
    submitted: req.query.submitted === 'true',
    pageTitle: `Apply for ${opp.title} - OpportuNest`
  });
});

// POST /opportunities/:id/apply - Process Application Submission
router.post('/opportunities/:id/apply', requireAuth, async (req, res) => {
  const opportunityId = parseInt(req.params.id, 10);
  const userId = req.session.user.id;
  const db = getDb();

  try {
    await db.execute({
      sql: `INSERT INTO applications (user_id, opportunity_id, status)
            VALUES (?, ?, 'In Review')
            ON CONFLICT(user_id, opportunity_id) DO UPDATE SET applied_at = CURRENT_TIMESTAMP`,
      args: [userId, opportunityId]
    });
  } catch (err) {
    console.error('Error recording application submission:', err.message);
  }

  res.redirect(`/opportunities/${opportunityId}/apply?submitted=true`);
});

// POST /opportunities/:id/bookmark
router.post('/opportunities/:id/bookmark', requireAuth, async (req, res) => {
  const opportunityId = parseInt(req.params.id, 10);
  const userId = req.session.user.id;
  const db = getDb();
  const action = req.body && req.body.action; // 'save' | 'unsave' | 'toggle'

  const existingRes = await db.execute({
    sql: "SELECT id FROM bookmarks WHERE user_id = ? AND opportunity_id = ?",
    args: [userId, opportunityId]
  });
  const existing = existingRes.rows[0];

  let bookmarked = false;
  if (action === 'save') {
    if (!existing) {
      await db.execute({
        sql: "INSERT INTO bookmarks (user_id, opportunity_id) VALUES (?, ?)",
        args: [userId, opportunityId]
      });
    }
    bookmarked = true;
  } else if (action === 'unsave') {
    if (existing) {
      await db.execute({
        sql: "DELETE FROM bookmarks WHERE id = ?",
        args: [existing.id]
      });
    }
    bookmarked = false;
  } else {
    if (existing) {
      await db.execute({
        sql: "DELETE FROM bookmarks WHERE id = ?",
        args: [existing.id]
      });
      bookmarked = false;
    } else {
      await db.execute({
        sql: "INSERT INTO bookmarks (user_id, opportunity_id) VALUES (?, ?)",
        args: [userId, opportunityId]
      });
      bookmarked = true;
    }
  }

  const bmCountRes = await db.execute({
    sql: "SELECT COUNT(*) as count FROM bookmarks WHERE user_id = ?",
    args: [userId]
  });
  const bookmarkCount = bmCountRes.rows[0] ? Number(bmCountRes.rows[0].count) : 0;

  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.json({ success: true, bookmarked, bookmarkCount, opportunityId });
  }

  res.redirect(req.get('referer') || '/opportunities');
});

// GET /bookmarks
router.get('/bookmarks', requireAuth, async (req, res) => {
  const db = getDb();
  const userId = req.session.user.id;

  const rawBookmarksRes = await db.execute({
    sql: `SELECT o.*, b.created_at as bookmarked_at
          FROM bookmarks b
          JOIN opportunities o ON b.opportunity_id = o.id
          WHERE b.user_id = ?
          ORDER BY b.created_at DESC`,
    args: [userId]
  });
  const rawBookmarks = rawBookmarksRes.rows;

  const now = new Date();
  const bookmarks = rawBookmarks.map(rawOpp => {
    const opp = { ...rawOpp };
    try { opp.required_skills = JSON.parse(opp.required_skills || '[]'); } catch (e) { opp.required_skills = []; }
    try { opp.tags = JSON.parse(opp.tags || '[]'); } catch (e) { opp.tags = []; }

    const deadlineDate = new Date(opp.deadline);
    const diffTime = deadlineDate - now;
    opp.daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    opp.matchDetails = scoreOpportunity(res.locals.currentUser, opp);
    return opp;
  });

  res.render('bookmarks', {
    bookmarks,
    pageTitle: 'My Saved Bookmarks - OpportuNest'
  });
});

module.exports = router;
