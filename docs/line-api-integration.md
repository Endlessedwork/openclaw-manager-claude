# LINE API Integration

Technical reference for the LINE Messaging API integration used to resolve user and group display names.

## Token Configuration

Token is read automatically from the openclaw gateway config:

```
~/.openclaw/openclaw.json → channels.line.channelAccessToken
```

No additional setup needed. If the token is missing or empty, LINE API calls are silently skipped.

## Code Location

```
backend/services/line_api.py          — API client (2 functions)
backend/services/profile_resolver.py  — orchestrator that calls the client
```

## API Endpoints

### Get User Profile

```
GET https://api.line.me/v2/bot/profile/{userId}
Authorization: Bearer {channelAccessToken}
```

**Function:** `line_api.fetch_user_profile(user_id, access_token)`

**Response:**
```json
{
  "displayName": "John Doe",
  "userId": "U0fab1bebacb28412b67d5695bfa3fe65",
  "pictureUrl": "https://profile.line-scdn.net/...",
  "statusMessage": "Hello"
}
```

**Mapped to:**
```python
{"display_name": "John Doe", "avatar_url": "https://profile.line-scdn.net/..."}
```

**Stored in DB:** `bot_users` table (`platform_user_id`, `platform="line"`, `display_name`)

### Get Group Summary

```
GET https://api.line.me/v2/bot/group/{groupId}/summary
Authorization: Bearer {channelAccessToken}
```

**Function:** `line_api.fetch_group_summary(group_id, access_token)`

**Response:**
```json
{
  "groupId": "C0e9b8fa0c22589d522d84444a373bb19",
  "groupName": "ACC BKK",
  "pictureUrl": "https://profile.line-scdn.net/..."
}
```

**Mapped to:**
```python
{"name": "ACC BKK", "picture_url": "https://profile.line-scdn.net/..."}
```

**Stored in DB:** `bot_groups` table (`platform_group_id`, `platform="line"`, `name`)

## ID Format

- User IDs start with `U` followed by 32 hex characters (e.g. `U0fab1bebacb28412b67d5695bfa3fe65`)
- Group IDs start with `C` followed by 32 hex characters (e.g. `C0e9b8fa0c22589d522d84444a373bb19`)
- Gateway session keys store IDs in **lowercase** (e.g. `u0fab1beb...`) but the LINE API and DB store **original case** (e.g. `U0fab1beb...`)
- All lookups use case-insensitive matching

## Disk Profile Files

The openclaw gateway creates profile JSON files when users interact:

```
~/.openclaw/workspace/shared/users/profiles/line_U0fab1beb....json
~/.openclaw/workspace/shared/groups/profiles/line_C0e9b8fa0....json
```

**User profile format:**
```json
{
  "platform": "line",
  "user_id": "U0fab1bebacb28412b67d5695bfa3fe65",
  "display_name": "John Doe",
  "role": "guest",
  "status": "new",
  "created_at": "2026-02-25T01:21:55.869Z"
}
```

**Group profile format:**
```json
{
  "platform": "line",
  "group_id": "C0e9b8fa0c22589d522d84444a373bb19",
  "group_name": "ACC BKK",
  "status": "active",
  "members": {
    "U52c1512969186b39e9b72dae856da2f3": {
      "display_name": "Sumalee",
      "first_seen_at": "2026-02-25T03:00:34.597Z"
    }
  }
}
```

These files may or may not exist depending on the deployment. The API fallback handles the case when they don't.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Token missing/empty | Skip all LINE API calls silently |
| API returns HTTP 404 | User likely blocked the bot or left the group. Logged at DEBUG, skipped. |
| API returns HTTP 401/403 | Token is invalid or expired. Logged at DEBUG, skipped. |
| Network timeout (>5s) | Logged at DEBUG, skipped. |
| Any other error | Logged at DEBUG, skipped. No exception propagated. |

No retry logic. Next page load will attempt resolution again for any unresolved IDs.

## Manual Testing

```bash
# Set your token
TOKEN="your_channel_access_token"

# Test user profile
curl -s -H "Authorization: Bearer $TOKEN" \
  https://api.line.me/v2/bot/profile/U0fab1bebacb28412b67d5695bfa3fe65 | python3 -m json.tool

# Test group summary
curl -s -H "Authorization: Bearer $TOKEN" \
  https://api.line.me/v2/bot/group/C0e9b8fa0c22589d522d84444a373bb19/summary | python3 -m json.tool
```

## Limitations

- **Blocked users**: If a user blocks the bot, the API returns 404 and the name cannot be resolved.
- **Left groups**: If the bot is removed from a group, the group summary API returns 404.
- **No member list**: The group summary endpoint does not return member details. Member info only comes from disk profile files (if they exist).
- **Rate limits**: LINE Messaging API has rate limits. The current implementation makes sequential calls, so this is unlikely to be hit under normal usage.

## References

- [LINE Messaging API - Get Profile](https://developers.line.biz/en/reference/messaging-api/#get-profile)
- [LINE Messaging API - Get Group Summary](https://developers.line.biz/en/reference/messaging-api/#get-group-summary)
