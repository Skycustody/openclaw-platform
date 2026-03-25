/** @type {import('next').NextConfig} */
const path = require('path');

// Turbopack needs the monorepo root to find next/package.json.
// When run via "npm run build:dashboard", cwd is monorepo root. When run from dashboard/, cwd is dashboard.
const cwd = path.resolve(process.cwd());
const configDir = path.resolve(__dirname);
const turbopackRoot = cwd === configDir ? path.join(configDir, '..') : cwd;

const nextConfig = {
  turbopack: {
    root: path.resolve(turbopackRoot),
  },
};

module.exports = nextConfig;
