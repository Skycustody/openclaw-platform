/**
 * Load .env before any other imports. Must be imported first in index.ts.
 * auth.ts throws at load time if JWT_SECRET is missing, so env must be loaded
 * before any route that imports auth.
 */
import path from 'path';
import { config } from 'dotenv';

const rootEnv = path.join(__dirname, '..', '..', '.env');
const apiEnv = path.join(__dirname, '..', '.env');
config({ path: rootEnv });
config({ path: apiEnv });
