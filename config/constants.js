
// Configuration constants for the telecom API
export const CONFIG = {
  // Server settings
  PORT: process.env.PORT || 3000,
  
  // External API
  JSON_URL: 'https://raw.githubusercontent.com/nh652/TelcoPlans/main/telecom_plans_improved.json',
  
  // Cache settings
  CACHE_DURATION: 3600000, // 1 hour
  
  // Response limits
  MAX_PLANS_TO_SHOW: 8,
  
  // Available operators
  AVAILABLE_OPERATORS: ['jio', 'airtel', 'vi'],
  
  // Operator name corrections
  OPERATOR_CORRECTIONS: {
    'geo': 'jio',
    'artel': 'airtel',
    'vodafone idea': 'vi',
    'vodaphone': 'vi',
    'idea': 'vi'
  },
  
  // Duration mappings for month expressions
  MONTH_MAPPINGS: {
    '1 month': 28,
    'one month': 28,
    'a month': 28,
    '2 month': 56,
    'two month': 56,
    '2 months': 56,
    'two months': 56,
    '3 month': 84,
    'three month': 84,
    '3 months': 84,
    'three months': 84
  },
  
  // Security settings
  SECURITY: {
    MAX_QUERY_LENGTH: 500,
    REQUEST_TIMEOUT: 30000,
    RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
    RATE_LIMIT_MAX: 100,
    WEBHOOK_RATE_LIMIT_MAX: 30,
    BODY_SIZE_LIMIT: '1mb'
  },
  
  // Conversational responses
  CONVERSATIONAL_RESPONSES: {
    'hi': ['Hello! How can I help you today?', 'Hi there! Looking for a mobile plan?', 'Hello! Need help finding a plan?'],
    'hello': ['Hi! How can I assist you?', 'Hello there! Need help with mobile plans?', 'Hello! Ready to find your perfect plan?'],
    'hey': ['Hey! How can I help?', 'Hi there! Looking for a mobile plan?', 'Hey! Ready to find your perfect plan?'],
    'how are you': ['I\'m doing great, thanks for asking! How can I help you today?', 'I\'m well, thanks! Ready to find you the perfect mobile plan?'],
    'thanks': ['You\'re welcome! Let me know if you need anything else.', 'Happy to help! Need anything else?', 'Glad I could help! Feel free to ask about any other plans.'],
    'thank you': ['You\'re welcome! Let me know if you need anything else.', 'Happy to help! Need anything else?', 'My pleasure! Feel free to ask about other plans.'],
    'bye': ['Goodbye! Have a great day!', 'Take care! Come back if you need more help.', 'Bye! Feel free to return if you need assistance.']
  }
};
