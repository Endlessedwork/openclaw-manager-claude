# Telegram API Integration

Technical reference for the Telegram Bot API integration used to resolve user and group display names.

## Token Configuration

Token is read automatically from the openclaw gateway config:

```
~/.openclaw/openclaw.json → channels.telegram.botToken
```

No additional setup needed. If the token is missing or empty, Telegram API calls are silently skipped.

## Code Location

```
backend/services/telegram_api.py      — API client (2 functions)
backend/services/profile_resolver.py  — orchestrator that calls the client
```

## API Endpoints

### Get User Profile (via getChat)

```
GET https://api.telegram.org/bot{botToken}/getChat?chat_id={userId}
```

**Function:** `telegram_api.fetch_user_profile(user_id, bot_token)`

**Response:**
```json
{
  "ok": true,
  "result": {
    "id": 90988085,
    "is_bot": false,
    "first_name": "John",
    "last_name": "Doe",
    "username": "johndoe",
    "type": "private"
  }
}
```

**Mapped to:**
```python
{"display_name": "John Doe", "username": "johndoe"}
```

- `display_name` is built from `first_name` + `last_name` (space-separated, trimmed)
- If only `first_name` exists, that becomes the display name
- If both are empty, returns `None`

**Stored in DB:** `bot_users` table (`platform_user_id`, `platform="telegram"`, `display_name`)

### Get Group Info (via getChat)

```
GET https://api.telegram.org/bot{botToken}/getChat?chat_id={groupId}
```

**Function:** `telegram_api.fetch_group_info(group_id, bot_token)`

**Response:**
```json
{
  "ok": true,
  "result": {
    "id": -1003838276320,
    "title": "W.I.N.E. Maker",
    "type": "supergroup",
    "permissions": {}
  }
}
```

**Mapped to:**
```python
{"name": "W.I.N.E. Maker"}
```

**Stored in DB:** `bot_groups` table (`platform_group_id`, `platform="telegram"`, `name`)

**Important:** Both endpoints check `data.get("ok")` before reading the result. If `ok` is `false`, the call is treated as a failure.

## ID Format

- User IDs are **numeric strings** (e.g. `90988085`)
- Group IDs are **negative numeric strings** (e.g. `-1003838276320` for supergroups, `-5175194999` for regular groups)
- No case sensitivity issues (unlike LINE)
- IDs are stored as strings in the `bot_users.platform_user_id` / `bot_groups.platform_group_id` columns

## Disk Profile Files

The openclaw gateway creates profile JSON files when users interact:

```
~/.openclaw/workspace/shared/users/profiles/telegram_90988085.json
```

**User profile format:**
```json
{
  "platform": "telegram",
  "user_id": "90988085",
  "display_name": "John Doe",
  "role": "owner",
  "status": "active",
  "created_at": "2026-02-23T21:43:18.188Z"
}
```

Group profiles for Telegram follow the same pattern as LINE groups (stored in `groups/profiles/`).

These files may or may not exist depending on the deployment. The API fallback handles the case when they don't.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Token missing/empty | Skip all Telegram API calls silently |
| `ok: false` in response | Logged at DEBUG with `description` field, skipped |
| User never DMed the bot | `getChat` fails (bot has no private chat record). Logged, skipped. |
| Bot removed from group | `getChat` fails for that group. Logged, skipped. |
| Group has no title | Logged at DEBUG, skipped (returns `None`) |
| Network timeout (>5s) | Logged at DEBUG, skipped |
| Any other error | Logged at DEBUG, skipped. No exception propagated. |

No retry logic. Next page load will attempt resolution again for any unresolved IDs.

## Manual Testing

```bash
# Set your token
TOKEN="your_bot_token"

# Test user profile (user must have DMed the bot before)
curl -s "https://api.telegram.org/bot$TOKEN/getChat?chat_id=90988085" | python3 -m json.tool

# Test group info (bot must be a member of the group)
curl -s "https://api.telegram.org/bot$TOKEN/getChat?chat_id=-1003838276320" | python3 -m json.tool
```

## Limitations

- **DM requirement for users**: The `getChat` method only works for users who have **previously sent a message to the bot** (started a private chat). Users who only appear in groups but never DMed the bot cannot be resolved via this endpoint.
- **Bot membership for groups**: The bot must be a **current member** of the group to fetch its info via `getChat`.
- **No user profile photos**: Unlike LINE, the `getChat` response for users does not include a profile photo URL directly. Photo retrieval requires additional API calls (`getUserProfilePhotos`), which are not implemented.
- **Rate limits**: Telegram Bot API allows approximately 30 requests per second. The current implementation makes sequential calls, so this is unlikely to be hit under normal usage.

## Telegram vs LINE: Key Differences

| Aspect | LINE | Telegram |
|--------|------|----------|
| Auth method | `Authorization: Bearer` header | Token in URL path |
| User endpoint | Dedicated `/profile/{userId}` | General `getChat` (same for users/groups) |
| Group endpoint | Dedicated `/group/{groupId}/summary` | General `getChat` (same for users/groups) |
| Response wrapper | Direct JSON object | Wrapped in `{"ok": true, "result": {...}}` |
| ID format | Hex string with prefix (`U...`, `C...`) | Numeric string (negative for groups) |
| Case sensitivity | Yes (original vs lowercase) | No (numeric) |
| Profile photo | Included in response (`pictureUrl`) | Not included |
| DM requirement | No (can look up any user the bot has interacted with) | Yes (user must have DMed the bot) |

## References

- [Telegram Bot API - getChat](https://core.telegram.org/bots/api#getchat)
- [Telegram Bot API - Chat object](https://core.telegram.org/bots/api#chat)
