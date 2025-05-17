import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';

const app = express();
app.use(bodyParser.json());
const port = process.env.PORT || 3000;

// Your GitHub JSON URL
const JSON_URL = 'https://raw.githubusercontent.com/nh652/TelcoPlans/main/telecom_plans_improved.json';

// Cache configuration
let cachedPlans = null;
let lastFetchTime = 0;
const CACHE_DURATION = 3600000; // 1 hour

// Root endpoint for Replit preview
app.get('/', (req, res) => {
  res.send('Telecom Plan Suggestion API is running');
});

// Fetch and cache plans from GitHub, with User-Agent header
async function getPlansData() {
  const now = Date.now();
  if (!cachedPlans || now - lastFetchTime > CACHE_DURATION) {
    try {
      const response = await fetch(JSON_URL, {
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
function flattenPrepaidPlans(prepaidData) {
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
function flattenPostpaidPlans(postpaidData) {
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

// Convert validity to days (handles numbers and strings)
function parseValidity(validity) {
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

// Main webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    console.log('Received webhook request:', JSON.stringify(req.body));
    const { queryResult } = req.body;
    const params = queryResult.parameters || {};
    const queryText = (queryResult.queryText || '').toLowerCase();

    console.log('Parameters:', JSON.stringify(params));
    console.log('Query text:', queryText);

    // Handle conversational queries first
    const conversationalResponses = {
      'hi': ['Hello! I\'m your mobile plan assistant. How can I help you today?', 'Hi there! I\'m here to help you find the perfect mobile plan. What are you looking for?', 'Hello! Ready to explore some great mobile plans with you!'],
      'hello': ['Hi! I\'m your dedicated plan advisor. What kind of plan are you interested in?', 'Hello there! I\'m here to help you find the best mobile plan for your needs.', 'Hello! Looking forward to helping you find your ideal plan today.'],
      'hey': ['Hey! Thanks for reaching out. How can I assist with your mobile plan search?', 'Hi there! Ready to help you discover the perfect plan for your needs.', 'Hey! Let\'s find you a great mobile plan today.'],
      'how are you': ['I\'m doing great, thanks for asking! I\'m excited to help you find the perfect mobile plan today. What are you looking for?', 'I\'m well and ready to assist you! Tell me what kind of mobile plan you\'re interested in.', 'I\'m excellent, thank you! Looking forward to helping you find your ideal plan. What features are important to you?'],
      'thanks': ['You\'re welcome! I\'m glad I could help. Feel free to ask if you need to explore more plans!', 'Happy to assist! Don\'t hesitate to ask if you need to compare more options.', 'My pleasure! Remember, I\'m here whenever you need to find the right plan for you.'],
      'thank you': ['You\'re welcome! I enjoyed helping you. Come back anytime to explore more plans!', 'It\'s my pleasure! Feel free to return if you need to compare more options.', 'Glad I could help! Don\'t hesitate to ask about any other plans or features.'],
      'bye': ['Goodbye! Thanks for letting me help with your plan search. Have a great day!', 'Take care! Remember, I\'m here whenever you need to explore mobile plans.', 'Bye! Feel free to return anytime to find the perfect plan for you.']
    };

    // Check for conversational queries
    const normalizedQuery = queryText.toLowerCase().trim();
    for (const [trigger, responses] of Object.entries(conversationalResponses)) {
      // Add more variations of "how are you"
      if (trigger === 'how are you' && (
          normalizedQuery.includes('how are you') ||
          normalizedQuery.includes('how are you doing') ||
          normalizedQuery.includes('how you doing') ||
          normalizedQuery.includes('how do you do') ||
          normalizedQuery.includes('how\'re you')
      )) {
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        return res.json({ fulfillmentText: randomResponse });
      }
      // Handle other conversational triggers
      else if (normalizedQuery.includes(trigger)) {
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        return res.json({ fulfillmentText: randomResponse });
      }
    }

    // Extract duration directly from query text first
    let targetDuration = null;

    // First check for month expressions
    const monthMap = {
      '1 month': 28,
      'one month': 28,
      'a month': 28, 
      '2 month': 56,
      'two month': 56,
      '2 months': 56,
      'two months': 56,
      '3 month': 84,
      'three month': 84,
      '3 months': 84,
      'three months': 84
    };

    // Check for month-based expressions first
    for (const [monthExpr, days] of Object.entries(monthMap)) {
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

    // Operator extraction
    let operator = params.operator?.toLowerCase();
    if (!operator) {
      if (queryText.includes('jio')) operator = 'jio';
      else if (queryText.includes('airtel')) operator = 'airtel';
      else if (queryText.includes('vi') || queryText.includes('vodafone')) operator = 'vi';
    }

    console.log('Selected operator:', operator);

    // Plan type detection (prepaid/postpaid)
    let planType = params.plan_type?.toLowerCase();
    if (!planType) {
      if (queryText.includes('prepaid')) {
        planType = 'prepaid';
      } else if (queryText.includes('postpaid')) {
        planType = 'postpaid';
      } else {
        // Default to prepaid if not specified
        planType = 'prepaid';
      }
    }

    console.log('Selected plan type:', planType);

    // Check if user is requesting voice-only or calling-only plans
    const isVoiceOnly = queryText.includes('voice only') || 
                       queryText.includes('voice-only') || 
                       queryText.includes('calling only') || 
                       queryText.includes('call only') ||
                       queryText.includes('calling-only') ||
                       (queryText.includes('only') && queryText.includes('call') && !queryText.includes('data')) ||
                       (queryText.includes('only') && queryText.includes('voice') && !queryText.includes('data'));

    console.log('Voice-only plan requested:', isVoiceOnly);

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

    // Fix budget extraction
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
      const budgetMatch = queryText.match(/under\s+(?:rs\.?|₹)?\s*(\d+)/i) || 
                          queryText.match(/less\s+than\s+(?:rs\.?|₹)?\s*(\d+)/i) ||
                          queryText.match(/budget\s+of\s+(?:rs\.?|₹)?\s*(\d+)/i);
      if (budgetMatch) {
        budget = parseInt(budgetMatch[1]);
      }
    }

    console.log('Extracted budget:', budget);

    // Get and process data
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

    // Log some sample plans for debugging
    if (plans.length > 0) {
      console.log('Sample plan data:');
      console.log(JSON.stringify(plans.slice(0, 2)));
    }

    // Filter plans by voice-only if requested
    if (isVoiceOnly) {
      const voicePlans = plans.filter(plan => {
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

      console.log(`Found ${voicePlans.length} voice-only plans`);

      // Replace the plans array with filtered voice-only plans
      if (voicePlans.length > 0) {
        plans = voicePlans;
      } else {
        // If no specific voice-only plans found, we'll continue with all plans
        // but add a note in the response
        console.log("No specific voice-only plans found, continuing with all plans");
      }
    }

    // Filter plans
    const filtered = plans.filter(plan => {
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

    console.log(`Filtered to ${filtered.length} matching plans`);

    // Sort by price ascending
    filtered.sort((a, b) => {
      const priceA = typeof a.price === 'string' ? parseInt(a.price.replace(/[^0-9]/g, '')) : a.price;
      const priceB = typeof b.price === 'string' ? parseInt(b.price.replace(/[^0-9]/g, '')) : b.price;
      return priceA - priceB;
    });

    // Limit number of plans to prevent response from being too long
    const MAX_PLANS_TO_SHOW = 8;
    const plansToShow = filtered.slice(0, MAX_PLANS_TO_SHOW);

    // Build response
    let responseText = '';
    if (plansToShow.length > 0) {
      // Include budget in the response if specified
      const budgetText = budget ? ` under ₹${budget}` : '';

      // Add voice-only to the description if requested
      const voiceText = isVoiceOnly ? ' VOICE-ONLY' : '';

      responseText = `Here are ${operator ? operator.toUpperCase() + ' ' : ''}${planType.toUpperCase()}${voiceText} plans${budgetText}${targetDuration ? ' with ' + targetDuration + ' days validity' : ''}:\n\n` +
        plansToShow.map(plan => {
          // Handle different validity formats and undefined values
          let validity = '';
          if (plan.validity) {
            if (plan.validity === 'base plan') validity = 'with base plan';
            else if (plan.validity === 'bill cycle' || plan.validity === 'monthly') validity = 'monthly bill cycle';
            else if (typeof plan.validity === 'number') validity = `${plan.validity} days`;
            else validity = plan.validity;
          } else if (planType === 'postpaid') {
            // Default for postpaid when validity is missing
            validity = 'monthly bill cycle';
          }

          // Only add the validity part if we have something meaningful
          const validityText = validity ? ` (${validity})` : '';

          // Include the provider name if not specified in the search
          const providerText = !operator && plan.provider ? `[${plan.provider.toUpperCase()}] ` : '';

          const benefits = [plan.benefits, plan.additional_benefits].filter(Boolean).join(', ');
          return `- ${providerText}₹${plan.price}: ${plan.data}${validityText}${benefits ? ' ' + benefits : ''}`;
        }).join('\n');

      // Add note if results were limited
      if (filtered.length > MAX_PLANS_TO_SHOW) {
        responseText += `\n\n(Showing ${MAX_PLANS_TO_SHOW} out of ${filtered.length} available plans)`;
      }
    } else {
      // Add a fallback that shows plans with similar validity if nothing matches exactly
      if (targetDuration && plans.length > 0) {
        // Try to find plans with similar validity that also meet budget constraints
        const similarPlans = plans
          .map(plan => ({
            plan,
            validDays: parseValidity(plan.validity)
          }))
          .filter(item => item.validDays) // Only include plans with valid durations
          .filter(item => !budget || item.plan.price <= budget) // Apply budget filter if specified
          .sort((a, b) => Math.abs(a.validDays - targetDuration) - Math.abs(b.validDays - targetDuration))
          .slice(0, 3); // Get top 3 closest matches

        if (similarPlans.length > 0) {
          const budgetText = budget ? ` under ₹${budget}` : '';
          // Add voice-only to the description if requested
          const voiceText = isVoiceOnly ? ' VOICE-ONLY' : '';

          responseText = `No exact ${operator ? operator.toUpperCase() + ' ' : ''}${planType.toUpperCase()}${voiceText} plans with ${targetDuration} days validity${budgetText} found. Here are some alternatives:\n\n` +
            similarPlans.map(item => {
              const plan = item.plan;
              // Handle different validity formats and undefined values
              let validity = '';
              if (plan.validity) {
                if (plan.validity === 'base plan') validity = 'with base plan';
                else if (plan.validity === 'bill cycle' || plan.validity === 'monthly') validity = 'monthly bill cycle';
                else if (typeof plan.validity === 'number') validity = `${plan.validity} days`;
                else validity = plan.validity;
              } else if (planType === 'postpaid') {
                // Default for postpaid when validity is missing
                validity = 'monthly bill cycle';
              }

              // Only add the validity part if we have something meaningful
              const validityText = validity ? ` (${validity})` : '';

              // Include the provider name if not specified in the search
              const providerText = !operator && plan.provider ? `[${plan.provider.toUpperCase()}] ` : '';

              const benefits = [plan.benefits, plan.additional_benefits].filter(Boolean).join(', ');
              return `- ${providerText}₹${plan.price}: ${plan.data}${validityText}${benefits ? ' ' + benefits : ''}`;
            }).join('\n');
        } else {
          const budgetText = budget ? ` under ₹${budget}` : '';
          // Add voice-only to the description if requested
          const voiceText = isVoiceOnly ? ' VOICE-ONLY' : '';

          responseText = `No matching ${operator ? operator.toUpperCase() + ' ' : ''}${planType.toUpperCase()}${voiceText} plans found with ${targetDuration} days validity${budgetText}. Try adjusting your filters.`;
        }
      } else if (budget && plans.length > 0) {
        // If we're just filtering by budget and nothing matches
        // Add voice-only to the description if requested
        const voiceText = isVoiceOnly ? ' VOICE-ONLY' : '';

        responseText = `No ${operator ? operator.toUpperCase() + ' ' : ''}${planType.toUpperCase()}${voiceText} plans found under ₹${budget}. The cheapest available plan is ₹${Math.min(...plans.map(p => p.price))}.`;
      } else if (plans.length > 0) {
        // If we have no plans matching filters but we have plans for this operator and type
        const budgetText = budget ? ` under ₹${budget}` : '';
        // Add voice-only to the description if requested
        const voiceText = isVoiceOnly ? ' VOICE-ONLY' : '';

        responseText = `No matching ${operator ? operator.toUpperCase() + ' ' : ''}${planType.toUpperCase()}${voiceText} plans found${targetDuration ? ' with ' + targetDuration + ' days validity' : ''}${budgetText}.`;
        if (targetDuration || budget) {
          responseText += ' Try adjusting your filters.';
        }
      } else {
        // If no plans found for this operator and type
        // Add voice-only to the description if requested
        const voiceText = isVoiceOnly ? ' VOICE-ONLY' : '';

        responseText = `No ${planType.toUpperCase()}${voiceText} plans available for ${operator ? operator.toUpperCase() : 'any operator'}. Would you like to check ${planType === 'prepaid' ? 'postpaid' : 'prepaid'} plans instead?`;
      }
    }

    console.log('Response:', responseText);
    res.json({ fulfillmentText: responseText });

  } catch (error) {
    console.error('Webhook error:', error);
    res.json({ fulfillmentText: 'Sorry, we encountered an error. Please try again later.' });
  }
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});