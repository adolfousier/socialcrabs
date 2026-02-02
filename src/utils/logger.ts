import winston from 'winston';
import path from 'path';
import fs from 'fs';

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const LOG_COLORS = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
};

winston.addColors(LOG_COLORS);

function createLogger(
  level: string = 'info',
  logFile?: string
): winston.Logger {
  const transports: winston.transport[] = [];

  // Console transport
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.colorize({ all: true }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length
            ? ` ${JSON.stringify(meta)}`
            : '';
          return `[${timestamp}] [${level}] ${message}${metaStr}`;
        })
      ),
    })
  );

  // File transport
  if (logFile) {
    const logDir = path.dirname(logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    transports.push(
      new winston.transports.File({
        filename: logFile,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
      })
    );
  }

  return winston.createLogger({
    level,
    levels: LOG_LEVELS,
    transports,
  });
}

// Default logger instance
let logger = createLogger(
  process.env.LOG_LEVEL || 'info',
  process.env.LOG_FILE
);

export function initLogger(level: string, logFile?: string): void {
  logger = createLogger(level, logFile);
}

export function getLogger(): winston.Logger {
  return logger;
}

// Convenience exports
export const log = {
  debug: (message: string, meta?: Record<string, unknown>) =>
    logger.debug(message, meta),
  info: (message: string, meta?: Record<string, unknown>) =>
    logger.info(message, meta),
  warn: (message: string, meta?: Record<string, unknown>) =>
    logger.warn(message, meta),
  error: (message: string, meta?: Record<string, unknown>) =>
    logger.error(message, meta),
};

export default logger;
