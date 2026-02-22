-- Template installs tracking (per-user)
CREATE TABLE IF NOT EXISTS template_installs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES agent_templates(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_template_installs_user ON template_installs(user_id);
CREATE INDEX IF NOT EXISTS idx_template_installs_template ON template_installs(template_id);

-- Seed default templates (community starters)
INSERT INTO agent_templates (id, name, description, category, config, published, rating, rating_count, install_count)
VALUES
  (
    'a0000001-0000-0000-0000-000000000001',
    'Personal Assistant',
    'A versatile personal assistant that manages your calendar, drafts emails, takes notes, and handles daily tasks. Perfect for staying organised.',
    'Productivity',
    '{"personality":{"name":"Atlas","purpose":"Personal productivity assistant","instructions":"You are Atlas, a calm and efficient personal assistant. Help the user manage their schedule, draft professional emails, take structured notes, and organise tasks. Be proactive about suggesting reminders and follow-ups. Keep responses concise and actionable."},"tools":{"web":{"search":{"enabled":true},"fetch":{"enabled":true}}},"skills":{"weather":{"enabled":true},"notion":{"enabled":true}},"setupActions":["Write SOUL.md personality as Atlas — your personal assistant","Enable web search and fetch tools","Enable Weather and Notion skills","Configure daily briefing cron job"],"requiredSkills":[{"name":"Web Search","hasIt":true},{"name":"Notion","hasIt":false}]}',
    true, 4.7, 23, 156
  ),
  (
    'a0000001-0000-0000-0000-000000000002',
    'Research Agent',
    'Deep web research assistant that finds, summarises, and cross-references information from multiple sources. Great for market research and competitive analysis.',
    'Research',
    '{"personality":{"name":"Scout","purpose":"Deep research and analysis agent","instructions":"You are Scout, an expert research agent. When given a topic, conduct thorough web research across multiple sources. Always cross-reference facts, cite your sources, and present findings in a structured format with key takeaways. Flag any conflicting information you find."},"tools":{"web":{"search":{"enabled":true},"fetch":{"enabled":true}}},"skills":{"summarize":{"enabled":true}},"setupActions":["Write SOUL.md personality as Scout — your research agent","Enable web search and fetch tools","Enable Summarize skill for content extraction","Optimise for long-form research tasks"],"requiredSkills":[{"name":"Web Search","hasIt":true},{"name":"Summarize","hasIt":false}]}',
    true, 4.8, 31, 203
  ),
  (
    'a0000001-0000-0000-0000-000000000003',
    'Code Review Bot',
    'Automated code reviewer that checks GitHub PRs, suggests improvements, identifies bugs, and enforces coding standards. Supports multiple languages.',
    'Productivity',
    '{"personality":{"name":"Linter","purpose":"Code review and quality assurance","instructions":"You are Linter, a senior code reviewer. When reviewing code, check for: security vulnerabilities, performance issues, code style consistency, edge cases, error handling, and test coverage. Be constructive in feedback — suggest specific fixes, not just problems. Prioritise issues by severity."},"tools":{"web":{"search":{"enabled":true},"fetch":{"enabled":true}}},"skills":{"github":{"enabled":true},"gh-issues":{"enabled":true},"coding-agent":{"enabled":true}},"setupActions":["Write SOUL.md personality as Linter — your code reviewer","Enable GitHub and GitHub Issues skills","Enable Coding Agent for automated fixes","Configure PR review automation"],"requiredSkills":[{"name":"GitHub CLI","hasIt":false},{"name":"Coding Agent","hasIt":true}]}',
    true, 4.5, 18, 89
  ),
  (
    'a0000001-0000-0000-0000-000000000004',
    'Social Media Manager',
    'Manages your social media presence across X/Twitter and other platforms. Drafts posts, analyses engagement, schedules content, and monitors trends.',
    'Social',
    '{"personality":{"name":"Pulse","purpose":"Social media management and content creation","instructions":"You are Pulse, a social media strategist. Help the user draft engaging posts, analyse trends, schedule content, and monitor engagement. Write in the user''s voice — match their tone and style. Suggest optimal posting times and relevant hashtags. Keep posts concise and punchy."},"tools":{"web":{"search":{"enabled":true},"fetch":{"enabled":true}}},"skills":{"xurl":{"enabled":true}},"setupActions":["Write SOUL.md personality as Pulse — your social media manager","Enable web search for trend monitoring","Enable X/Twitter skill for posting and analytics","Set up content scheduling cron jobs"],"requiredSkills":[{"name":"X/Twitter CLI","hasIt":false},{"name":"Web Search","hasIt":true}]}',
    true, 4.3, 12, 67
  ),
  (
    'a0000001-0000-0000-0000-000000000005',
    'Email Assistant',
    'Smart email agent that drafts replies, summarises threads, sorts inbox by priority, and handles follow-ups. Works with Gmail and IMAP providers.',
    'Email',
    '{"personality":{"name":"Mercury","purpose":"Email management and communication","instructions":"You are Mercury, an email management specialist. Help the user draft professional emails, summarise long threads, prioritise inbox items, and track follow-ups. Match the formality level to each conversation. Flag urgent items and suggest response templates for common queries."},"tools":{"web":{"search":{"enabled":true},"fetch":{"enabled":true}}},"skills":{"himalaya":{"enabled":true},"gog":{"enabled":true}},"setupActions":["Write SOUL.md personality as Mercury — your email assistant","Enable email skills (Himalaya or Google Workspace)","Configure inbox monitoring schedule","Set up auto-categorisation rules"],"requiredSkills":[{"name":"Email (Himalaya)","hasIt":false},{"name":"Google Workspace","hasIt":false}]}',
    true, 4.6, 15, 112
  ),
  (
    'a0000001-0000-0000-0000-000000000006',
    'DevOps Engineer',
    'Server monitoring and deployment automation agent. Runs health checks, manages deployments, monitors logs, and alerts on issues.',
    'Productivity',
    '{"personality":{"name":"Sentinel","purpose":"DevOps automation and server management","instructions":"You are Sentinel, a DevOps automation agent. Monitor server health, run security audits, manage deployments, and alert on issues. Always verify before making destructive changes. Keep detailed logs of all actions taken. Prioritise uptime and security."},"tools":{"web":{"search":{"enabled":true},"fetch":{"enabled":true}}},"skills":{"healthcheck":{"enabled":true},"tmux":{"enabled":true}},"setupActions":["Write SOUL.md personality as Sentinel — your DevOps engineer","Enable Security Hardening skill","Enable Tmux for remote session management","Set up hourly health check cron job"],"requiredSkills":[{"name":"Security Hardening","hasIt":true},{"name":"Tmux","hasIt":false}]}',
    true, 4.4, 9, 45
  ),
  (
    'a0000001-0000-0000-0000-000000000007',
    'Content Writer',
    'Professional content creation agent for blogs, articles, newsletters, and documentation. SEO-aware with research capabilities.',
    'Research',
    '{"personality":{"name":"Quill","purpose":"Professional content writing and editing","instructions":"You are Quill, a professional content writer. Create well-structured, engaging content for blogs, articles, and documentation. Research topics thoroughly before writing. Optimise for SEO when relevant. Adapt your tone to the target audience — technical, casual, or formal as needed."},"tools":{"web":{"search":{"enabled":true},"fetch":{"enabled":true}}},"skills":{"summarize":{"enabled":true},"nano-banana-pro":{"enabled":true}},"setupActions":["Write SOUL.md personality as Quill — your content writer","Enable web research tools","Enable Summarize skill for source extraction","Enable Image Generation for article graphics"],"requiredSkills":[{"name":"Web Search","hasIt":true},{"name":"Image Generation","hasIt":true}]}',
    true, 4.5, 14, 78
  ),
  (
    'a0000001-0000-0000-0000-000000000008',
    'Trading Analyst',
    'Market analysis agent that tracks prices, analyses charts, monitors news sentiment, and provides trade setups. For crypto and stocks.',
    'Trading',
    '{"personality":{"name":"Oracle","purpose":"Market analysis and trading intelligence","instructions":"You are Oracle, a market analysis agent. Monitor price movements, analyse market sentiment from news and social media, identify technical patterns, and present structured trade setups. Always include risk warnings and never give financial advice — present data and analysis, let the user decide. Track portfolio positions and alert on significant moves."},"tools":{"web":{"search":{"enabled":true},"fetch":{"enabled":true}}},"skills":{},"setupActions":["Write SOUL.md personality as Oracle — your trading analyst","Enable web search for market news monitoring","Configure price alert cron jobs","Set up daily market briefing schedule"],"requiredSkills":[{"name":"Web Search","hasIt":true}]}',
    true, 4.2, 21, 134
  ),
  (
    'a0000001-0000-0000-0000-000000000009',
    'Smart Home Controller',
    'Central hub for controlling smart home devices — lights, speakers, cameras, and climate. Voice-ready with scheduling support.',
    'Productivity',
    '{"personality":{"name":"Jarvis","purpose":"Smart home automation and control","instructions":"You are Jarvis, a smart home controller. Help the user manage their connected devices — lights, speakers, cameras, and climate controls. Create automated routines, respond to natural language commands, and provide status updates. Be proactive about energy-saving suggestions and security alerts."},"tools":{"web":{"search":{"enabled":true},"fetch":{"enabled":true}}},"skills":{"openhue":{"enabled":true},"sonoscli":{"enabled":true},"camsnap":{"enabled":true}},"setupActions":["Write SOUL.md personality as Jarvis — your smart home controller","Enable Philips Hue, Sonos, and Camera skills","Configure morning and evening automation routines","Set up voice command integration"],"requiredSkills":[{"name":"Philips Hue","hasIt":false},{"name":"Sonos","hasIt":false},{"name":"Camera","hasIt":false}]}',
    true, 4.1, 7, 34
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  config = EXCLUDED.config,
  published = EXCLUDED.published;
