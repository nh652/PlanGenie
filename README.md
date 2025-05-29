
# Telecom Plan Suggestion API

A robust webhook service that provides intelligent telecom plan recommendations based on user queries. Built with Express.js and designed for integration with chatbots and voice assistants.

## Features

- **Smart Plan Matching**: Finds optimal plans based on budget, duration, and data requirements
- **Multi-Operator Support**: Supports Jio, Airtel, and VI (Vodafone Idea)
- **Intelligent Parsing**: Handles natural language queries with spelling correction
- **Comprehensive Filtering**: Filter by voice-only, international roaming, OTT benefits
- **Rate Limiting & Security**: Built-in protection against abuse and attacks
- **Health Monitoring**: Complete health checks and performance metrics
- **Structured Logging**: Winston-based logging with log rotation
- **Input Validation**: Joi schema validation with XSS protection
- **Error Handling**: Graceful error handling with retry logic
- **Comprehensive Testing**: Unit and integration tests with Jest

## Tech Stack

- **Runtime**: Node.js with ES6 modules
- **Framework**: Express.js
- **Validation**: Joi
- **Security**: Helmet, XSS protection, Rate limiting
- **Logging**: Winston with daily log rotation
- **Testing**: Jest with Supertest
- **Documentation**: JSDoc

## API Endpoints

### Main Endpoints
- `POST /webhook` - Main webhook for plan recommendations
- `GET /health` - Complete health status
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe
- `GET /metrics` - Performance metrics
- `GET /` - API status

## Quick Start

### Prerequisites
- Node.js 18+ (recommended: 22.x)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd telecom-plan-api
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start the development server**
   ```bash
   npm start
   ```

5. **Run tests**
   ```bash
   npm test
   ```

The API will be available at `http://localhost:3000`

## Environment Configuration

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# External API
JSON_URL=https://raw.githubusercontent.com/nh652/TelcoPlans/main/telecom_plans_improved.json

# Cache Settings
CACHE_DURATION=3600000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
WEBHOOK_RATE_LIMIT_MAX=30

# Security
REQUEST_TIMEOUT_MS=30000
REQUEST_SIZE_LIMIT=1mb

# Logging
LOG_LEVEL=info
LOG_FILE_MAX_SIZE=20m
LOG_MAX_FILES=14d
```

## Usage Examples

### Basic Plan Query
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "queryResult": {
      "queryText": "Show me Jio prepaid plans under 500 rupees",
      "parameters": {
        "operator": "jio",
        "budget": 500
      }
    }
  }'
```

### Duration-Based Query
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "queryResult": {
      "queryText": "Find Airtel plans with 28 days validity",
      "parameters": {
        "operator": "airtel",
        "duration": "28 days"
      }
    }
  }'
```

### Voice-Only Plans
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "queryResult": {
      "queryText": "Show me voice only plans for VI"
    }
  }'
```

## Project Structure

```
telecom-plan-api/
├── config/
│   └── constants.js          # Application configuration
├── middleware/
│   ├── errorHandler.js       # Global error handling
│   ├── logging.js           # Request/response logging
│   ├── security.js          # Security middleware
│   └── validation.js        # Input validation
├── services/
│   ├── healthService.js     # Health check service
│   └── planService.js       # Plan processing service
├── utils/
│   ├── errors.js            # Custom error classes
│   ├── logger.js            # Winston logger configuration
│   ├── responseGenerator.js # Response formatting
│   └── textParser.js        # Text parsing utilities
├── tests/
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── mocks/             # Test data
├── logs/                  # Log files (auto-generated)
├── index.js              # Main application entry point
├── package.json          # Dependencies and scripts
└── README.md            # This file
```

## Development

### Available Scripts

```bash
# Start the application
npm start

# Start with production settings
npm run start:secure

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration
```

### Adding New Features

1. **Create feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Add your changes**
   - Write code with JSDoc comments
   - Add corresponding tests
   - Update documentation

3. **Run tests**
   ```bash
   npm test
   ```

4. **Submit pull request**

## API Documentation

### Webhook Request Format

```json
{
  "queryResult": {
    "queryText": "string",
    "parameters": {
      "operator": "string (optional)",
      "budget": "number (optional)",
      "duration": "string|number (optional)",
      "plan_type": "string (optional)"
    },
    "intent": {
      "displayName": "string (optional)"
    }
  }
}
```

### Response Format

```json
{
  "fulfillmentText": "string"
}
```

### Error Response Format

```json
{
  "fulfillmentText": "string",
  "error": {
    "code": "string",
    "message": "string"
  }
}
```

## Monitoring & Health Checks

### Health Check Endpoints

- **`GET /health`**: Complete health status with external API check
- **`GET /health/live`**: Basic liveness check
- **`GET /health/ready`**: Readiness check with dependencies
- **`GET /metrics`**: Performance metrics and statistics

### Health Check Response Example

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "production",
  "checks": {
    "external_api": {
      "status": "healthy",
      "responseTime": 120,
      "lastChecked": "2024-01-15T10:30:00.000Z"
    },
    "memory": {
      "status": "healthy",
      "usage": {
        "used": "45.2 MB",
        "free": "78.8 MB",
        "total": "124.0 MB"
      }
    }
  }
}
```

## Security Features

- **Rate Limiting**: Per-IP rate limiting with different tiers
- **Input Validation**: Joi schema validation for all inputs
- **XSS Protection**: Input sanitization to prevent XSS attacks
- **Request Size Limits**: Configurable request body size limits
- **Timeout Protection**: Request timeout handling
- **Security Headers**: Helmet.js security headers
- **Error Handling**: Secure error responses without sensitive data

## Performance

- **Caching**: In-memory caching of external API responses
- **Connection Pooling**: Efficient HTTP connection management
- **Response Compression**: Gzip compression for responses
- **Graceful Shutdown**: Proper cleanup on application termination

## Logging

Structured logging with Winston:

- **Console**: Development logging
- **File Rotation**: Daily log files with size limits
- **Log Levels**: error, warn, info, debug
- **Request Tracking**: Unique request IDs for tracing
- **Performance Metrics**: Response time logging

Log files are stored in `./logs/` directory:
- `error.log`: Error-level logs only
- `combined.log`: All log levels
- `app-YYYY-MM-DD.log`: Daily rotated application logs

## Testing

### Test Coverage

- **Unit Tests**: Individual function testing
- **Integration Tests**: End-to-end API testing
- **Mock Data**: Realistic test datasets
- **Coverage Reports**: Detailed coverage analysis

### Running Specific Tests

```bash
# Test specific file
npm test -- textParser.test.js

# Test with verbose output
npm test -- --verbose

# Test with coverage
npm test -- --coverage
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Ensure all tests pass
5. Submit a pull request

### Code Style

- Use ES6+ features
- Follow JSDoc conventions
- Write descriptive commit messages
- Maintain test coverage above 80%

## Deployment on Replit

This API is optimized for deployment on Replit:

1. **Fork the Repl**
2. **Configure Environment Variables** in Replit Secrets
3. **Use the Deploy Button** for autoscale deployment
4. **Monitor** using built-in health checks

### Replit Configuration

- **Run Command**: `node index.js`
- **Port**: 3000 (automatically forwarded)
- **Environment**: Set `NODE_ENV=production`

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Check the [Issues](link-to-issues) page
- Review the API documentation
- Check logs in `./logs/` directory

## Changelog

### Version 1.0.0
- Initial release with full API functionality
- Comprehensive test suite
- Production-ready security features
- Complete documentation
