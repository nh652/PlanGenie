
import { describe, test, expect } from '@jest/globals';
import {
  correctOperatorName,
  parseValidity,
  parseDataAllowance,
  hasFeature,
  extractDurationFromQuery,
  extractBudgetFromQuery,
  extractOperatorFromQuery,
  extractDailyDataFromQuery,
  processDurationParameter,
  processBudgetParameter
} from '../../utils/textParser.js';

describe('Text Parser Utilities', () => {
  describe('correctOperatorName', () => {
    test('should correct common misspellings', () => {
      expect(correctOperatorName('geo')).toBe('jio');
      expect(correctOperatorName('artel')).toBe('airtel');
      expect(correctOperatorName('vodafone idea')).toBe('vi');
      expect(correctOperatorName('vodaphone')).toBe('vi');
      expect(correctOperatorName('idea')).toBe('vi');
    });

    test('should return correct names unchanged', () => {
      expect(correctOperatorName('jio')).toBe('jio');
      expect(correctOperatorName('airtel')).toBe('airtel');
      expect(correctOperatorName('vi')).toBe('vi');
    });

    test('should handle partial matches', () => {
      expect(correctOperatorName('jio plans')).toBe('jio');
      expect(correctOperatorName('airtel network')).toBe('airtel');
      expect(correctOperatorName('vodafone prepaid')).toBe('vi');
    });

    test('should return null for invalid input', () => {
      expect(correctOperatorName('')).toBe(null);
      expect(correctOperatorName(null)).toBe(null);
      expect(correctOperatorName('unknown')).toBe(null);
    });
  });

  describe('parseValidity', () => {
    test('should parse numeric validity', () => {
      expect(parseValidity(28)).toBe(28);
      expect(parseValidity(56)).toBe(56);
    });

    test('should parse string validity with days', () => {
      expect(parseValidity('28 days')).toBe(28);
      expect(parseValidity('56 Days')).toBe(56);
      expect(parseValidity('1 day')).toBe(1);
    });

    test('should parse validity with months', () => {
      expect(parseValidity('1 month')).toBe(30);
      expect(parseValidity('2 months')).toBe(60);
      expect(parseValidity('3 month')).toBe(90);
    });

    test('should parse validity with weeks', () => {
      expect(parseValidity('1 week')).toBe(7);
      expect(parseValidity('2 weeks')).toBe(14);
    });

    test('should parse validity with years', () => {
      expect(parseValidity('1 year')).toBe(365);
    });

    test('should handle special cases', () => {
      expect(parseValidity('base plan')).toBe(null);
      expect(parseValidity('plan validity')).toBe(null);
      expect(parseValidity('bill cycle')).toBe(null);
      expect(parseValidity('')).toBe(null);
      expect(parseValidity(null)).toBe(null);
    });

    test('should extract numbers from complex strings', () => {
      expect(parseValidity('Validity: 28')).toBe(28);
      expect(parseValidity('Plan valid for 56')).toBe(56);
    });
  });

  describe('parseDataAllowance', () => {
    test('should parse GB amounts', () => {
      expect(parseDataAllowance('2GB')).toBe(2);
      expect(parseDataAllowance('1.5GB')).toBe(1.5);
      expect(parseDataAllowance('10 GB')).toBe(10);
    });

    test('should parse MB amounts and convert to GB', () => {
      expect(parseDataAllowance('1024MB')).toBe(1);
      expect(parseDataAllowance('512 MB')).toBe(0.5);
    });

    test('should handle unlimited data', () => {
      expect(parseDataAllowance('Unlimited')).toBe(Infinity);
      expect(parseDataAllowance('unlimited data')).toBe(Infinity);
    });

    test('should return null for invalid input', () => {
      expect(parseDataAllowance('')).toBe(null);
      expect(parseDataAllowance(null)).toBe(null);
      expect(parseDataAllowance('No data')).toBe(null);
      expect(parseDataAllowance('0GB')).toBe(0);
    });
  });

  describe('hasFeature', () => {
    const mockPlan = {
      name: 'Test Plan',
      benefits: 'Unlimited voice calls, Netflix included',
      additional_benefits: 'Amazon Prime, International roaming',
      description: 'Best plan for entertainment'
    };

    test('should find features in benefits', () => {
      expect(hasFeature(mockPlan, 'netflix')).toBe(true);
      expect(hasFeature(mockPlan, 'Netflix')).toBe(true);
      expect(hasFeature(mockPlan, 'voice')).toBe(true);
    });

    test('should find features in additional benefits', () => {
      expect(hasFeature(mockPlan, 'amazon prime')).toBe(true);
      expect(hasFeature(mockPlan, 'international roaming')).toBe(true);
    });

    test('should find features in description', () => {
      expect(hasFeature(mockPlan, 'entertainment')).toBe(true);
    });

    test('should return false for missing features', () => {
      expect(hasFeature(mockPlan, 'hotstar')).toBe(false);
      expect(hasFeature(mockPlan, 'youtube')).toBe(false);
    });

    test('should handle invalid input', () => {
      expect(hasFeature(null, 'feature')).toBe(false);
      expect(hasFeature(mockPlan, null)).toBe(false);
      expect(hasFeature(mockPlan, '')).toBe(false);
    });
  });

  describe('extractDurationFromQuery', () => {
    test('should extract month expressions', () => {
      expect(extractDurationFromQuery('I need a 1 month plan')).toBe(28);
      expect(extractDurationFromQuery('show me 2 months validity')).toBe(56);
      expect(extractDurationFromQuery('three month plan')).toBe(84);
    });

    test('should extract days from query', () => {
      expect(extractDurationFromQuery('28 days plan')).toBe(28);
      expect(extractDurationFromQuery('plan with 56 days validity')).toBe(56);
    });

    test('should return null for no duration', () => {
      expect(extractDurationFromQuery('cheap plan')).toBe(null);
      expect(extractDurationFromQuery('')).toBe(null);
    });
  });

  describe('extractBudgetFromQuery', () => {
    test('should extract budget with different formats', () => {
      expect(extractBudgetFromQuery('plans under 500')).toBe(500);
      expect(extractBudgetFromQuery('less than Rs. 300')).toBe(300);
      expect(extractBudgetFromQuery('budget of ₹200')).toBe(200);
    });

    test('should return null for no budget', () => {
      expect(extractBudgetFromQuery('cheap plans')).toBe(null);
      expect(extractBudgetFromQuery('')).toBe(null);
    });
  });

  describe('extractOperatorFromQuery', () => {
    test('should extract operators from query text', () => {
      expect(extractOperatorFromQuery('jio plans')).toBe('jio');
      expect(extractOperatorFromQuery('airtel prepaid')).toBe('airtel');
      expect(extractOperatorFromQuery('vi postpaid')).toBe('vi');
      expect(extractOperatorFromQuery('vodafone plans')).toBe('vi');
    });

    test('should return null for no operator', () => {
      expect(extractOperatorFromQuery('cheap plans')).toBe(null);
      expect(extractOperatorFromQuery('')).toBe(null);
    });
  });

  describe('extractDailyDataFromQuery', () => {
    test('should extract daily data requirements', () => {
      expect(extractDailyDataFromQuery('2GB per day')).toBe(2);
      expect(extractDailyDataFromQuery('1.5GB daily')).toBe(1.5);
      expect(extractDailyDataFromQuery('need 3 GB per day')).toBe(3);
    });

    test('should return null for no daily data requirement', () => {
      expect(extractDailyDataFromQuery('unlimited plans')).toBe(null);
      expect(extractDailyDataFromQuery('')).toBe(null);
    });
  });

  describe('processDurationParameter', () => {
    test('should process Dialogflow duration objects', () => {
      const params = {
        duration: {
          amount: 1,
          unit: 'month'
        }
      };
      expect(processDurationParameter(params, '')).toBe(28);
    });

    test('should process numeric duration', () => {
      const params = { duration: 56 };
      expect(processDurationParameter(params, '')).toBe(56);
    });

    test('should prefer query text over parameters', () => {
      const params = { duration: 56 };
      const queryText = '2 months plan';
      expect(processDurationParameter(params, queryText)).toBe(56);
    });
  });

  describe('processBudgetParameter', () => {
    test('should process numeric budget', () => {
      const params = { budget: 500 };
      expect(processBudgetParameter(params, '')).toBe(500);
    });

    test('should process budget object', () => {
      const params = {
        budget: {
          amount: 300
        }
      };
      expect(processBudgetParameter(params, '')).toBe(300);
    });

    test('should extract from query text if no params', () => {
      expect(processBudgetParameter({}, 'under 400')).toBe(400);
    });
  });
});
