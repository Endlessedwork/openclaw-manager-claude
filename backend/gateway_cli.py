import asyncio
import json
import time
import os
from pathlib import Path

OPENCLAW_CONFIG = Path.home() / ".openclaw" / "openclaw.json"
OPENCLAW_BIN = os.environ.get("OPENCLAW_BIN", str(Path.home() / ".npm-global" / "bin" / "openclaw"))


class CLICache:
    def __init__(self):
        self._cache = {}

    async def get(self, key: str, fetcher, ttl_seconds: float):
        if key in self._cache:
            entry = self._cache[key]
            if time.time() - entry["ts"] < ttl_seconds:
                return entry["data"]
        data = await fetcher()
        self._cache[key] = {"data": data, "ts": time.time()}
        return data

    def invalidate(self, key: str = None):
        if key:
            self._cache.pop(key, None)
        else:
            self._cache.clear()


class GatewayCLI:
    def __init__(self):
        self.cache = CLICache()

    async def _run(self, *args, json_output=True, timeout=30) -> dict | str:
        cmd = [OPENCLAW_BIN] + list(args)
        if json_output:
            cmd.append("--json")
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ, "NO_COLOR": "1"}
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            raise RuntimeError(f"CLI timeout: {' '.join(cmd)}")
        if proc.returncode != 0:
            raise RuntimeError(f"CLI error ({proc.returncode}): {stderr.decode()[:500]}")
        raw = stdout.decode()
        if json_output:
            return json.loads(raw)
        return raw

    async def agents(self):
        return await self.cache.get("agents", lambda: self._run("agents", "list"), 30)

    async def sessions(self):
        return await self.cache.get("sessions", lambda: self._run("sessions", "list"), 15)

    async def skills(self):
        return await self.cache.get("skills", lambda: self._run("skills", "list"), 60)

    async def health(self):
        return await self.cache.get("health", lambda: self._run("health"), 10)

    async def cron_jobs(self):
        return await self.cache.get("cron", lambda: self._run("cron", "list"), 30)

    async def models(self):
        return await self.cache.get("models", lambda: self._run("models", "list"), 60)

    async def config_read(self):
        async def _read():
            import aiofiles
            async with aiofiles.open(OPENCLAW_CONFIG, 'r') as f:
                content = await f.read()
            return json.loads(content)
        return await self.cache.get("config", _read, 5)

    async def config_write(self, data: dict):
        import aiofiles
        async with aiofiles.open(OPENCLAW_CONFIG, 'w') as f:
            await f.write(json.dumps(data, indent=2, ensure_ascii=False))
        self.cache.invalidate("config")
        await self._run("gateway", "reload", json_output=False, timeout=10)

    async def gateway_restart(self):
        self.cache.invalidate()
        return await self._run("gateway", "restart", json_output=False, timeout=15)

    async def logs_stream(self):
        proc = await asyncio.create_subprocess_exec(
            OPENCLAW_BIN, "logs", "--follow", "--json",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ, "NO_COLOR": "1"}
        )
        return proc


gateway = GatewayCLI()
