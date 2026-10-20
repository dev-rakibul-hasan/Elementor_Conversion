import pino from 'pino';
import { env } from '../config/index.js';

const isDev = env.NODE_ENV === 'development';
const isTest = env.NODE_ENV === 'test';

const redactPaths = [
  'password',
  '*.password',
  '*.*.password',
  'passwordHash',
  '*.passwordHash',
  'secret',
  '*.secret',
  'token',
  '*.token',
  'key',
  '*.key',
  'authorization',
  '*.authorization',
  'headers.authorization',
  'req.headers.authorization',
  'apiKey',
  '*.apiKey',
  'siteCredential',
  '*.siteCredential',
  'encryptedCredentials',
  '*.encryptedCredentials',
  'B2_APPLICATION_KEY',
  'JWT_SECRET',
  'SITE_CREDENTIAL_ENCRYPTION_KEY',
];

export const logger = pino({
  level: isTest ? 'silent' : isDev ? 'debug' : 'info',
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  ...(isDev && !isTest
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});

/**
 * Creates a child logger correlated with a specific request ID or workflow ID.
 */
export function createRequestLogger(
  requestId: string,
  extraBindings: Record<string, unknown> = {}
): pino.Logger {
  return logger.child({
    requestId,
    ...extraBindings,
  });
}

export default logger;
