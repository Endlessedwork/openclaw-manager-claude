"""Tool definitions and executor for AI Chat assistant."""
import os
import json
import asyncio
import glob as glob_module
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
        "description": "Read the contents of a file by absolute path. Max file size 1MB. Use this to inspect configuration files, logs, and other text files. Supports reading specific line ranges with offset and limit.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Absolute path to the file to read.",
                },
                "offset": {
                    "type": "integer",
                    "description": "Start line number (1-based). If provided, returns lines starting from this line.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Number of lines to return. Used with offset for reading specific line ranges.",
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
    {
        "name": "glob",
        "description": "Fast file pattern matching. Returns matching file paths sorted by modification time (newest first). Supports recursive patterns like '**/*.py'. Max 200 results.",
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Glob pattern to match files (e.g. '**/*.py', 'src/**/*.ts').",
                },
                "path": {
                    "type": "string",
                    "description": "Base directory to search in. Defaults to home directory.",
                },
            },
            "required": ["pattern"],
        },
    },
    {
        "name": "grep",
        "description": "Search file contents using regex patterns. Returns matching lines with file paths and line numbers. Max 50 matches.",
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Regex pattern to search for.",
                },
                "path": {
                    "type": "string",
                    "description": "File or directory to search in. Defaults to home directory.",
                },
                "include": {
                    "type": "string",
                    "description": "File glob filter (e.g. '*.py', '*.js'). Only search files matching this pattern.",
                },
                "context_lines": {
                    "type": "integer",
                    "description": "Number of context lines to show before and after each match. Default 0.",
                },
                "case_insensitive": {
                    "type": "boolean",
                    "description": "Whether to perform case-insensitive search. Default false.",
                },
            },
            "required": ["pattern"],
        },
    },
    {
        "name": "edit_file",
        "description": "Perform a surgical string replacement in a file. Finds exactly one occurrence of old_string and replaces it with new_string. Fails if the old_string is not found or is not unique.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Absolute path to the file to edit.",
                },
                "old_string": {
                    "type": "string",
                    "description": "The exact string to find and replace. Must appear exactly once in the file.",
                },
                "new_string": {
                    "type": "string",
                    "description": "The replacement string.",
                },
            },
            "required": ["path", "old_string", "new_string"],
        },
    },
]

MAX_OUTPUT = 50 * 1024  # 50KB
MAX_FILE_SIZE = 1 * 1024 * 1024  # 1MB
MAX_GLOB_RESULTS = 200
MAX_GREP_MATCHES = 50


async def execute_tool(name: str, input_data: dict) -> str:
    """Execute a tool and return result as string."""
    try:
        if name == "bash":
            return await _run_bash(input_data)
        elif name == "read_file":
            return await _read_file(input_data)
        elif name == "write_file":
            return await _write_file(input_data)
        elif name == "glob":
            return await _glob(input_data)
        elif name == "grep":
            return await _grep(input_data)
        elif name == "edit_file":
            return await _edit_file(input_data)
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

    offset = input_data.get("offset")
    limit = input_data.get("limit")

    if offset is not None or limit is not None:
        lines = content.splitlines()
        total_lines = len(lines)

        # offset is 1-based
        start = max((offset or 1) - 1, 0)
        if limit is not None:
            end = start + limit
        else:
            end = total_lines

        selected = lines[start:end]
        numbered_lines = []
        for i, line in enumerate(selected, start=start + 1):
            numbered_lines.append(f"{i:6}\t{line}")
        content = "\n".join(numbered_lines)

        return json.dumps(
            {"path": path, "size": size, "total_lines": total_lines, "content": content},
            ensure_ascii=False,
        )

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


async def _glob(input_data: dict) -> str:
    pattern = input_data.get("pattern", "")
    if not pattern:
        return json.dumps({"error": "No pattern provided"})

    path = input_data.get("path", os.path.expanduser("~"))
    path = os.path.expanduser(path)

    if not os.path.isdir(path):
        return json.dumps({"error": f"Directory not found: {path}"})

    def _glob_sync():
        try:
            matches = glob_module.glob(pattern, root_dir=path, recursive=True)
        except Exception as e:
            return json.dumps({"error": f"Glob error: {str(e)}"})

        abs_matches = []
        for m in matches:
            full_path = os.path.join(path, m)
            if os.path.isfile(full_path):
                try:
                    mtime = os.path.getmtime(full_path)
                    abs_matches.append((full_path, mtime))
                except OSError:
                    abs_matches.append((full_path, 0))

        abs_matches.sort(key=lambda x: x[1], reverse=True)

        truncated = len(abs_matches) > MAX_GLOB_RESULTS
        results = [p for p, _ in abs_matches[:MAX_GLOB_RESULTS]]

        result = {"pattern": pattern, "path": path, "count": len(results), "files": results}
        if truncated:
            result["truncated"] = True
            result["total_matches"] = len(abs_matches)

        return json.dumps(result, ensure_ascii=False)

    return await asyncio.to_thread(_glob_sync)


async def _grep(input_data: dict) -> str:
    pattern = input_data.get("pattern", "")
    if not pattern:
        return json.dumps({"error": "No pattern provided"})

    path = input_data.get("path", os.path.expanduser("~"))
    path = os.path.expanduser(path)

    if not os.path.exists(path):
        return json.dumps({"error": f"Path not found: {path}"})

    include = input_data.get("include")
    context_lines = input_data.get("context_lines", 0)
    case_insensitive = input_data.get("case_insensitive", False)

    args = ["grep", "-rn"]

    if case_insensitive:
        args.append("-i")

    if context_lines and context_lines > 0:
        args.append(f"-C{context_lines}")

    if include:
        args.append(f"--include={include}")

    # Limit output to prevent runaway matches
    args.extend(["-m", str(MAX_GREP_MATCHES)])

    args.append(pattern)
    args.append(path)

    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
    except asyncio.TimeoutError:
        proc.kill()
        return json.dumps({"error": "Grep timed out after 30s"})

    stdout_str = stdout.decode("utf-8", errors="replace")
    stderr_str = stderr.decode("utf-8", errors="replace")

    # Truncate output if too large
    if len(stdout_str) > MAX_OUTPUT:
        stdout_str = stdout_str[:MAX_OUTPUT] + "\n... (output truncated)"

    # grep returns exit code 1 for no matches (not an error)
    if proc.returncode == 1:
        return json.dumps({"pattern": pattern, "path": path, "count": 0, "output": ""})

    if proc.returncode > 1:
        return json.dumps({"error": f"Grep error: {stderr_str.strip()}"})

    match_count = len([line for line in stdout_str.splitlines() if line and not line.startswith("--")])

    result = {"pattern": pattern, "path": path, "count": match_count, "output": stdout_str}

    return json.dumps(result, ensure_ascii=False)


async def _edit_file(input_data: dict) -> str:
    path = input_data.get("path", "")
    old_string = input_data.get("old_string", "")
    new_string = input_data.get("new_string", "")

    if not path:
        return json.dumps({"error": "No path provided"})

    if not os.path.isabs(path):
        return json.dumps({"error": "Path must be absolute"})

    if not os.path.exists(path):
        return json.dumps({"error": f"File not found: {path}"})

    if not old_string:
        return json.dumps({"error": "No old_string provided"})

    if old_string == new_string:
        return json.dumps({"error": "old_string and new_string are identical"})

    async with aiofiles.open(path, "r", encoding="utf-8", errors="replace") as f:
        content = await f.read()

    count = content.count(old_string)

    if count == 0:
        return json.dumps({"error": f"old_string not found in {path}"})

    if count > 1:
        return json.dumps({"error": f"old_string not unique, found {count} occurrences in {path}"})

    new_content = content.replace(old_string, new_string, 1)

    async with aiofiles.open(path, "w", encoding="utf-8") as f:
        await f.write(new_content)

    return json.dumps({"path": path, "status": "edited"}, ensure_ascii=False)
