import React, { useEffect, useState } from 'react';
import { getModels } from '../lib/api';
import { Cpu, Star, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ModelsPage() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const res = await getModels(); setModels(res.data); }
      catch { toast.error('Failed to load models'); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div data-testid="models-page" className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Models</h1>
        <p className="text-sm text-zinc-500 mt-1">Active LLM models from gateway configuration and environment</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : models.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">No models configured</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {models.map(m => (
            <div key={m.id} data-testid={`model-card-${m.id}`} className={`bg-[#0c0c0e] border rounded-lg hover:border-orange-500/20 transition-all duration-300 ${m.is_primary ? 'border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.08)]' : 'border-zinc-800/60'}`}>
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${m.enabled ? 'bg-sky-500/10 border-sky-500/20' : 'bg-zinc-800 border-zinc-700'}`}>
                      <Cpu className={`w-4 h-4 ${m.enabled ? 'text-sky-500' : 'text-zinc-600'}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-zinc-200 truncate">{m.name}</h3>
                      <span className="text-[10px] font-mono text-zinc-500">{m.key}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {m.is_primary && <Star className="w-4 h-4 text-orange-500 fill-orange-500" title="Default model" />}
                    {m.enabled ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" title="Available" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-500" title="Unavailable" />
                    )}
                  </div>
                </div>

                <div className="space-y-2 mt-3">
                  {m.provider_id && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Provider</span>
                      <span className="font-mono text-zinc-300">{m.provider_id}</span>
                    </div>
                  )}
                  {m.input && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Input Price</span>
                      <span className="font-mono text-zinc-300">{m.input}</span>
                    </div>
                  )}
                  {m.context_window && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Context</span>
                      <span className="font-mono text-zinc-300">{Number(m.context_window).toLocaleString()} tokens</span>
                    </div>
                  )}
                </div>

                {m.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {m.tags.map(tag => (
                      <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${tag === 'default' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
