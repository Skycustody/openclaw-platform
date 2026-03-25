/**
 * Grant admin access to a user by email.
 * Run from repo root: npm run set-admin -- your@email.com
 * Or from api: npx tsx scripts/set-admin-user.ts your@email.com
 *
 * Requires DATABASE_URL in .env (api/.env or root .env).
 * After running, the user must log in and use the admin password (ADMIN_PASSWORD)
 * to access the admin panel. Admin API is only reachable from localhost
 * (or ADMIN_ALLOWED_IPS) on the control plane.
 */
import path from 'path';
import { config } from 'dotenv';

config({ path: path.resolve(process.cwd(), '.env') });
config({ path: path.resolve(process.cwd(), '..', '.env') });

async function main() {
  const email = process.argv[2]?.trim();
  if (!email) {
    console.error('Usage: npm run set-admin -- <email>');
    console.error('Example: npm run set-admin -- admin@yourdomain.com');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Create api/.env or .env with DATABASE_URL.');
    process.exit(1);
  }

  const db = (await import('../src/lib/db')).default;
  const result = await db.query<{ id: string; email: string }>(
    'UPDATE users SET is_admin = true WHERE email = $1 RETURNING id, email',
    [email]
  );

  if (result.rowCount === 0) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  console.log(`Admin granted to ${result.rows[0].email} (id: ${result.rows[0].id}).`);
  console.log('  - Log in at the dashboard, then open /admin');
  console.log('  - Enter ADMIN_PASSWORD when prompted');
  console.log('  - Admin API is only reachable from localhost (or ADMIN_ALLOWED_IPS)');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
