"""Tool definitions and executor for AI Chat assistant."""
import os
import json
import asyncio
import aiofiles


TOOLS = [
    {
        "name": "bash",
        "description": "Run a bash command on the server. Use this for system commands, openclaw CLI operations, and general shell tasks. Commands run with a 30 second default timeout (max 120s). Working directory is the user's home directory.",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The bash command to execute.",
                },
                "timeout": {
                    "type": "integer",
                    "description": "Timeout in seconds. Default 30, max 120.",
                },
            },
            "required": ["command"],
        },
    },
    {
        "name": "read_file",
        "description": "Read the contents of a file by absolute path. Max file size 1MB. Use this to inspect configuration files, logs, and other text files.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Absolute path to the file to read.",
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": "Write content to a file at the given absolute path. Creates the file if it doesn't exist, overwrites if it does. Parent directory must exist.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Absolute path to the file to write.",
                },
                "content": {
                    "type": "string",
                    "description": "The content to write to the file.",
                },
            },
            "required": ["path", "content"],
        },
    },
]

MAX_OUTPUT = 50 * 1024  # 50KB
MAX_FILE_SIZE = 1 * 1024 * 1024  # 1MB


async def execute_tool(name: str, input_data: dict) -> str:
    """Execute a tool and return result as string."""
    try:
        if name == "bash":
            return await _run_bash(input_data)
        elif name == "read_file":
            return await _read_file(input_data)
        elif name == "write_file":
            return await _write_file(input_data)
        else:
            return json.dumps({"error": f"Unknown tool: {name}"})
    except Exception as e:
        return json.dumps({"error": str(e)})


async def _run_bash(input_data: dict) -> str:
    command = input_data.get("command", "")
    if not command:
        return json.dumps({"error": "No command provided"})

    timeout = min(input_data.get("timeout", 30), 120)
    home = os.path.expanduser("~")

    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=home,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        return json.dumps({"error": f"Command timed out after {timeout}s", "command": command})

    stdout_str = stdout.decode("utf-8", errors="replace")
    stderr_str = stderr.decode("utf-8", errors="replace")

    # Truncate output if too large
    if len(stdout_str) > MAX_OUTPUT:
        stdout_str = stdout_str[:MAX_OUTPUT] + f"\n... (truncated, {len(stdout)} bytes total)"
    if len(stderr_str) > MAX_OUTPUT:
        stderr_str = stderr_str[:MAX_OUTPUT] + f"\n... (truncated, {len(stderr)} bytes total)"

    result = {"exit_code": proc.returncode}
    if stdout_str:
        result["stdout"] = stdout_str
    if stderr_str:
        result["stderr"] = stderr_str

    return json.dumps(result, ensure_ascii=False)


async def _read_file(input_data: dict) -> str:
    path = input_data.get("path", "")
    if not path:
        return json.dumps({"error": "No path provided"})

    if not os.path.isabs(path):
        return json.dumps({"error": "Path must be absolute"})

    if not os.path.exists(path):
        return json.dumps({"error": f"File not found: {path}"})

    size = os.path.getsize(path)
    if size > MAX_FILE_SIZE:
        return json.dumps({"error": f"File too large: {size} bytes (max {MAX_FILE_SIZE})"})

    async with aiofiles.open(path, "r", encoding="utf-8", errors="replace") as f:
        content = await f.read()

    return json.dumps({"path": path, "size": size, "content": content}, ensure_ascii=False)


async def _write_file(input_data: dict) -> str:
    path = input_data.get("path", "")
    content = input_data.get("content", "")

    if not path:
        return json.dumps({"error": "No path provided"})

    if not os.path.isabs(path):
        return json.dumps({"error": "Path must be absolute"})

    parent = os.path.dirname(path)
    if not os.path.isdir(parent):
        return json.dumps({"error": f"Parent directory does not exist: {parent}"})

    async with aiofiles.open(path, "w", encoding="utf-8") as f:
        await f.write(content)

    return json.dumps({"path": path, "size": len(content.encode("utf-8")), "status": "written"})
