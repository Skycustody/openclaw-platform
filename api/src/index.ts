import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';

import { errorHandler } from './middleware/errorHandler';
import { rateLimitGeneral } from './middleware/rateLimit';

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

import { startScheduler } from './jobs/scheduler';
import redis from './lib/redis';

const app = express();
const httpServer = createServer(app);

// ── WebSocket ──
const io = new SocketServer(httpServer, {
  cors: { origin: process.env.PLATFORM_URL || '*', methods: ['GET', 'POST'] },
});

io.on('connection', (socket) => {
  const userId = socket.handshake.auth?.userId;
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
