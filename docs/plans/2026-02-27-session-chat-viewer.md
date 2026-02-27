# Session Chat Viewer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a side panel (Sheet) to the Sessions page that shows the full chat transcript when clicking a session row.

**Architecture:** Backend gets a new endpoint that looks up conversations by `session_key` (bridging CLI sessions → DB sessions → conversations). Frontend adds a Sheet component with chat bubble UI, triggered by clicking a session row.

**Tech Stack:** FastAPI (backend), React + shadcn Sheet component (frontend), SQLModel/SQLAlchemy (DB queries)

---

### Task 1: Backend — Add by-session-key conversation endpoint

**Files:**
- Modify: `backend/routes/conversation_routes.py:1-8` (imports) and append new endpoint after line 97

**Step 1: Add Session import to conversation_routes.py**

Add `Session` import at line 4 (after `from sqlalchemy import desc`):

```python
from models.session import Session
```

**Step 2: Add the new endpoint**

Append after line 97 (after `get_session_conversations`):

```python


@conversation_router.get("/by-session-key")
async def get_conversations_by_session_key(
    session_key: str = Query(..., min_length=1, max_length=300),
    limit: int = Query(500, ge=1, le=2000),
    user=Depends(get_current_user),
):
    async with async_session() as session:
        result = await session.execute(
            select(Session).where(Session.session_key == session_key)
        )
        sess = result.scalar_one_or_none()
        if not sess:
            return []
        result = await session.execute(
            select(Conversation)
            .where(Conversation.session_id == sess.id)
            .order_by(Conversation.timestamp)
            .limit(limit)
        )
        return [_conversation_to_dict(c) for c in result.scalars().all()]
```

**Step 3: Verify backend starts without errors**

Run: `cd backend && python -c "from routes.conversation_routes import conversation_router; print('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
git add backend/routes/conversation_routes.py
git commit -m "feat: add conversations by-session-key endpoint"
```

---

### Task 2: Frontend — Add API function

**Files:**
- Modify: `frontend/src/lib/api.js:46-48` (sessions section)

**Step 1: Add getSessionConversations function**

After line 47 (`export const getSessions = ...`), add:

```javascript
export const getSessionConversations = (sessionKey) =>
  api.get(`/conversations/by-session-key?session_key=${encodeURIComponent(sessionKey)}`);
```

**Step 2: Commit**

```bash
git add frontend/src/lib/api.js
git commit -m "feat: add getSessionConversations API function"
```

---

### Task 3: Frontend — Create SessionChatSheet component

**Files:**
- Create: `frontend/src/components/SessionChatSheet.js`

**Step 1: Write the component**

```jsx
import React, { useEffect, useState, useRef } from 'react';
import { getSessionConversations } from '../lib/api';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
import { Bot, User, Hash, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
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

  if (!session) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-xl w-full flex flex-col p-0 bg-[#09090b] border-l border-zinc-800"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-zinc-800 shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base text-zinc-100" style={{ fontFamily: 'Manrope, sans-serif' }}>
            <MessageSquare className="w-4 h-4 text-orange-400" />
            Session Chat
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border bg-orange-500/10 border-orange-500/20 text-orange-400">
              <Bot className="w-3 h-3" />
              {session.agent}
            </span>
            {session.channel && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-md border bg-zinc-800 border-zinc-700 text-zinc-400">
                {session.channel}
              </span>
            )}
            <span className="text-[11px] font-mono text-zinc-500 flex items-center gap-1">
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
              <MessageSquare className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">No conversations recorded</p>
              <p className="text-xs text-zinc-600 mt-1">Run sync_sessions.py to import chat history</p>
            </div>
          ) : (
            messages.map(msg => (
              <ChatBubble key={msg.id} msg={msg} />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ChatBubble({ msg }) {
  const isUser = msg.sender_type === 'user';
  const isSystem = msg.sender_type === 'system';
  const isToolCall = msg.message_type === 'tool_call';

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <span className="text-[11px] text-zinc-600 bg-zinc-900 px-3 py-1 rounded-full">
          {msg.message}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[80%] ${isUser ? '' : ''}`}>
        <div className="flex items-center gap-1.5 mb-1">
          {isUser ? (
            <User className="w-3 h-3 text-sky-400" />
          ) : (
            <Bot className="w-3 h-3 text-orange-400" />
          )}
          <span className={`text-[11px] font-medium ${isUser ? 'text-sky-400' : 'text-orange-400'}`}>
            {msg.sender_name || (isUser ? 'User' : 'Agent')}
          </span>
          <span className="text-[10px] text-zinc-600">{formatTime(msg.timestamp)}</span>
        </div>
        <div
          className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
            isToolCall
              ? 'bg-zinc-900 border border-zinc-800 font-mono text-xs text-zinc-400 whitespace-pre-wrap'
              : isUser
              ? 'bg-zinc-800/80 border border-zinc-700/50 text-zinc-200'
              : 'bg-orange-500/10 border border-orange-500/20 text-zinc-200'
          }`}
        >
          {msg.message}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/SessionChatSheet.js
git commit -m "feat: add SessionChatSheet component with chat bubble UI"
```

---

### Task 4: Frontend — Wire SessionChatSheet into SessionsPage

**Files:**
- Modify: `frontend/src/pages/SessionsPage.js:1-5` (imports), line 24-26 (state), line 94 (row click), line 147 (Sheet render)

**Step 1: Add import**

At line 1, update imports to:

```javascript
import React, { useEffect, useState } from 'react';
import { getSessions } from '../lib/api';
import { MessageSquare, RefreshCw, Clock, Cpu, Bot, Hash, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import SessionChatSheet from '../components/SessionChatSheet';
```

**Step 2: Add state for selected session**

After line 26 (`const [loading, setLoading] = useState(true);`), add:

```javascript
  const [selectedSession, setSelectedSession] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
```

**Step 3: Make session rows clickable**

Replace line 94:
```
            <div key={s.id} data-testid={`session-row-${s.id}`} className="px-5 py-4 hover:bg-muted/30 transition-colors">
```

With:
```
            <div key={s.id} data-testid={`session-row-${s.id}`} className="px-5 py-4 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => { setSelectedSession(s); setSheetOpen(true); }}>
```

**Step 4: Add SessionChatSheet to render**

Before the closing `</div>` at line 148 (end of the page), add:

```jsx
      <SessionChatSheet open={sheetOpen} onOpenChange={setSheetOpen} session={selectedSession} />
```

**Step 5: Run existing tests to check no regressions**

Run: `cd frontend && yarn test -- --testPathPattern=SessionsPage --watchAll=false`
Expected: All existing tests pass (the mock for api might need updating)

**Step 6: Commit**

```bash
git add frontend/src/pages/SessionsPage.js
git commit -m "feat: wire SessionChatSheet into SessionsPage with click handler"
```

---

### Task 5: Update SessionsPage test for new behavior

**Files:**
- Modify: `frontend/src/pages/SessionsPage.test.js`

**Step 1: Update mock imports to include getSessionConversations**

Replace the api mock (lines 17-19):

```javascript
let mockGetSessions;
let mockGetSessionConversations;
jest.mock('../lib/api', () => ({
  getSessions: (...args) => mockGetSessions(...args),
  getSessionConversations: (...args) => mockGetSessionConversations(...args),
}));
```

**Step 2: Update beforeEach to initialize new mock**

Replace `beforeEach` (lines 34-36):

```javascript
beforeEach(() => {
  mockGetSessions = jest.fn().mockResolvedValue({ data: mockSessions });
  mockGetSessionConversations = jest.fn().mockResolvedValue({ data: [] });
});
```

**Step 3: Add test for clicking session opens chat sheet**

Add after the last test (before the closing `});`):

```javascript
  it('opens chat sheet when clicking a session row', async () => {
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('session-row-sess-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('session-row-sess-1'));
    await waitFor(() => {
      expect(screen.getByText('Session Chat')).toBeInTheDocument();
    });
  });
```

**Step 4: Run tests**

Run: `cd frontend && yarn test -- --testPathPattern=SessionsPage --watchAll=false`
Expected: All tests pass

**Step 5: Commit**

```bash
git add frontend/src/pages/SessionsPage.test.js
git commit -m "test: update SessionsPage tests for chat sheet integration"
```

---

### Task 6: Verify end-to-end

**Step 1: Run full frontend test suite**

Run: `cd frontend && yarn test -- --watchAll=false`
Expected: All tests pass

**Step 2: Build frontend to verify no compilation errors**

Run: `cd frontend && yarn build`
Expected: Build succeeds

**Step 3: Manual verification checklist**
- [ ] Open Sessions page, see session list
- [ ] Click a session row → Sheet slides in from right
- [ ] Sheet shows agent badge, channel badge, session key in header
- [ ] If conversations exist → chat bubbles display (user left, agent right)
- [ ] If no conversations → empty state with sync hint
- [ ] Click X or overlay → Sheet closes
- [ ] Click different session → Sheet shows new conversations
