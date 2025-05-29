/**
 * @fileoverview Service for fetching and processing telecom plans data
 * @module services/planService
 */

import fetch from 'node-fetch';
import { CONFIG } from '../config/constants.js';
import { parseValidity, parseDataAllowance, correctOperatorName } from '../utils/textParser.js';
import { PlanNotFoundError, ValidationError, ExternalAPIError } from '../utils/errors.js';
import { logInfo, logError, logDebug, logWarn } from '../utils/logger.js';

/** @type {Object|null} Cached plans data */
let cachedPlans = null;

/** @type {number} Timestamp of last fetch */
let lastFetchTime = 0;

/**
 * Retry configuration for external API calls
 * @type {Object}
 * @property {number} maxRetries - Maximum number of retry attempts
 * @property {number} baseDelay - Base delay between retries in milliseconds
 * @property {number} maxDelay - Maximum delay between retries in milliseconds
 * @property {number} backoffFactor - Exponential backoff multiplier
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffFactor: 2
};

/**
 * Sleep utility for implementing retry delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>} Promise that resolves after the specified delay
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches data from URL with exponential backoff retry logic
 * @param {string} url - The URL to fetch from
 * @param {Object} options - Fetch options
 * @param {number} [retryCount=0] - Current retry attempt number
 * @returns {Promise<Response>} The fetch response
 * @throws {ExternalAPIError} When all retry attempts are exhausted
 */
async function fetchWithRetry(url, options, retryCount = 0) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (error) {
    logError(`Fetch attempt ${retryCount + 1} failed: ${error.message}`, { attempt: retryCount + 1, error: error.message });

    // Don't retry on certain errors
    if (error.name === 'AbortError') {
      throw new ExternalAPIError('Request timeout while fetching plans data');
    }

    if (error.message.includes('404')) {
      throw new ExternalAPIError('Plans data source not found');
    }

    // Retry logic
    if (retryCount < RETRY_CONFIG.maxRetries) {
      const delay = Math.min(
        RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.backoffFactor, retryCount),
        RETRY_CONFIG.maxDelay
      );

      logWarn(`Retrying in ${delay}ms... (attempt ${retryCount + 2}/${RETRY_CONFIG.maxRetries + 1})`, { delay, attempt: retryCount + 2, maxAttempts: RETRY_CONFIG.maxRetries + 1 });
      await sleep(delay);

      return fetchWithRetry(url, options, retryCount + 1);
    }

    // All retries exhausted
    throw new ExternalAPIError(`Failed to fetch plans data after ${RETRY_CONFIG.maxRetries + 1} attempts: ${error.message}`);
  }
}

/**
 * Fetches and caches telecom plans data from external API with retry logic
 * @returns {Promise<Object>} The plans data object
 * @throws {ExternalAPIError} When fetch fails after all retries
 * @example
 * const data = await getPlansData();
 * console.log(data.telecom_providers.jio);
 */
export async function getPlansData() {
  const now = Date.now();
  if (!cachedPlans || now - lastFetchTime > CONFIG.CACHE_DURATION) {
    try {
      logInfo('Fetching fresh plans data...');
      const response = await fetchWithRetry(CONFIG.JSON_URL, {
        headers: {
          'User-Agent': 'TelecomPlanBot/1.0',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      const data = await response.json();

      // Validate the response structure
      if (!data || !data.telecom_providers) {
        throw new ExternalAPIError('Invalid plans data structure received');
      }

      cachedPlans = data;
      lastFetchTime = now;
      logInfo('Plans data fetched and cached successfully');
    } catch (error) {
      logError('Failed to fetch plans:', { error: error.message });

      // If we have cached data and it's not too old (within 24 hours), use it
      if (cachedPlans && now - lastFetchTime < 24 * 60 * 60 * 1000) {
        logWarn('Using stale cached data due to fetch failure');
        return cachedPlans;
      }

      throw error;
    }
  }
  return cachedPlans;
}

/**
 * Flattens nested prepaid plans structure into a single array
 * @param {Object} prepaidData - The nested prepaid plans object
 * @returns {Array<Object>} Flattened array of prepaid plans
 * @example
 * const plans = flattenPrepaidPlans(provider.plans.prepaid);
 */
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

/**
 * Flattens nested postpaid plans structure into a single array
 * @param {Object|Array} postpaidData - The nested postpaid plans object or array
 * @returns {Array<Object>} Flattened array of postpaid plans
 * @example
 * const plans = flattenPostpaidPlans(provider.plans.postpaid);
 */
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
  try {
    const data = await getPlansData();
    let plans = [];

    if (operator) {
      const provider = data.telecom_providers[operator];
      if (!provider) {
        throw new PlanNotFoundError(`No data available for operator: ${operator.toUpperCase()}`);
      }

      if (!provider.plans || !provider.plans[planType]) {
        throw new PlanNotFoundError(`No ${planType} plans available for ${operator.toUpperCase()}`);
      }

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
      logInfo(`Found ${plans.length} ${planType} plans for ${operator}`, { operator, planType, count: plans.length });
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
      logInfo(`Found ${plans.length} total ${planType} plans across all operators`, { planType, count: plans.length });
    }

    // Validate that we have valid plan data
    if (plans.length === 0) {
      throw new PlanNotFoundError(`No ${planType} plans found${operator ? ` for ${operator.toUpperCase()}` : ''}`);
    }

    // Validate plan structure
    plans.forEach((plan, index) => {
      if (!plan.price || !plan.data) {
        logWarn(`Plan at index ${index} has missing required fields:`, { index, plan });
      }
    });

    return plans;
  } catch (error) {
    logError('Error in getPlansForOperator:', { error: error.message });
    throw error;
  }
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

    logDebug(`Plan: ₹${planPrice}, Validity: ${plan.validity}, Parsed days: ${validDays}`, { price: planPrice, validity: plan.validity, parsedDays: validDays });

    // Debug any filtering issues
    if (targetDuration) {
      logDebug(`Comparing target ${targetDuration} with plan validity ${validDays}`, { targetDuration, planValidity: validDays });
    }

    if (budget) {
      logDebug(`Comparing budget ${budget} with plan price ${planPrice}`, { budget, planPrice });
    }

    // Check if the plan duration matches the requested duration
    let matchesDuration = !targetDuration || validDays === targetDuration;

    // Check if the plan price is within budget
    const matchesBudget = !budget || planPrice <= budget;

    // Log detailed info about why a plan might be filtered out
    if (targetDuration && !matchesDuration) {
      logDebug(`Plan filtered out: duration mismatch (requested ${targetDuration}, plan has ${validDays})`, { targetDuration, planValidity: validDays });
    }
    if (budget && !matchesBudget) {
      logDebug(`Plan filtered out: budget mismatch (max ₹${budget}, plan costs ₹${planPrice})`, { budget, planPrice });
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