
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import {
  flattenPrepaidPlans,
  flattenPostpaidPlans,
  filterVoiceOnlyPlans,
  filterByDailyData,
  filterPlansByConstraints,
  filterPlansByFeatures,
  filterInternationalPlans,
  findSimilarPlans,
  checkFeatureAvailability
} from '../../services/planService.js';
import { mockPlansData } from '../mocks/mockPlansData.js';

// Mock the logger to avoid console output during tests
jest.mock('../../utils/logger.js', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebug: jest.fn(),
  logWarn: jest.fn()
}));

describe('Plan Service Functions', () => {
  const samplePrepaidData = mockPlansData.telecom_providers.jio.plans.prepaid;
  const samplePostpaidData = mockPlansData.telecom_providers.jio.plans.postpaid;

  describe('flattenPrepaidPlans', () => {
    test('should flatten nested prepaid plan structure', () => {
      const flattened = flattenPrepaidPlans(samplePrepaidData);
      expect(Array.isArray(flattened)).toBe(true);
      expect(flattened.length).toBeGreaterThan(0);
      expect(flattened[0]).toHaveProperty('name');
      expect(flattened[0]).toHaveProperty('price');
    });

    test('should handle empty prepaid data', () => {
      const flattened = flattenPrepaidPlans({});
      expect(Array.isArray(flattened)).toBe(true);
      expect(flattened.length).toBe(0);
    });
  });

  describe('flattenPostpaidPlans', () => {
    test('should return array if already an array', () => {
      const flattened = flattenPostpaidPlans(samplePostpaidData);
      expect(Array.isArray(flattened)).toBe(true);
      expect(flattened.length).toBeGreaterThan(0);
    });

    test('should flatten nested postpaid structure', () => {
      const nestedData = {
        family_plans: samplePostpaidData,
        individual_plans: samplePostpaidData
      };
      const flattened = flattenPostpaidPlans(nestedData);
      expect(Array.isArray(flattened)).toBe(true);
      expect(flattened.length).toBeGreaterThan(0);
    });
  });

  describe('filterVoiceOnlyPlans', () => {
    const testPlans = [
      {
        name: 'Voice Plan',
        price: '99',
        data: '0GB',
        benefits: 'Unlimited voice calls, 300 SMS'
      },
      {
        name: 'Data Plan',
        price: '149',
        data: '2GB',
        benefits: 'Unlimited voice calls, 300 SMS, 2GB data'
      },
      {
        name: 'No Data Plan',
        price: '79',
        data: 'No data',
        benefits: 'Voice calls only'
      }
    ];

    test('should filter voice-only plans', () => {
      const voicePlans = filterVoiceOnlyPlans(testPlans);
      expect(voicePlans.length).toBe(2);
      expect(voicePlans.every(plan => 
        plan.data === '0GB' || plan.data === 'No data'
      )).toBe(true);
    });

    test('should return empty array for no voice-only plans', () => {
      const dataPlans = [
        {
          name: 'Data Plan',
          price: '149',
          data: '2GB',
          benefits: 'Unlimited voice calls, 2GB data'
        }
      ];
      const voicePlans = filterVoiceOnlyPlans(dataPlans);
      expect(voicePlans.length).toBe(0);
    });
  });

  describe('filterByDailyData', () => {
    const testPlans = [
      {
        name: 'Low Data Plan',
        data: '1GB',
        validity: '28 days'
      },
      {
        name: 'High Data Plan',
        data: '56GB',
        validity: '28 days'
      },
      {
        name: 'Unlimited Plan',
        data: 'Unlimited',
        validity: '28 days'
      }
    ];

    test('should filter plans by minimum daily data', () => {
      const filtered = filterByDailyData(testPlans, 1);
      expect(filtered.length).toBe(2); // High data and unlimited should match
    });

    test('should handle unlimited data correctly', () => {
      const filtered = filterByDailyData(testPlans, 10);
      expect(filtered.length).toBe(1); // Only unlimited should match
      expect(filtered[0].data).toBe('Unlimited');
    });
  });

  describe('filterPlansByConstraints', () => {
    const testPlans = [
      {
        name: 'Cheap Plan',
        price: '149',
        validity: '28 days'
      },
      {
        name: 'Expensive Plan',
        price: '599',
        validity: '28 days'
      },
      {
        name: 'Long Duration Plan',
        price: '299',
        validity: '56 days'
      }
    ];

    test('should filter by budget only', () => {
      const filtered = filterPlansByConstraints(testPlans, null, 300);
      expect(filtered.length).toBe(2);
      expect(filtered.every(plan => parseInt(plan.price) <= 300)).toBe(true);
    });

    test('should filter by duration only', () => {
      const filtered = filterPlansByConstraints(testPlans, 28, null);
      expect(filtered.length).toBe(2);
      expect(filtered.every(plan => plan.validity === '28 days')).toBe(true);
    });

    test('should filter by both budget and duration', () => {
      const filtered = filterPlansByConstraints(testPlans, 28, 200);
      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toBe('Cheap Plan');
    });
  });

  describe('filterPlansByFeatures', () => {
    const testPlans = [
      {
        name: 'Netflix Plan',
        benefits: 'Netflix included',
        additional_benefits: 'Amazon Prime'
      },
      {
        name: 'Basic Plan',
        benefits: 'Unlimited calls',
        additional_benefits: 'Nothing special'
      },
      {
        name: 'Premium Plan',
        benefits: 'Netflix, Amazon Prime',
        additional_benefits: 'Disney+ Hotstar'
      }
    ];

    test('should filter plans with specific features', () => {
      const filtered = filterPlansByFeatures(testPlans, ['netflix']);
      expect(filtered.length).toBe(2);
    });

    test('should filter plans with multiple features', () => {
      const filtered = filterPlansByFeatures(testPlans, ['netflix', 'amazon prime']);
      expect(filtered.length).toBe(2);
    });

    test('should return empty for unavailable features', () => {
      const filtered = filterPlansByFeatures(testPlans, ['youtube premium']);
      expect(filtered.length).toBe(0);
    });
  });

  describe('filterInternationalPlans', () => {
    const testPlans = [
      {
        name: 'International Plan',
        benefits: 'International roaming enabled',
        additional_benefits: 'Global coverage'
      },
      {
        name: 'IRO Plan',
        benefits: 'IRO included',
        additional_benefits: 'Voice and data abroad'
      },
      {
        name: 'Domestic Plan',
        benefits: 'Unlimited domestic calls',
        additional_benefits: 'Local coverage only'
      }
    ];

    test('should filter international roaming plans', () => {
      const filtered = filterInternationalPlans(testPlans);
      expect(filtered.length).toBe(2);
      expect(filtered.every(plan => 
        plan.name.includes('International') || 
        plan.name.includes('IRO') ||
        plan.benefits.includes('roaming') ||
        plan.benefits.includes('IRO')
      )).toBe(true);
    });
  });

  describe('findSimilarPlans', () => {
    const testPlans = [
      {
        name: '28 Day Plan',
        price: '149',
        validity: '28 days'
      },
      {
        name: '30 Day Plan',
        price: '179',
        validity: '30 days'
      },
      {
        name: '56 Day Plan',
        price: '299',
        validity: '56 days'
      }
    ];

    test('should find plans with similar duration', () => {
      const similar = findSimilarPlans(testPlans, 29, null, 2);
      expect(similar.length).toBe(2);
      expect(similar[0].validity).toBe('30 days'); // Closest match first
    });

    test('should respect budget constraints', () => {
      const similar = findSimilarPlans(testPlans, 29, 200, 3);
      expect(similar.length).toBe(2);
      expect(similar.every(plan => parseInt(plan.price) <= 200)).toBe(true);
    });

    test('should limit results', () => {
      const similar = findSimilarPlans(testPlans, 29, null, 1);
      expect(similar.length).toBe(1);
    });
  });

  describe('checkFeatureAvailability', () => {
    const testPlans = [
      {
        benefits: 'Netflix included',
        additional_benefits: 'Amazon Prime'
      },
      {
        benefits: 'Disney+ Hotstar',
        additional_benefits: 'Unlimited calls'
      }
    ];

    test('should identify available and unavailable features', () => {
      const features = ['netflix', 'amazon prime', 'youtube premium'];
      const result = checkFeatureAvailability(testPlans, features);
      
      expect(result.availableFeatures).toContain('netflix');
      expect(result.availableFeatures).toContain('amazon prime');
      expect(result.unavailableFeatures).toContain('youtube premium');
    });

    test('should handle empty feature list', () => {
      const result = checkFeatureAvailability(testPlans, []);
      expect(result.availableFeatures).toEqual([]);
      expect(result.unavailableFeatures).toEqual([]);
    });
  });
});
