
import Joi from 'joi';
import { ValidationError } from '../utils/errors.js';

// Validation schemas
export const webhookSchema = Joi.object({
  queryResult: Joi.object({
    queryText: Joi.string()
      .min(1)
      .max(500)
      .trim()
      .required()
      .messages({
        'string.empty': 'Query text cannot be empty',
        'string.max': 'Query text cannot exceed 500 characters',
        'any.required': 'Query text is required'
      }),
    parameters: Joi.object({
      operator: Joi.string()
        .valid('jio', 'airtel', 'vi', 'geo', 'artel', 'vodafone', 'idea', 'vodafone idea')
        .allow('')
        .optional(),
      plan_type: Joi.string()
        .valid('prepaid', 'postpaid')
        .allow('')
        .optional(),
      budget: Joi.alternatives()
        .try(
          Joi.string().pattern(/^\d+$/).max(10),
          Joi.number().integer().min(1).max(999999)
        )
        .optional(),
      duration: Joi.alternatives()
        .try(
          Joi.string().pattern(/^\d+$/).max(10),
          Joi.number().integer().min(1).max(9999)
        )
        .optional()
    }).optional().default({}),
    intent: Joi.object().optional(),
    languageCode: Joi.string().optional(),
    fulfillmentText: Joi.string().optional()
  }).required(),
  originalDetectIntentRequest: Joi.object().optional(),
  session: Joi.string().optional(),
  responseId: Joi.string().optional()
});

// Validation middleware factory
export function validateRequest(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: false
    });

    if (error) {
      const errorMessages = error.details.map(detail => detail.message);
      const validationError = new ValidationError(`Validation failed: ${errorMessages.join(', ')}`);
      return next(validationError);
    }

    // Replace request body with validated and sanitized value
    req.body = value;
    next();
  };
}

// Additional validation helpers
export function validateQueryLength(req, res, next) {
  const queryText = req.body?.queryResult?.queryText || '';
  
  if (queryText.length > 500) {
    return next(new ValidationError('Query text exceeds maximum length of 500 characters'));
  }
  
  if (queryText.trim().length === 0) {
    return next(new ValidationError('Query text cannot be empty'));
  }
  
  next();
}

// Sanitize special characters that could be problematic
export function sanitizeInput(req, res, next) {
  if (req.body?.queryResult?.queryText) {
    // Remove potentially dangerous characters but keep normal punctuation
    req.body.queryResult.queryText = req.body.queryResult.queryText
      .replace(/[<>]/g, '') // Remove HTML brackets
      .replace(/[{}]/g, '') // Remove curly braces
      .replace(/[\[\]]/g, '') // Remove square brackets
      .replace(/[`]/g, '') // Remove backticks
      .trim();
  }
  
  next();
}
