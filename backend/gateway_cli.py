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
        self._inflight = {}  # key -> asyncio.Task (dedup concurrent fetches)

    async def get(self, key: str, fetcher, ttl_seconds: float, stale_ok: bool = False):
        """Get cached data. If stale_ok=True, return stale data and refresh in background."""
        if key in self._cache:
            entry = self._cache[key]
            age = time.time() - entry["ts"]
            if age < ttl_seconds:
                return entry["data"]
            # Stale: return immediately and refresh in background
            if stale_ok:
                if key not in self._inflight:
                    self._background_refresh(key, fetcher)
                return entry["data"]
        # No cache at all — must wait for fetch
        if key in self._inflight:
            return await self._inflight[key]
        task = asyncio.ensure_future(fetcher())
        self._inflight[key] = task
        try:
            data = await task
            self._cache[key] = {"data": data, "ts": time.time()}
            return data
        finally:
            self._inflight.pop(key, None)

    def _background_refresh(self, key, fetcher):
        """Refresh cache entry in background without blocking."""
        async def _do():
            try:
                data = await fetcher()
                self._cache[key] = {"data": data, "ts": time.time()}
            except Exception:
                pass  # Keep stale data
            finally:
                self._inflight.pop(key, None)
        task = asyncio.ensure_future(_do())
        self._inflight[key] = task

    def invalidate(self, key: str = None):
        if key:
            self._cache.pop(key, None)
        else:
            self._cache.clear()


class GatewayCLI:
    def __init__(self):
        self.cache = CLICache()
        self._sem = asyncio.Semaphore(3)  # Max 3 concurrent CLI processes

    async def _run(self, *args, json_output=True, timeout=30) -> dict | str:
        cmd = [OPENCLAW_BIN] + list(args)
        if json_output:
            cmd.append("--json")
        async with self._sem:
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
                # CLI may emit doctor warnings before JSON — find the
                # last top-level JSON object/array which is the actual data
                last_obj_start = raw.rfind('\n{')
                last_arr_start = raw.rfind('\n[')
                start = max(last_obj_start, last_arr_start)
                if start >= 0:
                    start += 1  # skip the newline
                else:
                    # Maybe JSON is at very beginning
                    if raw.startswith('{') or raw.startswith('['):
                        start = 0
                    else:
                        raise RuntimeError(f"No JSON in CLI output: {raw[:200]}")
                return json.loads(raw[start:])
            return raw

    async def agents(self):
        return await self.cache.get("agents", lambda: self._run("agents", "list"), 60)

    async def sessions(self):
        return await self.cache.get("sessions", lambda: self._run("sessions", "list"), 30)

    async def skills(self):
        return await self.cache.get("skills", lambda: self._run("skills", "list"), 120)

    async def health(self):
        return await self.cache.get("health", lambda: self._run("health"), 30)

    async def cron_jobs(self):
        return await self.cache.get("cron", lambda: self._run("cron", "list"), 60)

    async def models(self):
        return await self.cache.get("models", lambda: self._run("models", "list"), 120)

    async def warmup(self):
        """Pre-populate cache on startup. Dashboard deps first."""
        try:
            # Phase 1: Dashboard dependencies (health has agents+sessions+channels)
            await asyncio.gather(
                self.health(),
                self.skills(),
                self.cron_jobs(),
                self.config_read(),
            )
            # Phase 2: Other pages (lower priority)
            await asyncio.gather(
                self.agents(),
                self.sessions(),
                self.models(),
            )
        except Exception:
            pass  # Non-fatal, cache will fill on demand

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
        await self._run("gateway", "restart", json_output=False, timeout=10)

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
