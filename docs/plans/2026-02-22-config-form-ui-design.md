# Config Page Form UI Design

**Date:** 2026-02-22
**Status:** Approved

## Goal

Replace the raw JSON editor on the Config page with a user-friendly form UI using accordion sections and minimal typing. Keep the JSON editor accessible via a tab toggle for power users.

## Scope

Form UI covers sections that don't have dedicated pages:
- Gateway, Agent Defaults, Tools, Messages, Commands, Skills, Plugins

Excluded (managed by other pages): auth profiles, models/providers, channels.

## Layout

- **Tab toggle** at the top: "Form" (default) / "JSON"
- **Form view**: Accordion sections, each collapsible
- **JSON view**: Existing textarea editor
- **Sync**: Switching tabs parses/rebuilds from the current config state. Save from either view updates the config.

## Accordion Sections

### 1. Gateway
| Field | Path | Control |
|-------|------|---------|
| Port | `gateway.port` | Number input (+/-) |
| Bind | `gateway.bind` | Select: loopback / lan / tailnet |
| Auth Mode | `gateway.auth.mode` | Select: token / password |
| Auth Token | `gateway.auth.token` | Password input + show/hide |
| Remote Token | `gateway.remote.token` | Password input + show/hide |
| Tailscale Mode | `gateway.tailscale.mode` | Select: off / on |
| Tailscale Reset on Exit | `gateway.tailscale.resetOnExit` | Toggle |
| Control UI Allowed Origins | `gateway.controlUi.allowedOrigins` | Tag/chip input |

### 2. Agent Defaults
| Field | Path | Control |
|-------|------|---------|
| Workspace | `agents.defaults.workspace` | Text input |
| Max Concurrent | `agents.defaults.maxConcurrent` | Number input |
| Compaction Mode | `agents.defaults.compaction.mode` | Select: default / safeguard |
| Memory Flush | `agents.defaults.compaction.memoryFlush.enabled` | Toggle |

### 3. Tools
| Field | Path | Control |
|-------|------|---------|
| Web Search API Key | `tools.web.search.apiKey` | Password input + show/hide |
| Elevated Enabled | `tools.elevated.enabled` | Toggle |
| Elevated Allow From | `tools.elevated.allowFrom` | Per-channel tag grid |
| Sandbox Tools Allow | `tools.sandbox.tools.allow` | Multi-select checkboxes |

### 4. Messages
| Field | Path | Control |
|-------|------|---------|
| Ack Reaction Scope | `messages.ackReactionScope` | Select: group-mentions / all / none |

### 5. Commands
| Field | Path | Control |
|-------|------|---------|
| Native | `commands.native` | Select: auto / on / off |
| Native Skills | `commands.nativeSkills` | Select: auto / on / off |
| Restart | `commands.restart` | Toggle |

### 6. Skills
| Field | Path | Control |
|-------|------|---------|
| Node Manager | `skills.install.nodeManager` | Select: npm / yarn / pnpm |

### 7. Plugins
| Field | Path | Control |
|-------|------|---------|
| Telegram Enabled | `plugins.entries.telegram.enabled` | Toggle |
| Line Enabled | `plugins.entries.line.enabled` | Toggle |

## Form Controls Strategy

- **Enums** → Select/Dropdown (zero typing)
- **Booleans** → Toggle switch
- **Numbers** → Number input with +/- buttons
- **Secrets** → Password input with show/hide toggle
- **Paths/Strings** → Text input
- **String arrays** → Tag/chip input (type + Enter, click X to remove)
- **Per-channel maps** → Grid of tag inputs per channel key

## Data Flow

1. On page load: fetch config → store as object
2. Form view reads/writes to the object state
3. JSON view serializes/deserializes the object
4. Save button sends the full object as raw JSON to PUT /api/config
5. Tab switch syncs: Form→JSON serializes object, JSON→Form parses text

## Backend

No backend changes needed. The existing GET/PUT /api/config endpoints handle full raw JSON.
