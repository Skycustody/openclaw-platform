import path from 'path';
import { config } from 'dotenv';

// Load .env: try project root (openclaw-platform/.env) then api/.env
const rootEnv = path.join(__dirname, '..', '..', '.env');
const apiEnv = path.join(__dirname, '..', '.env');
config({ path: rootEnv });
config({ path: apiEnv }); // api/.env can override (e.g. when only api is deployed)

const sshKey = process.env.SSH_PRIVATE_KEY;
const sshKeyPath = process.env.SSH_PRIVATE_KEY_PATH?.trim();
if (sshKey) {
  console.log(`SSH key loaded from env (${sshKey.replace(/\s/g, '').length} chars) for worker SSH`);
} else if (sshKeyPath) {
  console.log(`SSH key will be read from file: ${sshKeyPath}`);
} else {
  console.warn('SSH_PRIVATE_KEY or SSH_PRIVATE_KEY_PATH not set — SSH to workers will fail');
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';

import { errorHandler } from './middleware/errorHandler';
import { rateLimitGeneral } from './middleware/rateLimit';
import jwt from 'jsonwebtoken';

import authRoutes from './routes/auth';
import agentRoutes from './routes/agent';
import tokenRoutes from './routes/tokens';
import settingsRoutes from './routes/settings';
import channelRoutes from './routes/channels';
import memoryRoutes from './routes/memories';
import cronRoutes from './routes/cron';
import routerRoutes from './routes/router';
import activityRoutes from './routes/activity';
import conversationRoutes from './routes/conversations';
import fileRoutes from './routes/files';
import billingRoutes from './routes/billing';
import referralRoutes from './routes/referrals';
import templateRoutes from './routes/templates';
import webhookRoutes from './routes/webhooks';
import adminRoutes from './routes/admin';
import proxyRoutes from './routes/proxy';
import autoRoutes from './routes/auto';

import { startScheduler } from './jobs/scheduler';
import redis from './lib/redis';

const app = express();
const httpServer = createServer(app);

// ── WebSocket ──
const io = new SocketServer(httpServer, {
  cors: { origin: process.env.PLATFORM_URL || '*', methods: ['GET', 'POST'] },
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    socket.data.userId = payload.userId;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.data.userId;
  if (userId) {
    socket.join(userId);
  }
  socket.on('disconnect', () => {});
});

// Make io available to routes
app.set('io', io);

// ── Middleware ──
// Raw body for Stripe webhooks
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(cors({ origin: process.env.PLATFORM_URL || '*', credentials: true }));
app.use(helmet());
app.use(morgan('short'));
app.use(rateLimitGeneral);

// ── Routes ──
app.use('/auth', authRoutes);
app.use('/agent', agentRoutes);
app.use('/tokens', tokenRoutes);
app.use('/settings', settingsRoutes);
app.use('/channels', channelRoutes);
app.use('/memories', memoryRoutes);
app.use('/cron', cronRoutes);
app.use('/router', routerRoutes);
app.use('/activity', activityRoutes);
app.use('/conversations', conversationRoutes);
app.use('/files', fileRoutes);
app.use('/billing', billingRoutes);
app.use('/referrals', referralRoutes);
app.use('/templates', templateRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/admin', adminRoutes);
app.use('/proxy', proxyRoutes);
app.use('/auto', autoRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Error Handler ──
app.use(errorHandler);

// ── Start ──
const PORT = parseInt(process.env.PORT || '4000');

async function start() {
  try {
    await redis.connect();
    console.log('Redis connected');
  } catch (err) {
    console.warn('Redis connection failed, continuing without cache:', err);
  }

  httpServer.listen(PORT, () => {
    console.log(`OpenClaw API running on port ${PORT}`);
    startScheduler();
  });
}

start().catch(console.error);

export { app, io };
