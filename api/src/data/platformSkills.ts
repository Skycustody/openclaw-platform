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
  // ── Browser & Automation ──
  { id: 'browser-use', label: 'Browser Use', description: 'Cloud browser automation via Browser Use API — spin up browsers for form filling, scraping, and web tasks.', category: 'Browser & Automation', repoPath: 'shawnpana/browser-use', emoji: '🌐' },
  { id: 'browse', label: 'Browse', description: 'Create and deploy browser automation functions. Complete guide for web automation.', category: 'Browser & Automation', repoPath: 'pkiv/browse', emoji: '🧭' },
  { id: 'agent-browser-2', label: 'Agent Browser', description: 'Browser automation for web testing, form filling, and data extraction.', category: 'Browser & Automation', repoPath: 'murphykobe/agent-browser-2', emoji: '🤖' },
  { id: 'autofillin', label: 'AutoFill In', description: 'Automated web form filling and file uploading. Fill forms and upload files on any website.', category: 'Browser & Automation', repoPath: 'leohan123123/autofillin', emoji: '📝' },
  { id: 'job-auto-apply', label: 'Job Auto-Apply', description: 'Automated job search and application system. Find jobs and apply with your CV.', category: 'Browser & Automation', repoPath: 'veeky-kumar/job-auto-apply', emoji: '💼' },
  { id: 'deep-scraper', label: 'Deep Scraper', description: 'High-performance web scraping for extracting data from websites.', category: 'Browser & Automation', repoPath: 'opsun/deep-scraper', emoji: '🔍' },
  { id: 'desktop-control', label: 'Desktop Control', description: 'Advanced desktop automation with mouse, keyboard, and screen capture.', category: 'Browser & Automation', repoPath: 'matagul/desktop-control', emoji: '🖥️' },
  { id: 'firecrawl-skills', label: 'Firecrawl Skills', description: 'Web scraping, crawling, and search via Firecrawl API.', category: 'Browser & Automation', repoPath: 'leonardogrig/firecrawl-skills', emoji: '🔥' },

  // ── YouTube & Video ──
  { id: 'youtube-full', label: 'YouTube Full', description: 'Complete YouTube toolkit — transcripts, search, channels, playlists, video metadata.', category: 'YouTube & Video', repoPath: 'therohitdas/youtube-full', emoji: '📺' },
  { id: 'youtube-summarizer', label: 'YouTube Summarizer', description: 'Fetch YouTube video transcripts and generate intelligent summaries.', category: 'YouTube & Video', repoPath: 'abe238/youtube-summarizer', emoji: '📝' },
  { id: 'youtube-watcher', label: 'YouTube Watcher', description: 'Fetch and read transcripts from YouTube videos. Watch and understand video content.', category: 'YouTube & Video', repoPath: 'michaelgathara/youtube-watcher', emoji: '👁️' },
  { id: 'yt-dlp-downloader-skill', label: 'Video Downloader', description: 'Download videos from YouTube, Bilibili, and hundreds of sites via yt-dlp.', category: 'YouTube & Video', repoPath: 'apollo1234/yt-dlp-downloader-skill', emoji: '⬇️' },
  { id: 'tube-summary', label: 'Tube Summary', description: 'Search YouTube for videos on any topic and get intelligent summaries.', category: 'YouTube & Video', repoPath: 'dillera/tube-summary', emoji: '🎬' },
  { id: 'transcript', label: 'Transcript', description: 'Get transcripts from any YouTube video — for summarization, translation, and analysis.', category: 'YouTube & Video', repoPath: 'therohitdas/transcript', emoji: '📄' },

  // ── Communication ──
  { id: 'chirp', label: 'Chirp (X/Twitter)', description: 'X/Twitter CLI using OpenClaw browser tool. Post, search, and interact with X.', category: 'Communication', repoPath: 'zizi-cat/chirp', emoji: '🐦' },
  { id: 'inkedin-automation-that-really-works', label: 'LinkedIn Automation', description: 'LinkedIn automation that really works — messaging, connection requests, and more.', category: 'Communication', repoPath: 'red777777/inkedin-automation-that-really-works', emoji: '💼' },
  { id: 'smtp-send', label: 'Email Send (SMTP)', description: 'Send emails via SMTP with support for plain text, HTML, and attachments.', category: 'Communication', repoPath: 'xiwan/smtp-send', emoji: '📧' },
  { id: 'slack', label: 'Slack', description: 'Control Slack from your agent — send messages, manage channels, search conversations.', category: 'Communication', repoPath: 'steipete/slack', emoji: '💬' },
  { id: 'multiposting', label: 'Multi-Platform Post', description: 'Multiposting to X, Instagram, YouTube, TikTok, LinkedIn from one place.', category: 'Communication', repoPath: 'jordanprater/multiposting', emoji: '📢' },

  // ── Productivity ──
  { id: 'clawflows', label: 'ClawFlows', description: 'Search, install, and run multi-skill automations from clawflows.com.', category: 'Productivity', repoPath: 'cluka-399/clawflows', emoji: '⚡' },
  { id: 'automation-workflows', label: 'Automation Workflows', description: 'Design and implement automation workflows to save time and streamline tasks.', category: 'Productivity', repoPath: 'jk-0001/automation-workflows', emoji: '🔄' },
  { id: 'ez-cronjob', label: 'Easy Cron Jobs', description: 'Fix common cron job failures and manage scheduled tasks reliably.', category: 'Productivity', repoPath: 'promadgenius/ez-cronjob', emoji: '⏰' },
  { id: 'grab', label: 'Grab', description: 'Download and archive content from URLs — tweets, articles, Reddit posts, YouTube videos.', category: 'Productivity', repoPath: 'jamesalmeida/grab', emoji: '📥' },

  // ── Memory & Self-Improvement ──
  { id: 'cognitive-memory', label: 'Cognitive Memory', description: 'Intelligent multi-store memory system with human-like recall, forgetting, and consolidation.', category: 'Memory & Intelligence', repoPath: 'icemilo414/cognitive-memory', emoji: '🧠' },
  { id: 'agentmemory', label: 'Agent Memory', description: 'End-to-end encrypted cloud memory for AI agents. Persistent memory across sessions.', category: 'Memory & Intelligence', repoPath: 'badaramoni/agentmemory', emoji: '💾' },
  { id: 'create-agent-skills', label: 'Skill Creator', description: 'Guide for creating effective new skills. The agent can create its own skills.', category: 'Memory & Intelligence', repoPath: 'bowen31337/create-agent-skills', emoji: '🛠️' },
  { id: 'ralph-evolver', label: 'Self-Improver', description: 'Recursive self-improvement engine. Agent evolves its own capabilities over time.', category: 'Memory & Intelligence', repoPath: 'hsssgdtc/ralph-evolver', emoji: '🧬' },

  // ── Search & Research ──
  { id: 'deepwiki', label: 'DeepWiki', description: 'Query GitHub repository documentation and wikis. Research open-source projects.', category: 'Search & Research', repoPath: 'arun-8687/deepwiki', emoji: '📚' },
  { id: 'read-github', label: 'Read GitHub', description: 'Access GitHub repository documentation and code via gitmcp.io.', category: 'Search & Research', repoPath: 'am-will/read-github', emoji: '🐙' },
];

export const SKILLS_REPO_URL = 'https://github.com/openclaw/skills.git';
