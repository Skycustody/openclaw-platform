/**
 * Curated skill catalog for the Skill Store.
 * Skills are installed from https://github.com/openclaw/skills
 * Format: { id, owner, name, description, category, emoji }
 */
export interface StoreSkill {
  id: string;
  owner: string;
  name: string;
  description: string;
  category: string;
  emoji: string;
  repoPath: string; // owner/name for GitHub path
}

export const SKILL_STORE: StoreSkill[] = [
  { id: 'browser-use', owner: 'shawnpana', name: 'browser-use', emoji: '🌐', category: 'Browser & Automation',
    description: 'Use Browser Use cloud API for autonomous browser automation — forms, screenshots, multi-step workflows.',
    repoPath: 'shawnpana/browser-use' },
  { id: 'job-auto-apply', owner: 'veeky-kumar', name: 'job-auto-apply', emoji: '💼', category: 'Browser & Automation',
    description: 'Automated job search and application system. Find jobs and apply with your CV.',
    repoPath: 'veeky-kumar/job-auto-apply' },
  { id: 'autofillin', owner: 'leohan123123', name: 'autofillin', emoji: '📝', category: 'Browser & Automation',
    description: 'Automated web form filling and file uploading. Fill forms and upload files on any website.',
    repoPath: 'leohan123123/autofillin' },
  { id: 'desktop-control', owner: 'matagul', name: 'desktop-control', emoji: '🖥️', category: 'Browser & Automation',
    description: 'Advanced desktop automation with mouse, keyboard, and screen control.',
    repoPath: 'matagul/desktop-control' },
  { id: 'deep-scraper', owner: 'opsun', name: 'deep-scraper', emoji: '🔍', category: 'Research',
    description: 'High-performance deep web scraping. Extract data from complex websites.',
    repoPath: 'opsun/deep-scraper' },
  { id: 'firecrawl-skills', owner: 'leonardogrig', name: 'firecrawl-skills', emoji: '🔥', category: 'Research',
    description: 'Web scraping and crawling via Firecrawl API. Convert pages to markdown.',
    repoPath: 'leonardogrig/firecrawl-skills' },
  { id: 'chirp', owner: 'zizi-cat', name: 'chirp', emoji: '𝕏', category: 'Communication',
    description: 'X/Twitter CLI using OpenClaw browser tool. Post, reply, search timelines.',
    repoPath: 'zizi-cat/chirp' },
  { id: 'inkedin-automation-that-really-works', owner: 'red777777', name: 'inkedin-automation-that-really-works', emoji: '💼', category: 'Communication',
    description: 'LinkedIn automation for messaging, connection requests, and outreach.',
    repoPath: 'red777777/inkedin-automation-that-really-works' },
  { id: 'clawflows', owner: 'cluka-399', name: 'clawflows', emoji: '🔄', category: 'Automation',
    description: 'Search, install, and run multi-skill automations from clawflows.com.',
    repoPath: 'cluka-399/clawflows' },
  { id: 'browse', owner: 'pkiv', name: 'browse', emoji: '🌍', category: 'Browser & Automation',
    description: 'Create and deploy browser automation functions. Full web interaction control.',
    repoPath: 'pkiv/browse' },
  { id: 'agent-browser-2', owner: 'murphykobe', name: 'agent-browser-2', emoji: '🤖', category: 'Browser & Automation',
    description: 'Browser automation for web testing, form filling, and data extraction.',
    repoPath: 'murphykobe/agent-browser-2' },
  { id: 'automation-workflows', owner: 'jk-0001', name: 'automation-workflows', emoji: '⚙️', category: 'Automation',
    description: 'Design and implement automation workflows to save time on repetitive tasks.',
    repoPath: 'jk-0001/automation-workflows' },
  { id: 'crawl', owner: 'barneyjm', name: 'crawl', emoji: '🕷️', category: 'Research',
    description: 'Crawl any website and save pages as local markdown files.',
    repoPath: 'barneyjm/crawl' },
  { id: 'fast-browser-use', owner: 'rknoche6', name: 'fast-browser-use', emoji: '⚡', category: 'Browser & Automation',
    description: 'Rust-based browser automation engine for fast, reliable web control.',
    repoPath: 'rknoche6/fast-browser-use' },
];

export const SKILL_STORE_BY_ID = Object.fromEntries(SKILL_STORE.map(s => [s.id, s]));
