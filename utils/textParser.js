
import { CONFIG } from '../config/constants.js';

// Common misspellings and their corrections
export function correctOperatorName(input) {
  if (!input) return null;

  const lowerInput = input.toLowerCase();

  // Check direct corrections first
  if (CONFIG.OPERATOR_CORRECTIONS[lowerInput]) {
    return CONFIG.OPERATOR_CORRECTIONS[lowerInput];
  }

  // Check for partial matches
  if (lowerInput.includes('jio') || lowerInput.includes('geo')) return 'jio';
  if (lowerInput.includes('airtel') || lowerInput.includes('artel')) return 'airtel';
  if (lowerInput.includes('vi') || lowerInput.includes('vodafone') || lowerInput.includes('idea')) return 'vi';

  return null;
}

// Convert validity to days (handles numbers and strings)
export function parseValidity(validity) {
  if (typeof validity === 'number') return validity;
  if (!validity) return null;

  // Handle validity as string
  const str = validity.toString().toLowerCase();
  if (str === 'base plan' || str === 'plan validity' || str === 'bill cycle') return null;

  // Handle different time units
  if (str.includes('month')) {
    const monthMatch = str.match(/(\d+)/);
    return monthMatch ? parseInt(monthMatch[1]) * 30 : null;
  }
  if (str.includes('week')) {
    const weekMatch = str.match(/(\d+)/);
    return weekMatch ? parseInt(weekMatch[1]) * 7 : null;
  }
  if (str.includes('year')) {
    const yearMatch = str.match(/(\d+)/);
    return yearMatch ? parseInt(yearMatch[1]) * 365 : null;
  }

  // Handle special case for day units
  if (str.includes('day')) {
    const dayMatch = str.match(/(\d+)\s*days?/i);
    return dayMatch ? parseInt(dayMatch[1]) : null;
  }

  // Extract just the number for day values as fallback
  const match = str.match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

// Parse data allowance from plan description
export function parseDataAllowance(dataString) {
  if (!dataString) return null;

  // Handle unlimited cases
  if (dataString.toLowerCase().includes('unlimited')) return Infinity;

  // Extract GB amounts
  const gbMatch = dataString.match(/(\d+(\.\d+)?)\s*GB/i);
  if (gbMatch) return parseFloat(gbMatch[1]);

  // Extract MB amounts and convert to GB
  const mbMatch = dataString.match(/(\d+)\s*MB/i);
  if (mbMatch) return parseFloat(mbMatch[1]) / 1024;

  return null;
}

// Check if plan has a specific feature
export function hasFeature(plan, feature) {
  if (!plan || !feature) return false;

  const searchText = [plan.benefits, plan.additional_benefits, plan.description, plan.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return searchText.includes(feature.toLowerCase());
}

// Extract duration from query text
export function extractDurationFromQuery(queryText) {
  let targetDuration = null;

  // First check for month expressions
  for (const [monthExpr, days] of Object.entries(CONFIG.MONTH_MAPPINGS)) {
    if (queryText.includes(monthExpr)) {
      targetDuration = days;
      console.log(`Mapped "${monthExpr}" to ${days} days validity`);
      break;
    }
  }

  // If no month expression found, try direct days extraction
  if (!targetDuration) {
    const daysMatch = queryText.match(/(\d+)\s*days?/i);
    if (daysMatch) {
      targetDuration = parseInt(daysMatch[1]);
      console.log('Duration directly extracted from query text:', targetDuration);
    }
  }

  return targetDuration;
}

// Extract budget from query text
export function extractBudgetFromQuery(queryText) {
  const budgetMatch = queryText.match(/under\s+(?:rs\.?|₹)?\s*(\d+)/i) || 
                      queryText.match(/less\s+than\s+(?:rs\.?|₹)?\s*(\d+)/i) ||
                      queryText.match(/budget\s+of\s+(?:rs\.?|₹)?\s*(\d+)/i);
  if (budgetMatch) {
    return parseInt(budgetMatch[1]);
  }
  return null;
}

// Extract operator from query text
export function extractOperatorFromQuery(queryText) {
  if (queryText.includes('jio') || queryText.includes('geo')) return 'jio';
  else if (queryText.includes('airtel') || queryText.includes('artel')) return 'airtel';
  else if (queryText.includes('vi') || queryText.includes('vodafone') || queryText.includes('idea')) return 'vi';
  return null;
}

// Extract daily data requirement from query text
export function extractDailyDataFromQuery(queryText) {
  const dailyDataMatch = queryText.match(/(\d+(\.\d+)?)\s*GB\s*(?:per day|daily)/i);
  if (dailyDataMatch) {
    return parseFloat(dailyDataMatch[1]);
  }
  return null;
}

// Process duration parameter from Dialogflow
export function processDurationParameter(params, queryText) {
  // First try to extract from query text
  let targetDuration = extractDurationFromQuery(queryText);
  
  // Only attempt to process duration from params if we didn't already extract it from query text
  if (!targetDuration && params.duration) {
    console.log('Original duration parameter:', JSON.stringify(params.duration));

    // Handle Dialogflow's duration entities
    if (typeof params.duration === 'object' && params.duration.amount) {
      const amount = params.duration.amount;
      const unit = params.duration.unit?.toLowerCase() || '';

      if (unit.includes('month')) {
        // Map months to days according to Indian telecom standards
        if (amount === 1) targetDuration = 28;
        else if (amount === 2) targetDuration = 56;
        else if (amount === 3) targetDuration = 84;
        else targetDuration = Math.round(amount * 30); // Approximate for other values
      }
      else if (unit.includes('week')) targetDuration = amount * 7;
      else if (unit.includes('year')) targetDuration = amount * 365;
      else targetDuration = amount; // Assume days
    } else if (typeof params.duration === 'number') {
      targetDuration = params.duration;
    } else if (typeof params.duration === 'string') {
      // For handling "28 days" type strings directly
      targetDuration = parseValidity(params.duration);
    }

    console.log('Processed target duration from params:', targetDuration);
  }

  return targetDuration;
}

// Process budget parameter from Dialogflow
export function processBudgetParameter(params, queryText) {
  let budget = null;
  
  // Try to extract budget from parameters
  if (params.budget) {
    if (typeof params.budget === 'number') {
      budget = params.budget;
    } else if (typeof params.budget === 'object' && params.budget.amount) {
      budget = params.budget.amount;
    } else if (typeof params.budget === 'string') {
      // Try to extract a number from the string
      const budgetMatch = params.budget.match(/(\d+)/);
      if (budgetMatch) budget = parseInt(budgetMatch[1]);
    }
  }

  // If budget not found in parameters, try to extract from query text
  if (!budget) {
    budget = extractBudgetFromQuery(queryText);
  }

  return budget;
}
