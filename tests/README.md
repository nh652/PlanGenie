
# Test Documentation

This directory contains comprehensive tests for the Telecom Plan API.

## Test Structure

```
tests/
├── unit/                   # Unit tests for individual functions
│   ├── textParser.test.js  # Tests for text parsing utilities
│   ├── planService.test.js # Tests for plan service functions
│   └── responseGenerator.test.js # Tests for response generation
├── integration/            # Integration tests
│   └── webhook.test.js     # End-to-end webhook tests
├── mocks/                  # Mock data and utilities
│   └── mockPlansData.js    # Mock telecom plans data
├── setup.js               # Global test setup
└── README.md              # This file
```

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

## Test Categories

### Unit Tests
- **textParser.test.js**: Tests all text parsing and extraction functions
- **planService.test.js**: Tests plan filtering and processing logic
- **responseGenerator.test.js**: Tests response formatting and generation

### Integration Tests
- **webhook.test.js**: Tests the complete webhook endpoint with various scenarios

## Mock Data
- **mockPlansData.js**: Contains realistic telecom plan data for testing

## Coverage Goals
- Functions: 90%+ coverage
- Lines: 85%+ coverage
- Statements: 85%+ coverage

## Writing New Tests

1. Follow the existing naming convention: `[module].test.js`
2. Use descriptive test names that explain what is being tested
3. Group related tests with `describe` blocks
4. Use `beforeEach` for test setup when needed
5. Mock external dependencies appropriately
6. Test both success and error scenarios

## Common Test Patterns

### Testing async functions:
```javascript
test('should handle async operation', async () => {
  const result = await someAsyncFunction();
  expect(result).toBe('expected value');
});
```

### Testing error cases:
```javascript
test('should throw error for invalid input', () => {
  expect(() => someFunction(invalidInput)).toThrow('Expected error message');
});
```

### Mocking modules:
```javascript
jest.mock('../../some/module.js', () => ({
  someFunction: jest.fn().mockReturnValue('mocked value')
}));
```
