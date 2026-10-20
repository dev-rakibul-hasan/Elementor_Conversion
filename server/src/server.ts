/**
 * Express Server Application & Entrypoint
 * Module Owner: Rakib (Storage & Upload Lead)
 * 
 * Configures Express application, security middleware, upload routing,
 * health checks, and global error handling.
 */

import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { createUploadRouter } from './routes/upload.js';
import { UploadService } from './modules/storage/upload-service.js';
import { LocalStorageProvider } from './modules/storage/storage-provider.js';
import { InMemoryDeduplicationStore } from './modules/storage/hasher.js';
import { ImageProcessor } from './modules/storage/processor.js';
import { CanvasIsolationService } from './modules/storage/canvas.js';
import { DEFAULT_STORAGE_CONFIG, type StorageConfig } from './modules/storage/types.js';
import { API_VERSION } from './contracts/api.js';

export interface AppOptions {
  uploadService?: UploadService;
  storageConfig?: StorageConfig;
  corsOrigin?: string | string[];
}

export function createApp(options: AppOptions = {}): Application {
  const app = express();
  const storageConfig = options.storageConfig || DEFAULT_STORAGE_CONFIG;

  // Security headers middleware
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  // CORS configuration
  app.use(
    cors({
      origin: options.corsOrigin || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Standard body parsers for non-multipart requests
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Dependency injection: initialize upload service if not provided
  let uploadService = options.uploadService;
  if (!uploadService) {
    const storageProvider = new LocalStorageProvider(storageConfig.storageDir);
    const deduplicationStore = new InMemoryDeduplicationStore();
    const imageProcessor = new ImageProcessor(storageConfig);
    const canvasService = new CanvasIsolationService(storageConfig);

    uploadService = new UploadService({
      config: storageConfig,
      storageProvider,
      deduplicationStore,
      processor: imageProcessor,
      canvasService,
    });
  }

  // Health check endpoints
  const healthHandler = (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      version: API_VERSION,
      timestamp: new Date().toISOString(),
    });
  };

  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);
  app.get('/api/v1/health', healthHandler);

  // Mount upload router
  const uploadRouter = createUploadRouter(uploadService, storageConfig);
  app.use('/api/upload', uploadRouter);
  app.use('/api/v1/upload', uploadRouter);

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Route ${req.method} ${req.path} not found`,
        stage: 'routing',
        retryable: false,
        timestamp: new Date().toISOString(),
      },
      meta: {
        apiVersion: API_VERSION,
        timestamp: new Date().toISOString(),
      },
    });
  });

  // Global 500 error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = typeof err.httpStatus === 'number' ? err.httpStatus : 500;
    const message = err.message || 'Internal server error';
    const code = err.code || 'INTERNAL_SERVER_ERROR';

    res.status(status).json({
      success: false,
      error: {
        code,
        message,
        stage: 'server',
        retryable: false,
        timestamp: new Date().toISOString(),
      },
      meta: {
        apiVersion: API_VERSION,
        timestamp: new Date().toISOString(),
      },
    });
  });

  return app;
}

export function startServer(port: number = Number(process.env.PORT) || 4000) {
  const app = createApp();
  const server = app.listen(port, () => {
    console.log(`[Elementor Conversion Server] Listening on port ${port}`);
    console.log(`[Upload Module] Ready. Routes: POST /api/upload, POST /api/v1/upload`);
  });

  // Graceful shutdown handling
  const shutdown = () => {
    console.log('[Elementor Conversion Server] Shutting down gracefully...');
    server.close(() => {
      console.log('[Elementor Conversion Server] Closed all connections.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}

// Auto-run if executed directly as entrypoint
if (process.argv[1]?.endsWith('server.js') || process.argv[1]?.endsWith('server.ts')) {
  startServer();
}
