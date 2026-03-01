import { useState, useRef } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ChatInput({ onSend, disabled }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  return (
    <div className="border-t border-subtle bg-surface-card px-4 py-3">
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your bot system..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-surface-page border border-subtle rounded-lg px-4 py-2.5 text-sm text-theme-primary placeholder:text-theme-faint focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/50 disabled:opacity-50"
        />
        <Button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          size="icon"
          className="shrink-0 h-10 w-10 bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-30"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
