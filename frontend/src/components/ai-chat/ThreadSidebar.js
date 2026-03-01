import { Plus, MessageSquare, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

export default function ThreadSidebar({ threads, activeThreadId, onSelectThread, onNewThread, onDeleteThread }) {
  return (
    <div className="w-64 border-r border-subtle bg-surface-card flex flex-col shrink-0">
      <div className="p-3 border-b border-subtle">
        <Button
          onClick={onNewThread}
          variant="outline"
          size="sm"
          className="w-full border-subtle text-theme-secondary hover:text-theme-primary hover:border-orange-500/30"
        >
          <Plus className="w-4 h-4 mr-2" /> New Chat
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {threads.length === 0 ? (
          <p className="text-theme-faint text-xs text-center py-8">No conversations yet</p>
        ) : (
          threads.map((t) => (
            <div
              key={t.id}
              onClick={() => onSelectThread(t.id)}
              className={`group flex items-center gap-2 px-3 py-2 mx-1 rounded-md cursor-pointer transition-colors ${
                t.id === activeThreadId
                  ? 'bg-orange-500/10 text-orange-400'
                  : 'text-theme-secondary hover:bg-muted/30 hover:text-theme-primary'
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{t.title || 'Untitled'}</p>
                <p className="text-[10px] text-theme-faint">
                  {t.updated_at ? formatDistanceToNow(new Date(t.updated_at), { addSuffix: true }) : ''}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteThread(t.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-theme-faint hover:text-red-400 transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
