import React, { useEffect, useState, useRef, useMemo } from 'react';
import { getSessionConversations } from '../lib/api';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import { Bot, User, Hash, MessageSquare, Reply, Wrench, Clock, Info, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { toast } from 'sonner';
import { parseMediaBlock } from '../utils/mediaParser';
import MediaPreview from './MediaPreview';
import ImageModal from './ImageModal';

function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// --- Message text processing ---

/** Extract sender info from "Conversation info (untrusted metadata)" blocks */
function extractConversationMeta(text) {
  const match = text.match(/Conversation info \(untrusted metadata\):\s*```json\s*(\{[\s\S]*?\})\s*```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch { return null; }
}

/** Strip system preamble like [Thu 2026-02-26 09:00 GMT+7] [System Message] [sessionId: xxx] */
function parseSystemPreamble(text) {
  const preambleRe = /^\[([^\]]+)\]\s*\[System Message\]\s*\[sessionId:\s*[^\]]+\]\s*/;
  const match = text.match(preambleRe);
  if (!match) return { timestamp: null, body: text };
  return { timestamp: match[1], body: text.slice(match[0].length) };
}

/** Strip internal instruction suffixes that shouldn't be shown to viewers */
function stripInternalInstructions(text) {
  // Remove "A completed cron job is ready for user delivery..." and everything after
  const cronCutoff = text.indexOf('A completed cron job is ready for user delivery');
  if (cronCutoff > 0) return text.slice(0, cronCutoff).trim();
  // Remove "Convert the result above into your normal assistant voice..."
  const convertCutoff = text.indexOf('Convert the result above into');
  if (convertCutoff > 0) return text.slice(0, convertCutoff).trim();
  return text;
}

/** Process [[directives]] into badge elements, returns array of React nodes */
function processDirectives(text) {
  const parts = [];
  let remaining = text;
  const directiveRe = /\[\[([^\]]+)\]\]/g;
  let match;
  let lastIdx = 0;

  while ((match = directiveRe.exec(remaining)) !== null) {
    if (match.index > lastIdx) {
      parts.push(remaining.slice(lastIdx, match.index));
    }
    const directive = match[1];
    const label = directive.replace(/_/g, ' ');
    parts.push(
      <span key={`dir-${match.index}`} className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-sky-500/10 border-sky-500/20 text-sky-400 align-middle">
        <Reply className="w-2.5 h-2.5" />
        {label}
      </span>
    );
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < remaining.length) {
    parts.push(remaining.slice(lastIdx));
  }

  return parts.length > 0 ? parts : [text];
}

function MessageContent({ msg }) {
  const [selectedImage, setSelectedImage] = useState(null);
  const isToolCall = msg.message_type === 'tool_call';
  const text = msg.message || '';

  // Tool call: show as icon badge
  if (isToolCall) {
    const toolMatch = text.match(/\[tool_call:\s*(.+?)\]/);
    const toolName = toolMatch ? toolMatch[1] : text;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md border bg-violet-500/10 border-violet-500/20 text-violet-400">
        <Wrench className="w-3 h-3" />
        {toolName}
      </span>
    );
  }

  // Conversation metadata block: strip metadata, show only the actual message
  const meta = extractConversationMeta(text);
  if (meta) {
    const afterMeta = text.replace(/Conversation info \(untrusted metadata\):\s*```json\s*\{[\s\S]*?\}\s*```\s*/, '').trim();
    if (!afterMeta) return null;
    const parsed = parseMediaBlock(afterMeta);
    return (
      <>
        <ImageModal imagePath={selectedImage} onClose={() => setSelectedImage(null)} />
        {parsed.media && <MediaPreview media={parsed.media} onImageClick={setSelectedImage} />}
        <div>{processDirectives(parsed.remaining)}</div>
      </>
    );
  }

  // System preamble: strip [date][System Message][sessionId] and show body
  const { timestamp: sysTs, body: sysBody } = parseSystemPreamble(text);
  if (sysTs) {
    const cleaned = stripInternalInstructions(sysBody);
    const parsed = parseMediaBlock(cleaned);
    return (
      <>
        <ImageModal imagePath={selectedImage} onClose={() => setSelectedImage(null)} />
        <div className="space-y-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] text-theme-dimmed">
            <Clock className="w-2.5 h-2.5" />
            {sysTs}
          </span>
          {parsed.media && <MediaPreview media={parsed.media} onImageClick={setSelectedImage} />}
          <div className="whitespace-pre-wrap">{processDirectives(parsed.remaining)}</div>
        </div>
      </>
    );
  }

  // Regular message: process [[directives]] and media
  const parsed = parseMediaBlock(text);
  return (
    <>
      <ImageModal imagePath={selectedImage} onClose={() => setSelectedImage(null)} />
      {parsed.media && <MediaPreview media={parsed.media} onImageClick={setSelectedImage} />}
      <div className="whitespace-pre-wrap">{processDirectives(parsed.remaining)}</div>
    </>
  );
}

// --- Collapsible long messages ---

function CollapsibleMessage({ msg, threshold = 400 }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = (msg.message || '').length > threshold;

  return (
    <div>
      <div className={!expanded && isLong ? 'max-h-40 overflow-hidden relative' : ''}>
        <MessageContent msg={msg} />
        {!expanded && isLong && (
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-surface-card to-transparent" />
        )}
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 mt-1 text-[11px] text-orange-400 hover:text-orange-300 transition-colors"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

// --- Main components ---

/** Get initials from a display name (up to 2 chars) */
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Derive a readable group/peer label from session_key */
function parsePeerLabel(sessionKey) {
  if (!sessionKey) return null;
  // session_key format: agent:main:telegram:group:-1003838276320
  const parts = sessionKey.split(':');
  // Look for group/private identifier
  const groupIdx = parts.indexOf('group');
  if (groupIdx >= 0 && parts[groupIdx + 1]) {
    return { type: 'group', id: parts[groupIdx + 1] };
  }
  const privateIdx = parts.indexOf('private');
  if (privateIdx >= 0 && parts[privateIdx + 1]) {
    return { type: 'private', id: parts[privateIdx + 1] };
  }
  return null;
}

export default function SessionChatSheet({ open, onOpenChange, session }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!open || !session) return;
    setLoading(true);
    setMessages([]);
    getSessionConversations(session.session_key)
      .then(res => setMessages(res.data))
      .catch(() => toast.error('Failed to load conversation'))
      .finally(() => setLoading(false));
  }, [open, session]);

  useEffect(() => {
    if (!loading && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [loading, messages]);

  // Build profile lookup from enriched message data: { platform_id -> { display_name, avatar_url } }
  const profiles = useMemo(() => {
    const map = {};
    for (const msg of messages) {
      const pid = msg.sender_platform_id;
      if (pid && !map[pid]) {
        map[pid] = {
          display_name: msg.display_name || '',
          avatar_url: msg.avatar_url || null,
        };
      }
    }
    return map;
  }, [messages]);

  // Find group name from metadata — first message with conversation meta often has group_subject
  const groupName = useMemo(() => {
    for (const msg of messages) {
      const meta = extractConversationMeta(msg.message || '');
      if (meta?.group_subject) return meta.group_subject;
    }
    return null;
  }, [messages]);

  // Primary contact name for the header title
  const primaryContactName = useMemo(() => {
    if (groupName) return groupName;
    for (const msg of messages) {
      if (msg.sender_type === 'user') {
        const name = msg.display_name || profiles[msg.sender_platform_id]?.display_name || msg.sender_name;
        if (name) return name;
      }
    }
    return null;
  }, [messages, profiles, groupName]);

  const peerInfo = parsePeerLabel(session?.session_key);

  if (!session) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-xl w-full flex flex-col p-0 bg-surface-page border-l border-subtle"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-subtle shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base text-theme-primary" style={{ fontFamily: 'Manrope, sans-serif' }}>
            <MessageSquare className="w-4 h-4 text-orange-400" />
            {primaryContactName || 'Session Chat'}
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border bg-orange-500/10 border-orange-500/20 text-orange-400">
              <Bot className="w-3 h-3" />
              {session.agent}
            </span>
            {session.channel && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-md border bg-surface-card border-subtle text-theme-muted">
                {session.channel}
              </span>
            )}
            {(groupName || peerInfo) && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border bg-sky-500/10 border-sky-500/20 text-sky-400">
                {peerInfo?.type === 'group' ? <Users className="w-3 h-3" /> : <User className="w-3 h-3" />}
                {groupName || (peerInfo?.type === 'group' ? `Group ${peerInfo.id}` : `DM ${peerInfo.id}`)}
              </span>
            )}
            <span className="text-[11px] font-mono text-theme-faint flex items-center gap-1">
              <Hash className="w-3 h-3" />
              {session.session_key}
            </span>
          </SheetDescription>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-16">
              <MessageSquare className="w-10 h-10 text-theme-dimmed mx-auto mb-3" />
              <p className="text-sm text-theme-faint">No conversations recorded</p>
              <p className="text-xs text-theme-dimmed mt-1">Run sync_sessions.py to import chat history</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <ChatBubble key={msg.id} msg={msg} prevMsg={i > 0 ? messages[i - 1] : null} profiles={profiles} />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SenderAvatar({ msg, profiles, size = 'sm' }) {
  const isUser = msg.sender_type === 'user';
  const profile = profiles?.[msg.sender_platform_id] || {};
  const avatarUrl = msg.avatar_url || profile.avatar_url;
  const displayName = msg.display_name || profile.display_name || msg.sender_name;

  const sizeClasses = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';
  const textSize = size === 'sm' ? 'text-[9px]' : 'text-[10px]';

  if (isUser) {
    return (
      <Avatar className={`${sizeClasses} shrink-0`}>
        {avatarUrl ? (
          <AvatarImage src={avatarUrl} alt={displayName || 'User'} />
        ) : null}
        <AvatarFallback className={`${textSize} font-semibold bg-sky-500/20 text-sky-400`}>
          {displayName ? getInitials(displayName) : <User className="w-3 h-3" />}
        </AvatarFallback>
      </Avatar>
    );
  }

  // Agent/bot
  return (
    <Avatar className={`${sizeClasses} shrink-0`}>
      <AvatarFallback className={`${textSize} font-semibold bg-orange-500/20 text-orange-400`}>
        <Bot className="w-3 h-3" />
      </AvatarFallback>
    </Avatar>
  );
}

function resolveDisplayName(msg, profiles) {
  if (msg.display_name) return msg.display_name;
  const profile = profiles?.[msg.sender_platform_id] || {};
  if (profile.display_name) return profile.display_name;
  if (msg.sender_name) return msg.sender_name;
  return msg.sender_type === 'user' ? 'User' : 'Agent';
}

function ChatBubble({ msg, prevMsg, profiles }) {
  const isUser = msg.sender_type === 'user';
  const isSystem = msg.sender_type === 'system';
  const isToolCall = msg.message_type === 'tool_call';
  const sameSender = prevMsg && prevMsg.sender_type === msg.sender_type && prevMsg.sender_platform_id === msg.sender_platform_id && prevMsg.sender_type !== 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <span className="text-[11px] text-theme-dimmed bg-surface-sunken px-3 py-1 rounded-full">
          {msg.message}
        </span>
      </div>
    );
  }

  const displayName = resolveDisplayName(msg, profiles);

  // Tool calls: inline badge only, no bubble — but still aligned with avatar column
  if (isToolCall) {
    const text = msg.message || '';
    const toolMatch = text.match(/\[tool_call:\s*(.+?)\]/);
    const toolName = toolMatch ? toolMatch[1] : text;
    return (
      <div className={`flex ${isUser ? 'justify-start' : 'justify-end'} ${sameSender ? '' : 'mt-1'}`}>
        <div className={`flex items-center gap-2 ${isUser ? '' : 'flex-row-reverse'}`}>
          {/* Spacer for avatar column when same sender */}
          {sameSender && <div className="w-6 shrink-0" />}
          {!sameSender && <SenderAvatar msg={msg} profiles={profiles} />}
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md border bg-violet-500/10 border-violet-500/20 text-violet-400">
            <Wrench className="w-3 h-3" />
            {toolName}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-start' : 'justify-end'} ${sameSender ? '' : 'mt-1'}`}>
      <div className={`flex gap-2 max-w-[85%] ${isUser ? '' : 'flex-row-reverse'}`}>
        {/* Avatar column */}
        {sameSender ? (
          <div className="w-6 shrink-0" />
        ) : (
          <SenderAvatar msg={msg} profiles={profiles} />
        )}

        {/* Message content */}
        <div className="min-w-0">
          {!sameSender && (
            <div className={`mb-1 ${isUser ? '' : 'text-right'}`}>
              <div className={`flex items-center gap-1.5 ${isUser ? '' : 'justify-end'}`}>
                <span className={`text-[11px] font-medium ${isUser ? 'text-sky-400' : 'text-orange-400'}`}>
                  {displayName}
                </span>
                <span className="text-[10px] text-theme-dimmed">{formatTime(msg.timestamp)}</span>
              </div>
              {isUser && msg.sender_platform_id && (
                <span className="text-[10px] text-theme-dimmed font-mono">{msg.sender_platform_id}</span>
              )}
            </div>
          )}
          <div
            className={`rounded-lg px-3 py-2 text-sm leading-relaxed break-words ${
              isUser
                ? 'bg-surface-card border border-subtle text-theme-primary'
                : 'bg-orange-500/10 border border-orange-500/20 text-theme-primary'
            }`}
          >
            <CollapsibleMessage msg={msg} />
          </div>
        </div>
      </div>
    </div>
  );
}
