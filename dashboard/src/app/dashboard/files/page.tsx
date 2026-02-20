'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardTitle, CardDescription, GlassPanel } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import api from '@/lib/api';
import { formatDate, formatBytes } from '@/lib/utils';
import {
  Upload,
  Download,
  Trash2,
  Search,
  File,
  FileText,
  FileImage,
  FileCode,
  FileSpreadsheet,
  Loader2,
  FolderOpen,
  MoreVertical,
  Share2,
  CloudUpload,
} from 'lucide-react';

interface FileItem {
  id: string;
  name: string;
  size: number;
  createdAt: string;
  mimeType: string;
}

interface StorageUsage {
  used: number;
  total: number;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return FileImage;
  if (mimeType.includes('spreadsheet') || mimeType.includes('csv') || mimeType.includes('excel')) return FileSpreadsheet;
  if (mimeType.includes('text') || mimeType.includes('pdf') || mimeType.includes('document')) return FileText;
  if (mimeType.includes('json') || mimeType.includes('javascript') || mimeType.includes('typescript') || mimeType.includes('html') || mimeType.includes('css')) return FileCode;
  return File;
}

function getFileColor(mimeType: string) {
  if (mimeType.startsWith('image/')) return 'text-blue-400 bg-blue-400/10';
  if (mimeType.includes('spreadsheet') || mimeType.includes('csv')) return 'text-emerald-400 bg-emerald-400/10';
  if (mimeType.includes('pdf')) return 'text-red-400 bg-red-400/10';
  if (mimeType.includes('text') || mimeType.includes('document')) return 'text-blue-400 bg-blue-400/10';
  if (mimeType.includes('json') || mimeType.includes('javascript')) return 'text-amber-400 bg-amber-400/10';
  return 'text-white/40 bg-white/5';
}

export default function FilesPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [usage, setUsage] = useState<StorageUsage>({ used: 0, total: 5368709120 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<{ files: FileItem[] }>('/files'),
      api.get<any>('/files/usage'),
    ])
      .then(([filesRes, usageRes]) => {
        setFiles(filesRes.files || []);
        setUsage({ used: usageRes.usedBytes ?? usageRes.used ?? 0, total: usageRes.total ?? 5368709120 });
      })
      .catch(() => {
        setFiles([]);
        setUsage({ used: 0, total: 5368709120 });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleClickOutside() { setMenuOpenId(null); }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const filtered = useMemo(
    () => files.filter((f) => f.name.toLowerCase().includes(search.toLowerCase())),
    [files, search]
  );

  const uploadFile = useCallback(async (file: globalThis.File) => {
    setUploading(true);
    try {
      const { uploadUrl, fileId } = await api.post<{ uploadUrl: string; fileId: string }>(
        '/files/upload',
        { name: file.name, size: file.size, mimeType: file.type }
      );
      await fetch(uploadUrl, { method: 'PUT', body: file });
      setFiles((prev) => [
        { id: fileId, name: file.name, size: file.size, createdAt: new Date().toISOString(), mimeType: file.type || 'application/octet-stream' },
        ...prev,
      ]);
      const usageRes = await api.get<any>('/files/usage');
      setUsage({ used: usageRes.usedBytes ?? usageRes.used ?? 0, total: usageRes.total ?? 5368709120 });
    } catch {}
    finally {
      setUploading(false);
    }
  }, []);

  function handleUploadClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) uploadFile(file);
    };
    input.click();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  async function handleDownload(fileId: string) {
    try {
      const { url } = await api.get<{ url: string }>(`/files/${fileId}/download`);
      window.open(url, '_blank');
    } catch {}
  }

  async function handleDelete(fileId: string) {
    setDeletingId(fileId);
    setMenuOpenId(null);
    try {
      await api.delete(`/files/${fileId}`);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      const usageRes = await api.get<any>('/files/usage');
      setUsage({ used: usageRes.usedBytes ?? usageRes.used ?? 0, total: usageRes.total ?? 5368709120 });
    } catch {}
    finally {
      setDeletingId(null);
    }
  }

  const usagePct = Math.min((usage.used / usage.total) * 100, 100);
  const progressColor = usagePct > 90 ? 'progress-fill-red' : usagePct > 70 ? 'progress-fill-amber' : 'progress-fill';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between animate-fade-up">
        <div>
          <h1 className="text-[28px] font-bold text-white tracking-tight">Files</h1>
          <p className="mt-1.5 text-[15px] text-white/50">
            Files your agent creates or that you upload will appear here.
          </p>
        </div>
        <Button onClick={handleUploadClick} loading={uploading}>
          <Upload className="h-4 w-4" />
          Upload
        </Button>
      </div>

      <GlassPanel className="animate-fade-up">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[14px] text-white/50">Storage</span>
          <span className="text-[14px] text-white/50">
            {formatBytes(usage.used)} of {formatBytes(usage.total)}
          </span>
        </div>
        <div className="progress-bar h-2.5">
          <div className={`h-full ${progressColor}`} style={{ width: `${usagePct}%` }} />
        </div>
      </GlassPanel>

      <div className="relative animate-fade-up">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
        <input
          type="text"
          placeholder="Search by filename..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="glass-input w-full py-3 pl-11 pr-4 text-[14px]"
        />
      </div>

      <div
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all animate-fade-up ${
          dragOver
            ? 'border-white/[0.08] bg-white/[0.06]'
            : 'border-white/8 hover:border-white/15'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <CloudUpload className={`h-10 w-10 mx-auto mb-3 ${dragOver ? 'text-white/40' : 'text-white/15'}`} />
        <p className={`text-[14px] ${dragOver ? 'text-white/60' : 'text-white/30'}`}>
          {dragOver ? 'Drop your file here' : 'Drag a file here to upload, or use the button above'}
        </p>
      </div>

      {filtered.length === 0 ? (
        <Card className="animate-fade-up">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-2xl bg-white/5 p-5 mb-4">
              <FolderOpen className="h-10 w-10 text-white/15" />
            </div>
            <p className="text-[16px] font-medium text-white/50 mb-1">
              {search ? 'No files match your search' : 'No files yet'}
            </p>
            <p className="text-[14px] text-white/30 max-w-sm">
              {search
                ? 'Try a different search term.'
                : 'Files your agent creates or processes will appear here.'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3 animate-fade-up">
          {filtered.map((file) => {
            const Icon = getFileIcon(file.mimeType);
            const colorClass = getFileColor(file.mimeType);
            const isDeleting = deletingId === file.id;

            return (
              <Card key={file.id} className={`!p-4 transition-all ${isDeleting ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-4">
                  <div className={`rounded-xl p-2.5 shrink-0 ${colorClass}`}>
                    <Icon className="h-5 w-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-white truncate">{file.name}</p>
                    <p className="text-[12px] text-white/30 mt-0.5">
                      {formatBytes(file.size)} &middot; {formatDate(file.createdAt)}
                    </p>
                  </div>

                  <div className="relative shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === file.id ? null : file.id);
                      }}
                      className="rounded-xl p-2 text-white/30 hover:text-white hover:bg-white/5 transition-all"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>

                    {menuOpenId === file.id && (
                      <div className="absolute right-0 top-full mt-1 z-10 glass-strong rounded-xl p-1.5 min-w-[160px] shadow-xl animate-fade-in">
                        <button
                          onClick={() => { handleDownload(file.id); setMenuOpenId(null); }}
                          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] text-white/70 hover:bg-white/5 hover:text-white transition-colors"
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </button>
                        <button
                          onClick={() => { setMenuOpenId(null); }}
                          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] text-white/70 hover:bg-white/5 hover:text-white transition-colors"
                        >
                          <Share2 className="h-4 w-4" />
                          Share
                        </button>
                        <hr className="glass-divider my-1" />
                        <button
                          onClick={() => handleDelete(file.id)}
                          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] text-red-400 hover:bg-red-400/5 transition-colors"
                        >
                          {isDeleting
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Trash2 className="h-4 w-4" />}
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
