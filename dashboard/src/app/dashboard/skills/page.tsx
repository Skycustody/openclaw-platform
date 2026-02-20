'use client';

import { useState, useMemo } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import {
  Mail, Calendar, FileText, Music, Github, Hash, Layout, ShoppingCart,
  Twitter, Linkedin, MessageCircle, Youtube, FolderOpen, Droplet, ListChecks, Cloud,
  Search, Lock, Settings, Plus, Sparkles,
} from 'lucide-react';

interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: typeof Mail;
  active: boolean;
  planLocked?: boolean;
}

const SKILLS: Skill[] = [
  { id: 'gmail', name: 'Gmail', description: 'Read, reply to, and compose emails. Your agent can triage your inbox and draft responses in your style.', category: 'Communication', icon: Mail, active: true },
  { id: 'calendar', name: 'Google Calendar', description: 'Check your schedule, create events, and reschedule meetings. Never double-book again.', category: 'Productivity', icon: Calendar, active: true },
  { id: 'notion', name: 'Notion', description: 'Search your Notion workspace, create pages, and update databases. Your second brain gets a helper.', category: 'Productivity', icon: FileText, active: true },
  { id: 'spotify', name: 'Spotify', description: 'Play music, create playlists, and discover new songs based on your taste.', category: 'Entertainment', icon: Music, active: false },
  { id: 'github', name: 'GitHub', description: 'Monitor repos, review PRs, and create issues. Stays on top of your code.', category: 'Development', icon: Github, active: true },
  { id: 'slack', name: 'Slack', description: 'Send messages, summarize channels, and respond to mentions when you\'re busy.', category: 'Communication', icon: Hash, active: false },
  { id: 'trello', name: 'Trello', description: 'Move cards, create tasks, and keep your boards organized automatically.', category: 'Productivity', icon: Layout, active: false },
  { id: 'shopify', name: 'Shopify', description: 'Track orders, monitor inventory, and get sales alerts. Your store on autopilot.', category: 'Business', icon: ShoppingCart, active: false, planLocked: true },
  { id: 'twitter', name: 'Twitter / X', description: 'Draft tweets, track mentions, and engage with your audience while you sleep.', category: 'Social', icon: Twitter, active: false },
  { id: 'linkedin', name: 'LinkedIn', description: 'Accept connections, respond to messages, and share content on your professional network.', category: 'Social', icon: Linkedin, active: false, planLocked: true },
  { id: 'reddit', name: 'Reddit', description: 'Monitor subreddits, find answers, and get summaries of discussions you care about.', category: 'Social', icon: MessageCircle, active: false },
  { id: 'youtube', name: 'YouTube', description: 'Search videos, get transcripts, and summarize long videos into key takeaways.', category: 'Entertainment', icon: Youtube, active: false },
  { id: 'google-drive', name: 'Google Drive', description: 'Find files, create docs, and organize your drive. Search your files in plain English.', category: 'Productivity', icon: FolderOpen, active: true },
  { id: 'dropbox', name: 'Dropbox', description: 'Access and organize your Dropbox files. Share links and manage storage.', category: 'Productivity', icon: Droplet, active: false, planLocked: true },
  { id: 'jira', name: 'Jira', description: 'Create tickets, update statuses, and get sprint summaries. Project management made easy.', category: 'Development', icon: ListChecks, active: false },
  { id: 'weather', name: 'Weather', description: 'Get forecasts, rain alerts, and packing suggestions for upcoming trips.', category: 'Utilities', icon: Cloud, active: true },
];

const CATEGORIES = ['All', ...Array.from(new Set(SKILLS.map((s) => s.category)))];

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>(SKILLS);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  const filtered = useMemo(() => {
    return skills.filter((s) => {
      const matchesSearch = !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = category === 'All' || s.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [skills, search, category]);

  const activeSkills = filtered.filter((s) => s.active);
  const availableSkills = filtered.filter((s) => !s.active);
  const activeCount = skills.filter((s) => s.active).length;

  const toggleSkill = (id: string) => {
    setSkills((prev) =>
      prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s))
    );
  };

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-[26px] font-bold text-white tracking-tight">Skills</h1>
          <Badge variant="accent" dot={false}>{activeCount} active</Badge>
        </div>
        <p className="text-[15px] text-white/40">What your agent can do — add skills to make it more capable</p>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center animate-fade-up">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
          <input
            placeholder="Search skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="glass-input w-full pl-10 pr-4 py-2.5 text-[14px]"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                'inline-flex items-center rounded-full px-4 py-2 text-[13px] font-medium whitespace-nowrap transition-all',
                category === cat
                  ? 'bg-white/[0.06] text-white ring-1 ring-white/20'
                  : 'text-white/40 hover:text-white/60 hover:bg-white/5'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 mb-4">
            <Search className="h-7 w-7 text-white/20" />
          </div>
          <p className="text-[17px] font-medium text-white/60">No skills match your search</p>
          <p className="text-[14px] text-white/30 mt-2">Try a different keyword or category</p>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Active skills */}
          {activeSkills.length > 0 && (
            <div>
              <p className="text-[13px] font-medium text-white/30 uppercase tracking-wider mb-3 px-1">
                Active Skills
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeSkills.map((skill) => {
                  const Icon = skill.icon;
                  return (
                    <Card key={skill.id} className="ring-1 ring-emerald-500/10 hover:ring-emerald-500/20 transition-all">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                          <Icon className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-[15px] font-semibold text-white">{skill.name}</h3>
                            <Badge variant="green" dot>Active</Badge>
                          </div>
                          <span className="text-[12px] text-white/30">{skill.category}</span>
                        </div>
                      </div>
                      <p className="text-[13px] text-white/45 leading-relaxed mb-4">{skill.description}</p>
                      <div className="flex items-center gap-2">
                        <Button variant="glass" size="sm">
                          <Settings className="h-3.5 w-3.5" />
                          Configure
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Available skills */}
          {availableSkills.length > 0 && (
            <div>
              <p className="text-[13px] font-medium text-white/30 uppercase tracking-wider mb-3 px-1">
                Available Skills
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {availableSkills.map((skill) => {
                  const Icon = skill.icon;
                  return (
                    <Card key={skill.id} className="hover:ring-1 hover:ring-white/10 transition-all">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
                          <Icon className="h-5 w-5 text-white/40" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-[15px] font-semibold text-white/70">{skill.name}</h3>
                            {skill.planLocked && (
                              <Badge variant="accent" dot={false}>
                                <Lock className="h-3 w-3" />
                                Pro
                              </Badge>
                            )}
                          </div>
                          <span className="text-[12px] text-white/25">{skill.category}</span>
                        </div>
                      </div>
                      <p className="text-[13px] text-white/35 leading-relaxed mb-4">{skill.description}</p>
                      {skill.planLocked ? (
                        <Button variant="glass" size="sm" onClick={() => window.location.href = '/dashboard/billing'}>
                          <Lock className="h-3.5 w-3.5" />
                          Upgrade to unlock
                        </Button>
                      ) : (
                        <Button variant="primary" size="sm" onClick={() => toggleSkill(skill.id)}>
                          <Plus className="h-3.5 w-3.5" />
                          Add Skill
                        </Button>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
