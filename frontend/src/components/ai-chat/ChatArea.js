import { useEffect, useRef } from 'react';
import { Bot, User, Wrench, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex gap-2 max-w-[85%] ${isUser ? 'flex-row-reverse' : ''}`}>
        <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold mt-1">
          {isUser ? (
            <div className="w-7 h-7 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <User className="w-3.5 h-3.5" />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className={`mb-1 ${isUser ? 'text-right' : ''}`}>
            <span className={`text-[11px] font-medium ${isUser ? 'text-sky-400' : 'text-orange-400'}`}>
              {isUser ? 'You' : 'AI Assistant'}
            </span>
          </div>
          <div className={`rounded-lg px-3 py-2 text-sm leading-relaxed break-words ${
            isUser
              ? 'bg-surface-card border border-subtle text-theme-primary whitespace-pre-wrap'
              : 'bg-orange-500/10 border border-orange-500/20 text-theme-primary'
          }`}>
            {isUser ? (
              msg.content
            ) : (
              <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:text-theme-primary prose-strong:text-theme-primary prose-code:text-orange-300 prose-code:bg-surface-page prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-surface-page prose-pre:border prose-pre:border-subtle">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolIndicator({ toolName, status }) {
  return (
    <div className="flex justify-start">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border bg-violet-500/10 border-violet-500/20 text-violet-400">
        {status === 'calling' ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Wrench className="w-3 h-3" />
        )}
        {toolName}
        {status === 'calling' && '...'}
      </span>
    </div>
  );
}

function StreamingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex gap-2 max-w-[85%]">
        <div className="w-7 h-7 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0">
          <Bot className="w-3.5 h-3.5" />
        </div>
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse [animation-delay:0.2s]" />
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse [animation-delay:0.4s]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatArea({ messages, streamingText, toolStatus, isStreaming }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, toolStatus]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Bot className="w-12 h-12 text-orange-500/30 mx-auto" />
          <p className="text-theme-faint text-sm">Ask anything about your bot system</p>
          <div className="flex flex-wrap gap-2 justify-center max-w-md">
            {['How many active sessions?', 'Show agent list', 'Gateway health status'].map((q) => (
              <span key={q} className="text-xs text-theme-muted bg-surface-card border border-subtle rounded-full px-3 py-1">
                {q}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
      <div className="max-w-3xl mx-auto space-y-4">
        {messages.map((msg, i) => (
          <MessageBubble key={msg.id || i} msg={msg} />
        ))}
        {toolStatus && (
          <ToolIndicator toolName={toolStatus.tool_name} status={toolStatus.status} />
        )}
        {isStreaming && streamingText && (
          <MessageBubble msg={{ role: 'assistant', content: streamingText }} />
        )}
        {isStreaming && !streamingText && !toolStatus && (
          <StreamingIndicator />
        )}
      </div>
    </div>
  );
}
