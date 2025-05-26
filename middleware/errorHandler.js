
import { TelecomAPIError } from '../utils/errors.js';

// Global error handling middleware
export function errorHandler(err, req, res, next) {
  console.error('Error occurred:', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body
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
