import React, { useEffect, useState, useMemo } from 'react';
import { getWorkspaceKnowledge, getWorkspaceKnowledgeContent } from '../lib/api';
import { BookOpen, RefreshCw, Search, Loader2, FileText } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';

const DOMAINS = ['financial', 'strategic', 'operations', 'production', 'hr', 'commercial'];

const DOMAIN_COLORS = {
  financial: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  strategic: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  operations: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  production: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  hr: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  commercial: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function WorkspaceKBPage() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDomain, setFilterDomain] = useState('all');
  const [viewOpen, setViewOpen] = useState(false);
  const [viewContent, setViewContent] = useState('');
  const [viewTitle, setViewTitle] = useState('');
  const [loadingContent, setLoadingContent] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getWorkspaceKnowledge();
      setArticles(res.data);
    } catch {
      toast.error('Failed to load knowledge base');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = articles;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a => a.name.toLowerCase().includes(q) || a.filename.toLowerCase().includes(q));
    }
    if (filterDomain !== 'all') list = list.filter(a => a.domain === filterDomain);
    return list;
  }, [articles, search, filterDomain]);

  const grouped = useMemo(() => {
    const map = {};
    for (const a of filtered) {
      if (!map[a.domain]) map[a.domain] = [];
      map[a.domain].push(a);
    }
    return map;
  }, [filtered]);

  const openArticle = async (article) => {
    setViewTitle(article.name);
    setViewOpen(true);
    setLoadingContent(true);
    try {
      const res = await getWorkspaceKnowledgeContent(article.path);
      setViewContent(res.data.content);
    } catch {
      setViewContent('Failed to load content.');
    } finally {
      setLoadingContent(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-orange-500" /> Knowledge Base
          </h1>
          <p className="text-theme-faint text-sm mt-1">{articles.length} articles across {DOMAINS.length} domains</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}
          className="border-subtle text-theme-secondary hover:text-theme-primary">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-faint" />
          <Input placeholder="Search articles..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-surface-card border-subtle text-theme-primary" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setFilterDomain('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filterDomain === 'all'
                ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                : 'bg-surface-card text-theme-faint border-subtle hover:text-theme-secondary'
            }`}>All</button>
          {DOMAINS.map(d => (
            <button key={d} onClick={() => setFilterDomain(d)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                filterDomain === d
                  ? DOMAIN_COLORS[d]
                  : 'bg-surface-card text-theme-faint border-subtle hover:text-theme-secondary'
              }`}>{d}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-theme-faint">No articles found</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([domain, items]) => (
            <div key={domain}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-theme-faint mb-3 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${DOMAIN_COLORS[domain]?.split(' ')[0] || 'bg-zinc-500'}`} />
                {domain} <span className="text-theme-dimmed font-normal">({items.length})</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map(a => (
                  <button key={a.path} onClick={() => openArticle(a)}
                    className="text-left bg-surface-card border border-subtle rounded-lg p-4 hover:border-orange-500/30 hover:bg-muted/30 transition-all group">
                    <div className="flex items-start gap-3">
                      <FileText className="w-5 h-5 text-theme-faint group-hover:text-orange-400 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-theme-primary font-medium truncate group-hover:text-orange-400">
                          {a.name}
                        </div>
                        <div className="text-theme-faint text-xs mt-1">
                          {formatSize(a.size)} · {new Date(a.modified * 1000).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="bg-surface-card border-subtle max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-theme-primary">{viewTitle}</DialogTitle>
          </DialogHeader>
          {loadingContent ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap text-sm text-theme-secondary font-mono leading-relaxed p-4 bg-surface-page rounded-lg border border-subtle overflow-x-auto">
              {viewContent}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
