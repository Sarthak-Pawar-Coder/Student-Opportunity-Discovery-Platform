/**
 * ⭐ WOW FEATURE — Skill Gap Advisor
 * Computes which skill, if added to student profile, unlocks the most additional opportunities.
 */

const { scoreOpportunity } = require('./recommendationEngine');

function analyzeSkillGaps(user, allOpportunities) {
  if (!user || !Array.isArray(allOpportunities) || allOpportunities.length === 0) {
    return null;
  }

  let userSkills = [];
  try {
    userSkills = typeof user.skills === 'string' ? JSON.parse(user.skills) : (user.skills || []);
  } catch (e) {
    userSkills = [];
  }
  if (!Array.isArray(userSkills)) {
    userSkills = [];
  }

  const userSkillsLower = userSkills.map(s => s.toLowerCase().trim());

  // Extract all unique skills required across all opportunities
  const skillFrequency = {};
  const skillCanonicalName = {};

  allOpportunities.forEach(opp => {
    let reqSkills = [];
    try {
      reqSkills = typeof opp.required_skills === 'string' ? JSON.parse(opp.required_skills) : (opp.required_skills || []);
    } catch (e) {
      reqSkills = [];
    }

    reqSkills.forEach(skill => {
      const lower = skill.toLowerCase().trim();
      if (!userSkillsLower.includes(lower)) {
        skillFrequency[lower] = (skillFrequency[lower] || 0) + 1;
        if (!skillCanonicalName[lower]) {
          skillCanonicalName[lower] = skill.trim();
        }
      }
    });
  });

  const missingSkillsLower = Object.keys(skillFrequency);
  if (missingSkillsLower.length === 0) {
    return null; // Student already has every skill in catalog!
  }

  const skillAnalysis = [];

  missingSkillsLower.forEach(missingSkillLower => {
    const canonicalSkill = skillCanonicalName[missingSkillLower];
    const hypotheticalSkills = [...userSkills, canonicalSkill];
    const hypotheticalUser = {
      ...user,
      skills: hypotheticalSkills
    };

    let unlockedCount = 0;
    let totalScoreDelta = 0;
    const unlockedOpportunities = [];

    allOpportunities.forEach(opp => {
      const baseScore = scoreOpportunity(user, opp).score;
      const hypoScore = scoreOpportunity(hypotheticalUser, opp).score;
      const delta = hypoScore - baseScore;

      if (delta > 0) {
        totalScoreDelta += delta;
        // Count as "unlocked/boosted" if it moves to or beyond threshold score (e.g. 3) or gained direct skill match
        if (baseScore < 3 && hypoScore >= 3) {
          unlockedCount++;
          if (unlockedOpportunities.length < 3) {
            unlockedOpportunities.push(opp.title);
          }
        } else if (delta >= 3) {
          unlockedCount++;
          if (unlockedOpportunities.length < 3) {
            unlockedOpportunities.push(opp.title);
          }
        }
      }
    });

    if (unlockedCount > 0) {
      skillAnalysis.push({
        skill: canonicalSkill,
        unlockedCount,
        totalScoreDelta,
        sampleOpportunities: unlockedOpportunities
      });
    }
  });

  // Sort by unlocked opportunity count, then total score delta
  skillAnalysis.sort((a, b) => {
    if (b.unlockedCount !== a.unlockedCount) {
      return b.unlockedCount - a.unlockedCount;
    }
    return b.totalScoreDelta - a.totalScoreDelta;
  });

  if (skillAnalysis.length === 0) {
    return null;
  }

  const topGap = skillAnalysis[0];
  const secondGap = skillAnalysis.length > 1 ? skillAnalysis[1] : null;

  return {
    topSkill: topGap.skill,
    unlockedCount: topGap.unlockedCount,
    sampleOpportunities: topGap.sampleOpportunities,
    recommendations: skillAnalysis.slice(0, 8),
    allGaps: skillAnalysis.slice(0, 8)
  };
}

module.exports = { analyzeSkillGaps };
