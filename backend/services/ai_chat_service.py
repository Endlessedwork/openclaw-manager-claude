"""AI Chat service — Claude API streaming with tool calling."""
import os
import json
import anthropic
from sqlmodel import select
from database import async_session
from models.app_setting import AppSetting
from services.ai_chat_tools import TOOLS, execute_tool

SYSTEM_PROMPT = """You are a powerful system management AI for the OpenClaw bot gateway.
You have tools similar to Claude Code: bash, read_file, write_file, edit_file, glob, grep.

## Your Tools
- **bash**: Run any shell command. Use for `openclaw` CLI, git, system tasks.
- **read_file**: Read files. Use offset/limit for large files.
- **write_file**: Create or overwrite entire files.
- **edit_file**: Find-and-replace a unique string in a file. Safer than write_file for small changes.
- **glob**: Find files by pattern (e.g. `**/*.py`). Fast file discovery.
- **grep**: Search file contents with regex. Supports context lines and file type filters.

## Best Practices
- Use glob/grep to explore before editing
- Use edit_file for targeted changes, write_file only for new files or full rewrites
- Use read_file with offset/limit for large files
- Verify changes after editing (read the file back)

## OpenClaw System
- CLI: `openclaw sessions|agents|skills|models|health|cron list --json`
- Config: `~/.openclaw/openclaw.json` (after changes: `openclaw gateway reload`)
- Project: /home/walter/openclaw-manager-claude
  - Backend: backend/ (FastAPI + PostgreSQL)
  - Frontend: frontend/ (React 19 + Tailwind)

Answer in the same language the user uses. Be concise.
Use markdown tables or bullet lists for data. Use tools — don't guess."""


async def _get_api_key() -> str:
    """Get API key from DB settings, falling back to env var."""
    async with async_session() as session:
        result = await session.execute(
            select(AppSetting).where(AppSetting.key == "ai_chat_api_key")
        )
        setting = result.scalar_one_or_none()
        if setting and setting.value:
            return setting.value
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not configured")
    return api_key


async def _get_model() -> str:
    """Get model name from DB settings, falling back to default.

    Stored value may be an openclaw key (e.g. 'anthropic/claude-sonnet-4-6')
    or a raw model ID (e.g. 'claude-sonnet-4-20250514'). Strip provider prefix
    if present so the Anthropic SDK receives a valid model name.
    """
    async with async_session() as session:
        result = await session.execute(
            select(AppSetting).where(AppSetting.key == "ai_chat_model")
        )
        setting = result.scalar_one_or_none()
        if setting and setting.value:
            val = setting.value
            # Strip provider prefix (e.g. "anthropic/claude-sonnet-4-6" → "claude-sonnet-4-6")
            if "/" in val:
                val = val.split("/", 1)[1]
            return val
    return "claude-sonnet-4-20250514"


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def stream_chat(messages: list[dict], thread_id: str):
    """Async generator yielding SSE-formatted strings."""
    yield _sse("message_start", {"thread_id": thread_id})

    api_key = await _get_api_key()
    model = await _get_model()
    client = anthropic.Anthropic(api_key=api_key)
    full_response = ""
    max_tool_rounds = 20
    current_messages = list(messages)

    for _round in range(max_tool_rounds + 1):
        try:
            with client.messages.stream(
                model=model,
                max_tokens=8192,
                system=SYSTEM_PROMPT,
                messages=current_messages,
                tools=TOOLS,
            ) as stream:
                for event in stream:
                    if event.type == "content_block_start":
                        if event.content_block.type == "tool_use":
                            yield _sse("tool_use", {"tool_name": event.content_block.name, "status": "calling"})
                    elif event.type == "content_block_delta":
                        if hasattr(event.delta, "text"):
                            full_response += event.delta.text
                            yield _sse("content_delta", {"text": event.delta.text})

                response = stream.get_final_message()

                if response.stop_reason == "tool_use":
                    assistant_content = []
                    for block in response.content:
                        if block.type == "text":
                            assistant_content.append({"type": "text", "text": block.text})
                        elif block.type == "tool_use":
                            assistant_content.append({"type": "tool_use", "id": block.id, "name": block.name, "input": block.input})

                    current_messages.append({"role": "assistant", "content": assistant_content})

                    tool_results = []
                    for block in response.content:
                        if block.type == "tool_use":
                            result = await execute_tool(block.name, block.input)
                            tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": result})
                            yield _sse("tool_use", {"tool_name": block.name, "status": "done"})

                    current_messages.append({"role": "user", "content": tool_results})
                    continue
                else:
                    break

        except anthropic.APIError as e:
            yield _sse("error", {"detail": f"Claude API error: {str(e)}"})
            return
        except Exception as e:
            yield _sse("error", {"detail": str(e)})
            return

    yield _sse("message_done", {"full_text": full_response})
