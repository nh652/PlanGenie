
import { describe, test, expect, beforeEach } from '@jest/globals';
import { responseGenerator } from '../../utils/responseGenerator.js';

describe('Response Generator', () => {
  describe('generateConversationalResponse', () => {
    test('should return greeting for hi/hello', () => {
      const response1 = responseGenerator.generateConversationalResponse('hi');
      const response2 = responseGenerator.generateConversationalResponse('hello');
      
      expect(typeof response1).toBe('string');
      expect(typeof response2).toBe('string');
      expect(response1.length).toBeGreaterThan(0);
      expect(response2.length).toBeGreaterThan(0);
    });

    test('should return response for how are you', () => {
      const response = responseGenerator.generateConversationalResponse('how are you');
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });

    test('should return null for non-conversational queries', () => {
      const response = responseGenerator.generateConversationalResponse('show me plans');
      expect(response).toBe(null);
    });

    test('should handle empty or null input', () => {
      expect(responseGenerator.generateConversationalResponse('')).toBe(null);
      expect(responseGenerator.generateConversationalResponse(null)).toBe(null);
    });
  });

  describe('generateResponse', () => {
    const mockPlans = [
      {
        name: '₹149 Plan',
        price: '149',
        data: '2GB',
        validity: '28 days',
        benefits: 'Unlimited voice calls',
        provider: 'jio'
      },
      {
        name: '₹399 Plan',
        price: '399',
        data: '6GB',
        validity: '56 days',
        benefits: 'Unlimited voice calls, Netflix',
        provider: 'jio'
      }
    ];

    test('should generate response for successful plan search', () => {
      const params = {
        plans: mockPlans,
        filteredPlans: mockPlans,
        operator: 'jio',
        planType: 'prepaid',
        queryText: 'jio prepaid plans'
      };

      const response = responseGenerator.generateResponse(params);
      expect(typeof response).toBe('string');
      expect(response).toContain('JIO');
      expect(response).toContain('PREPAID');
      expect(response).toContain('₹149');
      expect(response).toContain('₹399');
    });

    test('should handle no plans found scenario', () => {
      const params = {
        plans: [],
        filteredPlans: [],
        operator: 'jio',
        planType: 'prepaid',
        queryText: 'jio prepaid plans'
      };

      const response = responseGenerator.generateResponse(params);
      expect(response).toContain('No PREPAID plans');
    });

    test('should handle international roaming queries', () => {
      const params = {
        plans: mockPlans,
        filteredPlans: [],
        operator: 'airtel',
        planType: 'prepaid',
        isInternationalQuery: true,
        queryText: 'international roaming plans'
      };

      const response = responseGenerator.generateResponse(params);
      expect(response).toContain('international roaming');
    });

    test('should handle voice-only plan requests', () => {
      const voicePlan = {
        name: '₹99 Voice Plan',
        price: '99',
        data: '0GB',
        validity: '28 days',
        benefits: 'Unlimited voice calls',
        provider: 'jio'
      };

      const params = {
        plans: [voicePlan],
        filteredPlans: [voicePlan],
        operator: 'jio',
        planType: 'prepaid',
        isVoiceOnly: true,
        queryText: 'voice only plans'
      };

      const response = responseGenerator.generateResponse(params);
      expect(response).toContain('VOICE-ONLY');
      expect(response).toContain('₹99');
    });

    test('should handle budget constraints', () => {
      const params = {
        plans: mockPlans,
        filteredPlans: [mockPlans[0]], // Only first plan within budget
        budget: 200,
        planType: 'prepaid',
        queryText: 'plans under 200'
      };

      const response = responseGenerator.generateResponse(params);
      expect(response).toContain('₹149');
      expect(response).not.toContain('₹399');
    });

    test('should handle duration constraints', () => {
      const params = {
        plans: mockPlans,
        filteredPlans: [mockPlans[0]], // Only 28-day plan
        targetDuration: 28,
        planType: 'prepaid',
        queryText: 'plans with 28 days validity'
      };

      const response = responseGenerator.generateResponse(params);
      expect(response).toContain('28 days');
    });

    test('should handle operator correction', () => {
      const params = {
        plans: mockPlans,
        filteredPlans: mockPlans,
        operator: 'jio',
        originalOperator: 'geo',
        correctedOperator: 'jio',
        planType: 'prepaid',
        queryText: 'geo plans'
      };

      const response = responseGenerator.generateResponse(params);
      expect(response).toContain('JIO');
      expect(response).toContain('GEO');
    });

    test('should handle missing operator scenario', () => {
      const params = {
        plans: mockPlans,
        filteredPlans: mockPlans,
        missingOperator: 'bsnl',
        planType: 'prepaid',
        queryText: 'bsnl plans'
      };

      const response = responseGenerator.generateResponse(params);
      expect(response).toContain('BSNL');
    });

    test('should limit displayed plans to maximum', () => {
      // Create more plans than the maximum display limit
      const manyPlans = Array(15).fill().map((_, i) => ({
        name: `₹${100 + i * 50} Plan`,
        price: `${100 + i * 50}`,
        data: '2GB',
        validity: '28 days',
        benefits: 'Unlimited voice calls',
        provider: 'jio'
      }));

      const params = {
        plans: manyPlans,
        filteredPlans: manyPlans,
        operator: 'jio',
        planType: 'prepaid',
        queryText: 'jio plans'
      };

      const response = responseGenerator.generateResponse(params);
      // Should show limited message
      expect(response).toMatch(/Showing \d+ out of \d+ available plans/);
    });

    test('should handle alternative plans when no exact matches', () => {
      const alternativePlans = [mockPlans[1]]; // 56-day plan as alternative

      const params = {
        plans: mockPlans,
        filteredPlans: [],
        alternativePlans,
        targetDuration: 30,
        planType: 'prepaid',
        queryText: 'plans with 30 days validity'
      };

      const response = responseGenerator.generateResponse(params);
      expect(response).toContain('alternatives');
      expect(response).toContain('₹399');
    });

    test('should handle feature requests', () => {
      const params = {
        plans: mockPlans,
        filteredPlans: [mockPlans[1]], // Netflix plan
        requestedFeatures: ['netflix'],
        planType: 'prepaid',
        queryText: 'plans with netflix'
      };

      const response = responseGenerator.generateResponse(params);
      expect(response).toContain('₹399');
      expect(response).toContain('Netflix');
    });

    test('should handle unavailable features', () => {
      const params = {
        plans: mockPlans,
        filteredPlans: [],
        requestedFeatures: ['youtube premium'],
        unavailableFeatures: ['youtube premium'],
        planType: 'prepaid',
        queryText: 'plans with youtube premium'
      };

      const response = responseGenerator.generateResponse(params);
      expect(response).toContain('youtube premium');
    });
  });

  describe('edge cases', () => {
    test('should handle null or undefined parameters', () => {
      const params = {
        plans: null,
        filteredPlans: null,
        queryText: '',
        planType: 'prepaid'
      };

      const response = responseGenerator.generateResponse(params);
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });

    test('should handle empty query text', () => {
      const params = {
        plans: [],
        filteredPlans: [],
        queryText: '',
        planType: 'prepaid'
      };

      const response = responseGenerator.generateResponse(params);
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });
  });
});
