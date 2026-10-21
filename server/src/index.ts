import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env, printConfigDiagnostics } from './config/index.js';
import { getStorage } from './modules/storage/factory.js';
import { prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';

export const app = express();

// Trust proxy settings if configured behind reverse proxy (e.g., Nginx, Cloudflare)
if (env.TRUST_PROXY_HOPS > 0) {
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
}

// 1. Security Headers
app.use(
  helmet({
    contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: false,
  })
);

// 2. CORS configuration
const allowedOrigins = env.WEB_ORIGIN.split(',').map((o) => o.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        allowedOrigins.includes('*') ||
        env.NODE_ENV !== 'production'
      ) {
        return callback(null, true);
      }
      return callback(new Error(`Origin '${origin}' not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  })
);

// 3. Request Correlation ID
app.use(requestId);

// 4. Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'production' ? 1000 : 100000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV !== 'production', // Disable rate limiting in local dev
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later.',
    },
  },
});
app.use(limiter);

// 5. Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5b. Static asset serving for uploads & storage
const localUploadsPath = path.resolve(process.cwd(), env.LOCAL_STORAGE_PATH);
app.use(['/storage', '/uploads'], (_req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});
app.use('/storage', async (req, res, next) => {
  if (env.STORAGE_PROVIDER !== 'b2') return next();
  try {
    const key = decodeURIComponent(req.path).replace(/^\/+/, '');
    if (key.split(/[\\/]/).includes('..')) return res.sendStatus(400);
    const asset = await prisma.asset.findFirst({ where: { storagePath: key, storageProvider: 'b2' } });
    if (!asset) return res.sendStatus(404);
    const buffer = await getStorage().download(key);
    res.type(asset.mimeType).send(buffer);
  } catch (error) { next(error); }
});
app.use('/storage', express.static(localUploadsPath));
app.use('/uploads', express.static(localUploadsPath));

// 6. Mount API routes
app.use('/api/v1', apiRouter);

// 7. Unmatched Route Handler (404)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Endpoint ${req.method} ${req.originalUrl} not found`,
      requestId: req.id,
    },
  });
});

// 8. Global Error Handler Middleware
app.use(errorHandler);

// Start server when executed directly
if (process.env.NODE_ENV !== 'test') {
  printConfigDiagnostics();

  const server = app.listen(env.API_PORT, () => {
    logger.info(
      {
        port: env.API_PORT,
        env: env.NODE_ENV,
        webOrigin: env.WEB_ORIGIN,
      },
      `Server successfully started and listening on port ${env.API_PORT}`
    );
  });

  // Graceful shutdown handling
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}. Shutting down HTTP server gracefully...`);
    server.close((err) => {
      if (err) {
        logger.error({ err }, 'Error during server close');
        process.exit(1);
      }
      logger.info('HTTP server closed cleanly. Exiting.');
      process.exit(0);
    });

    // Force close after 10 seconds if connections hang
    setTimeout(() => {
      logger.error('Forced shutdown after timeout expiration');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export default app;
