/**
 * Explainable Recommendation Engine
 * Transparent, rule-based scoring without external black-box LLMs.
 */

function scoreOpportunity(user, opportunity) {
  if (!user || !opportunity) {
    return {
      score: 0,
      matchedSkills: [],
      matchedInterests: [],
      eligibilityMatched: false,
      daysRemaining: 0,
      reasons: [],
      summaryChip: 'No match'
    };
  }

  let userSkills = [];
  let userInterests = [];
  let userCategories = [];

  try {
    userSkills = typeof user.skills === 'string' ? JSON.parse(user.skills) : (user.skills || []);
  } catch (e) { userSkills = []; }
  try {
    userInterests = typeof user.interests === 'string' ? JSON.parse(user.interests) : (user.interests || []);
  } catch (e) { userInterests = []; }
  try {
    userCategories = typeof user.preferred_categories === 'string' ? JSON.parse(user.preferred_categories) : (user.preferred_categories || []);
  } catch (e) { userCategories = []; }

  let oppSkills = [];
  let oppTags = [];
  try {
    oppSkills = typeof opportunity.required_skills === 'string' ? JSON.parse(opportunity.required_skills) : (opportunity.required_skills || []);
  } catch (e) { oppSkills = []; }
  try {
    oppTags = typeof opportunity.tags === 'string' ? JSON.parse(opportunity.tags) : (opportunity.tags || []);
  } catch (e) { oppTags = []; }

  const matchedSkills = [];
  const matchedInterests = [];
  const reasons = [];

  const userSkillsLower = userSkills.map(s => s.toLowerCase().trim());

  for (const skill of oppSkills) {
    if (userSkillsLower.includes(skill.toLowerCase().trim())) {
      matchedSkills.push(skill);
    }
  }

  const skillScore = matchedSkills.length * 3;
  if (matchedSkills.length > 0) {
    reasons.push(`+${skillScore} for ${matchedSkills.length} matched skill${matchedSkills.length > 1 ? 's' : ''}: ${matchedSkills.join(', ')}`);
  }

  const userInterestsLower = userInterests.map(i => i.toLowerCase().trim());
  const userCategoriesLower = userCategories.map(c => c.toLowerCase().trim());

  for (const tag of oppTags) {
    if (userInterestsLower.includes(tag.toLowerCase().trim())) {
      matchedInterests.push(tag);
    }
  }
  const oppCategoryLower = (opportunity.category || '').toLowerCase().trim();
  if (oppCategoryLower && userCategoriesLower.includes(oppCategoryLower)) {
    if (!matchedInterests.includes(`Category: ${opportunity.category}`)) {
      matchedInterests.push(`Category: ${opportunity.category}`);
    }
  }

  const interestScore = matchedInterests.length * 2;
  if (matchedInterests.length > 0) {
    reasons.push(`+${interestScore} for ${matchedInterests.length} matched interest/category: ${matchedInterests.join(', ')}`);
  }

  let eligibilityScore = 0;
  let eligibilityMatched = false;
  if (opportunity.eligibility) {
    const oppEligLower = String(opportunity.eligibility).toLowerCase();
    const userEduLower = (user.education_level || '').toLowerCase();
    if (oppEligLower.includes('all') || (userEduLower && oppEligLower.includes(userEduLower)) || (userEduLower && userEduLower.includes(oppEligLower))) {
      eligibilityScore = 1;
      eligibilityMatched = true;
      reasons.push(`+1 for matching education level (${user.education_level || 'Student'})`);
    }
  }

  let urgencyScore = 0;
  let daysRemaining = null;
  if (opportunity.deadline) {
    const now = new Date();
    const deadlineDate = new Date(opportunity.deadline + 'T23:59:59');
    const diffTime = deadlineDate - now;
    daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    if (diffTime >= 0 && daysRemaining <= 14) {
      urgencyScore = 2;
      reasons.push(`+2 urgency boost (closing in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'})`);
    } else if (diffTime >= 0 && daysRemaining > 14 && daysRemaining <= 30) {
      urgencyScore = 1;
      reasons.push(`+1 urgency boost (closing in ${daysRemaining} days)`);
    }
  }

  const totalScore = skillScore + interestScore + eligibilityScore + urgencyScore;

  return {
    score: totalScore,
    matchedSkills,
    matchedInterests,
    eligibilityMatched,
    daysRemaining,
    reasons,
    summaryChip: matchedSkills.length > 0 
      ? `Matched: ${matchedSkills.join(', ')}`
      : matchedInterests.length > 0
        ? `Matched Interest: ${matchedInterests[0]}`
        : `Eligibility Match`
  };
}

function rankOpportunitiesForUser(user, opportunities) {
  return opportunities
    .map(opp => {
      const match = scoreOpportunity(user, opp);
      return {
        ...opp,
        matchScore: match.score,
        matchDetails: match
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}

module.exports = {
  scoreOpportunity,
  rankOpportunitiesForUser
};
