import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { getWorkspaceDocuments, getDocumentFile, patchDocument, deleteDocument } from '../lib/api';
import { FileText, RefreshCw, Search, Loader2, File, Image, FileSpreadsheet, ExternalLink, X, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

const DOMAINS = ['financial', 'legal', 'strategic', 'operations', 'production', 'hr', 'commercial', 'uncategorized'];

const DOMAIN_COLORS = {
  financial: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
  legal: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
  strategic: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  operations: 'text-sky-500 bg-sky-500/10 border-sky-500/20',
  production: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  hr: 'text-pink-500 bg-pink-500/10 border-pink-500/20',
  commercial: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  uncategorized: 'text-theme-faint bg-muted border-strong',
};

const SENSITIVITY_COLORS = {
  internal: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
  confidential: 'text-red-500 bg-red-500/10 border-red-500/20',
  public: 'text-green-500 bg-green-500/10 border-green-500/20',
};

const IMAGE_TYPES = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];

function fileIcon(type) {
  if (IMAGE_TYPES.includes(type)) return Image;
  if (['xlsx', 'xls', 'csv'].includes(type)) return FileSpreadsheet;
  return File;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ImageLightbox({ src, name, onClose }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <button onClick={onClose}
          className="absolute -top-3 -right-3 z-10 bg-zinc-800 border border-zinc-600 rounded-full p-1.5 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors">
          <X className="w-4 h-4" />
        </button>
        <img src={src} alt={name} className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg" />
        <p className="text-center text-zinc-400 text-sm mt-3">{name}</p>
      </div>
    </div>
  );
}

export default function WorkspaceDocsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDomain, setFilterDomain] = useState('all');
  const [filterSensitivity, setFilterSensitivity] = useState('all');
  const [lightbox, setLightbox] = useState(null); // { src, name }

  const load = async () => {
    setLoading(true);
    try {
      const res = await getWorkspaceDocuments();
      setDocs(res.data);
    } catch {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = docs;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        d.name.toLowerCase().includes(q) ||
        (d.uploaded_by || '').toLowerCase().includes(q)
      );
    }
    if (filterDomain !== 'all') list = list.filter(d => d.domain === filterDomain);
    if (filterSensitivity !== 'all') list = list.filter(d => (d.sensitivity || '').toLowerCase() === filterSensitivity);
    return list;
  }, [docs, search, filterDomain, filterSensitivity]);

  const grouped = useMemo(() => {
    const map = {};
    for (const d of filtered) {
      if (!map[d.domain]) map[d.domain] = [];
      map[d.domain].push(d);
    }
    return map;
  }, [filtered]);

  const handleFileClick = useCallback(async (d) => {
    if (!d.viewable) return;
    try {
      const res = await getDocumentFile(d.id);
      const blob = res.data;
      const url = URL.createObjectURL(blob);
      if (IMAGE_TYPES.includes(d.type)) {
        setLightbox({ src: url, name: d.name });
      } else {
        window.open(url, '_blank');
      }
    } catch {
      toast.error('Failed to load file');
    }
  }, []);

  // Cleanup blob URL when lightbox closes
  const closeLightbox = useCallback(() => {
    if (lightbox?.src) URL.revokeObjectURL(lightbox.src);
    setLightbox(null);
  }, [lightbox]);

  const handleSensitivityChange = useCallback(async (doc, newValue) => {
    try {
      await patchDocument(doc.id, { sensitivity: newValue });
      setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, sensitivity: newValue } : d));
      toast.success(`Sensitivity updated to ${newValue}`);
    } catch {
      toast.error('Failed to update sensitivity');
    }
  }, []);

  const handleDelete = useCallback(async (doc) => {
    if (!window.confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
    try {
      await deleteDocument(doc.id);
      setDocs(prev => prev.filter(d => d.id !== doc.id));
      toast.success('Document deleted');
    } catch (err) {
      toast.error(err.response?.status === 403 ? 'Access denied' : 'Failed to delete document');
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary flex items-center gap-2">
            <FileText className="w-6 h-6 text-orange-500" /> Documents
          </h1>
          <p className="text-theme-faint text-sm mt-1">{docs.length} documents across {DOMAINS.length} domains</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}
          className="border-subtle text-theme-secondary hover:text-theme-primary">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-faint" />
          <Input placeholder="Search documents..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-surface-card border-subtle text-theme-primary" />
        </div>
        <Select value={filterDomain} onValueChange={setFilterDomain}>
          <SelectTrigger className="w-[150px] bg-surface-card border-subtle text-theme-primary">
            <SelectValue placeholder="Domain" />
          </SelectTrigger>
          <SelectContent className="bg-surface-card border-subtle">
            <SelectItem value="all">All Domains</SelectItem>
            {DOMAINS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSensitivity} onValueChange={setFilterSensitivity}>
          <SelectTrigger className="w-[160px] bg-surface-card border-subtle text-theme-primary">
            <SelectValue placeholder="Sensitivity" />
          </SelectTrigger>
          <SelectContent className="bg-surface-card border-subtle">
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="public">Public</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
            <SelectItem value="confidential">Confidential</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-theme-faint">No documents found</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([domain, items]) => (
            <div key={domain}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-theme-faint mb-3 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${(DOMAIN_COLORS[domain] || 'text-theme-faint bg-muted border-strong').split(' ')[1]}`} />
                {domain} <span className="text-theme-dimmed font-normal">({items.length})</span>
              </h2>
              <div className="bg-surface-card border border-subtle rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-subtle">
                      <th className="text-left px-4 py-2.5 text-theme-faint font-medium">File</th>
                      <th className="text-left px-4 py-2.5 text-theme-faint font-medium">Type</th>
                      <th className="text-left px-4 py-2.5 text-theme-faint font-medium">Size</th>
                      <th className="text-left px-4 py-2.5 text-theme-faint font-medium">Uploaded By</th>
                      <th className="text-left px-4 py-2.5 text-theme-faint font-medium">Sensitivity</th>
                      <th className="text-left px-4 py-2.5 text-theme-faint font-medium">Date</th>
                      {(isAdmin || docs.some(d => d.can_manage)) && (
                        <th className="text-right px-4 py-2.5 text-theme-faint font-medium">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(d => {
                      const Icon = fileIcon(d.type);
                      return (
                        <tr key={d.path} className="border-b border-subtle last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5">
                            {d.viewable ? (
                              <button onClick={() => handleFileClick(d)}
                                className="flex items-center gap-2 text-left group">
                                <Icon className="w-4 h-4 text-theme-faint shrink-0 group-hover:text-orange-500 transition-colors" />
                                <span className="text-theme-primary truncate max-w-[300px] group-hover:text-orange-500 transition-colors underline decoration-transparent group-hover:decoration-orange-500/50">
                                  {d.name}
                                </span>
                                <ExternalLink className="w-3 h-3 text-theme-faint opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                              </button>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Icon className="w-4 h-4 text-theme-faint shrink-0" />
                                <span className="text-theme-primary truncate max-w-[300px]">{d.name}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="px-2 py-0.5 rounded bg-surface-page text-theme-faint text-xs font-mono">
                              {d.type}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-theme-faint text-xs">{formatSize(d.size)}</td>
                          <td className="px-4 py-2.5 text-theme-secondary text-xs">{d.uploaded_by || '—'}</td>
                          <td className="px-4 py-2.5">
                            {d.sensitivity ? (
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider ${SENSITIVITY_COLORS[d.sensitivity.toLowerCase()] || 'text-theme-faint bg-muted border-strong'}`}>
                                {d.sensitivity}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-theme-faint text-xs">
                            {d.updated_at ? new Date(d.updated_at).toLocaleDateString() : '—'}
                          </td>
                          {(isAdmin || docs.some(dd => dd.can_manage)) && (
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {isAdmin && (
                                  <Select value={d.sensitivity} onValueChange={(v) => handleSensitivityChange(d, v)}>
                                    <SelectTrigger className="h-7 w-[120px] text-xs bg-surface-page border-subtle text-theme-secondary">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-surface-card border-subtle">
                                      <SelectItem value="public">Public</SelectItem>
                                      <SelectItem value="internal">Internal</SelectItem>
                                      <SelectItem value="confidential">Confidential</SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                                {d.can_manage && (
                                  <Button variant="ghost" size="sm" onClick={() => handleDelete(d)}
                                    className="h-7 w-7 p-0 text-theme-faint hover:text-red-500 hover:bg-red-500/10">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {lightbox && <ImageLightbox src={lightbox.src} name={lightbox.name} onClose={closeLightbox} />}
    </div>
  );
}
