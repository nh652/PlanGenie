
import fetch from 'node-fetch';
import { CONFIG } from '../config/constants.js';
import { parseValidity, parseDataAllowance, hasFeature } from '../utils/textParser.js';

// Cache configuration
let cachedPlans = null;
let lastFetchTime = 0;

// Fetch and cache plans from GitHub, with User-Agent header
export async function getPlansData() {
  const now = Date.now();
  if (!cachedPlans || now - lastFetchTime > CONFIG.CACHE_DURATION) {
    try {
      const response = await fetch(CONFIG.JSON_URL, {
        headers: {
          'User-Agent': 'TelecomPlanBot/1.0'
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      cachedPlans = await response.json();
      lastFetchTime = now;
    } catch (error) {
      console.error('Failed to fetch plans:', error);
      throw error;
    }
  }
  return cachedPlans;
}

// Flatten all nested prepaid plans for any operator
export function flattenPrepaidPlans(prepaidData) {
  let plans = [];
  for (const category of Object.values(prepaidData)) {
    if (Array.isArray(category)) {
      plans.push(...category);
    } else if (typeof category === 'object' && category !== null) {
      for (const subCategory of Object.values(category)) {
        if (Array.isArray(subCategory)) plans.push(...subCategory);
      }
    }
  }
  return plans;
}

// Flatten all nested postpaid plans for any operator
export function flattenPostpaidPlans(postpaidData) {
  let plans = [];

  // If it's already an array, return it directly
  if (Array.isArray(postpaidData)) {
    return postpaidData;
  }

  // Handle different possible nesting structures for postpaid plans
  for (const category of Object.values(postpaidData)) {
    if (Array.isArray(category)) {
      plans.push(...category);
    } else if (typeof category === 'object' && category !== null) {
      // Might have additional nesting levels
      for (const subCategory of Object.values(category)) {
        if (Array.isArray(subCategory)) {
          plans.push(...subCategory);
        } else if (typeof subCategory === 'object' && subCategory !== null) {
          // Handle potential third level nesting
          for (const thirdLevel of Object.values(subCategory)) {
            if (Array.isArray(thirdLevel)) plans.push(...thirdLevel);
          }
        }
      }
    }
  }
  return plans;
}

// Get plans for specific operator and plan type
export async function getPlansForOperator(operator, planType) {
  const data = await getPlansData();
  let plans = [];

  if (operator) {
    const provider = data.telecom_providers[operator];
    if (provider?.plans?.[planType]) {
      // For postpaid plans which might have a different structure
      if (planType === 'postpaid') {
        const postpaidPlans = provider.plans.postpaid;
        if (Array.isArray(postpaidPlans)) {
          plans = postpaidPlans.map(p => ({ ...p, provider: operator }));
        } else if (typeof postpaidPlans === 'object' && postpaidPlans !== null) {
          // Handle nested postpaid structure if needed
          plans = flattenPostpaidPlans(postpaidPlans).map(p => ({ ...p, provider: operator }));
        }
      } else {
        // For prepaid plans, use existing flattening function
        plans = flattenPrepaidPlans(provider.plans[planType]).map(p => ({ ...p, provider: operator }));
      }
    }
    console.log(`Found ${plans.length} ${planType} plans for ${operator}`);
  } else {
    // Search all providers if no operator specified
    for (const op of Object.keys(data.telecom_providers)) {
      const provider = data.telecom_providers[op];
      if (provider?.plans?.[planType]) {
        let operatorPlans = [];
        if (planType === 'postpaid') {
          const postpaidPlans = provider.plans.postpaid;
          if (Array.isArray(postpaidPlans)) {
            operatorPlans = postpaidPlans;
          } else if (typeof postpaidPlans === 'object' && postpaidPlans !== null) {
            // Handle nested postpaid structure if needed
            operatorPlans = flattenPostpaidPlans(postpaidPlans);
          }
        } else {
          operatorPlans = flattenPrepaidPlans(provider.plans[planType]);
        }
        plans.push(...operatorPlans.map(p => ({ ...p, provider: op })));
      }
    }
    console.log(`Found ${plans.length} total ${planType} plans across all operators`);
  }

  return plans;
}

// Filter plans by voice-only requirements
export function filterVoiceOnlyPlans(plans) {
  return plans.filter(plan => {
    // Only include plans with zero data
    const hasZeroData = plan.data === "0GB" || 
                       plan.data === "No data" ||
                       plan.data?.toLowerCase().includes('0gb');

    // Check if benefits only mention voice/calls and SMS
    const onlyVoiceAndSMS = plan.benefits && 
                           !plan.benefits.toLowerCase().includes('data') &&
                           !plan.benefits.toLowerCase().includes('gb') &&
                           (plan.benefits.toLowerCase().includes('voice') ||
                            plan.benefits.toLowerCase().includes('calls'));

    return hasZeroData && onlyVoiceAndSMS;
  });
}

// Filter plans by minimum daily data requirement
export function filterByDailyData(plans, minDailyData) {
  return plans.filter(plan => {
    const dataAmount = parseDataAllowance(plan.data);
    if (!dataAmount) return false; // Exclude plans with no data or unparseable data

    // Get validity in days
    const validityDays = parseValidity(plan.validity) || 1;

    // Calculate daily data (total data divided by validity)
    const dailyData = dataAmount / validityDays;

    return dailyData >= minDailyData;
  });
}

// Filter plans by duration and budget
export function filterPlansByConstraints(plans, targetDuration, budget) {
  return plans.filter(plan => {
    const validDays = parseValidity(plan.validity);
    const planPrice = typeof plan.price === 'string' ? parseInt(plan.price.replace(/[^0-9]/g, '')) : plan.price;

    console.log(`Plan: ₹${planPrice}, Validity: ${plan.validity}, Parsed days: ${validDays}`);

    // Debug any filtering issues
    if (targetDuration) {
      console.log(`Comparing target ${targetDuration} with plan validity ${validDays}`);
    }

    if (budget) {
      console.log(`Comparing budget ${budget} with plan price ${planPrice}`);
    }

    // Check if the plan duration matches the requested duration
    let matchesDuration = !targetDuration || validDays === targetDuration;

    // Check if the plan price is within budget
    const matchesBudget = !budget || planPrice <= budget;

    // Log detailed info about why a plan might be filtered out
    if (targetDuration && !matchesDuration) {
      console.log(`Plan filtered out: duration mismatch (requested ${targetDuration}, plan has ${validDays})`);
    }
    if (budget && !matchesBudget) {
      console.log(`Plan filtered out: budget mismatch (max ₹${budget}, plan costs ₹${planPrice})`);
    }

    return matchesDuration && matchesBudget;
  });
}

// Filter plans by requested features
export function filterPlansByFeatures(plans, requestedFeatures) {
  return plans.filter(plan => 
    requestedFeatures.every(feature => hasFeature(plan, feature))
  );
}

// Filter plans for international roaming
export function filterInternationalPlans(plans) {
  return plans.filter(plan => {
    const planText = [plan.benefits, plan.additional_benefits, plan.description, plan.name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return planText.includes('iro') || 
           planText.includes('international roaming') || 
           planText.includes('global roaming') ||
           planText.includes('international pack');
  });
}

// Find similar plans when exact matches aren't found
export function findSimilarPlans(plans, targetDuration, budget, maxResults = 3) {
  return plans
    .map(plan => ({
      plan,
      validDays: parseValidity(plan.validity)
    }))
    .filter(item => item.validDays) // Only include plans with valid durations
    .filter(item => !budget || item.plan.price <= budget) // Apply budget filter if specified
    .sort((a, b) => Math.abs(a.validDays - targetDuration) - Math.abs(b.validDays - targetDuration))
    .slice(0, maxResults) // Get top matches
    .map(item => item.plan);
}

// Check feature availability in plans
export function checkFeatureAvailability(plans, requestedFeatures) {
  const availableFeatures = [];
  const unavailableFeatures = [];

  requestedFeatures.forEach(feature => {
    if (plans.some(plan => hasFeature(plan, feature))) {
      availableFeatures.push(feature);
    } else {
      unavailableFeatures.push(feature);
    }
  });

  return { availableFeatures, unavailableFeatures };
}
