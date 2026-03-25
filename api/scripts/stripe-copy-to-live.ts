/**
 * Copy Stripe products and prices from Test mode to Live mode.
 *
 * Usage:
 *   STRIPE_SECRET_KEY_TEST=sk_test_xxx STRIPE_SECRET_KEY_LIVE=sk_live_xxx npx tsx api/scripts/stripe-copy-to-live.ts
 *
 * Or with .env:
 *   Add STRIPE_SECRET_KEY (test) and STRIPE_SECRET_KEY_LIVE (live) to .env
 *   npx tsx api/scripts/stripe-copy-to-live.ts
 *
 * Outputs the new Live price IDs ready to paste into your production .env.
 */
import Stripe from 'stripe';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const skTest = process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY;
const skLive = process.env.STRIPE_SECRET_KEY_LIVE;

if (!skTest || !skTest.startsWith('sk_test_')) {
  console.error('Need STRIPE_SECRET_KEY_TEST or STRIPE_SECRET_KEY (test key)');
  process.exit(1);
}
if (!skLive || !skLive.startsWith('sk_live_')) {
  console.error('Need STRIPE_SECRET_KEY_LIVE (live key)');
  process.exit(1);
}

const stripeTest = new Stripe(skTest, { apiVersion: '2024-12-18.acacia' as any });
const stripeLive = new Stripe(skLive, { apiVersion: '2024-12-18.acacia' as any });

/** Infer env key from product name and price amount */
function inferEnvKey(productName: string, unitAmount: number | null, isRecurring: boolean): string | null {
  const name = productName.toLowerCase();
  if (isRecurring) {
    if (name.includes('starter')) return 'STRIPE_PRICE_STARTER';
    if (name.includes('pro')) return 'STRIPE_PRICE_PRO';
    if (name.includes('business')) return 'STRIPE_PRICE_BUSINESS';
  }
  if (unitAmount === 500) return 'STRIPE_PRICE_CREDITS_500K';
  if (unitAmount === 1000) return 'STRIPE_PRICE_CREDITS_1200K';
  if (unitAmount === 2500) return 'STRIPE_PRICE_CREDITS_3500K';
  if (unitAmount === 5000) return 'STRIPE_PRICE_CREDITS_8M';
  return null;
}

async function main() {
  const envOutput: Record<string, string> = {};

  const products = await stripeTest.products.list({ limit: 100, active: true });

  for (const product of products.data) {
    const prices = await stripeTest.prices.list({ product: product.id, active: true });

    const liveProduct = await stripeLive.products.create({
      name: product.name,
      description: product.description || undefined,
      images: product.images,
      metadata: product.metadata,
    });

    for (const price of prices.data) {
      const livePrice = await stripeLive.prices.create({
        product: liveProduct.id,
        unit_amount: price.unit_amount,
        currency: price.currency,
        recurring: price.recurring ? {
          interval: price.recurring.interval,
          interval_count: price.recurring.interval_count || 1,
        } : undefined,
        metadata: price.metadata,
      });

      const envKey = inferEnvKey(
        product.name,
        price.unit_amount,
        !!price.recurring
      );
      if (envKey) envOutput[envKey] = livePrice.id;
      console.log(`${product.name} / ${price.id} → ${livePrice.id}${envKey ? ` (${envKey})` : ''}`);
    }
  }

  console.log('\n--- Add these to your production .env ---');
  console.log('(Also create a webhook in Stripe Dashboard → Live mode → Webhooks and set STRIPE_WEBHOOK_SECRET)\n');
  const order = [
    'STRIPE_PRICE_STARTER',
    'STRIPE_PRICE_PRO',
    'STRIPE_PRICE_BUSINESS',
    'STRIPE_PRICE_CREDITS_500K',
    'STRIPE_PRICE_CREDITS_1200K',
    'STRIPE_PRICE_CREDITS_3500K',
    'STRIPE_PRICE_CREDITS_8M',
  ];
  for (const key of order) {
    if (envOutput[key]) console.log(`${key}=${envOutput[key]}`);
  }
  for (const [key, val] of Object.entries(envOutput)) {
    if (!order.includes(key)) console.log(`${key}=${val}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
