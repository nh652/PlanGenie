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
import { responseGenerator } from './utils/responseGenerator.js';
import { logInfo, logError, logWarn, logDebug } from './utils/logger.js';
import { 
  requestIdMiddleware, 
  requestLogger, 
  errorLogger, 
  performanceMonitor 
} from './middleware/logging.js';
import { healthService } from './services/healthService.js';

const app = express();

// Trust proxy for rate limiting (important for production)
app.set('trust proxy', 1);

// Request ID middleware (must be first)
app.use(requestIdMiddleware);

// Security headers
app.use(securityHeaders);

// Request logging middleware
app.use(requestLogger);

// Performance monitoring
app.use(performanceMonitor);

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
    // Increment request counter for health metrics
    healthService.incrementRequestCount();

    logInfo('Received webhook request', {
      requestId: req.requestId,
      queryText: req.body.queryResult?.queryText,
      parameters: req.body.queryResult?.parameters,
      intent: req.body.queryResult?.intent?.displayName
    });

    const { queryResult } = req.body;
    const params = queryResult.parameters || {};
    const queryText = (queryResult.queryText || '').toLowerCase();

    logDebug('Processing webhook request', {
      requestId: req.requestId,
      parameters: params,
      queryText: queryText
    });

  // Validate query text length
  if (queryText.length > 500) {
    throw new ValidationError('Query text is too long (maximum 500 characters)');
  }

    // Handle conversational queries first
    const conversationalResponse = responseGenerator.generateConversationalResponse(queryText);
    if (conversationalResponse) {
      return res.json({ fulfillmentText: conversationalResponse });
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
    let originalOperator = operator;
    let correctedOperator = null;
    let missingOperator = null;

    if (operator) {
      correctedOperator = correctOperatorName(operator);
      if (correctedOperator && correctedOperator !== operator) {
        originalOperator = operator;
        operator = correctedOperator;
      }
    } else {
      // Try to extract operator from query text if not in params
      operator = extractOperatorFromQuery(queryText);
    }

    logDebug('Operator selection result', {
      requestId: req.requestId,
      selectedOperator: operator,
      originalOperator,
      correctedOperator
    });

    // Check if requested operator is available
    if (operator && !CONFIG.AVAILABLE_OPERATORS.includes(operator)) {
      // For unsupported operators, we'll set a note but continue
      missingOperator = operator;
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

    logDebug('Plan type selection', {
      requestId: req.requestId,
      planType
    });

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

    logDebug('Feature analysis', {
      requestId: req.requestId,
      requestedFeatures
    });

    // Check if user is requesting voice-only or calling-only plans
    const isVoiceOnly = queryText.includes('voice only') || 
                       queryText.includes('voice-only') || 
                       queryText.includes('calling only') || 
                       queryText.includes('call only') ||
                       queryText.includes('calling-only') ||
                       (queryText.includes('only') && queryText.includes('call') && !queryText.includes('data')) ||
                       (queryText.includes('only') && queryText.includes('voice') && !queryText.includes('data'));

    logDebug('Voice-only plan analysis', {
      requestId: req.requestId,
      isVoiceOnly
    });

    // Extract budget
    const budget = processBudgetParameter(params, queryText);
    logDebug('Budget extraction result', {
      requestId: req.requestId,
      budget
    });

    // Get plans data with error handling
    let plans;
    try {
      plans = await getPlansForOperator(operator, planType);
    } catch (error) {
      if (error instanceof PlanNotFoundError) {
        // Handle case where no plans are found for the specified criteria
        const responseParams = {
          plans: [],
          filteredPlans: [],
          queryText,
          operator,
          planType,
          missingOperator
        };
        const responseText = responseGenerator.generateResponse(responseParams) + '. Try adjusting your search criteria or checking other operators.';
        return res.json({ fulfillmentText: responseText });
      }
      // Re-throw other errors to be handled by global error handler
      throw error;
    }

    // Validate that plans is an array
    if (!Array.isArray(plans)) {
      throw new Error('Invalid plans data format received');
    }

    // Log plans data for debugging
    logInfo('Plans data retrieved', {
      requestId: req.requestId,
      operator,
      planType,
      totalPlans: plans.length,
      samplePlanNames: plans.slice(0, 3).map(p => p.name)
    });

    // Filter plans by voice-only if requested
    if (isVoiceOnly) {
      const voicePlans = filterVoiceOnlyPlans(plans);
      logInfo('Voice-only plans filtering', {
        requestId: req.requestId,
        voicePlansFound: voicePlans.length,
        totalPlans: plans.length
      });

      // Replace the plans array with filtered voice-only plans
      if (voicePlans.length > 0) {
        plans = voicePlans;
      } else {
        // If no specific voice-only plans found, we'll continue with all plans
        // but add a note in the response
        logWarn("No specific voice-only plans found, continuing with all plans", {
          requestId: req.requestId
        });
      }
    }

    // Filter plans by minimum daily data if requested
    if (minDailyData) {
      const originalCount = plans.length;
      plans = filterByDailyData(plans, minDailyData);
      logInfo('Daily data filtering applied', {
        requestId: req.requestId,
        minDailyData,
        originalCount,
        remainingPlans: plans.length
      });
    }

    // Filter plans by constraints
    let filtered = filterPlansByConstraints(plans, targetDuration, budget);
    logInfo('Constraints filtering applied', {
      requestId: req.requestId,
      targetDuration,
      budget,
      originalPlans: plans.length,
      filteredPlans: filtered.length
    });

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
        const responseParams = {
          plans,
          filteredPlans: [],
          queryText,
          operator,
          planType,
          requestedFeatures,
          missingOperator
        };
        const responseText = responseGenerator.generateResponse(responseParams);
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
        const responseParams = {
          plans,
          filteredPlans: [],
          queryText,
          operator,
          planType,
          isInternationalQuery: true,
          missingOperator
        };
        const responseText = responseGenerator.generateResponse(responseParams);
        return res.json({ fulfillmentText: responseText });
      }
    }

    // Prepare parameters for response generation
    const responseParams = {
      plans,
      filteredPlans: filtered,
      alternativePlans: [],
      queryText,
      operator,
      planType,
      budget,
      targetDuration,
      isVoiceOnly,
      sortBy,
      correctedOperator: originalOperator !== operator ? operator : null,
      originalOperator: originalOperator !== operator ? originalOperator : null,
      missingOperator,
      requestedFeatures,
      unavailableFeatures,
      isInternationalQuery
    };

    // If no exact matches found, try to find alternatives
    if (filtered.length === 0 && targetDuration && plans.length > 0) {
      responseParams.alternativePlans = findSimilarPlans(plans, targetDuration, budget);
    }

    // Generate response using ResponseGenerator
    const responseText = responseGenerator.generateResponse(responseParams);

    logInfo('Webhook response generated', {
      requestId: req.requestId,
      responseLength: responseText.length,
      finalPlanCount: filtered.length,
      alternativePlansCount: responseParams.alternativePlans?.length || 0
    });

    res.json({ fulfillmentText: responseText });
}));

// Comprehensive health check endpoint
app.get('/health', asyncHandler(async (req, res) => {
  const healthStatus = await healthService.getHealthStatus();
  const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(healthStatus);
}));

// Liveness probe (for Kubernetes/container orchestration)
app.get('/health/live', (req, res) => {
  const livenessStatus = healthService.getLivenessStatus();
  res.json(livenessStatus);
});

// Readiness probe (for Kubernetes/container orchestration)
app.get('/health/ready', asyncHandler(async (req, res) => {
  const readinessStatus = await healthService.getReadinessStatus();
  const statusCode = readinessStatus.status === 'ready' ? 200 : 503;
  res.status(statusCode).json(readinessStatus);
}));

// Metrics endpoint
app.get('/metrics', (req, res) => {
  const memory = healthService.getMemoryUsage();
  const cpu = healthService.getCPUUsage();

  res.json({
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory,
    cpu,
    requests: healthService.healthMetrics.requestCount,
    errors: healthService.healthMetrics.errorCount,
    errorRate: healthService.healthMetrics.requestCount > 0 
      ? (healthService.healthMetrics.errorCount / healthService.healthMetrics.requestCount) * 100 
      : 0
  });
});

// Handle 404 for undefined routes
app.use('*', (req, res) => {
  logWarn('Route not found', {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    fulfillmentText: 'Endpoint not found',
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.originalUrl} not found`
    }
  });
});

// Error logging middleware (before global error handler)
app.use(errorLogger);

// Global error handling middleware (must be last)
app.use(errorHandler);

// Start server with error handling
const server = app.listen(port, '0.0.0.0', () => {
  logInfo('Server started successfully', {
    port,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    pid: process.pid
  });
});

// Handle server errors
server.on('error', (error) => {
  logError('Server startup error', error, { port });
  if (error.code === 'EADDRINUSE') {
    logError(`Port ${port} is already in use`, error);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logInfo('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logInfo('Server closed gracefully');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logInfo('SIGINT received, shutting down gracefully');
  server.close(() => {
    logInfo('Server closed gracefully');
    process.exit(0);
  });
});