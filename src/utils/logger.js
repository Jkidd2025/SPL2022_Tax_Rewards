const winston = require('winston');
const Sentry = require('@sentry/node');
const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Initialize Sentry
if (process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        tracesSampleRate: 1.0,
    });
}

// Create Winston logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        // Write all logs to console
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        // Write all logs to files
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        })
    ]
});

// Custom logging levels
const LogLevel = {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug'
};

// Logging functions with Sentry integration
const log = {
    error: (message, error = null, context = {}) => {
        if (error && process.env.SENTRY_DSN) {
            Sentry.captureException(error, {
                extra: { ...context, message }
            });
        }
        logger.error(message, { error: error?.message || error, ...context });
    },

    warn: (message, context = {}) => {
        logger.warn(message, context);
    },

    info: (message, context = {}) => {
        logger.info(message, context);
    },

    debug: (message, context = {}) => {
        logger.debug(message, context);
    },

    transaction: (txId, status, details = {}) => {
        logger.info(`Transaction ${txId}: ${status}`, {
            type: 'transaction',
            txId,
            status,
            ...details
        });
    },

    swap: (fromAmount, toAmount, fromToken, toToken, details = {}) => {
        logger.info(`Swap: ${fromAmount} ${fromToken} -> ${toAmount} ${toToken}`, {
            type: 'swap',
            fromAmount,
            toAmount,
            fromToken,
            toToken,
            ...details
        });
    },

    reward: (amount, recipients, details = {}) => {
        logger.info(`Reward Distribution: ${amount} WBTC to ${recipients} recipients`, {
            type: 'reward',
            amount,
            recipients,
            ...details
        });
    }
};

module.exports = {
    log,
    LogLevel
}; 