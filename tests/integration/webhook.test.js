
import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock all external dependencies
jest.mock('../../services/planService.js');
jest.mock('../../utils/logger.js');
jest.mock('../../services/healthService.js');

// Import mocked modules
import { getPlansForOperator } from '../../services/planService.js';
import { logInfo, logError, logDebug, logWarn } from '../../utils/logger.js';
import { healthService } from '../../services/healthService.js';
import { mockPlansData } from '../mocks/mockPlansData.js';

// Mock logger functions
logInfo.mockImplementation(() => {});
logError.mockImplementation(() => {});
logDebug.mockImplementation(() => {});
logWarn.mockImplementation(() => {});

// Mock health service
healthService.incrementRequestCount = jest.fn();
healthService.getHealthStatus = jest.fn().mockResolvedValue({
  status: 'healthy',
  timestamp: new Date().toISOString(),
  uptime: 100,
  externalAPI: { status: 'available' }
});
healthService.getLivenessStatus = jest.fn().mockReturnValue({
  status: 'alive',
  timestamp: new Date().toISOString()
});
healthService.getReadinessStatus = jest.fn().mockResolvedValue({
  status: 'ready',
  timestamp: new Date().toISOString()
});
healthService.getMemoryUsage = jest.fn().mockReturnValue({
  used: 50,
  total: 100
});
healthService.getCPUUsage = jest.fn().mockReturnValue(25);
healthService.healthMetrics = {
  requestCount: 100,
  errorCount: 5
};

describe('Webhook Integration Tests', () => {
  let app;

  beforeAll(async () => {
    // Import the app after mocking dependencies
    const appModule = await import('../../index.js');
    app = appModule.default || appModule.app;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementation for getPlansForOperator
    getPlansForOperator.mockImplementation(async (operator, planType) => {
      const plans = mockPlansData.telecom_providers.jio.plans.prepaid.data_plans;
      return plans.map(p => ({ ...p, provider: operator || 'jio' }));
    });
  });

  describe('POST /webhook', () => {
    const validWebhookPayload = {
      queryResult: {
        queryText: 'show me jio prepaid plans',
        parameters: {
          operator: 'jio',
          plan_type: 'prepaid'
        },
        intent: {
          displayName: 'get.plans'
        }
      }
    };

    test('should return 200 for valid webhook request', async () => {
      const response = await request(app)
        .post('/webhook')
        .send(validWebhookPayload)
        .expect(200);

      expect(response.body).toHaveProperty('fulfillmentText');
      expect(typeof response.body.fulfillmentText).toBe('string');
      expect(response.body.fulfillmentText.length).toBeGreaterThan(0);
    });

    test('should handle operator-specific queries', async () => {
      const payload = {
        queryResult: {
          queryText: 'airtel plans under 500',
          parameters: {
            operator: 'airtel',
            budget: 500
          }
        }
      };

      const response = await request(app)
        .post('/webhook')
        .send(payload)
        .expect(200);

      expect(response.body.fulfillmentText).toContain('AIRTEL');
      expect(getPlansForOperator).toHaveBeenCalledWith('airtel', 'prepaid');
    });

    test('should handle budget constraints', async () => {
      const payload = {
        queryResult: {
          queryText: 'plans under 200',
          parameters: {
            budget: 200
          }
        }
      };

      const response = await request(app)
        .post('/webhook')
        .send(payload)
        .expect(200);

      expect(response.body.fulfillmentText).toContain('₹');
    });

    test('should handle duration constraints', async () => {
      const payload = {
        queryResult: {
          queryText: 'plans with 28 days validity',
          parameters: {
            duration: {
              amount: 28,
              unit: 'day'
            }
          }
        }
      };

      const response = await request(app)
        .post('/webhook')
        .send(payload)
        .expect(200);

      expect(response.body.fulfillmentText).toContain('28');
    });

    test('should handle voice-only plan requests', async () => {
      getPlansForOperator.mockResolvedValue([
        {
          name: 'Voice Plan',
          price: '99',
          data: '0GB',
          validity: '28 days',
          benefits: 'Unlimited voice calls',
          provider: 'jio'
        }
      ]);

      const payload = {
        queryResult: {
          queryText: 'voice only plans',
          parameters: {}
        }
      };

      const response = await request(app)
        .post('/webhook')
        .send(payload)
        .expect(200);

      expect(response.body.fulfillmentText).toContain('VOICE-ONLY');
    });

    test('should handle international roaming requests', async () => {
      getPlansForOperator.mockResolvedValue([
        {
          name: 'International Plan',
          price: '699',
          data: '4GB',
          validity: '28 days',
          benefits: 'International roaming enabled',
          provider: 'airtel'
        }
      ]);

      const payload = {
        queryResult: {
          queryText: 'international roaming plans',
          parameters: {}
        }
      };

      const response = await request(app)
        .post('/webhook')
        .send(payload)
        .expect(200);

      expect(response.body.fulfillmentText).toContain('international');
    });

    test('should handle conversational queries', async () => {
      const payload = {
        queryResult: {
          queryText: 'hi',
          parameters: {}
        }
      };

      const response = await request(app)
        .post('/webhook')
        .send(payload)
        .expect(200);

      expect(response.body.fulfillmentText).toMatch(/Hello|Hi/);
    });

    test('should return 400 for invalid request body', async () => {
      const response = await request(app)
        .post('/webhook')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should return 400 for missing queryResult', async () => {
      const response = await request(app)
        .post('/webhook')
        .send({ invalidField: 'test' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle rate limiting', async () => {
      // Make multiple rapid requests to trigger rate limiting
      const requests = Array(35).fill().map(() => 
        request(app)
          .post('/webhook')
          .send(validWebhookPayload)
      );

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited (429 status)
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    test('should sanitize malicious input', async () => {
      const maliciousPayload = {
        queryResult: {
          queryText: '<script>alert("xss")</script>',
          parameters: {
            operator: '<img src=x onerror=alert("xss")>'
          }
        }
      };

      const response = await request(app)
        .post('/webhook')
        .send(maliciousPayload)
        .expect(200);

      expect(response.body.fulfillmentText).not.toContain('<script>');
      expect(response.body.fulfillmentText).not.toContain('<img');
    });

    test('should handle external API errors gracefully', async () => {
      getPlansForOperator.mockRejectedValue(new Error('External API failed'));

      const response = await request(app)
        .post('/webhook')
        .send(validWebhookPayload)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    test('should validate query text length', async () => {
      const longQueryPayload = {
        queryResult: {
          queryText: 'a'.repeat(600), // Exceeds 500 character limit
          parameters: {}
        }
      };

      const response = await request(app)
        .post('/webhook')
        .send(longQueryPayload)
        .expect(400);

      expect(response.body.error.message).toContain('too long');
    });
  });

  describe('Health Endpoints', () => {
    test('GET /health should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('healthy');
    });

    test('GET /health/live should return liveness status', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('alive');
    });

    test('GET /health/ready should return readiness status', async () => {
      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('ready');
    });

    test('GET /metrics should return system metrics', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('cpu');
      expect(response.body).toHaveProperty('requests');
      expect(response.body).toHaveProperty('errors');
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for undefined routes', async () => {
      const response = await request(app)
        .get('/nonexistent')
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    test('should handle server errors gracefully', async () => {
      // Mock a server error
      getPlansForOperator.mockImplementation(() => {
        throw new Error('Unexpected server error');
      });

      const response = await request(app)
        .post('/webhook')
        .send(validWebhookPayload)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Root Endpoint', () => {
    test('GET / should return API status', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.text).toContain('Telecom Plan Suggestion API is running');
    });
  });
});
