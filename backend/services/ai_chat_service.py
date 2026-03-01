"""AI Chat service — Claude API streaming with tool calling."""
import os
import json
import anthropic
from services.ai_chat_tools import TOOLS, execute_tool

SYSTEM_PROMPT = """You are an AI assistant for the OpenClaw bot management dashboard.
You help administrators query and understand their bot system — sessions, agents, users, channels, models, usage, and more.
You have tools to query live system data. Always use tools to get real data before answering — do not guess or make up information.
Answer in the same language the user uses. Be concise and helpful.
When presenting data, use markdown tables or bullet lists for clarity."""


def _get_client():
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not configured")
    return anthropic.Anthropic(api_key=api_key)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def stream_chat(messages: list[dict], thread_id: str):
    """Async generator yielding SSE-formatted strings."""
    yield _sse("message_start", {"thread_id": thread_id})

    client = _get_client()
    full_response = ""
    max_tool_rounds = 5
    current_messages = list(messages)

    for _round in range(max_tool_rounds + 1):
        try:
            with client.messages.stream(
                model="claude-sonnet-4-20250514",
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
