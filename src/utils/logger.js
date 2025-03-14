const winston = require('winston');
const path = require('path');
require('dotenv').config();

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join('logs', 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// If we're not in production, also log to the console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
}

// Add webhook logging if URL is configured
if (process.env.WEBHOOK_URL) {
  const axios = require('axios');
  logger.add(new winston.transports.Stream({
    stream: {
      write: async (message) => {
        try {
          const logData = JSON.parse(message);
          if (logData.level === 'error') {
            await axios.post(process.env.WEBHOOK_URL, {
              content: `🚨 Error: ${logData.message}`,
              timestamp: logData.timestamp,
              level: logData.level,
            });
          }
        } catch (error) {
          console.error('Failed to send webhook:', error);
        }
      }
    }
  }));
}

module.exports = logger; 