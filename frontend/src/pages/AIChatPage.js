import { useState, useEffect, useCallback } from 'react';
import { Sparkles, History, X } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { getAIChatThreads, getAIChatThread, deleteAIChatThread, sendAIChatMessage } from '@/lib/api';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import ThreadSidebar from '@/components/ai-chat/ThreadSidebar';
import ChatArea from '@/components/ai-chat/ChatArea';
import ChatInput from '@/components/ai-chat/ChatInput';

export default function AIChatPage() {
  const { token } = useAuth();
  const isMobile = useIsMobile();
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [toolStatus, setToolStatus] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadThreads = useCallback(async () => {
    try {
      const res = await getAIChatThreads();
      setThreads(res.data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const selectThread = useCallback(async (threadId) => {
    setActiveThreadId(threadId);
    setStreamingText('');
    setToolStatus(null);
    setSidebarOpen(false);
    try {
      const res = await getAIChatThread(threadId);
      setMessages(res.data.messages || []);
    } catch {
      toast.error('Failed to load conversation');
    }
  }, []);

  const handleNewThread = () => {
    setActiveThreadId(null);
    setMessages([]);
    setStreamingText('');
    setToolStatus(null);
    setSidebarOpen(false);
  };

  const handleDeleteThread = async (threadId) => {
    try {
      await deleteAIChatThread(threadId);
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (activeThreadId === threadId) {
        setActiveThreadId(null);
        setMessages([]);
      }
      toast.success('Conversation deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleSend = async (text) => {
    if (isStreaming) return;

    const userMsg = { id: `temp-${Date.now()}`, role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setStreamingText('');
    setToolStatus(null);

    try {
      const reader = await sendAIChatMessage(
        { message: text, thread_id: activeThreadId },
        token,
      );

      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let currentThreadId = activeThreadId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);

              switch (eventType) {
                case 'message_start':
                  if (data.thread_id && !currentThreadId) {
                    currentThreadId = data.thread_id;
                    setActiveThreadId(data.thread_id);
                  }
                  break;
                case 'content_delta':
                  fullText += data.text;
                  setStreamingText(fullText);
                  break;
                case 'tool_use':
                  setToolStatus(data);
                  if (data.status === 'done') {
                    setTimeout(() => setToolStatus(null), 500);
                  }
                  break;
                case 'message_done':
                  setMessages((prev) => [
                    ...prev,
                    { id: `ai-${Date.now()}`, role: 'assistant', content: fullText },
                  ]);
                  setStreamingText('');
                  break;
                case 'error':
                  toast.error(data.detail || 'AI error');
                  break;
                default:
                  break;
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }

      loadThreads();
    } catch (e) {
      toast.error(e.message || 'Failed to send message');
    } finally {
      setIsStreaming(false);
      setToolStatus(null);
    }
  };

  const threadSidebarProps = {
    threads,
    activeThreadId,
    onSelectThread: selectThread,
    onNewThread: handleNewThread,
    onDeleteThread: handleDeleteThread,
  };

  return (
    <div className={isMobile ? '' : 'space-y-4'}>
      {/* Desktop header */}
      {!isMobile && (
        <div>
          <h1 className="text-2xl font-bold text-theme-primary flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-orange-500" /> System Editor Mode
          </h1>
          <p className="text-theme-faint text-sm mt-1">Manage your bot system with AI assistance</p>
        </div>
      )}

      <div
        className={`bg-surface-card border border-subtle overflow-hidden flex flex-col ${
          isMobile ? 'rounded-none border-x-0 -mx-4' : 'rounded-xl'
        }`}
        style={{ height: isMobile ? 'calc(100dvh - 72px)' : 'calc(100vh - 200px)' }}
      >
        {/* Mobile chat header */}
        {isMobile && (
          <div className="flex items-center justify-between px-3 py-2 border-b border-subtle shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-semibold text-theme-primary">System Editor Mode</span>
            </div>
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-theme-secondary hover:text-theme-primary hover:bg-muted/30 transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              History
            </button>
          </div>
        )}

        <div className="flex flex-1 min-h-0">
          {/* Desktop sidebar */}
          {!isMobile && <ThreadSidebar {...threadSidebarProps} />}

          {/* Chat area */}
          <div className="flex-1 flex flex-col min-w-0">
            <ChatArea
              messages={messages}
              streamingText={streamingText}
              toolStatus={toolStatus}
              isStreaming={isStreaming}
            />
            <ChatInput onSend={handleSend} disabled={isStreaming} />
          </div>
        </div>
      </div>

      {/* Mobile thread sidebar as Sheet */}
      {isMobile && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="p-0 w-[280px] bg-surface-card border-r border-subtle">
            <div className="flex items-center justify-between px-3 py-3 border-b border-subtle">
              <span className="text-sm font-semibold text-theme-primary">Chat History</span>
              <button onClick={() => setSidebarOpen(false)} className="p-1 rounded hover:bg-muted/30 text-theme-faint hover:text-theme-primary transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ThreadSidebar {...threadSidebarProps} className="w-full border-r-0" />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
