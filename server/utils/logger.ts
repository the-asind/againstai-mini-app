import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logDir = path.join(process.cwd(), 'server', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom format for clean console output
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return `[${timestamp}] ${level}: ${message}${
      Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''
    }`;
  })
);

// Standard JSON format for files
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: 'info',
  format: fileFormat,
  transports: [
    // Output all logs to console with custom formatting
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // Write all logs with level `error` and below to `error.log`
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error' 
    }),
    // Write all logs with level `info` and below to `combined.log`
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log') 
    }),
  ],
});

// A separate distinct logger for raw AI responses
export const aiLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, message }) => {
      // Clean readable text for AI dumps, not JSON
      return `\n================== [AI OUTPUT @ ${timestamp}] ==================\n${message}\n=================================================================\n`;
    })
  ),
  transports: [
    new winston.transports.File({ 
      filename: path.join(logDir, 'ai-responses.log') 
    })
  ]
});

// Helper for saving AI raw dumps without flooding the console
export const logAiResult = (modelName: string, rawText: string) => {
  // We log a small note to the main logger (console included)
  logger.info(`Model [${modelName}] answered (${rawText.length} chars) -> printed to ai-responses.log`);
  // And the raw dump goes exclusively to the aiLogger
  aiLogger.info(rawText);
};

export default logger;
