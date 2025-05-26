
// Custom error classes for the telecom API
export class TelecomAPIError extends Error {
  constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class PlanNotFoundError extends TelecomAPIError {
  constructor(message = 'No plans found matching your criteria') {
    super(message, 404, 'PLAN_NOT_FOUND');
  }
}

export class ValidationError extends TelecomAPIError {
  constructor(message = 'Invalid request parameters') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class OperatorNotSupportedError extends TelecomAPIError {
  constructor(operator) {
    super(`Operator '${operator}' is not supported`, 400, 'OPERATOR_NOT_SUPPORTED');
  }
}

export class ExternalAPIError extends TelecomAPIError {
  constructor(message = 'Failed to fetch plans data') {
    super(message, 503, 'EXTERNAL_API_ERROR');
  }
}

export class RateLimitError extends TelecomAPIError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}
