"""AI Chat service — Claude API streaming with tool calling."""
import os
import json
import anthropic
from sqlmodel import select
from database import async_session
from models.app_setting import AppSetting
from services.ai_chat_tools import TOOLS, execute_tool

SYSTEM_PROMPT = """You are a powerful system management AI for the OpenClaw bot gateway.
You have full access to the server via bash commands, and can read/write files directly.

Your capabilities:
- Run any bash command (use `openclaw` CLI for gateway operations)
- Read and write files on the system
- Query and modify gateway configuration

Key commands:
- `openclaw sessions list --json` — list active sessions
- `openclaw agents list --json` — list agents
- `openclaw skills list --json` — list skills
- `openclaw models list --json` — list models
- `openclaw health --json` — gateway health
- `openclaw cron list --json` — cron jobs
- Gateway config: `~/.openclaw/openclaw.json`

Answer in the same language the user uses. Be concise and helpful.
When presenting data, use markdown tables or bullet lists for clarity.
Always use tools to get real data — do not guess."""


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
    """Get model name from DB settings, falling back to default."""
    async with async_session() as session:
        result = await session.execute(
            select(AppSetting).where(AppSetting.key == "ai_chat_model")
        )
        setting = result.scalar_one_or_none()
        if setting and setting.value:
            return setting.value
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
    max_tool_rounds = 10
    current_messages = list(messages)

    for _round in range(max_tool_rounds + 1):
        try:
            with client.messages.stream(
                model=model,
                max_tokens=4096,
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
