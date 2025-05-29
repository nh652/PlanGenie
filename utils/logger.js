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
  winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    const reqId = requestId ? ` [${requestId}]` : '';
    return `${timestamp} [${level}]:${reqId} ${message} ${metaStr}`;
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
  ],
  // Don't exit on handled exceptions
  exitOnError: false
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

// Create a stream object for morgan
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

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