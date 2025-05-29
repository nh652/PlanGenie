import express from 'express';
import bodyParser from 'body-parser';
import { CONFIG } from './config/constants.js';
import { 
  correctOperatorName, 
  extractOperatorFromQuery,
  extractDailyDataFromQuery,
  processDurationParameter,
  processBudgetParameter
} from './utils/textParser.js';
import {
  getPlansForOperator,
  filterVoiceOnlyPlans,
  filterByDailyData,
  filterPlansByConstraints,
  filterPlansByFeatures,
  filterInternationalPlans,
  findSimilarPlans,
  checkFeatureAvailability
} from './services/planService.js';
import { 
  errorHandler, 
  asyncHandler, 
  validateWebhookRequest 
} from './middleware/errorHandler.js';
import { 
  webhookSchema, 
  validateRequest, 
  sanitizeInput 
} from './middleware/validation.js';
import {
  rateLimiter,
  webhookRateLimiter,
  speedLimiter,
  securityHeaders,
  xssProtection,
  requestTimeout
} from './middleware/security.js';
import { 
  ValidationError, 
  OperatorNotSupportedError,
  PlanNotFoundError 
} from './utils/errors.js';

const app = express();

// Trust proxy for rate limiting (important for production)
app.set('trust proxy', 1);

// Security headers
app.use(securityHeaders);

// Global rate limiting and speed limiting
app.use(rateLimiter);
app.use(speedLimiter);

// Request timeout
app.use(requestTimeout(30000));

// XSS protection
app.use(xssProtection);

// Body parser with security limits
app.use(bodyParser.json({ 
  limit: '1mb', // Reduced from 10mb for security
  strict: true,
  verify: (req, res, buf) => {
    // Additional verification can be added here
    if (buf.length === 0) {
      throw new Error('Empty request body');
    }
  }
}));

// Request timeout middleware
app.use((req, res, next) => {
  req.setTimeout(30000); // 30 second timeout
  next();
});

const port = CONFIG.PORT;

// Root endpoint for Replit preview
app.get('/', (req, res) => {
  res.send('Telecom Plan Suggestion API is running');
});

// Main webhook endpoint with comprehensive validation and security
app.post('/webhook', 
  webhookRateLimiter, // Stricter rate limiting for webhook
  validateWebhookRequest, 
  validateRequest(webhookSchema), // Joi validation
  sanitizeInput, // Input sanitization
  asyncHandler(async (req, res) => {
  console.log('Received webhook request:', JSON.stringify(req.body));
  
  const { queryResult } = req.body;
  const params = queryResult.parameters || {};
  const queryText = (queryResult.queryText || '').toLowerCase();

  console.log('Parameters:', JSON.stringify(params));
  console.log('Query text:', queryText);

  // Validate query text length
  if (queryText.length > 500) {
    throw new ValidationError('Query text is too long (maximum 500 characters)');
  }

    // Handle conversational queries first
    const normalizedQuery = queryText.toLowerCase().trim();
    for (const [trigger, responses] of Object.entries(CONFIG.CONVERSATIONAL_RESPONSES)) {
      if (normalizedQuery.includes(trigger)) {
        // Return a random response from the available options
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        return res.json({ fulfillmentText: randomResponse });
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
    const minDailyData = extractDailyDataFromQuery(queryText);

    // Extract duration
    const targetDuration = processDurationParameter(params, queryText);

    // Operator extraction with spelling correction
    let operator = params.operator?.toLowerCase();
    let correctedOperator = null;
    let operatorCorrectionMessage = '';

    if (operator) {
      correctedOperator = correctOperatorName(operator);
      if (correctedOperator && correctedOperator !== operator) {
        operatorCorrectionMessage = `(Assuming you meant ${correctedOperator.toUpperCase()} instead of ${operator.toUpperCase()}) `;
        operator = correctedOperator;
      }
    } else {
      // Try to extract operator from query text if not in params
      operator = extractOperatorFromQuery(queryText);
    }

    console.log('Selected operator:', operator);

    // Check if requested operator is available
    let missingOperatorMessage = '';
    if (operator && !CONFIG.AVAILABLE_OPERATORS.includes(operator)) {
      // For unsupported operators, we'll set a note but continue
      missingOperatorMessage = `Note: I don't have information on ${operator.toUpperCase()} plans. `;
      operator = null; // Reset to show all operators
    }

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
    const isVoiceOnly = queryText.includes('voice only') || 
                       queryText.includes('voice-only') || 
                       queryText.includes('calling only') || 
                       queryText.includes('call only') ||
                       queryText.includes('calling-only') ||
                       (queryText.includes('only') && queryText.includes('call') && !queryText.includes('data')) ||
                       (queryText.includes('only') && queryText.includes('voice') && !queryText.includes('data'));

    console.log('Voice-only plan requested:', isVoiceOnly);

    // Extract budget
    const budget = processBudgetParameter(params, queryText);
    console.log('Extracted budget:', budget);

    // Get plans data with error handling
    let plans;
    try {
      plans = await getPlansForOperator(operator, planType);
    } catch (error) {
      if (error instanceof PlanNotFoundError) {
        // Handle case where no plans are found for the specified criteria
        const responseText = `${missingOperatorMessage}${error.message}. Try adjusting your search criteria or checking other operators.`;
        return res.json({ fulfillmentText: responseText });
      }
      // Re-throw other errors to be handled by global error handler
      throw error;
    }

    // Validate that plans is an array
    if (!Array.isArray(plans)) {
      throw new Error('Invalid plans data format received');
    }

    // Log some sample plans for debugging
    if (plans.length > 0) {
      console.log('Sample plan data:');
      console.log(JSON.stringify(plans.slice(0, 2)));
    }

    // Filter plans by voice-only if requested
    if (isVoiceOnly) {
      const voicePlans = filterVoiceOnlyPlans(plans);
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
      plans = filterByDailyData(plans, minDailyData);
      console.log(`After daily data filtering, ${plans.length} plans remain`);
    }

    // Filter plans by constraints
    let filtered = filterPlansByConstraints(plans, targetDuration, budget);
    console.log(`Filtered to ${filtered.length} matching plans`);

    // Initialize arrays for feature tracking
    let availableFeatures = [];
    let unavailableFeatures = [];

    // Add international roaming to requested features if query contains it
    if (queryText.includes('international') && queryText.includes('roaming')) {
      requestedFeatures.push('international roaming');
    }

    // Filter plans based on requested features
    if (requestedFeatures.length > 0) {
      const plansWithFeatures = filterPlansByFeatures(filtered, requestedFeatures);

      // Check which features are available/unavailable
      const featureCheck = checkFeatureAvailability(filtered, requestedFeatures);
      availableFeatures = featureCheck.availableFeatures;
      unavailableFeatures = featureCheck.unavailableFeatures;

      if (plansWithFeatures.length === 0) {
        // If no plans have all requested features, return early with a message
        const responseText = `No ${operator ? operator.toUpperCase() + ' ' : ''}${planType.toUpperCase()} plans found with ${requestedFeatures.join(' and ')}.`;
        console.log('Response:', responseText);
        return res.json({ fulfillmentText: responseText });
      }

      // Update filtered plans to only include those with all requested features
      filtered = plansWithFeatures;
    }

    // Special handling for international roaming query
    const isInternationalQuery = queryText.toLowerCase().includes('international') || queryText.toLowerCase().includes('roaming');
    if (isInternationalQuery) {
      const internationalPlans = filterInternationalPlans(filtered);

      filtered = internationalPlans;

      if (filtered.length === 0) {
        const responseText = `No ${operator ? operator.toUpperCase() + ' ' : ''}international roaming plans found. Please check the operator's website or customer care for international roaming activation and rates.`;
        return res.json({ fulfillmentText: responseText });
      }
    }

    // Limit number of plans to prevent response from being too long
    const plansToShow = filtered.slice(0, CONFIG.MAX_PLANS_TO_SHOW);

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

      // Add note if results were limited
      if (filtered.length > CONFIG.MAX_PLANS_TO_SHOW) {
        responseText += `\n\n(Showing ${CONFIG.MAX_PLANS_TO_SHOW} out of ${filtered.length} available plans)`;
      }
    } else {
      // Add a fallback that shows plans with similar validity if nothing matches exactly
      if (targetDuration && plans.length > 0) {
        // Try to find plans with similar validity that also meet budget constraints
        const similarPlans = findSimilarPlans(plans, targetDuration, budget);

        if (similarPlans.length > 0) {
          const budgetText = budget ? ` under ₹${budget}` : '';
          // Add voice-only to the description if requested
          const voiceText = isVoiceOnly ? ' VOICE-ONLY' : '';

          responseText += `No exact ${operator ? operator.toUpperCase() + ' ' : ''}${planType.toUpperCase()}${voiceText} plans with ${targetDuration} days validity${budgetText} found. Here are some alternatives:\n\n` +
            similarPlans.map(plan => {
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

    console.log('Response:', responseText);
    res.json({ fulfillmentText: responseText });
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Handle 404 for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    fulfillmentText: 'Endpoint not found',
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.originalUrl} not found`
    }
  });
});

// Global error handling middleware (must be last)
app.use(errorHandler);

// Start server with error handling
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use`);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});