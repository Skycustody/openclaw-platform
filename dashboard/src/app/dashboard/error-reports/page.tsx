'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';

interface ErrorReport {
  id: string;
  email: string | null;
  app_version: string | null;
  platform: string | null;
  arch: string | null;
  os_version: string | null;
  runtime: string | null;
  step_id: string | null;
  error_message: string | null;
  logs: string | null;
  resolved: boolean;
  admin_note: string | null;
  created_at: string;
}

export default function ErrorReportsPage() {
  const [reports, setReports] = useState<ErrorReport[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter === 'all' ? '' : `?resolved=${filter === 'resolved'}`;
      const res = await api.get<{ reports: ErrorReport[]; total: number }>(`/error-reports/list${params}`);
      setReports(res.reports);
      setTotal(res.total);
    } catch (err) {
      console.error('Failed to fetch error reports:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  async function toggleResolved(id: string, current: boolean) {
    await api.request('PATCH', `/error-reports/${id}`, { resolved: !current });
    setReports(prev => prev.map(r => r.id === id ? { ...r, resolved: !current } : r));
  }

  async function saveNote(id: string, note: string) {
    await api.request('PATCH', `/error-reports/${id}`, { adminNote: note });
    setReports(prev => prev.map(r => r.id === id ? { ...r, admin_note: note } : r));
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  const platformIcon = (p: string | null) => {
    if (p === 'win32') return 'Windows';
    if (p === 'darwin') return 'macOS';
    if (p === 'linux') return 'Linux';
    return p || '?';
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#fafafa' }}>Error Reports ({total})</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['open', 'resolved', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                background: filter === f ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                color: filter === f ? '#fff' : '#888',
                fontSize: 13,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#666', padding: 40, textAlign: 'center' }}>Loading...</div>
      ) : reports.length === 0 ? (
        <div style={{ color: '#666', padding: 40, textAlign: 'center' }}>No error reports found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reports.map(r => {
            const isExpanded = expanded === r.id;
            return (
              <div
                key={r.id}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  cursor: 'pointer',
                }}
                onClick={() => setExpanded(isExpanded ? null : r.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        display: 'inline-block',
                        width: 8, height: 8, borderRadius: '50%',
                        background: r.resolved ? '#4ade80' : '#f87171',
                      }} />
                      <span style={{ color: '#fafafa', fontSize: 14, fontWeight: 500 }}>
                        {r.step_id || 'unknown step'}
                      </span>
                      <span style={{ color: '#666', fontSize: 12 }}>{platformIcon(r.platform)}</span>
                      <span style={{ color: '#666', fontSize: 12 }}>v{r.app_version}</span>
                      <span style={{ color: '#555', fontSize: 12 }}>{timeAgo(r.created_at)}</span>
                    </div>
                    <div style={{ color: '#f87171', fontSize: 13, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isExpanded ? 'pre-wrap' : 'nowrap' }}>
                      {r.error_message}
                    </div>
                    {r.email && (
                      <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>{r.email}</div>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleResolved(r.id, r.resolved); }}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      border: 'none',
                      background: r.resolved ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
                      color: r.resolved ? '#4ade80' : '#f87171',
                      fontSize: 12,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.resolved ? 'Resolved' : 'Mark Resolved'}
                  </button>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12, fontSize: 12, color: '#888' }}>
                      <div>OS: {r.os_version || '?'}</div>
                      <div>Arch: {r.arch || '?'}</div>
                      <div>Runtime: {r.runtime || '?'}</div>
                    </div>
                    {r.logs && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Terminal output:</div>
                        <pre style={{
                          background: '#0a0a0a',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 6,
                          padding: 12,
                          fontSize: 12,
                          color: '#d4d4d4',
                          maxHeight: 300,
                          overflow: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                        }}>
                          {r.logs}
                        </pre>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Admin note:</div>
                      <textarea
                        defaultValue={r.admin_note || ''}
                        placeholder="Add a note..."
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => saveNote(r.id, e.target.value)}
                        style={{
                          width: '100%',
                          background: '#0a0a0a',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 6,
                          padding: 8,
                          fontSize: 13,
                          color: '#d4d4d4',
                          resize: 'vertical',
                          minHeight: 60,
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
