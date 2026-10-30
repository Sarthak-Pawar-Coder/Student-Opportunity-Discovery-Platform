const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// GET /signup
router.get('/signup', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('signup', { error: null, pageTitle: 'Sign Up - OpportuNest' });
});

// POST /signup
router.post('/signup', async (req, res) => {
  const { name, email, password, education_level, field_of_study } = req.body;

  if (!name || !email || !password) {
    return res.render('signup', { error: 'Please provide name, email, and password.', pageTitle: 'Sign Up - OpportuNest' });
  }

  const db = getDb();
  const existingRes = await db.execute({
    sql: "SELECT id FROM users WHERE email = ?",
    args: [email.toLowerCase().trim()]
  });
  if (existingRes.rows.length > 0) {
    return res.render('signup', { error: 'An account with that email already exists.', pageTitle: 'Sign Up - OpportuNest' });
  }

  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);

  const defaultSkills = JSON.stringify(['Python', 'Git']);
  const defaultInterests = JSON.stringify(['Web Development', 'Artificial Intelligence']);
  const defaultCategories = JSON.stringify(['hackathon', 'internship']);

  const result = await db.execute({
    sql: `INSERT INTO users (name, email, password_hash, education_level, field_of_study, skills, interests, preferred_categories)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      name.trim(),
      email.toLowerCase().trim(),
      hash,
      education_level || 'Undergraduate',
      field_of_study || 'Computer Science',
      defaultSkills,
      defaultInterests,
      defaultCategories
    ]
  });

  let newUser = null;
  if (result.lastInsertRowid !== undefined && result.lastInsertRowid !== null) {
    const userRes = await db.execute({
      sql: "SELECT * FROM users WHERE id = ?",
      args: [Number(result.lastInsertRowid)]
    });
    newUser = userRes.rows[0];
  }
  if (!newUser) {
    const userRes = await db.execute({
      sql: "SELECT * FROM users WHERE email = ?",
      args: [email.toLowerCase().trim()]
    });
    newUser = userRes.rows[0];
  }

  req.session.user = { id: newUser.id, email: newUser.email, name: newUser.name };
  res.cookie('auth_user_id', String(newUser.id), {
    signed: true,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    sameSite: 'lax'
  });

  if (req.session && typeof req.session.save === 'function') {
    req.session.save((err) => {
      if (err) console.error('Session save error on signup:', err);
      res.redirect(303, '/dashboard');
    });
  } else {
    res.redirect(303, '/dashboard');
  }
});

// GET /login
router.get('/login', (req, res) => {
  if (res.locals.currentUser || (req.session && req.session.user)) {
    return res.redirect('/dashboard');
  }
  res.render('login', { error: null, pageTitle: 'Log In - OpportuNest' });
});

// POST /login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.render('login', { error: 'Please provide email and password.', pageTitle: 'Log In - OpportuNest' });
  }

  const db = getDb();
  const userRes = await db.execute({
    sql: "SELECT * FROM users WHERE email = ?",
    args: [email.toLowerCase().trim()]
  });
  const user = userRes.rows[0];

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.render('login', { error: 'Invalid email or password.', pageTitle: 'Log In - OpportuNest' });
  }

  req.session.user = { id: user.id, email: user.email, name: user.name };
  res.cookie('auth_user_id', String(user.id), {
    signed: true,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    sameSite: 'lax'
  });

  if (req.session && typeof req.session.save === 'function') {
    req.session.save((err) => {
      if (err) console.error('Session save error on login:', err);
      res.redirect(303, '/dashboard');
    });
  } else {
    res.redirect(303, '/dashboard');
  }
});

// GET & POST /logout
router.all('/logout', (req, res) => {
  res.clearCookie('auth_user_id');
  res.clearCookie('session');
  res.clearCookie('session.sig');
  if (req.session && typeof req.session.destroy === 'function') {
    req.session.destroy(() => {
      res.redirect('/');
    });
  } else {
    req.session = null;
    res.redirect('/');
  }
});

// GET /profile
router.get('/profile', requireAuth, async (req, res) => {
  const db = getDb();
  const userRes = await db.execute({
    sql: "SELECT * FROM users WHERE id = ?",
    args: [req.session.user.id]
  });
  const rawUser = userRes.rows[0];
  if (!rawUser) {
    return res.redirect('/logout');
  }
  
  const user = { ...rawUser };
  try { user.skills = JSON.parse(user.skills || '[]'); } catch (e) { user.skills = []; }
  try { user.interests = JSON.parse(user.interests || '[]'); } catch (e) { user.interests = []; }
  try { user.preferred_categories = JSON.parse(user.preferred_categories || '[]'); } catch (e) { user.preferred_categories = []; }

  const allOppsRes = await db.execute("SELECT * FROM opportunities WHERE deadline >= DATE('now')");
  const allOpps = allOppsRes.rows;
  const { analyzeSkillGaps } = require('../services/skillGapAdvisor');
  const skillGapAnalysis = analyzeSkillGaps(user, allOpps);

  const welcome = req.query.welcome === '1';

  res.render('profile', {
    user,
    welcome,
    skillGapAnalysis,
    successMsg: null,
    errorMsg: null,
    pageTitle: 'My Profile - OpportuNest'
  });
});

// POST /profile
router.post('/profile', requireAuth, async (req, res) => {
  const { education_level, field_of_study, skills, interests, preferred_categories } = req.body;

  let skillsArr = [];
  if (typeof skills === 'string') {
    skillsArr = skills.split(',').map(s => s.trim()).filter(Boolean);
  } else if (Array.isArray(skills)) {
    skillsArr = skills.map(s => String(s).trim()).filter(Boolean);
  }

  let interestsArr = [];
  if (typeof interests === 'string') {
    interestsArr = interests.split(',').map(i => i.trim()).filter(Boolean);
  } else if (Array.isArray(interests)) {
    interestsArr = interests.map(i => String(i).trim()).filter(Boolean);
  }

  let categoriesArr = [];
  if (typeof preferred_categories === 'string') {
    categoriesArr = [preferred_categories];
  } else if (Array.isArray(preferred_categories)) {
    categoriesArr = preferred_categories;
  }

  const db = getDb();
  await db.execute({
    sql: `UPDATE users 
          SET education_level = ?, field_of_study = ?, skills = ?, interests = ?, preferred_categories = ?
          WHERE id = ?`,
    args: [
      education_level || 'Undergraduate',
      field_of_study || 'Computer Science',
      JSON.stringify(skillsArr),
      JSON.stringify(interestsArr),
      JSON.stringify(categoriesArr),
      req.session.user.id
    ]
  });

  const updatedRes = await db.execute({
    sql: "SELECT * FROM users WHERE id = ?",
    args: [req.session.user.id]
  });
  const updatedUser = { ...updatedRes.rows[0] };
  try { updatedUser.skills = JSON.parse(updatedUser.skills || '[]'); } catch (e) { updatedUser.skills = []; }
  try { updatedUser.interests = JSON.parse(updatedUser.interests || '[]'); } catch (e) { updatedUser.interests = []; }
  try { updatedUser.preferred_categories = JSON.parse(updatedUser.preferred_categories || '[]'); } catch (e) { updatedUser.preferred_categories = []; }

  req.session.user = { id: updatedUser.id, email: updatedUser.email, name: updatedUser.name };

  res.render('profile', {
    user: updatedUser,
    welcome: false,
    successMsg: 'Profile updated successfully! Your opportunity recommendations have been recalculated.',
    errorMsg: null,
    pageTitle: 'My Profile - OpportuNest'
  });
});

// POST /profile/add-skill (Skill Gap Advisor CTA)
router.post('/profile/add-skill', requireAuth, async (req, res) => {
  const { skill } = req.body;
  if (!skill) {
    return res.redirect('/dashboard');
  }

  const db = getDb();
  const userRes = await db.execute({
    sql: "SELECT * FROM users WHERE id = ?",
    args: [req.session.user.id]
  });
  const user = { ...userRes.rows[0] };
  let currentSkills = [];
  try { currentSkills = JSON.parse(user.skills || '[]'); } catch (e) { currentSkills = []; }

  const skillTrimmed = skill.trim();
  const exists = currentSkills.some(s => s.toLowerCase() === skillTrimmed.toLowerCase());

  if (!exists) {
    currentSkills.push(skillTrimmed);
    await db.execute({
      sql: "UPDATE users SET skills = ? WHERE id = ?",
      args: [JSON.stringify(currentSkills), user.id]
    });
  }

  if (req.xhr || req.headers.accept?.includes('application/json')) {
    let score = 0;
    if (user.name) score += 10;
    if (user.email) score += 10;
    if (user.education_level) score += 20;
    if (user.field_of_study) score += 20;
    if (currentSkills.length > 0) score += 20;
    try {
      const interests = JSON.parse(user.interests || '[]');
      if (interests.length > 0) score += 10;
    } catch(e) {}
    try {
      const categories = JSON.parse(user.preferred_categories || '[]');
      if (categories.length > 0) score += 10;
    } catch(e) {}
    const completionPercentage = Math.min(score, 100);

    return res.json({ 
      success: true, 
      addedSkill: skillTrimmed, 
      newSkills: currentSkills,
      completionPercentage 
    });
  }

  res.redirect('/dashboard?addedSkill=' + encodeURIComponent(skillTrimmed));
});

module.exports = router;
