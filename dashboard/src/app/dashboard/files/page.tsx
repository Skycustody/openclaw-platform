'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, GlassPanel } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api';
import { formatDate, formatBytes } from '@/lib/utils';
import {
  Upload, Download, Trash2, Search, File, FileText,
  FileImage, FileCode, FileSpreadsheet, Loader2,
  FolderOpen, MoreVertical, CloudUpload, Folder,
  AlertTriangle, Bot,
} from 'lucide-react';

interface FileItem {
  id: string;
  name: string;
  size: number;
  createdAt: string;
  mimeType: string;
  isDirectory?: boolean;
}

function getFileIcon(mimeType: string) {
  if (mimeType === 'inode/directory') return Folder;
  if (mimeType.startsWith('image/')) return FileImage;
  if (mimeType.includes('spreadsheet') || mimeType.includes('csv') || mimeType.includes('excel')) return FileSpreadsheet;
  if (mimeType.includes('text') || mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('markdown')) return FileText;
  if (mimeType.includes('json') || mimeType.includes('javascript') || mimeType.includes('typescript') || mimeType.includes('python') || mimeType.includes('shell')) return FileCode;
  return File;
}

function getFileColor(mimeType: string) {
  if (mimeType === 'inode/directory') return 'text-amber-400 bg-amber-400/10';
  if (mimeType.startsWith('image/')) return 'text-blue-400 bg-blue-400/10';
  if (mimeType.includes('spreadsheet') || mimeType.includes('csv')) return 'text-emerald-400 bg-emerald-400/10';
  if (mimeType.includes('pdf')) return 'text-red-400 bg-red-400/10';
  if (mimeType.includes('markdown')) return 'text-purple-400 bg-purple-400/10';
  if (mimeType.includes('text') || mimeType.includes('document')) return 'text-blue-400 bg-blue-400/10';
  if (mimeType.includes('json') || mimeType.includes('javascript') || mimeType.includes('python')) return 'text-amber-400 bg-amber-400/10';
  return 'text-white/40 bg-white/5';
}

export default function FilesPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [usage, setUsage] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fetchFiles = useCallback(async () => {
    try {
      setError(null);
      const [filesRes, usageRes] = await Promise.all([
        api.get<{ files: FileItem[] }>('/files'),
        api.get<{ usedBytes: number }>('/files/usage'),
      ]);
      setFiles(filesRes.files || []);
      setUsage(usageRes.usedBytes || 0);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('not provisioned') || msg.includes('not running')) {
        setError('Your agent must be running to view workspace files. Go to the chat page first to start your agent.');
      } else {
        setError(msg || 'Failed to load files');
      }
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

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
      const reader = new FileReader();
      const content = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1] || '');
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      await api.post('/files/upload', {
        filename: file.name,
        content,
      });

      await fetchFiles();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [fetchFiles]);

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

  async function handleDownload(fileName: string) {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/files/${encodeURIComponent(fileName)}/download`,
        { headers: { Authorization: `Bearer ${api.getToken()}` } }
      );
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.split('/').pop() || fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Download failed');
    }
  }

  async function handleDelete(fileName: string) {
    setDeletingId(fileName);
    setMenuOpenId(null);
    try {
      await api.delete(`/files/${encodeURIComponent(fileName)}`);
      await fetchFiles();
    } catch (err: any) {
      setError(err.message || 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

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
          <h1 className="text-[28px] font-bold text-white tracking-tight">Workspace Files</h1>
          <p className="mt-1.5 text-[15px] text-white/50">
            Files in your agent&apos;s OpenClaw workspace. Upload files here for your agent to access.
          </p>
        </div>
        <Button onClick={handleUploadClick} loading={uploading} disabled={!!error}>
          <Upload className="h-4 w-4" />
          Upload to Workspace
        </Button>
      </div>

      {/* Container workspace info */}
      <GlassPanel className="animate-fade-up">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04]">
            <Bot className="h-4.5 w-4.5 text-white/30" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] text-white/50">
              These are files inside your OpenClaw container at <code className="text-white/30 text-[12px]">~/.openclaw/workspace/</code>
            </p>
            <p className="text-[12px] text-white/25 mt-0.5">
              {formatBytes(usage)} used &middot; Your agent can read and write to this workspace
            </p>
          </div>
        </div>
      </GlassPanel>

      {/* Error */}
      {error && (
        <div className="border border-red-500/20 bg-red-500/5 rounded-xl px-4 py-3 flex items-center gap-3 animate-fade-up">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-[13px] text-red-400 flex-1">{error}</p>
          <button onClick={() => { setError(null); fetchFiles(); }}
            className="text-[12px] text-red-400/60 hover:text-red-400 transition-colors">
            Retry
          </button>
        </div>
      )}

      {!error && (
        <>
          <div className="relative animate-fade-up">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
            <input
              type="text"
              placeholder="Search workspace files..."
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
              {dragOver ? 'Drop to upload to workspace' : 'Drag a file here to add it to your agent\'s workspace'}
            </p>
          </div>

          {filtered.length === 0 ? (
            <Card className="animate-fade-up">
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-2xl bg-white/5 p-5 mb-4">
                  <FolderOpen className="h-10 w-10 text-white/15" />
                </div>
                <p className="text-[16px] font-medium text-white/50 mb-1">
                  {search ? 'No files match your search' : 'Workspace is empty'}
                </p>
                <p className="text-[14px] text-white/30 max-w-sm">
                  {search
                    ? 'Try a different search term.'
                    : 'Upload files here or chat with your agent — files it creates will appear here.'}
                </p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3 animate-fade-up">
              {filtered.map((file) => {
                const Icon = getFileIcon(file.mimeType);
                const colorClass = getFileColor(file.mimeType);
                const isDeleting = deletingId === file.id;
                const isDir = file.isDirectory || file.mimeType === 'inode/directory';

                return (
                  <Card key={file.id} className={`!p-4 transition-all ${isDeleting ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-4">
                      <div className={`rounded-xl p-2.5 shrink-0 ${colorClass}`}>
                        <Icon className="h-5 w-5" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-white truncate">{file.name}</p>
                        <p className="text-[12px] text-white/30 mt-0.5">
                          {isDir ? 'Directory' : formatBytes(file.size)} &middot; {formatDate(file.createdAt)}
                        </p>
                      </div>

                      {!isDir && (
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
                                onClick={() => { handleDownload(file.name); setMenuOpenId(null); }}
                                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] text-white/70 hover:bg-white/5 hover:text-white transition-colors"
                              >
                                <Download className="h-4 w-4" />
                                Download
                              </button>
                              <hr className="border-white/[0.06] my-1" />
                              <button
                                onClick={() => handleDelete(file.name)}
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
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
