/**
 * API Routes — Auth
 */

import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthError, ValidationError, NotFoundError } from '../lib/errors.js';
import { env } from '../config/index.js';
import { requireAuth, signToken } from '../middleware/auth.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

authRouter.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseRes = registerSchema.safeParse(req.body);
    if (!parseRes.success) {
      throw new ValidationError('Invalid registration parameters', parseRes.error.format());
    }

    const { email, password } = parseRes.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ValidationError('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash },
    });

    const token = signToken({ id: user.id, email: user.email, role: user.role });

    res.status(201).json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, role: user.role },
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseRes = loginSchema.safeParse(req.body);
    if (!parseRes.success) {
      throw new ValidationError('Invalid login parameters', parseRes.error.format());
    }

    const { email, password } = parseRes.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AuthError('Invalid email or password');
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new AuthError('Invalid email or password');
    }

    const token = signToken({ id: user.id, email: user.email, role: user.role });

    res.json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, role: user.role },
      },
    });
  } catch (err) {
    next(err);
  }
});

// Dev/Quick Login endpoint for seamless local development
authRouter.post('/dev-login', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (env.NODE_ENV === 'production') throw new NotFoundError('Endpoint');
    const devEmail =
      process.env.DEV_USER_EMAIL ||
      'developer@elementor.local';
    let user = await prisma.user.findUnique({ where: { email: devEmail } });
    if (!user) {
      const defaultHash = await bcrypt.hash('devpassword123', 10);
      user = await prisma.user.create({
        data: {
          email: devEmail,
          passwordHash: defaultHash,
        },
      });
    }

    const token = signToken({ id: user.id, email: user.email, role: user.role });

    res.json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, role: user.role },
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id || (req as any).user?.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AuthError('User not found');
    }

    const userData = {
      id: user.id,
      email: user.email,
      role: user.role,
      usedStorage: user.usedStorage.toString(),
      storageQuota: user.storageQuota.toString(),
    };

    res.json({
      success: true,
      data: {
        ...userData,
        user: userData,
      },
    });
  } catch (err) {
    next(err);
  }
});

