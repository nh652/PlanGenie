
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...meta
    });
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

// Create logs directory if it doesn't exist
const logsDir = 'logs';

// Error log rotation
const errorFileRotateTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxFiles: '30d',
  maxSize: '20m',
  format: logFormat
});

// Combined log rotation
const combinedFileRotateTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: '30d',
  maxSize: '20m',
  format: logFormat
});

// Access log rotation for HTTP requests
const accessFileRotateTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'access-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: '30d',
  maxSize: '20m',
  format: logFormat
});

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { 
    service: 'telecom-api',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    errorFileRotateTransport,
    combinedFileRotateTransport
  ],
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'exceptions.log'),
      format: logFormat
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'rejections.log'),
      format: logFormat
    })
  ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
}

// Create access logger for HTTP requests
export const accessLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { 
    service: 'telecom-api-access',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    accessFileRotateTransport
  ]
});

// Add console for development
if (process.env.NODE_ENV !== 'production') {
  accessLogger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// Helper functions for structured logging
export const logError = (message, error = null, meta = {}) => {
  const logData = {
    message,
    ...meta
  };
  
  if (error) {
    logData.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code
    };
  }
  
  logger.error(logData);
};

export const logInfo = (message, meta = {}) => {
  logger.info({ message, ...meta });
};

export const logWarn = (message, meta = {}) => {
  logger.warn({ message, ...meta });
};

export const logDebug = (message, meta = {}) => {
  logger.debug({ message, ...meta });
};

// Performance logging helper
export const logPerformance = (operation, duration, meta = {}) => {
  logger.info({
    message: `Performance: ${operation}`,
    operation,
    duration_ms: duration,
    performance: true,
    ...meta
  });
};

export default logger;
import winston from 'winston';
import path from 'path';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
    const logEntry = {
      timestamp,
      level,
      message,
      requestId,
      ...meta
    };
    return JSON.stringify(logEntry);
  })
);

// Create logs directory if it doesn't exist
const logDir = 'logs';

// Logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'telecom-api' },
  transports: [
    // Write all logs with level 'error' and below to 'error.log'
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Write all logs to 'combined.log'
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          const reqId = requestId ? ` [${requestId}]` : '';
          return `${timestamp} ${level}:${reqId} ${message}${metaStr}`;
        })
      )
    })
  ],
  
  // Don't exit on handled exceptions
  exitOnError: false
});

// Handle uncaught exceptions and unhandled rejections
logger.exceptions.handle(
  new winston.transports.File({ filename: path.join(logDir, 'exceptions.log') })
);

logger.rejections.handle(
  new winston.transports.File({ filename: path.join(logDir, 'rejections.log') })
);

// Create a stream object for morgan
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

// Convenience methods
export function logInfo(message, meta = {}) {
  logger.info(message, meta);
}

export function logError(message, error = null, meta = {}) {
  const errorMeta = error ? {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    ...meta
  } : meta;
  
  logger.error(message, errorMeta);
}

export function logWarn(message, meta = {}) {
  logger.warn(message, meta);
}

export function logDebug(message, meta = {}) {
  logger.debug(message, meta);
}

export function logPerformance(message, duration, meta = {}) {
  logger.info(message, { duration, ...meta, type: 'performance' });
}

export default logger;
