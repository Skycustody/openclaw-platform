/**
 * Curated platform skills — installable from GitHub (openclaw/skills).
 * Users can browse and install these from the Skill Marketplace in the dashboard.
 */
export interface PlatformSkill {
  id: string;
  label: string;
  description: string;
  category: string;
  repoPath: string; // e.g. "shawnpana/browser-use" (skills/owner/name in repo)
  emoji?: string;
}

export const PLATFORM_SKILLS: PlatformSkill[] = [
  { id: 'browser-use', label: 'Browser Use', description: 'Cloud browser automation via Browser Use API — spin up browsers for form filling, scraping, and web tasks.', category: 'Browser & Automation', repoPath: 'shawnpana/browser-use', emoji: '🌐' },
  { id: 'job-auto-apply', label: 'Job Auto-Apply', description: 'Automated job search and application system. Find jobs and apply with your CV.', category: 'Browser & Automation', repoPath: 'veeky-kumar/job-auto-apply', emoji: '💼' },
  { id: 'autofillin', label: 'AutoFill In', description: 'Automated web form filling and file uploading. Fill forms and upload files on any website.', category: 'Browser & Automation', repoPath: 'leohan123123/autofillin', emoji: '📝' },
  { id: 'desktop-control', label: 'Desktop Control', description: 'Advanced desktop automation with mouse, keyboard, and screen capture.', category: 'Browser & Automation', repoPath: 'matagul/desktop-control', emoji: '🖥️' },
  { id: 'deep-scraper', label: 'Deep Scraper', description: 'High-performance web scraping for extracting data from websites.', category: 'Browser & Automation', repoPath: 'opsun/deep-scraper', emoji: '🔍' },
  { id: 'firecrawl-skills', label: 'Firecrawl Skills', description: 'Web scraping, crawling, and search via Firecrawl API.', category: 'Browser & Automation', repoPath: 'leonardogrig/firecrawl-skills', emoji: '🔥' },
  { id: 'chirp', label: 'Chirp (X/Twitter)', description: 'X/Twitter CLI using OpenClaw browser tool. Post, search, and interact with X.', category: 'Communication', repoPath: 'zizi-cat/chirp', emoji: '🐦' },
  { id: 'inkedin-automation-that-really-works', label: 'LinkedIn Automation', description: 'LinkedIn automation that really works — messaging, connection requests, and more.', category: 'Communication', repoPath: 'red777777/inkedin-automation-that-really-works', emoji: '💼' },
  { id: 'clawflows', label: 'ClawFlows', description: 'Search, install, and run multi-skill automations from clawflows.com.', category: 'Productivity', repoPath: 'cluka-399/clawflows', emoji: '⚡' },
  { id: 'browse', label: 'Browse', description: 'Create and deploy browser automation functions. Complete guide for web automation.', category: 'Browser & Automation', repoPath: 'pkiv/browse', emoji: '🧭' },
  { id: 'agent-browser-2', label: 'Agent Browser', description: 'Browser automation for web testing, form filling, and data extraction.', category: 'Browser & Automation', repoPath: 'murphykobe/agent-browser-2', emoji: '🤖' },
  { id: 'automation-workflows', label: 'Automation Workflows', description: 'Design and implement automation workflows to save time and streamline tasks.', category: 'Productivity', repoPath: 'jk-0001/automation-workflows', emoji: '🔄' },
];

export const SKILLS_REPO_URL = 'https://github.com/openclaw/skills.git';
