console.log("🚀 Server is starting...");
import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import { getGPTRecommendation } from './gptHelper.js';
import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getGPTFallbackResponse(userInput) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: "You are a friendly mobile plan assistant who also handles casual conversation if no plan is being discussed." },
        { role: 'user', content: userInput }
      ]
    });

    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error("GPT fallback error:", err.message);
    return "Sorry, I didn't catch that.";
  }
}

// Environment-based configuration
const CONFIG = {
  // Server settings
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // External API
  JSON_URL: 'https://raw.githubusercontent.com/nh652/TelcoPlans/main/telecom_plans_improved.json',



  // Cache settings
  CACHE_DURATION: 3600000, // 1 hour

  // Rate limiting settings
  RATE_LIMIT_WINDOW: 60000, // 1 minute
  MAX_REQUESTS_PER_WINDOW: 30,

  // Response limits
  MAX_PLANS_TO_SHOW: 8,

  // Available operators
  AVAILABLE_OPERATORS: ['jio', 'airtel', 'vi'],

  // Operator name corrections
  OPERATOR_CORRECTIONS: {
    'geo': 'jio',
    'artel': 'airtel',
    'vodafone idea': 'vi',
    'vodaphone': 'vi',
    'idea': 'vi'
  },

  // Duration mappings for month expressions
  MONTH_MAPPINGS: {
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
  },

  // Conversational responses
  CONVERSATIONAL_RESPONSES: {
    'hi': ['Hello! How can I help you today?', 'Hi there! Looking for a mobile plan?', 'Hello! Need help finding a plan?'],
    'hello': ['Hi! How can I assist you?', 'Hello there! Need help with mobile plans?', 'Hello! Ready to find your perfect plan?'],
    'hey': ['Hey! How can I help?', 'Hi there! Looking for a mobile plan?', 'Hey! Ready to find your perfect plan?'],
    'how are you': ['I\'m doing great, thanks for asking! How can I help you today?', 'I\'m well, thanks! Ready to find you the perfect mobile plan?'],
    'thanks': ['You\'re welcome! Let me know if you need anything else.', 'Happy to help! Need anything else?', 'Glad I could help! Feel free to ask about any other plans.'],
    'thank you': ['You\'re welcome! Let me know if you need anything else.', 'Happy to help! Need anything else?', 'My pleasure! Feel free to ask about other plans.'],
    'bye': ['Goodbye! Have a great day!', 'Take care! Come back if you need more help.', 'Bye! Feel free to return if you need assistance.']
  }
};

const app = express();
app.use(bodyParser.json());
const port = CONFIG.PORT;

// Rate limiting
const requestCounts = new Map();

function rateLimitMiddleware(req, res, next) {
  const clientId = req.ip || 'unknown';
  const now = Date.now();

  if (!requestCounts.has(clientId)) {
    requestCounts.set(clientId, { count: 1, resetTime: now + CONFIG.RATE_LIMIT_WINDOW });
    return next();
  }

  const clientData = requestCounts.get(clientId);

  if (now > clientData.resetTime) {
    requestCounts.set(clientId, { count: 1, resetTime: now + CONFIG.RATE_LIMIT_WINDOW });
    return next();
  }

  if (clientData.count >= CONFIG.MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      fulfillmentText: 'Too many requests. Please wait a moment before trying again.'
    });
  }

  clientData.count++;
  next();
}

app.use('/webhook', rateLimitMiddleware);

// Your GitHub JSON URL
const JSON_URL = CONFIG.JSON_URL;

// Cache configuration
let cachedPlans = null;
let lastFetchTime = 0;
const CACHE_DURATION = CONFIG.CACHE_DURATION;

// Response cache for frequently asked queries
const responseCache = new Map();
const RESPONSE_CACHE_DURATION = 300000; // 5 minutes

function getCachedResponse(key) {
  const cached = responseCache.get(key);
  if (cached && Date.now() - cached.timestamp < RESPONSE_CACHE_DURATION) {
    return cached.response;
  }
  return null;
}

function setCachedResponse(key, response) {
  responseCache.set(key, {
    response,
    timestamp: Date.now()
  });

  // Clean old entries if cache gets too large
  if (responseCache.size > 100) {
    const oldestKey = responseCache.keys().next().value;
    responseCache.delete(oldestKey);
  }
}

// Smart response cache for complete query responses
const smartCache = new Map();
const SMART_CACHE_TTL = 300000; // 5 minutes

function getSmartCache(key) {
  const entry = smartCache.get(key);
  if (entry && Date.now() - entry.timestamp < SMART_CACHE_TTL) {
    return entry.response;
  }
  return null;
}

function setSmartCache(key, response) {
  smartCache.set(key, {
    response,
    timestamp: Date.now()
  });

  // Clean old entries if too many
  if (smartCache.size > 100) {
    const oldestKey = smartCache.keys().next().value;
    smartCache.delete(oldestKey);
  }
}

// Root endpoint for Replit preview
app.get('/', (req, res) => {
  res.send('Telecom Plan Suggestion API is running');
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test data source connectivity
    const startTime = Date.now();
    await getPlansData();
    const responseTime = Date.now() - startTime;

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      dataSource: {
        cached: cachedPlans !== null,
        lastFetch: new Date(lastFetchTime).toISOString(),
        responseTime: `${responseTime}ms`
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Operator name correction mapping
const OPERATOR_CORRECTIONS = CONFIG.OPERATOR_CORRECTIONS;

// Common misspellings and their corrections
function correctOperatorName(input) {
  if (!input) return null;

  const lowerInput = input.toLowerCase();

  // Check direct corrections first
  if (OPERATOR_CORRECTIONS[lowerInput]) {
    return OPERATOR_CORRECTIONS[lowerInput];
  }

  // Check for partial matches
  if (lowerInput.includes('jio') || lowerInput.includes('geo')) return 'jio';
  if (lowerInput.includes('airtel') || lowerInput.includes('artel')) return 'airtel';
  if (lowerInput.includes('vi') || lowerInput.includes('vodafone') || lowerInput.includes('idea')) return 'vi';

  return null;
}

// Available operators in our database
const AVAILABLE_OPERATORS = CONFIG.AVAILABLE_OPERATORS;

// Fetch and cache plans from GitHub, with User-Agent header, timeout, and retry logic
async function getPlansData(retryCount = 0) {
  const now = Date.now();
  const maxRetries = 2;

  if (!cachedPlans || now - lastFetchTime > CACHE_DURATION) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(JSON_URL, {
        headers: {
          'User-Agent': 'TelecomPlanBot/1.0'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      cachedPlans = await response.json();
      lastFetchTime = now;
      console.log('Successfully fetched fresh plan data');

    } catch (error) {
      console.error(`Failed to fetch plans (attempt ${retryCount + 1}):`, error);

      // Retry logic with exponential backoff
      if (retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s delays
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return getPlansData(retryCount + 1);
      }

      // If we have cached data, use it despite being stale
      if (cachedPlans) {
        console.warn('Using stale cached data due to fetch failure');
        const cacheAge = Math.round((now - lastFetchTime) / 60000); // minutes
        console.warn(`Cache is ${cacheAge} minutes old`);
        return cachedPlans;
      }

      // No cached data available - provide a more specific error
      const errorMessage = error.name === 'AbortError' ? 
        'Request timed out while fetching plan data' :
        error.message.includes('fetch') ? 
        'Unable to connect to plan data source' :
        `Data fetch failed: ${error.message}`;

      throw new Error(`${errorMessage}. Please try again in a few moments.`);
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

// Parse data allowance from plan description
function parseDataAllowance(dataString) {
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
function hasFeature(plan, feature) {
  if (!plan || !feature) return false;

  const searchText = [plan.benefits, plan.additional_benefits, plan.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return searchText.includes(feature.toLowerCase());
}

// Infer user intent from natural language patterns
function inferUserIntent(queryText) {
  const inferences = {
    inferredFeatures: [],
    inferredMinDailyData: null,
    inferredVoiceOnly: false,
    inferredTargetDuration: null
  };

  const text = queryText.toLowerCase();

  if (text.includes('stream') || text.includes('binge') || text.includes('watch')) {
    inferences.inferredFeatures.push('ott');
    inferences.inferredMinDailyData = 2;
  }

  if (text.includes('long term') || text.includes('yearly') || text.includes('annual')) {
    inferences.inferredTargetDuration = 365;
  }

  if (text.includes('heavy user') || text.includes('power user')) {
    inferences.inferredMinDailyData = 2.5;
  }

  if (text.includes('just calls') || text.includes('only calls') || text.includes('voice only')) {
    inferences.inferredVoiceOnly = true;
  }

  if (text.includes('short term') || text.includes('weekend only')) {
    inferences.inferredTargetDuration = 1; // fallback to 1-day low cost plans
  }

  return inferences;
}

// Input validation middleware
function validateWebhookRequest(req, res, next) {
  if (!req.body || !req.body.queryResult) {
    return res.status(400).json({ 
      fulfillmentText: 'Invalid request format. Missing queryResult.' 
    });
  }

  const { queryResult } = req.body;
  if (!queryResult.queryText) {
    return res.status(400).json({ 
      fulfillmentText: 'Invalid request format. Missing queryText.' 
    });
  }

  // Sanitize input
  queryResult.queryText = queryResult.queryText.trim().substring(0, 1000); // Limit length

  next();
}

// Main webhook endpoint
app.post('/webhook', validateWebhookRequest, async (req, res) => {
  try {
    console.log('Received webhook request:', JSON.stringify(req.body, null, 2));
    const { queryResult } = req.body;
    const params = queryResult.parameters || {};
    const queryText = (queryResult.queryText || '').toLowerCase();

    console.log('Parameters:', JSON.stringify(params));
    console.log('Query text:', queryText);

    // Infer intent if user hasn't been explicit
    const inference = inferUserIntent(queryText);

    // Extract session and pagination context from input contexts
    const session = req.body.session || '';
    const contexts = queryResult.outputContexts || [];
    const paginationContext = contexts.find(ctx => ctx.name.endsWith('/contexts/pagination'));

    const isShowMoreIntent = queryResult.intent?.displayName?.toLowerCase().includes("show more");

    console.log("PAGINATION CONTEXT:", paginationContext);
    console.log("IS SHOW MORE INTENT:", isShowMoreIntent);

    // Handle conversational queries first with GPT
    const conversationalQueries = ['hi', 'hello', 'good morning', 'how are you', 'thank you', 'bye', 'thanks'];
    const normalizedQuery = queryText.toLowerCase().trim();

    if (conversationalQueries.some(q => normalizedQuery.includes(q))) {
      try {
        const gptReply = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: "You are a friendly mobile plan assistant. Keep responses brief and warm. Always offer to help with mobile plans." },
            { role: "user", content: queryText }
          ],
          max_tokens: 60,
        });

        return res.json({ fulfillmentText: gptReply.choices[0].message.content });
      } catch (error) {
        console.error('GPT API error for conversational query:', error);
        // Fallback to a simple response if GPT fails
        return res.json({ fulfillmentText: "Hello! I'm here to help you find the perfect mobile plan. What are you looking for?" });
      }
    }

    // Extract sorting preference (cheapest, best, etc.)
    let sortBy = null;
    if (queryText.includes('cheapest')) {
      sortBy = 'price';
    } else if (queryText.includes('best') || queryText.includes('highest') || queryText.includes('most')) {
      sortBy = 'value';
    }

    // Extract minimum data requirement
    let minDailyData = null;
    const dailyDataMatch = queryText.match(/(\d+(\.\d+)?)\s*GB\s*(?:per day|daily)/i);
    if (dailyDataMatch) {
      minDailyData = parseFloat(dailyDataMatch[1]);
    }

    // Extract duration directly from query text first
    let targetDuration = null;

    // First check for month expressions
    const monthMap = CONFIG.MONTH_MAPPINGS;

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

    // Operator extraction with spelling correction
    let operator = params.operator?.toLowerCase();
    let correctedOperator = null;
    let operatorCorrectionMessage = '';

    // Pagination logic - initialize offset first before any operator logic
    let offset = 0;
    const DEFAULT_PAGE_SIZE = CONFIG.MAX_PLANS_TO_SHOW;

    if (isShowMoreIntent && paginationContext?.parameters?.offset) {
      offset = paginationContext.parameters.offset;
    }

    // For show more intent, preserve the original operator from pagination context
    // BUT override if user explicitly mentions a different operator in the query
    if (isShowMoreIntent && paginationContext?.parameters?.originalOperator) {
      // Check if user is requesting a different operator in the query
      let newOperatorFromQuery = null;
      if (queryText.includes('jio') || queryText.includes('geo')) newOperatorFromQuery = 'jio';
      else if (queryText.includes('airtel') || queryText.includes('artel')) newOperatorFromQuery = 'airtel';
      else if (queryText.includes('vi') || queryText.includes('vodafone') || queryText.includes('idea')) newOperatorFromQuery = 'vi';

      if (newOperatorFromQuery && newOperatorFromQuery !== paginationContext.parameters.originalOperator) {
        operator = newOperatorFromQuery;
        console.log("Override pagination context - new operator from query:", operator);
        // Reset offset since we're starting a new search
        offset = 0;
      } else {
        operator = paginationContext.parameters.originalOperator;
        console.log("Restored operator from pagination context:", operator);
      }
    } else if (operator) {
      correctedOperator = correctOperatorName(operator);
      if (correctedOperator && correctedOperator !== operator) {
        operatorCorrectionMessage = `(Assuming you meant ${correctedOperator.toUpperCase()} instead of ${operator.toUpperCase()}) `;
        operator = correctedOperator;
      }
    } else {
      // Try to extract operator from query text if not in params
      if (queryText.includes('jio') || queryText.includes('geo')) operator = 'jio';
      else if (queryText.includes('airtel') || queryText.includes('artel')) operator = 'airtel';
      else if (queryText.includes('vi') || queryText.includes('vodafone') || queryText.includes('idea')) operator = 'vi';
    }

    console.log('Selected operator:', operator);

    // Handle "skip filter" queries - allow users to bypass operator/budget requirements
    const skipFilters = queryText.includes('show all plans') || 
                       queryText.includes('any operator') || 
                       queryText.includes('no budget') ||
                       queryText.includes('skip filters') ||
                       queryText.includes('view everything');

    // Fallback: If both operator and budget are missing and it's not a show more intent or skip filter request
    if (!operator && !budget && !isShowMoreIntent && !skipFilters) {
      return res.json({
        fulfillmentText: `To help you better, please tell me your preferred operator (like Jio, Airtel, or Vi) and your budget (e.g., under ₹300).\n\nOr just say "show all plans" to skip filters and view everything.`
      });
    }

    // Check if requested operator is available
    let missingOperatorMessage = '';
    if (operator && !AVAILABLE_OPERATORS.includes(operator)) {
      missingOperatorMessage = `Note: I don't have information on ${operator.toUpperCase()} plans. `;
      operator = null; // Reset to show all operators
    }

    // Plan type detection (prepaid/postpaid)
    let planType = params.plan_type?.toLowerCase();

    // For show more intent, preserve the original plan type from pagination context
    if (isShowMoreIntent && paginationContext?.parameters?.originalPlanType) {
      planType = paginationContext.parameters.originalPlanType;
      console.log("Restored plan type from pagination context:", planType);
    } else if (!planType) {
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

    // Check for specific feature requests
    const requestedFeatures = [];
    if (queryText.includes('international roaming')) {
      requestedFeatures.push('international roaming');
    }
    if (queryText.includes('ott')) {
      requestedFeatures.push('ott');
    }
    if (queryText.includes('amazon prime') || queryText.includes('prime video')) {
      requestedFeatures.push('amazon prime');
    }
    if (queryText.includes('netflix')) {
      requestedFeatures.push('netflix');
    }
    if (queryText.includes('hotstar')) {
      requestedFeatures.push('hotstar');
    }

    console.log('Requested features:', requestedFeatures);

    // Check if user is requesting voice-only or calling-only plans
    let isVoiceOnly = queryText.includes('voice only') || 
                     queryText.includes('voice-only') || 
                     queryText.includes('calling only') || 
                     queryText.includes('call only') ||
                     queryText.includes('calling-only') ||
                     (queryText.includes('only') && queryText.includes('call') && !queryText.includes('data')) ||
                     (queryText.includes('only') && queryText.includes('voice') && !queryText.includes('data'));

    // Only override if not already specified
    if (!targetDuration && inference.inferredTargetDuration) {
      targetDuration = inference.inferredTargetDuration;
      console.log("🔍 Inferred duration:", targetDuration);
    }

    if (!isVoiceOnly && inference.inferredVoiceOnly) {
      isVoiceOnly = true;
      console.log("🔍 Inferred voice-only requirement");
    }

    if (!minDailyData && inference.inferredMinDailyData) {
      minDailyData = inference.inferredMinDailyData;
      console.log("🔍 Inferred min daily data:", minDailyData);
    }

    if (inference.inferredFeatures.length > 0) {
      inference.inferredFeatures.forEach(f => {
        if (!requestedFeatures.includes(f)) requestedFeatures.push(f);
      });
      console.log("🔍 Inferred features:", inference.inferredFeatures);
    }

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

    console.log("OFFSET USED:", offset);

    // Build a cache key using key parameters
    const cacheKey = JSON.stringify({
      queryText,
      operator,
      planType,
      budget,
      duration: targetDuration,
      offset,
      isShowMoreIntent,
      requestedFeatures: requestedFeatures.sort(), // Sort to ensure consistent ordering
      isVoiceOnly,
      minDailyData,
      sortBy
    });

    // Check smart response cache
    const cachedResponse = getSmartCache(cacheKey);
    if (cachedResponse) {
      console.log("✅ Serving from smart cache");
      // Update timestamp in metadata for cache hit
      if (cachedResponse.metadata) {
        cachedResponse.metadata.timestamp = new Date().toISOString();
        cachedResponse.metadata.fromCache = true;
      }
      return res.json(cachedResponse);
    }

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

    // Filter plans by minimum daily data if requested
    if (minDailyData) {
      plans = plans.filter(plan => {
        const dataAmount = parseDataAllowance(plan.data);
        if (!dataAmount) return false; // Exclude plans with no data or unparseable data

        // Get validity in days
        const validityDays = parseValidity(plan.validity) || 1;

        // Calculate daily data (total data divided by validity)
        const dailyData = dataAmount / validityDays;

        return dailyData >= minDailyData;
      });

      console.log(`After daily data filtering, ${plans.length} plans remain`);
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

    // Helper function to check if a plan has a specific feature
    function hasFeature(plan, feature) {
      if (!plan || !feature) return false;
      const searchText = [plan.benefits, plan.additional_benefits, plan.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchText.includes(feature.toLowerCase());
    }

    // Initialize arrays for feature tracking
    const availableFeatures = [];
    const unavailableFeatures = [];

    // Add international roaming to requested features if query contains it
    if (queryText.includes('international') && queryText.includes('roaming')) {
      requestedFeatures.push('international roaming');
    }

    // Smart plan ranking function
    function calculatePlanScore(plan) {
      let score = 0;
      const planPrice = typeof plan.price === 'string' ? parseInt(plan.price.replace(/[^0-9]/g, '')) : plan.price;
      const dataAmount = parseDataAllowance(plan.data) || 0;
      const validityDays = parseValidity(plan.validity) || 28;

      // Price-to-data ratio (lower is better)
      if (dataAmount > 0) {
        score += (dataAmount / planPrice) * 100;
      }

      // Validity bonus
      score += validityDays * 0.1;

      // Feature bonuses
      if (hasFeature(plan, 'unlimited')) score += 50;
      if (hasFeature(plan, 'ott')) score += 20;
      if (hasFeature(plan, 'roaming')) score += 15;

      return score;
    }

    // Filter plans based on requested features
    if (requestedFeatures.length > 0) {
      const plansWithFeatures = filtered.filter(plan => 
        requestedFeatures.every(feature => hasFeature(plan, feature))
      );

      // Check which features are available/unavailable
      requestedFeatures.forEach(feature => {
        if (filtered.some(plan => hasFeature(plan, feature))) {
          availableFeatures.push(feature);
        } else {
          unavailableFeatures.push(feature);
        }
      });

      if (plansWithFeatures.length === 0) {
        // If no plans have all requested features, return early with a message
        responseText = `No ${operator ? operator.toUpperCase() + ' ' : ''}${planType.toUpperCase()} plans found with ${requestedFeatures.join(' and ')}.`;
        console.log('Response:', responseText);
        return res.json({ fulfillmentText: responseText });
      }

      // Update filtered plans to only include those with all requested features
      filtered = plansWithFeatures;
    }

    // Special handling for international roaming query
    const isInternationalQuery = queryText.toLowerCase().includes('international');
    if (isInternationalQuery) {
      const internationalPlans = filtered.filter(plan => {
        const planText = [plan.benefits, plan.additional_benefits, plan.description]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return planText.includes('international roaming') || 
               planText.includes('iro') || 
               planText.includes('international call') ||
               planText.includes('global roaming');
      });

      if (internationalPlans.length === 0) {
        responseText = `No ${operator ? operator.toUpperCase() + ' ' : ''}international roaming plans found. Please check the operator's website or customer care for international roaming activation and rates.`;
        return res.json({ fulfillmentText: responseText });
      }
      filtered = internationalPlans;
    }



    // Slice plans based on offset
    const plansToShow = filtered.slice(offset, offset + DEFAULT_PAGE_SIZE);

    console.log("PLANS RETURNED:", plansToShow.length);

    let responseText = '';

    // Check which features are available/unavailable
    if (unavailableFeatures.length > 0) {
      responseText += `Note: None of these plans include ${unavailableFeatures.join(' or ')}.\n\n`;
    }

    if (plansToShow.length > 0) {
      // Include budget in the response if specified
      const budgetText = budget ? ` under ₹${budget}` : '';

      // Add voice-only to the description if requested
      const voiceText = isVoiceOnly ? ' VOICE-ONLY' : '';

      // Add sorting information if specified
      const sortText = sortBy === 'price' ? ' (cheapest first)' : 
                      sortBy === 'value' ? ' (best value first)' : '';

      responseText += `Here are ${operator ? operator.toUpperCase() + ' ' : ''}${planType.toUpperCase()}${voiceText} plans${budgetText}${targetDuration ? ' with ' + targetDuration + ' days validity' : ''}${sortText}:\n\n` +
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

      // Add dynamic pagination message
      if (filtered.length > DEFAULT_PAGE_SIZE) {
        const startIndex = offset + 1;
        const endIndex = Math.min(offset + plansToShow.length, filtered.length);
        const hasMore = filtered.length > offset + DEFAULT_PAGE_SIZE;

        if (offset === 0) {
          responseText += `\n\n(Showing first ${plansToShow.length} of ${filtered.length} available plans)`;
        } else {
          responseText += `\n\n(Showing ${startIndex}-${endIndex} of ${filtered.length} available plans)`;
        }

        if (hasMore) {
          responseText += ` - Ask for "more" to see additional plans.`;
        }
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

          responseText += `No exact ${operator ? operator.toUpperCase() + ' ' : ''}${planType.toUpperCase()}${voiceText} plans with ${targetDuration} days validity${budgetText} found. Here are some alternatives:\n\n` +
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

          responseText += `No matching ${operator ? operator.toUpperCase() + ' ' : ''}${planType.toUpperCase()}${voiceText} plans found with ${targetDuration} days validity${budgetText}. Try adjusting your filters.`;
        }
      } else if (budget && plans.length > 0) {
        // If we're just filtering by budget and nothing matches
        // Add voice-only to the description if requested
        const voiceText = isVoiceOnly ? ' VOICE-ONLY' : '';

        responseText += `No ${operator ? operator.toUpperCase() + ' ' : ''}${planType.toUpperCase()}${voiceText} plans found under ₹${budget}. The cheapest available plan is ₹${Math.min(...plans.map(p => p.price))}.`;
      } else if (plans.length > 0) {
        // If we have no plans matching filters but we have plans for this operator and type
        const budgetText = budget ? ` under ₹${budget}` : '';
        // Add voice-only to the description if requested
        const voiceText = isVoiceOnly ? ' VOICE-ONLY' : '';

        responseText += `No matching ${operator ? operator.toUpperCase() + ' ' : ''}${planType.toUpperCase()}${voiceText} plans found${targetDuration ? ' with ' + targetDuration + ' days validity' : ''}${budgetText}.`;
        if (targetDuration || budget) {
          responseText += ' Try adjusting your filters.';
        }
      } else {
        // If no plans found for this operator and type
        // Add voice-only to the description if requested
        const voiceText = isVoiceOnly ? ' VOICE-ONLY' : '';

        responseText += `No ${planType.toUpperCase()}${voiceText} plans available for ${operator ? operator.toUpperCase() : 'any operator'}. Would you like to check ${planType === 'prepaid' ? 'postpaid' : 'prepaid'} plans instead?`;
      }
    }

    // Get GPT recommendation if we have plans to show
    if (plansToShow.length > 0) {
      const gptPrompt = `
User is searching for ${operator ? operator.toUpperCase() : "ANY"} ${planType.toUpperCase()} plans.
Their preferences:
- Budget: ${budget || "Not specified"}
- Duration: ${targetDuration ? `${targetDuration} days` : "Any"}
- Voice only: ${isVoiceOnly ? "Yes" : "No"}
- Special features: ${requestedFeatures.length > 0 ? requestedFeatures.join(', ') : "None"}

Here are the filtered plans:

${plansToShow.map(p => {
  const validity = p.validity ? `(${p.validity})` : '';
  const benefits = [p.benefits, p.additional_benefits].filter(Boolean).join(', ');
  return `• ₹${p.price}: ${p.data} ${validity}${benefits ? ' - ' + benefits : ''}`;
}).join('\n')}
`;

      let gptResponse = await getGPTRecommendation(gptPrompt);

      if (!gptResponse) {
        // GPT failed or quota exceeded
        gptResponse = `Here are some options that might suit you well. If you're looking for something more specific like OTT benefits or a budget range, just ask! 😊`;
      }

      responseText = gptResponse;
    } else {
      // Handle case when no plans found and GPT might fail
      const gptPrompt = `User searched for ${operator ? operator.toUpperCase() : "ANY"} ${planType.toUpperCase()} plans but none were found matching their criteria.`;
      
      let gptResponse = await getGPTRecommendation(gptPrompt);
      
      if (!gptResponse) {
        responseText = `Hmm, I couldn't find any plans matching your filters right now 😕. Try relaxing the filters or asking for a different operator. I'm here to help!`;
      } else {
        responseText = gptResponse;
      }
    }

    // Set up output contexts for pagination
    let outputContexts = [];

    if (filtered.length > offset + DEFAULT_PAGE_SIZE) {
      outputContexts.push({
        name: `${session}/contexts/pagination`,
        lifespanCount: 5,
        parameters: {
          offset: offset + DEFAULT_PAGE_SIZE,
          originalOperator: operator,
          originalPlanType: planType,
          originalBudget: budget,
          originalDuration: targetDuration
        }
      });
    }

    // Format response with metadata and pagination
    const response = {
      fulfillmentText: responseText,
      outputContexts,
      metadata: {
        timestamp: new Date().toISOString(),
        planCount: plansToShow.length,
        pageOffset: offset,
        totalAvailable: filtered.length,
        operator: operator || 'all',
        planType: planType,
        cached: cachedPlans !== null
      }
    };

    console.log('Response:', responseText);
    console.log('Metadata:', response.metadata);

    // Save response in smart cache (store the simple format)
    const cacheResponse = outputContexts.length > 0 ? 
      { fulfillmentText: responseText, outputContexts: outputContexts } :
      { fulfillmentText: responseText };
    setSmartCache(cacheKey, cacheResponse);
    console.log("💾 Response saved to smart cache");

    res.json(response);

  } catch (error) {
    console.error('Webhook error:', error);

    // If we have a user query and no critical error, try GPT fallback
    if (req.body?.queryResult?.queryText && !error.message.includes('Request timed out')) {
      try {
        const fallbackReply = await getGPTFallbackResponse(req.body.queryResult.queryText);
        return res.json({ fulfillmentText: fallbackReply });
      } catch (fallbackError) {
        console.error('GPT fallback also failed:', fallbackError.message);
      }
    }
    console.error('Webhook error:', error);

    // Provide specific error messages based on error type
    let userMessage = 'Sorry, we encountered an error. Please try again later.';

    if (error.message.includes('Request timed out')) {
      userMessage = 'Our plan data service is responding slowly. Please try again in a moment.';
    } else if (error.message.includes('Unable to connect')) {
      userMessage = 'We\'re having trouble accessing our plan database. Please try again shortly.';
    } else if (error.message.includes('Data fetch failed')) {
      userMessage = 'Our plan data is temporarily unavailable. Please try again in a few minutes.';
    } else if (error.message.includes('HTTP 429') || error.message.includes('rate limit')) {
      userMessage = 'We\'re experiencing high traffic. Please wait a moment and try again.';
    } else if (error.message.includes('HTTP 5')) {
      userMessage = 'Our data provider is experiencing issues. Please try again shortly.';
    }

    res.json({ 
      fulfillmentText: userMessage,
      metadata: {
        error: true,
        timestamp: new Date().toISOString(),
        cached: cachedPlans !== null
      }
    });
  }
});

// Enhanced logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', {
    error: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
    url: req.url,
    method: req.method
  });

  res.status(500).json({ 
    fulfillmentText: 'Sorry, we encountered a server error. Please try again later.',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});