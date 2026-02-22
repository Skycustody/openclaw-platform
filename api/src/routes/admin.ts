import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireAdmin } from '../middleware/auth';
import { rateLimitAdmin } from '../middleware/rateLimit';
import db from '../lib/db';
import { getServerLoad, checkCapacity, getAllWorkersStats } from '../services/serverRegistry';
import { provisionUser } from '../services/provisioning';
import { User, PLAN_LIMITS, PROFIT_MARGIN_TARGET } from '../types';
import { sshExec } from '../services/ssh';
import { injectApiKeys } from '../services/apiKeys';
import { ensureNexosKey, RETAIL_MARKUP, AVG_COST_PER_1M_USD, USD_TO_EUR_CENTS } from '../services/nexos';

const router = Router();

router.use(rateLimitAdmin);
router.use(authenticate);
router.use(requireAdmin);

// ── Platform Overview ──
router.get('/overview', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const [users, servers, recentSignups, plans] = await Promise.all([
      db.getOne<any>(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE status = 'sleeping') as sleeping,
          COUNT(*) FILTER (WHERE status = 'paused') as paused,
          COUNT(*) FILTER (WHERE status = 'provisioning') as provisioning,
          COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as new_24h,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as new_7d,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as new_30d
        FROM users
      `),
      db.getOne<any>(`
        SELECT
          COUNT(*) as total,
          COALESCE(SUM(ram_total), 0) as total_ram,
          COALESCE(SUM(ram_used), 0) as used_ram
        FROM servers WHERE status = 'active'
      `),
      db.getMany<any>(`
        SELECT id, email, plan, status, created_at
        FROM users ORDER BY created_at DESC LIMIT 10
      `),
      db.getOne<any>(`
        SELECT
          COUNT(*) FILTER (WHERE plan = 'starter') as starter,
          COUNT(*) FILTER (WHERE plan = 'pro') as pro,
          COUNT(*) FILTER (WHERE plan = 'business') as business
        FROM users WHERE status != 'cancelled'
      `),
    ]);

    const starterCount = parseInt(plans?.starter || '0');
    const proCount = parseInt(plans?.pro || '0');
    const businessCount = parseInt(plans?.business || '0');

    const planCounts: Record<string, number> = { starter: starterCount, pro: proCount, business: businessCount };

    // Monthly subscription revenue (what users pay us, EUR cents)
    const monthlySubscriptionRevenue = Object.entries(planCounts).reduce(
      (sum, [plan, count]) => sum + count * (PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS]?.priceEurCents || 0), 0
    );

    // Server costs
    const serverCount = parseInt(servers?.total || '0');
    const serverCostPerMonth = parseInt(process.env.SERVER_COST_EUR_CENTS || '1999');
    const monthlyServerCosts = serverCount * serverCostPerMonth;

    // OpenRouter credit costs (estimated from per-plan budget allocations)
    const monthlyNexosCosts = Object.entries(planCounts).reduce(
      (sum, [plan, count]) => sum + count * (PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS]?.nexosCreditBudgetEurCents || 0), 0
    );

    const totalCosts = monthlyServerCosts + monthlyNexosCosts;
    const monthlyProfit = monthlySubscriptionRevenue - totalCosts;
    const profitMarginPercent = monthlySubscriptionRevenue > 0
      ? Math.round((monthlyProfit / monthlySubscriptionRevenue) * 100) : 0;

    const financials = {
      currency: 'EUR',
      monthlySubscriptionRevenue,
      monthlyServerCosts,
      monthlyNexosCosts,
      monthlyProfit,
      profitMarginPercent,
      profitMarginTarget: Math.round(PROFIT_MARGIN_TARGET * 100),
      retailMarkup: RETAIL_MARKUP,
      perPlan: Object.fromEntries(
        Object.entries(planCounts).map(([plan, count]) => {
          const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS];
          const revenue = count * (limits?.priceEurCents || 0);
          const nexosCost = count * (limits?.nexosCreditBudgetEurCents || 0);
          const serverCost = count * (limits?.serverCostShareEurCents || 0);
          return [plan, {
            count,
            revenueEurCents: revenue,
            nexosCostEurCents: nexosCost,
            serverCostEurCents: serverCost,
            profitEurCents: revenue - nexosCost - serverCost,
            marginPercent: revenue > 0 ? Math.round(((revenue - nexosCost - serverCost) / revenue) * 100) : 0,
          }];
        })
      ),
    };

    res.json({ users, servers, recentSignups, plans, financials });
  } catch (err) {
    next(err);
  }
});

// ── Revenue & Billing Stats (EUR) ──
router.get('/revenue', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const [subscriptions, topUsers, signupsByMonth] = await Promise.all([
      db.getMany<any>(`
        SELECT plan, COUNT(*) as count
        FROM users WHERE status != 'cancelled'
        GROUP BY plan
      `),
      db.getMany<any>(`
        SELECT u.email, u.plan, u.status, u.created_at, u.last_active
        FROM users u
        WHERE u.status != 'cancelled'
        ORDER BY u.last_active DESC NULLS LAST
        LIMIT 20
      `),
      db.getMany<any>(`
        SELECT
          DATE_TRUNC('month', created_at) as month,
          COUNT(*) as signups,
          COUNT(*) FILTER (WHERE status != 'cancelled') as active
        FROM users
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
      `),
    ]);

    const subscriptionRevenue: Record<string, { count: number; revenueEurCents: number; nexosCostEurCents: number; profitEurCents: number }> = {};
    let totalRevenueEurCents = 0;
    let totalNexosCostEurCents = 0;
    let totalServerCostEurCents = 0;

    for (const s of subscriptions) {
      const count = parseInt(s.count);
      const limits = PLAN_LIMITS[s.plan as keyof typeof PLAN_LIMITS];
      if (!limits) continue;

      const revenue = count * limits.priceEurCents;
      const nexosCost = count * limits.nexosCreditBudgetEurCents;
      const serverCost = count * limits.serverCostShareEurCents;

      subscriptionRevenue[s.plan] = {
        count,
        revenueEurCents: revenue,
        nexosCostEurCents: nexosCost,
        profitEurCents: revenue - nexosCost - serverCost,
      };

      totalRevenueEurCents += revenue;
      totalNexosCostEurCents += nexosCost;
      totalServerCostEurCents += serverCost;
    }

    const totalProfitEurCents = totalRevenueEurCents - totalNexosCostEurCents - totalServerCostEurCents;
    const profitMarginPercent = totalRevenueEurCents > 0
      ? Math.round((totalProfitEurCents / totalRevenueEurCents) * 100) : 0;

    res.json({
      currency: 'EUR',
      totalRevenueEurCents,
      totalNexosCostEurCents,
      totalServerCostEurCents,
      totalProfitEurCents,
      profitMarginPercent,
      profitMarginTarget: Math.round(PROFIT_MARGIN_TARGET * 100),
      retailMarkup: RETAIL_MARKUP,
      subscriptionRevenue,
      topUsers,
      signupsByMonth,
    });
  } catch (err) {
    next(err);
  }
});

// ── All Users (paginated, searchable) ──
router.get('/users', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const search = (req.query.search as string || '').trim();
    const status = req.query.status as string || '';
    const plan = req.query.plan as string || '';

    let where = 'WHERE 1=1';
    const params: any[] = [];
    let paramIdx = 1;

    if (search) {
      where += ` AND (u.email ILIKE $${paramIdx} OR u.display_name ILIKE $${paramIdx} OR u.subdomain ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }
    if (status) {
      where += ` AND u.status = $${paramIdx}`;
      params.push(status);
      paramIdx++;
    }
    if (plan) {
      where += ` AND u.plan = $${paramIdx}`;
      params.push(plan);
      paramIdx++;
    }

    const [users, countResult] = await Promise.all([
      db.getMany<any>(
        `SELECT u.id, u.email, u.display_name, u.plan, u.status, u.subdomain,
                u.created_at, u.last_active, u.is_admin,
                tb.balance as token_balance, tb.total_used, tb.total_purchased,
                s.ip as server_ip, s.hostname as server_hostname
         FROM users u
         LEFT JOIN token_balances tb ON tb.user_id = u.id
         LEFT JOIN servers s ON s.id = u.server_id
         ${where}
         ORDER BY u.created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limit, offset]
      ),
      db.getOne<any>(
        `SELECT COUNT(*) as total FROM users u ${where}`,
        params
      ),
    ]);

    res.json({ users, total: parseInt(countResult?.total || '0') });
  } catch (err) {
    next(err);
  }
});

// ── Single User Detail ──
router.get('/users/:userId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const [user, tokens, activity, transactions] = await Promise.all([
      db.getOne<any>(
        `SELECT u.*, s.ip as server_ip, s.hostname as server_hostname
         FROM users u
         LEFT JOIN servers s ON s.id = u.server_id
         WHERE u.id = $1`,
        [userId]
      ),
      db.getOne<any>(
        'SELECT * FROM token_balances WHERE user_id = $1',
        [userId]
      ),
      db.getMany<any>(
        'SELECT * FROM activity_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
        [userId]
      ),
      db.getMany<any>(
        'SELECT * FROM token_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
        [userId]
      ),
    ]);

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user, tokens, activity, transactions });
  } catch (err) {
    next(err);
  }
});

// ── Update User (change plan, status, admin flag) ──
router.put('/users/:userId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const { plan, status, is_admin, token_balance } = req.body;

    if (plan) {
      const validPlans = ['starter', 'pro', 'business'];
      if (!validPlans.includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
      await db.query('UPDATE users SET plan = $1 WHERE id = $2', [plan, userId]);
    }
    if (status) {
      const validStatuses = ['provisioning', 'active', 'sleeping', 'paused', 'cancelled', 'grace_period'];
      if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
      await db.query('UPDATE users SET status = $1 WHERE id = $2', [status, userId]);
    }
    if (typeof is_admin === 'boolean') {
      await db.query('UPDATE users SET is_admin = $1 WHERE id = $2', [is_admin, userId]);
    }
    if (typeof token_balance === 'number' && token_balance >= 0) {
      await db.query(
        `INSERT INTO token_balances (user_id, balance, total_purchased)
         VALUES ($1, $2, $2)
         ON CONFLICT (user_id) DO UPDATE SET balance = $2`,
        [userId, token_balance]
      );
    }

    const user = await db.getOne<any>('SELECT id, email, plan, status, is_admin FROM users WHERE id = $1', [userId]);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// ── Server Management ──
router.get('/servers', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const servers = await getServerLoad();
    res.json({ servers });
  } catch (err) {
    next(err);
  }
});

router.get('/worker-stats', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stats = await getAllWorkersStats();
    res.json({ workers: stats });
  } catch (err) {
    next(err);
  }
});

// ── Actions ──
router.post('/check-capacity', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await checkCapacity();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/reprovision', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.body;
    let users: User[];

    if (userId) {
      const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
      if (!user) return res.status(404).json({ error: 'User not found' });
      users = [user];
    } else {
      users = await db.getMany<User>(
        `SELECT * FROM users WHERE status = 'provisioning' AND server_id IS NULL`
      );
    }

    if (users.length === 0) {
      return res.json({ message: 'No stuck users to re-provision', results: [] });
    }

    const results = [];
    for (const user of users) {
      try {
        console.log(`Re-provisioning user ${user.id} (${user.email})...`);
        const result = await provisionUser({
          userId: user.id,
          email: user.email,
          plan: user.plan as any,
          stripeCustomerId: user.stripe_customer_id || undefined,
        });
        results.push({ userId: user.id, email: user.email, status: 'success', subdomain: result.subdomain });
      } catch (err: any) {
        console.error(`Re-provision failed for ${user.id}:`, err.message);
        results.push({ userId: user.id, email: user.email, status: 'failed', error: err.message });
      }
    }

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

router.post('/inject-keys', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.body;
    let users: any[];

    if (userId) {
      const user = await db.getOne<any>(
        `SELECT u.*, s.ip as server_ip FROM users u
         LEFT JOIN servers s ON s.id = u.server_id
         WHERE u.id = $1`,
        [userId]
      );
      if (!user) return res.status(404).json({ error: 'User not found' });
      users = [user];
    } else {
      users = await db.getMany<any>(
        `SELECT u.*, s.ip as server_ip FROM users u
         LEFT JOIN servers s ON s.id = u.server_id
         WHERE u.server_id IS NOT NULL AND u.status IN ('active', 'sleeping', 'provisioning')`
      );
    }

    if (users.length === 0) {
      return res.json({ message: 'No users with containers found', results: [] });
    }

    const results = [];

    for (const user of users) {
      try {
        const cn = user.container_name || `openclaw-${user.id.slice(0, 12)}`;
        const nexosKey = await ensureNexosKey(user.id);
        await injectApiKeys(user.server_ip, user.id, cn, user.plan || 'starter');
        await sshExec(user.server_ip, `docker restart ${cn} 2>/dev/null || true`);
        results.push({ userId: user.id, email: user.email, nexosKey: nexosKey.slice(0, 12) + '...', status: 'success' });
      } catch (err: any) {
        console.error(`[inject-keys] Failed for ${user.id}:`, err.message);
        results.push({ userId: user.id, email: user.email, status: 'failed', error: err.message });
      }
    }

    res.json({ fixed: results.filter(r => r.status === 'success').length, total: users.length, results });
  } catch (err) {
    next(err);
  }
});

export default router;
