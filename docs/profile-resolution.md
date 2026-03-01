# Profile Resolution

How the Sessions page resolves participant names (users and groups) from raw platform IDs.

## Overview

Sessions store participant IDs as opaque platform strings (e.g. `Ubc9c7dda...` for LINE, `90988085` for Telegram). The profile resolver translates these into human-readable display names through a 3-step fallback chain, then caches the result in PostgreSQL. Once cached, subsequent requests hit the database directly and return instantly.

## Fallback Chain

```
1. PostgreSQL       → batch lookup with case-insensitive matching
2. Disk profiles    → JSON files created by the openclaw gateway
3. Platform API     → calls LINE or Telegram API directly
4. Cache to DB      → saves results from steps 2-3 into PostgreSQL
```

Each step only processes IDs that were **not** resolved by the previous step.

## Platform API Details

### LINE

| Type  | Endpoint                                                  |
|-------|-----------------------------------------------------------|
| User  | `GET https://api.line.me/v2/bot/profile/{userId}`         |
| Group | `GET https://api.line.me/v2/bot/group/{groupId}/summary`  |

Token source: `openclaw.json` → `channels.line.channelAccessToken`

### Telegram

| Type  | Endpoint                                                                |
|-------|-------------------------------------------------------------------------|
| User  | `GET https://api.telegram.org/bot{token}/getChat?chat_id={userId}`      |
| Group | `GET https://api.telegram.org/bot{token}/getChat?chat_id={groupId}`     |

Token source: `openclaw.json` → `channels.telegram.botToken`

## File Structure

```
backend/services/
  line_api.py             — LINE API functions (sync, called via run_in_executor)
  telegram_api.py         — Telegram API functions (sync, called via run_in_executor)
  profile_resolver.py     — orchestrator (called by server.py)
```

Disk profile files are read from:
```
~/.openclaw/workspace/shared/users/profiles/*.json
~/.openclaw/workspace/shared/groups/profiles/*.json
```

File naming convention: `{platform}_{platformId}.json` (e.g. `line_Ubc9c7dda.json`).

## Configuration

No additional configuration is needed. Tokens are read automatically from `~/.openclaw/openclaw.json` at request time. If a platform's token is missing or empty, that platform's API step is silently skipped.

## Case-Insensitive Matching

Gateway session keys use **lowercase** IDs (e.g. `ubc9c7dda...`) but the database stores IDs with **original case** (e.g. `Ubc9c7dda...`). All lookups use `func.lower()` / case-insensitive matching. Disk profile filenames are also matched case-insensitively.

Telegram IDs are numeric strings and do not have case issues.

## Error Handling

- **API timeout**: 5 seconds per call
- **Failures**: logged at `DEBUG` level and skipped (no exception propagation)
- **No retry**: a failed lookup is simply skipped; the next page load tries again automatically
- **Disk read errors**: caught per-file (`json.JSONDecodeError`, `OSError`)

## Adding a New Platform

1. Create `backend/services/<platform>_api.py` with sync functions for fetching user/group profiles
2. Add the platform's branch in `profile_resolver.py`:
   - `_fetch_from_api_users()` — add an `elif platform == "<name>" and <token>:` block
   - `_fetch_from_api_groups()` — same pattern
3. Token source: add to the `channels` dict check at the top of each function (e.g. `channels.get("<platform>", {}).get("<tokenKey>", "")`)

## Troubleshooting

**Names not showing at all:**
1. Check that the platform token exists in `~/.openclaw/openclaw.json` under `channels.<platform>`
2. Check database row count: `SELECT count(*) FROM bot_users;` / `SELECT count(*) FROM bot_groups;`
3. Set backend log level to `DEBUG` and look for profile resolution messages
4. Test the API manually:
   ```bash
   # LINE user
   curl -H "Authorization: Bearer $TOKEN" https://api.line.me/v2/bot/profile/$USER_ID

   # Telegram user
   curl "https://api.telegram.org/bot$TOKEN/getChat?chat_id=$USER_ID"
   ```

**Names for some users but not others:**
- LINE: the user may have blocked the bot (API returns 404)
- Telegram: the bot can only resolve users who have interacted with it directly (sent a message or joined a group with the bot)
