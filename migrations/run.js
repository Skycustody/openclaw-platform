const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `);

  const applied = await pool.query('SELECT name FROM _migrations ORDER BY name');
  const appliedSet = new Set(applied.rows.map(r => r.name));

  const files = fs.readdirSync(__dirname)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`⏭  ${file} (already applied)`);
      continue;
    }

    console.log(`▶  Applying ${file}...`);
    const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');

    try {
      await pool.query('BEGIN');
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await pool.query('COMMIT');
      console.log(`✓  ${file} applied`);
    } catch (err) {
      await pool.query('ROLLBACK');
      console.error(`✗  ${file} failed:`, err.message);
      process.exit(1);
    }
  }

  await pool.end();
  console.log('\nAll migrations complete.');
}

migrate().catch(err => {
  console.error('Migration runner failed:', err);
  process.exit(1);
});
