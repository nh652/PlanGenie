
import { TelecomAPIError } from '../utils/errors.js';
import { logError, logWarn } from '../utils/logger.js';
import { healthService } from '../services/healthService.js';

// Rate limit error handler
export function handleRateLimitError(req, res, next) {
  logWarn('Rate limit exceeded', {
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    url: req.originalUrl,
    retryAfter: req.rateLimit?.resetTime
  });

  res.status(429).json({
    fulfillmentText: 'Too many requests. Please try again later.',
    error: {
      code: 'RATE_LIMIT_ERROR',
      message: 'Rate limit exceeded',
      retryAfter: req.rateLimit?.resetTime || 'unknown'
    }
  });
}

// Global error handling middleware
export function errorHandler(err, req, res, next) {
  // Increment error counter for health metrics
  healthService.incrementErrorCount();

  logError('Request error occurred', err, {
    requestId: req.requestId,
    url: req.url,
    method: req.method,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    body: req.path === '/webhook' ? req.body : 'redacted'
  });

  // Handle known custom errors
  if (err instanceof TelecomAPIError) {
    return res.status(err.statusCode).json({
      fulfillmentText: err.message,
      error: {
        code: err.errorCode,
        message: err.message
      }
    });
  }

  // Handle specific Node.js errors
  if (err.code === 'ECONNREFUSED') {
    return res.status(503).json({
      fulfillmentText: 'Service temporarily unavailable. Please try again later.',
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'External service connection failed'
      }
    });
  }

  if (err.name === 'SyntaxError' && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      fulfillmentText: 'Invalid request format.',
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must be valid JSON'
      }
    });
  }

  // Handle timeout errors
  if (err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
    return res.status(504).json({
      fulfillmentText: 'Request timeout. Please try again.',
      error: {
        code: 'TIMEOUT_ERROR',
        message: 'Request took too long to process'
      }
    });
  }

  // Default error response
  res.status(500).json({
    fulfillmentText: 'Sorry, we encountered an error. Please try again later.',
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    }
  });
}

// Async error wrapper for route handlers
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Request validation middleware
export function validateWebhookRequest(req, res, next) {
  try {
    // Check if request body exists
    if (!req.body) {
      throw new ValidationError('Request body is required');
    }

    // Check if queryResult exists
    if (!req.body.queryResult) {
      throw new ValidationError('queryResult is required in request body');
    }

    // Validate that queryResult has the expected structure
    const { queryResult } = req.body;
    
    if (typeof queryResult !== 'object') {
      throw new ValidationError('queryResult must be an object');
    }

    // Set defaults if missing
    req.body.queryResult = {
      parameters: {},
      queryText: '',
      ...queryResult
    };

    next();
  } catch (error) {
    next(error);
  }
}
