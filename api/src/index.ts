/**
 * OPENCLAW SAAS PLATFORM — API SERVER
 *
 * This is NOT a standalone AI service. This is the control plane for a hosted
 * OpenClaw platform. Every user gets their own OpenClaw container. The API:
 *  - Provisions and manages containers on worker servers
 *  - Proxies AI calls from containers and tracks token usage
 *  - Syncs settings/skills/channels to container config (openclaw.json)
 *  - Serves auth, billing, and admin endpoints
 *
 * ALL user AI interactions go through the OpenClaw container, never direct.
 * See AGENTS.md and .cursor/rules/openclaw-saas-mission.mdc for full details.
 */
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
import agentsRoutes from './routes/agents';
import skillsRoutes from './routes/skills';

import { startScheduler } from './jobs/scheduler';
import redis from './lib/redis';

const app = express();
const httpServer = createServer(app);

const ALLOWED_ORIGINS = process.env.PLATFORM_URL
  ? process.env.PLATFORM_URL.split(',').map(s => s.trim())
  : ['http://localhost:3000'];

// ── WebSocket ──
const io = new SocketServer(httpServer, {
  cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] },
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
// Trust the first reverse proxy (nginx/Cloudflare) for req.ip
app.set('trust proxy', 1);

// Raw body for Stripe webhooks
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));

// HTTPS redirect in production.
// CRITICAL: /webhooks/* and /health MUST be skipped. Workers call back via
// HTTP POST to /webhooks/servers/register. A 301 redirect converts POST→GET,
// losing the body and silently failing worker registration.
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.path.startsWith('/webhooks/') || req.path === '/health') {
      return next();
    }
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.hostname}${req.url}`);
    }
    next();
  });
}

app.use(express.json({ limit: '10mb' }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
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
app.use('/agents', agentsRoutes);
app.use('/skills', skillsRoutes);

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
