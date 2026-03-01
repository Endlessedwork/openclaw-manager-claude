import { useState, useEffect, useCallback } from 'react';
import { Bot } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { getAIChatThreads, getAIChatThread, deleteAIChatThread, sendAIChatMessage } from '@/lib/api';
import ThreadSidebar from '@/components/ai-chat/ThreadSidebar';
import ChatArea from '@/components/ai-chat/ChatArea';
import ChatInput from '@/components/ai-chat/ChatInput';

export default function AIChatPage() {
  const { token } = useAuth();
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [toolStatus, setToolStatus] = useState(null);

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-theme-primary flex items-center gap-2">
          <Bot className="w-6 h-6 text-orange-500" /> AI Assistant
        </h1>
        <p className="text-theme-faint text-sm mt-1">Ask questions about your bot system</p>
      </div>

      <div className="bg-surface-card border border-subtle rounded-xl overflow-hidden flex" style={{ height: 'calc(100vh - 200px)' }}>
        <ThreadSidebar
          threads={threads}
          activeThreadId={activeThreadId}
          onSelectThread={selectThread}
          onNewThread={handleNewThread}
          onDeleteThread={handleDeleteThread}
        />
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
  );
}
