import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireAdmin } from '../middleware/auth';
import { rateLimitAdmin } from '../middleware/rateLimit';
import db from '../lib/db';
import { getServerLoad, checkCapacity, getAllWorkersStats } from '../services/serverRegistry';
import { provisionUser } from '../services/provisioning';
import { User, PLAN_LIMITS, PROFIT_MARGIN_TARGET } from '../types';
import { sshExec } from '../services/ssh';
import { injectApiKeys } from '../services/apiKeys';
import { ensureNexosKey, RETAIL_MARKUP, AVG_COST_PER_1M_USD, fetchOpenRouterTotalUsage, getNexosUsage } from '../services/nexos';
import { fetchCreditRevenueFromStripe } from '../services/stripe';
import { updateImageOnAllWorkers } from '../services/dockerImage';

const router = Router();

router.use(rateLimitAdmin);
router.use(authenticate);
router.use(requireAdmin);

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const CONTAINER_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/;

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();

function validateUuid(id: string | string[]): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}

function safeContainerName(name: string | null | undefined, fallbackUserId: string): string {
  const cn = name || `openclaw-${fallbackUserId.slice(0, 12)}`;
  if (!CONTAINER_NAME_RE.test(cn)) throw new Error(`Invalid container name: ${cn}`);
  return cn;
}

// ── Platform Overview ──
router.get('/overview', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const [users, servers, recentSignups, plans, creditsRow, revenueRow, churnRow, conversionRow] = await Promise.all([
      db.getOne<any>(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE status = 'sleeping') as sleeping,
          COUNT(*) FILTER (WHERE status = 'paused') as paused,
          COUNT(*) FILTER (WHERE status = 'provisioning') as provisioning,
          COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE stripe_customer_id IS NOT NULL AND LOWER(email) != $1) as paid,
          COUNT(*) FILTER (WHERE stripe_customer_id IS NULL AND status != 'cancelled') as unpaid,
          COUNT(*) FILTER (WHERE stripe_customer_id IS NOT NULL AND status NOT IN ('cancelled', 'pending') AND LOWER(email) != $1) as paying_active,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as new_24h,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as new_7d,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as new_30d
        FROM users
      `, [ADMIN_EMAIL]),
      db.getOne<any>(`
        SELECT
          COUNT(*) as total,
          COALESCE(SUM(ram_total), 0) as total_ram,
          COALESCE(SUM(ram_used), 0) as used_ram
        FROM servers WHERE status = 'active'
      `),
      db.getMany<any>(`
        SELECT id, email, plan, status, created_at, (stripe_customer_id IS NOT NULL) as has_paid
        FROM users ORDER BY created_at DESC LIMIT 10
      `),
      db.getOne<any>(`
        SELECT
          COUNT(*) FILTER (WHERE plan = 'starter') as starter,
          COUNT(*) FILTER (WHERE plan = 'pro') as pro,
          COUNT(*) FILTER (WHERE plan = 'business') as business
        FROM users WHERE stripe_customer_id IS NOT NULL
          AND status NOT IN ('cancelled', 'pending')
          AND LOWER(email) != $1
      `, [ADMIN_EMAIL]),
      db.getOne<any>(`
        SELECT
          COALESCE(SUM(total_used), 0)::text as total_used,
          COALESCE(SUM(balance), 0)::text as total_balance,
          COALESCE(SUM(total_purchased), 0)::text as total_purchased
        FROM token_balances
      `).catch(() => ({ total_used: '0', total_balance: '0', total_purchased: '0' })),
      db.getOne<any>(`
        SELECT
          COALESCE(SUM(CASE WHEN created_at >= DATE_TRUNC('month', NOW()) THEN amount_eur_cents ELSE 0 END), 0)::text as month_credit_purchases,
          COALESCE(SUM(amount_eur_cents), 0)::text as total_credit_purchases
        FROM credit_purchases
      `).catch(() => ({ month_credit_purchases: '0', total_credit_purchases: '0' })),
      // Churn: users who paid but are now cancelled/paused (exclude admin)
      db.getOne<any>(`
        SELECT
          COUNT(*) FILTER (WHERE stripe_customer_id IS NOT NULL AND status IN ('cancelled', 'paused') AND LOWER(email) != $1) as churned,
          COUNT(*) FILTER (WHERE stripe_customer_id IS NOT NULL AND LOWER(email) != $1) as total_ever_paid
        FROM users
      `, [ADMIN_EMAIL]).catch(() => ({ churned: '0', total_ever_paid: '0' })),
      // Conversion: signups → paid (exclude admin from both sides)
      db.getOne<any>(`
        SELECT
          COUNT(*) FILTER (WHERE LOWER(email) != $1) as total_signups,
          COUNT(*) FILTER (WHERE stripe_customer_id IS NOT NULL AND LOWER(email) != $1) as converted
        FROM users
      `, [ADMIN_EMAIL]).catch(() => ({ total_signups: '0', converted: '0' })),
    ]);

    const desktopRow = await db.getOne<any>(
      `SELECT
         COUNT(*) as total_signups,
         COUNT(*) FILTER (WHERE desktop_subscription_id IS NOT NULL) as paid,
         COUNT(*) FILTER (WHERE desktop_trial_ends_at IS NOT NULL AND desktop_trial_ends_at > NOW() AND desktop_subscription_id IS NULL) as trialing,
         COUNT(*) FILTER (WHERE desktop_trial_ends_at IS NOT NULL AND desktop_trial_ends_at <= NOW() AND desktop_subscription_id IS NULL) as trial_expired,
         COUNT(*) FILTER (WHERE desktop_subscription_id IS NOT NULL OR (desktop_trial_ends_at IS NOT NULL AND desktop_trial_ends_at > NOW())) as active,
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as new_24h,
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as new_7d
       FROM desktop_users WHERE LOWER(email) != $1`,
      [ADMIN_EMAIL]
    ).catch(() => ({ total_signups: '0', paid: '0', trialing: '0', trial_expired: '0', active: '0', new_24h: '0', new_7d: '0' }));

    const desktopVpsOverlap = await db.getOne<any>(
      `SELECT
         COUNT(*) as desktop_and_vps
       FROM desktop_users d
       INNER JOIN users u ON LOWER(u.email) = LOWER(d.email)
         AND u.status NOT IN ('pending', 'cancelled') AND u.server_id IS NOT NULL
       WHERE d.desktop_subscription_id IS NOT NULL`,
    ).catch(() => ({ desktop_and_vps: '0' }));

    const starterCount = parseInt(plans?.starter || '0');
    const proCount = parseInt(plans?.pro || '0');
    const businessCount = parseInt(plans?.business || '0');

    const planCounts: Record<string, number> = { starter: starterCount, pro: proCount, business: businessCount };
    const payingActiveCount = parseInt(users?.paying_active || '0');

    const monthlySubscriptionRevenue = Object.entries(planCounts).reduce(
      (sum, [plan, count]) => sum + count * (PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS]?.priceUsdCents || 0), 0
    );

    const serverCount = parseInt(servers?.total || '0');
    const serverCostNetPerMonth = parseInt(process.env.SERVER_COST_USD_CENTS || process.env.SERVER_COST_EUR_CENTS || '4300');
    const vatRate = parseFloat(process.env.SERVER_VAT_RATE || '0.21');
    const serverCostVatPerMonth = Math.round(serverCostNetPerMonth * vatRate);
    const serverCostGrossPerMonth = serverCostNetPerMonth + serverCostVatPerMonth;
    const monthlyServerCostsNet = serverCount * serverCostNetPerMonth;
    const monthlyServerCostsVat = serverCount * serverCostVatPerMonth;
    const monthlyServerCosts = serverCount * serverCostGrossPerMonth;

    const monthlyNexosCosts = Object.entries(planCounts).reduce(
      (sum, [plan, count]) => sum + count * (PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS]?.nexosCreditBudgetUsdCents || 0), 0
    );

    const monthlyCreditRevenue = parseInt(revenueRow?.month_credit_purchases ?? '0');
    const totalMonthlyRevenue = monthlySubscriptionRevenue + monthlyCreditRevenue;
    const totalCosts = monthlyServerCosts + monthlyNexosCosts;
    const monthlyProfit = totalMonthlyRevenue - totalCosts;
    const profitMarginPercent = totalMonthlyRevenue > 0
      ? Math.round((monthlyProfit / totalMonthlyRevenue) * 100) : 0;

    // Key SaaS metrics
    const arpu = payingActiveCount > 0 ? Math.round(monthlySubscriptionRevenue / payingActiveCount) : 0;
    const totalEverPaid = parseInt(churnRow?.total_ever_paid || '0');
    const churned = parseInt(churnRow?.churned || '0');
    const churnRate = totalEverPaid > 0 ? Math.round((churned / totalEverPaid) * 100) : 0;
    const totalSignups = parseInt(conversionRow?.total_signups || '0');
    const converted = parseInt(conversionRow?.converted || '0');
    const conversionRate = totalSignups > 0 ? Math.round((converted / totalSignups) * 100) : 0;
    const ltv = churnRate > 0 ? Math.round(arpu * (100 / churnRate)) : 0;

    const financials = {
      currency: 'USD',
      monthlySubscriptionRevenue,
      monthlyCreditRevenue,
      totalMonthlyRevenue,
      monthlyServerCosts,
      monthlyServerCostsNet,
      monthlyServerCostsVat,
      serverCostNetPerMonth,
      serverCostVatPerMonth,
      serverCostGrossPerMonth,
      vatRate,
      monthlyNexosCosts,
      monthlyCreditCosts: monthlyNexosCosts,
      totalCosts,
      monthlyProfit,
      profitMarginPercent,
      profitMarginTarget: Math.round(PROFIT_MARGIN_TARGET * 100),
      retailMarkup: RETAIL_MARKUP,
      perPlan: Object.fromEntries(
        Object.entries(planCounts).map(([plan, count]) => {
          const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS];
          const revenue = count * (limits?.priceUsdCents || 0);
          const nexosCost = count * (limits?.nexosCreditBudgetUsdCents || 0);
          const serverCost = count * (limits?.serverCostShareUsdCents || 0);
          return [plan, {
            count,
            priceUsdCents: limits?.priceUsdCents || 0,
            revenueUsdCents: revenue,
            nexosCostUsdCents: nexosCost,
            serverCostUsdCents: serverCost,
            totalCostUsdCents: nexosCost + serverCost,
            profitUsdCents: revenue - nexosCost - serverCost,
            marginPercent: revenue > 0 ? Math.round(((revenue - nexosCost - serverCost) / revenue) * 100) : 0,
          }];
        })
      ),
    };

    const metrics = {
      mrr: totalMonthlyRevenue,
      arpu,
      payingActive: payingActiveCount,
      churnRate,
      churned,
      totalEverPaid,
      conversionRate,
      converted,
      totalSignups,
      ltv,
    };

    const revenue = {
      month_credit_purchases: String(parseInt(revenueRow?.month_credit_purchases ?? '0') / 100),
      total_credit_purchases: String(parseInt(revenueRow?.total_credit_purchases ?? '0') / 100),
    };
    const credits = {
      total_used: creditsRow?.total_used ?? '0',
      total_balance: creditsRow?.total_balance ?? '0',
      total_purchased: creditsRow?.total_purchased ?? '0',
    };
    const desktopPaidCount = parseInt(desktopRow?.paid || '0');
    const desktopTrialingCount = parseInt(desktopRow?.trialing || '0');
    const desktopActiveCount = parseInt(desktopRow?.active || '0');
    const desktopTotalSignups = parseInt(desktopRow?.total_signups || '0');
    const desktopTrialExpired = parseInt(desktopRow?.trial_expired || '0');
    const desktopNew24h = parseInt(desktopRow?.new_24h || '0');
    const desktopNew7d = parseInt(desktopRow?.new_7d || '0');
    const desktopAndVpsCount = parseInt(desktopVpsOverlap?.desktop_and_vps || '0');
    const desktopOnlyCount = desktopPaidCount - desktopAndVpsCount;
    const desktopPriceEurCents = 500;
    const desktopVatRate = 0.25;
    const desktopRevenueEurCents = desktopPaidCount * Math.round(desktopPriceEurCents * (1 + desktopVatRate));

    const desktop = {
      subscribers: desktopPaidCount,
      trialing: desktopTrialingCount,
      trialExpired: desktopTrialExpired,
      total: desktopActiveCount,
      totalSignups: desktopTotalSignups,
      desktopOnly: desktopOnlyCount,
      desktopAndVps: desktopAndVpsCount,
      new24h: desktopNew24h,
      new7d: desktopNew7d,
      priceEurCents: desktopPriceEurCents,
      vatRate: desktopVatRate,
      revenueEurCents: desktopRevenueEurCents,
    };

    res.json({ users, servers, recentSignups, plans, financials, metrics, revenue, credits, desktop });
  } catch (err) {
    next(err);
  }
});

// ── Website traffic & funnel (self-hosted analytics) ──
router.get('/traffic', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tables = await db.getOne<any>(
      `SELECT
         EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'page_views') as page_views,
         EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'track_events') as track_events,
         EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'desktop_usage') as desktop_usage`
    ).catch(() => ({ page_views: false, track_events: false, desktop_usage: false }));

    const hasPv = tables?.page_views === true || tables?.page_views === 't';
    const hasTe = tables?.track_events === true || tables?.track_events === 't';
    const hasDu = tables?.desktop_usage === true || tables?.desktop_usage === 't';

    if (!hasPv || !hasTe) {
      return res.json({
        enabled: false,
        message: 'Run migration 026_page_analytics.sql to enable traffic analytics.',
        viewsToday: 0,
        views7d: 0,
        views30d: 0,
        uniqueVisitors7d: 0,
        uniqueVisitors30d: 0,
        topPages: [] as any[],
        topReferrers: [] as any[],
        devices: [] as any[],
        browsers: [] as any[],
        countries: [] as any[],
        funnel: {
          homeLanding: 0,
          desktopPage: 0,
          downloadClick: 0,
          appOpened: 0,
          desktopSignups: 0,
        },
      });
    }

    // Exclude admin visitor_ids — anyone who ever visited /admin is an admin, not a real user
    const ADMIN_FILTER = `visitor_id NOT IN (SELECT DISTINCT visitor_id FROM page_views WHERE path LIKE '/admin%')`;
    const ADMIN_FILTER_TE = `visitor_id NOT IN (SELECT DISTINCT visitor_id FROM page_views WHERE path LIKE '/admin%')`;

    const [
      viewsToday,
      views7d,
      views30d,
      unique7d,
      unique30d,
      // Previous period for comparison
      prevViewsToday,
      prevViews7d,
      prevViews30d,
      prevUnique7d,
      prevUnique30d,
      topPages,
      topReferrers,
      utmSources,
      devices,
      browsers,
      countries,
      funnelHome,
      funnelDesktop,
      funnelDownload,
      funnelApp,
      funnelSignups,
    ] = await Promise.all([
      // Current period
      db.getOne<any>(`SELECT COUNT(*)::text as c FROM page_views WHERE created_at > NOW() - INTERVAL '1 day' AND ${ADMIN_FILTER}`),
      db.getOne<any>(`SELECT COUNT(*)::text as c FROM page_views WHERE created_at > NOW() - INTERVAL '7 days' AND ${ADMIN_FILTER}`),
      db.getOne<any>(`SELECT COUNT(*)::text as c FROM page_views WHERE created_at > NOW() - INTERVAL '30 days' AND ${ADMIN_FILTER}`),
      db.getOne<any>(`SELECT COUNT(DISTINCT visitor_id)::text as c FROM page_views WHERE created_at > NOW() - INTERVAL '7 days' AND ${ADMIN_FILTER}`),
      db.getOne<any>(`SELECT COUNT(DISTINCT visitor_id)::text as c FROM page_views WHERE created_at > NOW() - INTERVAL '30 days' AND ${ADMIN_FILTER}`),
      // Previous period (for week-over-week / period-over-period comparison)
      db.getOne<any>(`SELECT COUNT(*)::text as c FROM page_views WHERE created_at BETWEEN NOW() - INTERVAL '2 days' AND NOW() - INTERVAL '1 day' AND ${ADMIN_FILTER}`),
      db.getOne<any>(`SELECT COUNT(*)::text as c FROM page_views WHERE created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days' AND ${ADMIN_FILTER}`),
      db.getOne<any>(`SELECT COUNT(*)::text as c FROM page_views WHERE created_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days' AND ${ADMIN_FILTER}`),
      db.getOne<any>(`SELECT COUNT(DISTINCT visitor_id)::text as c FROM page_views WHERE created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days' AND ${ADMIN_FILTER}`),
      db.getOne<any>(`SELECT COUNT(DISTINCT visitor_id)::text as c FROM page_views WHERE created_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days' AND ${ADMIN_FILTER}`),
      // Top pages
      db.getMany<any>(`
        SELECT path, COUNT(*)::text as views, COUNT(DISTINCT visitor_id)::text as uniques
        FROM page_views WHERE created_at > NOW() - INTERVAL '30 days' AND ${ADMIN_FILTER}
        GROUP BY path ORDER BY COUNT(*) DESC LIMIT 20`),
      // Top referrers with signup count per referrer domain
      db.getMany<any>(`
        SELECT
          COALESCE(NULLIF(TRIM(pv.referrer), ''), '(direct)') as ref,
          COUNT(*)::text as views,
          COUNT(DISTINCT CASE WHEN te.event IS NOT NULL THEN pv.visitor_id END)::text as signups
        FROM page_views pv
        LEFT JOIN track_events te ON te.visitor_id = pv.visitor_id AND te.event = 'desktop_signup'
        WHERE pv.created_at > NOW() - INTERVAL '30 days' AND pv.${ADMIN_FILTER}
        GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 15`),
      // UTM campaign breakdown
      db.getMany<any>(`
        SELECT
          COALESCE(NULLIF(TRIM(utm_source), ''), '(none)') as source,
          COALESCE(NULLIF(TRIM(utm_medium), ''), '') as medium,
          COUNT(*)::text as views,
          COUNT(DISTINCT visitor_id)::text as uniques
        FROM page_views
        WHERE created_at > NOW() - INTERVAL '30 days' AND ${ADMIN_FILTER}
          AND utm_source IS NOT NULL AND TRIM(utm_source) != ''
        GROUP BY 1, 2 ORDER BY COUNT(*) DESC LIMIT 15`),
      db.getMany<any>(`
        SELECT device, COUNT(*)::text as views FROM page_views WHERE created_at > NOW() - INTERVAL '30 days' AND ${ADMIN_FILTER}
        GROUP BY device ORDER BY COUNT(*) DESC`),
      db.getMany<any>(`
        SELECT browser, COUNT(*)::text as views FROM page_views WHERE created_at > NOW() - INTERVAL '30 days' AND ${ADMIN_FILTER}
        GROUP BY browser ORDER BY COUNT(*) DESC`),
      db.getMany<any>(`
        SELECT COALESCE(country, 'unknown') as country, COUNT(*)::text as views
        FROM page_views WHERE created_at > NOW() - INTERVAL '30 days' AND ${ADMIN_FILTER}
        GROUP BY country ORDER BY COUNT(*) DESC LIMIT 15`),
      db.getOne<any>(`
        SELECT COUNT(DISTINCT visitor_id)::text as c FROM page_views
        WHERE created_at > NOW() - INTERVAL '30 days' AND (path = '/' OR path = '') AND ${ADMIN_FILTER}`),
      db.getOne<any>(`
        SELECT COUNT(DISTINCT visitor_id)::text as c FROM page_views
        WHERE created_at > NOW() - INTERVAL '30 days' AND path LIKE '/desktop%' AND ${ADMIN_FILTER}`),
      db.getOne<any>(`
        SELECT COUNT(DISTINCT visitor_id)::text as c FROM track_events
        WHERE created_at > NOW() - INTERVAL '30 days' AND event LIKE 'download_click%' AND ${ADMIN_FILTER_TE}`),
      hasDu
        ? db.getOne<any>(`
            SELECT COUNT(DISTINCT user_id)::text as c FROM desktop_usage
            WHERE last_heartbeat > NOW() - INTERVAL '30 days'`)
        : Promise.resolve({ c: '0' }),
      db.getOne<any>(`
        SELECT COUNT(*)::text as c FROM desktop_users
        WHERE created_at > NOW() - INTERVAL '30 days' AND LOWER(email) != $1`, [ADMIN_EMAIL]),
    ]);

    res.json({
      enabled: true,
      viewsToday: parseInt(viewsToday?.c || '0'),
      views7d: parseInt(views7d?.c || '0'),
      views30d: parseInt(views30d?.c || '0'),
      uniqueVisitors7d: parseInt(unique7d?.c || '0'),
      uniqueVisitors30d: parseInt(unique30d?.c || '0'),
      prev: {
        viewsToday: parseInt(prevViewsToday?.c || '0'),
        views7d: parseInt(prevViews7d?.c || '0'),
        views30d: parseInt(prevViews30d?.c || '0'),
        uniqueVisitors7d: parseInt(prevUnique7d?.c || '0'),
        uniqueVisitors30d: parseInt(prevUnique30d?.c || '0'),
      },
      topPages: topPages.map((r: any) => ({
        path: r.path,
        views: parseInt(r.views || '0'),
        uniques: parseInt(r.uniques || '0'),
      })),
      topReferrers: topReferrers.map((r: any) => ({
        referrer: r.ref,
        views: parseInt(r.views || '0'),
        signups: parseInt(r.signups || '0'),
      })),
      utmSources: utmSources.map((r: any) => ({
        source: r.source,
        medium: r.medium,
        views: parseInt(r.views || '0'),
        uniques: parseInt(r.uniques || '0'),
      })),
      devices: devices.map((r: any) => ({ device: r.device, views: parseInt(r.views || '0') })),
      browsers: browsers.map((r: any) => ({ browser: r.browser, views: parseInt(r.views || '0') })),
      countries: countries.map((r: any) => ({ country: r.country, views: parseInt(r.views || '0') })),
      funnel: {
        homeLanding: parseInt(funnelHome?.c || '0'),
        desktopPage: parseInt(funnelDesktop?.c || '0'),
        downloadClick: parseInt(funnelDownload?.c || '0'),
        appOpened: parseInt(funnelApp?.c || '0'),
        desktopSignups: parseInt(funnelSignups?.c || '0'),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Revenue & Billing Stats (USD) ──
router.get('/revenue', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const [subscriptions, topUsers, signupsByMonth] = await Promise.all([
      db.getMany<any>(`
        SELECT plan, COUNT(*) as count
        FROM users WHERE stripe_customer_id IS NOT NULL
          AND status NOT IN ('cancelled', 'pending')
          AND LOWER(email) != $1
        GROUP BY plan
      `, [ADMIN_EMAIL]),
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
          COUNT(*) FILTER (WHERE LOWER(email) != $1) as signups,
          COUNT(*) FILTER (WHERE stripe_customer_id IS NOT NULL AND LOWER(email) != $1) as paid,
          COUNT(*) FILTER (WHERE stripe_customer_id IS NOT NULL AND status NOT IN ('cancelled', 'pending') AND LOWER(email) != $1) as paying_active
        FROM users
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
      `, [ADMIN_EMAIL]),
    ]);

    const subscriptionRevenue: Record<string, { count: number; revenueUsdCents: number; nexosCostUsdCents: number; profitUsdCents: number }> = {};
    let totalRevenueUsdCents = 0;
    let totalNexosCostUsdCents = 0;

    for (const s of subscriptions) {
      const count = parseInt(s.count);
      const limits = PLAN_LIMITS[s.plan as keyof typeof PLAN_LIMITS];
      if (!limits) continue;

      const revenue = count * limits.priceUsdCents;
      const nexosCost = count * limits.nexosCreditBudgetUsdCents;
      const serverCost = count * limits.serverCostShareUsdCents;

      subscriptionRevenue[s.plan] = {
        count,
        revenueUsdCents: revenue,
        nexosCostUsdCents: nexosCost,
        profitUsdCents: revenue - nexosCost - serverCost,
      };

      totalRevenueUsdCents += revenue;
      totalNexosCostUsdCents += nexosCost;
    }

    // Server costs with VAT (tracked in USD cents)
    const serverCount2 = await db.getOne<any>(`SELECT COUNT(*) as total FROM servers WHERE status = 'active'`);
    const sCount = parseInt(serverCount2?.total || '0');
    const sNetPerMonth = parseInt(process.env.SERVER_COST_USD_CENTS || process.env.SERVER_COST_EUR_CENTS || '4300');
    const sVatRate = parseFloat(process.env.SERVER_VAT_RATE || '0.21');
    const sVatPerMonth = Math.round(sNetPerMonth * sVatRate);
    const sGrossPerMonth = sNetPerMonth + sVatPerMonth;
    const totalServerCostGross = sCount * sGrossPerMonth;
    const totalServerCostVat = sCount * sVatPerMonth;

    const totalProfitUsdCents = totalRevenueUsdCents - totalNexosCostUsdCents - totalServerCostGross;
    const profitMarginPercent = totalRevenueUsdCents > 0
      ? Math.round((totalProfitUsdCents / totalRevenueUsdCents) * 100) : 0;

    res.json({
      currency: 'USD',
      totalRevenueUsdCents: totalRevenueUsdCents,
      totalNexosCostUsdCents,
      totalServerCostUsdCents: totalServerCostGross,
      totalServerCostNet: sCount * sNetPerMonth,
      totalServerCostVat,
      serverCount: sCount,
      serverCostNetPerMonth: sNetPerMonth,
      serverCostGrossPerMonth: sGrossPerMonth,
      vatRate: sVatRate,
      totalProfitUsdCents,
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

// ── Financials (credits from Stripe, API usage from OpenRouter) ──
router.get('/financials', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();

    const [
      stripeCredits,
      openRouterUsage,
      creditDb,
      subscriptions,
      serverRow,
    ] = await Promise.all([
      fetchCreditRevenueFromStripe().catch(() => ({ monthUsdCents: 0, totalUsdCents: 0 })),
      fetchOpenRouterTotalUsage().then((usd) => Math.round(usd * 100)).catch(() => 0),
      db.getOne<any>(`
        SELECT
          COALESCE(SUM(CASE WHEN created_at >= DATE_TRUNC('month', NOW()) THEN amount_eur_cents ELSE 0 END), 0)::text as month_revenue,
          COALESCE(SUM(amount_eur_cents), 0)::text as total_revenue,
          COALESCE(SUM(CASE WHEN created_at >= DATE_TRUNC('month', NOW()) THEN credits_usd ELSE 0 END), 0)::text as month_credits_usd,
          COALESCE(SUM(credits_usd), 0)::text as total_credits_usd
        FROM credit_purchases
      `).catch(() => ({ month_revenue: '0', total_revenue: '0', month_credits_usd: '0', total_credits_usd: '0' })),
      db.getMany<any>(`
        SELECT plan, COUNT(*) as count
        FROM users WHERE stripe_customer_id IS NOT NULL
          AND status NOT IN ('cancelled', 'pending')
          AND LOWER(email) != $1
        GROUP BY plan
      `, [ADMIN_EMAIL]).catch(() => []),
      db.getOne<any>(`SELECT COUNT(*) as total FROM servers WHERE status = 'active'`).catch(() => ({ total: '0' })),
    ]);

    const planCounts: Record<string, number> = {};
    const subList = Array.isArray(subscriptions) ? subscriptions : [];
    for (const s of subList) {
      planCounts[s.plan] = parseInt(s.count || '0');
    }

    const subscriptionRevenue = Object.entries(planCounts).reduce(
      (sum, [plan, count]) => sum + count * (PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS]?.priceUsdCents || 0), 0
    );
    const subscriptionAiCost = Object.entries(planCounts).reduce(
      (sum, [plan, count]) => sum + count * (PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS]?.nexosCreditBudgetUsdCents || 0), 0
    );

    const sCount = parseInt(serverRow?.total || '0');
    const sNetPerMonth = parseInt(process.env.SERVER_COST_USD_CENTS || process.env.SERVER_COST_EUR_CENTS || '4300');
    const sVatRate = parseFloat(process.env.SERVER_VAT_RATE || '0.21');
    const sVatPerMonth = Math.round(sNetPerMonth * sVatRate);
    const sGrossPerMonth = sNetPerMonth + sVatPerMonth;
    const vpsCostUsdCents = sCount * sGrossPerMonth;

    const creditRevenueMonth = stripeCredits.monthUsdCents || parseInt(creditDb?.month_revenue ?? '0');
    const creditRevenueTotal = stripeCredits.totalUsdCents || parseInt(creditDb?.total_revenue ?? '0');
    // Cost derived from revenue (50% credits + 6% OR + VAT). DB credits_usd can be stale (old 69%).
    const USER_CREDIT_RATE = 0.50;
    const OPENROUTER_FEE_RATE = 0.06;
    const VAT_RATE = parseFloat(process.env.CREDIT_VAT_RATE || '0.203');
    const creditCostBaseMonth = Math.round(creditRevenueMonth * USER_CREDIT_RATE);
    const creditCostBaseTotal = Math.round(creditRevenueTotal * USER_CREDIT_RATE);
    const openRouterFeeMonth = Math.round(creditRevenueMonth * OPENROUTER_FEE_RATE);
    const openRouterFeeTotal = Math.round(creditRevenueTotal * OPENROUTER_FEE_RATE);
    const vatCostMonth = Math.round(creditRevenueMonth * VAT_RATE);
    const vatCostTotal = Math.round(creditRevenueTotal * VAT_RATE);
    const creditCostMonth = creditCostBaseMonth + openRouterFeeMonth + vatCostMonth;
    const creditCostTotal = creditCostBaseTotal + openRouterFeeTotal + vatCostTotal;

    const credits = {
      revenueUsdCents: creditRevenueTotal,
      monthRevenueUsdCents: creditRevenueMonth,
      costUsdCents: creditCostTotal,
      monthCostUsdCents: creditCostMonth,
      costBreakdown: {
        creditsBaseUsdCents: creditCostBaseTotal,
        openRouterFeeUsdCents: openRouterFeeTotal,
        vatUsdCents: vatCostTotal,
      },
      profitUsdCents: creditRevenueTotal - creditCostTotal,
      monthProfitUsdCents: creditRevenueMonth - creditCostMonth,
      fromStripe: stripeCredits.totalUsdCents > 0,
    };

    const subs = {
      revenueUsdCents: subscriptionRevenue,
      aiCostUsdCents: subscriptionAiCost,
      vpsCostUsdCents,
    };

    const totalRevenue = subscriptionRevenue + creditRevenueTotal;
    const totalAiCost = openRouterUsage;
    const totalCosts = totalAiCost + vpsCostUsdCents;
    const totalProfit = totalRevenue - totalCosts;

    res.json({
      currency: 'USD',
      main: {
        totalRevenueUsdCents: totalRevenue,
        totalProfitUsdCents: totalProfit,
        totalAiCostUsdCents: totalAiCost,
      },
      subscriptions: subs,
      credits,
      vps: {
        costUsdCents: vpsCostUsdCents,
        serverCount: sCount,
        costPerServerUsdCents: sGrossPerMonth,
      },
      openRouterUsageUsdCents: openRouterUsage,
    });
  } catch (err: any) {
    console.error('[admin/financials]', err?.message || err);
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
    const paid = req.query.paid as string || '';

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
    if (paid === 'true') {
      where += ` AND u.stripe_customer_id IS NOT NULL`;
    } else if (paid === 'false') {
      where += ` AND u.stripe_customer_id IS NULL`;
    }

    const desktop = req.query.desktop as string || '';
    if (desktop === 'true') {
      where += ` AND (u.desktop_subscription_id IS NOT NULL OR (u.desktop_trial_ends_at IS NOT NULL AND u.desktop_trial_ends_at > NOW()))`;
    } else if (desktop === 'only') {
      where += ` AND (u.desktop_subscription_id IS NOT NULL OR (u.desktop_trial_ends_at IS NOT NULL AND u.desktop_trial_ends_at > NOW()))`;
      where += ` AND u.status IN ('pending')`;
    } else if (desktop === 'vps_only') {
      where += ` AND u.status NOT IN ('pending', 'cancelled')`;
      where += ` AND (u.desktop_subscription_id IS NULL AND (u.desktop_trial_ends_at IS NULL OR u.desktop_trial_ends_at <= NOW()))`;
    }

    const [users, countResult] = await Promise.all([
      db.getMany<any>(
        `SELECT u.id, u.email, u.display_name, u.plan, u.status, u.subdomain,
                u.created_at, u.last_active, u.is_admin,
                (u.stripe_customer_id IS NOT NULL) as has_paid,
                (u.desktop_subscription_id IS NOT NULL) as has_desktop,
                (u.desktop_trial_ends_at IS NOT NULL AND u.desktop_trial_ends_at > NOW()) as has_desktop_trial,
                u.desktop_subscription_id,
                u.desktop_trial_ends_at,
                (u.status NOT IN ('pending', 'cancelled') AND u.server_id IS NOT NULL) as has_vps,
                tb.balance as credit_balance, tb.total_used, tb.total_purchased,
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

// ── Desktop Users (from desktop_users table) ──
router.get('/desktop-users', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const filter = (req.query.filter as string) || 'all';
    const search = (req.query.search as string) || '';

    let where = `WHERE LOWER(d.email) != $1`;
    const params: any[] = [ADMIN_EMAIL];
    let paramIdx = 2;

    if (filter === 'paid') {
      where += ` AND d.desktop_subscription_id IS NOT NULL`;
    } else if (filter === 'trialing') {
      where += ` AND d.desktop_trial_ends_at IS NOT NULL AND d.desktop_trial_ends_at > NOW() AND d.desktop_subscription_id IS NULL`;
    } else if (filter === 'expired') {
      where += ` AND d.desktop_trial_ends_at IS NOT NULL AND d.desktop_trial_ends_at <= NOW() AND d.desktop_subscription_id IS NULL`;
    } else if (filter === 'free') {
      where += ` AND d.desktop_subscription_id IS NULL AND (d.desktop_trial_ends_at IS NULL OR d.desktop_trial_ends_at <= NOW())`;
    }

    if (search) {
      where += ` AND (LOWER(d.email) LIKE $${paramIdx} OR LOWER(d.display_name) LIKE $${paramIdx})`;
      params.push(`%${search.toLowerCase()}%`);
      paramIdx++;
    }

    // Check if desktop_usage table exists (migration may not have run yet)
    const usageTableExists = await db.getOne<any>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'desktop_usage') as exists`
    ).then(r => r?.exists === true || r?.exists === 't').catch(() => false);

    const usageColumns = usageTableExists
      ? `, (SELECT SUM(EXTRACT(EPOCH FROM (last_heartbeat - session_start))) FROM desktop_usage WHERE user_id = d.id) as total_use_seconds,
                (SELECT MAX(last_heartbeat) FROM desktop_usage WHERE user_id = d.id) as last_seen,
                (SELECT app_version FROM desktop_usage WHERE user_id = d.id ORDER BY last_heartbeat DESC LIMIT 1) as app_version,
                (SELECT os FROM desktop_usage WHERE user_id = d.id ORDER BY last_heartbeat DESC LIMIT 1) as os`
      : `, NULL as total_use_seconds, NULL as last_seen, NULL as app_version, NULL as os`;

    const [users, countResult, usageData] = await Promise.all([
      db.getMany<any>(
        `SELECT d.id, d.email, d.display_name, d.avatar_url,
                d.stripe_customer_id, d.desktop_subscription_id,
                d.desktop_trial_ends_at, d.created_at, d.updated_at,
                (d.desktop_subscription_id IS NOT NULL) as has_paid,
                (d.desktop_trial_ends_at IS NOT NULL AND d.desktop_trial_ends_at > NOW() AND d.desktop_subscription_id IS NULL) as has_active_trial
                ${usageColumns}
         FROM desktop_users d
         ${where}
         ORDER BY d.created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limit, offset]
      ),
      db.getOne<any>(
        `SELECT COUNT(*) as total FROM desktop_users d ${where}`,
        params
      ),
      usageTableExists
        ? db.getOne<any>(
            `SELECT
               COUNT(DISTINCT user_id) FILTER (WHERE last_heartbeat > NOW() - INTERVAL '24 hours') as active_24h,
               COUNT(DISTINCT user_id) FILTER (WHERE last_heartbeat > NOW() - INTERVAL '7 days') as active_7d,
               SUM(EXTRACT(EPOCH FROM (last_heartbeat - session_start))) as total_use_seconds
             FROM desktop_usage`
          ).catch(() => ({ active_24h: '0', active_7d: '0', total_use_seconds: '0' }))
        : Promise.resolve({ active_24h: '0', active_7d: '0', total_use_seconds: '0' }),
    ]);

    res.json({
      users,
      total: parseInt(countResult?.total || '0'),
      usage: {
        active24h: parseInt(usageData?.active_24h || '0'),
        active7d: parseInt(usageData?.active_7d || '0'),
        totalUseHours: Math.round(parseFloat(usageData?.total_use_seconds || '0') / 3600),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Desktop Usage Heartbeat (for admin viewing) ──
router.get('/desktop-usage/:userId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    if (!validateUuid(userId)) return res.status(400).json({ error: 'Invalid user ID format' });

    const sessions = await db.getMany<any>(
      `SELECT id, session_start, last_heartbeat,
              EXTRACT(EPOCH FROM (last_heartbeat - session_start)) as duration_seconds,
              app_version, os, arch
       FROM desktop_usage
       WHERE user_id = $1
       ORDER BY session_start DESC
       LIMIT 50`,
      [userId]
    ).catch(() => []);

    res.json({ sessions });
  } catch (err) {
    next(err);
  }
});

// ── Single User Detail ──
router.get('/users/:userId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    if (!validateUuid(userId)) return res.status(400).json({ error: 'Invalid user ID format' });
    const [user, tokens, activity, transactions, creditPurchases, nexosUsage] = await Promise.all([
      db.getOne<any>(
        `SELECT u.id, u.email, u.display_name, u.plan, u.status, u.subdomain,
                u.container_name, u.server_id, u.stripe_customer_id, u.referral_code,
                u.is_admin, u.created_at, u.last_active, u.api_budget_addon_usd,
                u.desktop_subscription_id, u.desktop_trial_ends_at,
                (u.desktop_trial_ends_at IS NOT NULL AND u.desktop_trial_ends_at > NOW()) as desktop_trial_active,
                (u.status NOT IN ('pending', 'cancelled') AND u.server_id IS NOT NULL) as has_vps,
                s.ip as server_ip, s.hostname as server_hostname
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
      db.getMany<any>(
        'SELECT id, amount_eur_cents, credits_usd, stripe_session_id, created_at FROM credit_purchases WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      ),
      getNexosUsage(userId),
    ]);

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      user,
      tokens,
      activity,
      transactions,
      creditPurchases: creditPurchases || [],
      nexosUsage: nexosUsage ? {
        usedUsd: nexosUsage.usedUsd,
        remainingUsd: nexosUsage.remainingUsd,
        limitUsd: nexosUsage.limitUsd,
        displayAmountBought: nexosUsage.displayAmountBought,
      } : null,
    });
  } catch (err) {
    next(err);
  }
});

// ── Update User (change plan, status, admin flag) ──
router.put('/users/:userId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    if (!validateUuid(userId)) return res.status(400).json({ error: 'Invalid user ID format' });
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

router.delete('/servers/:serverId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { serverId } = req.params;
    const server = await db.getOne<any>('SELECT * FROM servers WHERE id = $1', [serverId]);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const userCount = await db.getOne<any>(
      `SELECT COUNT(*) as count FROM users WHERE server_id = $1 AND status NOT IN ('cancelled')`,
      [serverId]
    );
    if (parseInt(userCount?.count || '0') > 0) {
      return res.status(400).json({
        error: `Cannot remove server with ${userCount.count} active users. Migrate them first.`,
      });
    }

    await db.query(`UPDATE servers SET status = 'offline' WHERE id = $1`, [serverId]);
    res.json({ ok: true, message: `Server ${server.hostname || server.ip} marked as offline` });
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
      if (!validateUuid(userId)) return res.status(400).json({ error: 'Invalid user ID format' });
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
        results.push({ userId: user.id, email: user.email, status: 'failed', error: 'Provisioning failed' });
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
      if (!validateUuid(userId)) return res.status(400).json({ error: 'Invalid user ID format' });
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
        const cn = safeContainerName(user.container_name, user.id);
        const nexosKey = await ensureNexosKey(user.id);
        await injectApiKeys(user.server_ip, user.id, cn, user.plan || 'starter');
        await sshExec(user.server_ip, `docker restart ${cn} 2>/dev/null || true`);
        results.push({ userId: user.id, email: user.email, nexosKey: nexosKey.slice(0, 6) + '...', status: 'success' });
      } catch (err: any) {
        console.error(`[inject-keys] Failed for ${user.id}:`, err.message);
        results.push({ userId: user.id, email: user.email, status: 'failed', error: 'Key injection failed' });
      }
    }

    res.json({ fixed: results.filter(r => r.status === 'success').length, total: users.length, results });
  } catch (err) {
    next(err);
  }
});

router.post('/update-openclaw', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ status: 'started', message: 'Rebuilding OpenClaw image on all workers. This takes 3-5 minutes.' });
    updateImageOnAllWorkers()
      .then(({ updated, failed }) => {
        console.log(`[admin] OpenClaw image update complete: ${updated.length} updated, ${failed.length} failed`);
      })
      .catch((err) => {
        console.error(`[admin] OpenClaw image update error:`, err.message);
      });
  } catch (err) {
    next(err);
  }
});

export default router;
