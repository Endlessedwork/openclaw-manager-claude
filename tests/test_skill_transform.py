"""Unit tests for skill transform helpers (_normalize_source, _transform_skill)."""

import sys
from pathlib import Path

# Allow importing from backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from server import _normalize_source, _transform_skill


# ── _normalize_source ───────────────────────────────────────────────

class TestNormalizeSource:
    def test_bundled(self):
        assert _normalize_source("bundled") == "bundled"

    def test_bundled_with_prefix(self):
        assert _normalize_source("/usr/lib/openclaw/bundled/skills") == "bundled"

    def test_workspace(self):
        assert _normalize_source("workspace") == "workspace"

    def test_workspace_path(self):
        assert _normalize_source("/home/user/.openclaw/workspace/skills/my-skill") == "workspace"

    def test_personal(self):
        assert _normalize_source("personal") == "managed"

    def test_managed(self):
        assert _normalize_source("managed") == "managed"

    def test_agents_skills(self):
        assert _normalize_source("/home/user/.openclaw/agents-skills/foo") == "managed"

    def test_unknown_empty(self):
        assert _normalize_source("") == "unknown"

    def test_unknown_random(self):
        assert _normalize_source("some-other-source") == "unknown"

    def test_case_insensitive_bundled(self):
        """Source strings may have mixed case in paths."""
        assert _normalize_source("Bundled") == "bundled"

    def test_case_insensitive_workspace(self):
        assert _normalize_source("WORKSPACE") == "workspace"


# ── _transform_skill ───────────────────────────────────────────────

class TestTransformSkill:
    def test_basic_eligible_skill(self):
        raw = {
            "name": "web-search",
            "description": "Search the web",
            "emoji": "🔍",
            "eligible": True,
            "disabled": False,
            "source": "bundled",
            "missing": {"bins": [], "env": [], "os": []},
        }
        result = _transform_skill(raw)
        assert result == {
            "id": "web-search",
            "name": "web-search",
            "description": "Search the web",
            "emoji": "🔍",
            "eligible": True,
            "disabled": False,
            "enabled": True,
            "source": "bundled",
            "missing": {"bins": [], "env": [], "os": []},
        }

    def test_disabled_skill(self):
        raw = {
            "name": "browser",
            "description": "Control browser",
            "emoji": "",
            "eligible": True,
            "disabled": True,
            "source": "bundled",
            "missing": {"bins": [], "env": [], "os": []},
        }
        result = _transform_skill(raw)
        assert result["enabled"] is False
        assert result["eligible"] is True
        assert result["disabled"] is True

    def test_ineligible_skill(self):
        raw = {
            "name": "canvas",
            "description": "Drive the node Canvas",
            "emoji": "",
            "eligible": False,
            "disabled": False,
            "source": "bundled",
            "missing": {"bins": ["node"], "env": ["CANVAS_KEY"], "os": ["linux"]},
        }
        result = _transform_skill(raw)
        assert result["enabled"] is False
        assert result["eligible"] is False
        assert result["disabled"] is False
        assert result["missing"] == {
            "bins": ["node"],
            "env": ["CANVAS_KEY"],
            "os": ["linux"],
        }

    def test_combines_bins_and_anybins(self):
        raw = {
            "name": "ffmpeg-skill",
            "description": "Video processing",
            "emoji": "",
            "eligible": False,
            "disabled": False,
            "source": "workspace",
            "missing": {
                "bins": ["ffmpeg"],
                "anyBins": ["avconv", "ffmpeg-alt"],
                "env": [],
                "os": [],
            },
        }
        result = _transform_skill(raw)
        assert result["missing"]["bins"] == ["ffmpeg", "avconv", "ffmpeg-alt"]

    def test_anybins_only(self):
        raw = {
            "name": "player",
            "description": "Play audio",
            "emoji": "",
            "eligible": False,
            "disabled": False,
            "source": "bundled",
            "missing": {
                "anyBins": ["mpv", "vlc"],
                "env": [],
                "os": [],
            },
        }
        result = _transform_skill(raw)
        assert result["missing"]["bins"] == ["mpv", "vlc"]

    def test_source_normalized(self):
        raw = {
            "name": "my-skill",
            "description": "",
            "emoji": "",
            "eligible": True,
            "disabled": False,
            "source": "/home/user/.openclaw/agents-skills/my-skill",
            "missing": {},
        }
        result = _transform_skill(raw)
        assert result["source"] == "managed"

    def test_missing_fields_default(self):
        """Minimal raw dict -- all optional fields missing."""
        raw = {"name": "bare-skill"}
        result = _transform_skill(raw)
        assert result["id"] == "bare-skill"
        assert result["name"] == "bare-skill"
        assert result["description"] == ""
        assert result["emoji"] == ""
        assert result["eligible"] is False
        assert result["disabled"] is False
        assert result["enabled"] is False
        assert result["source"] == "unknown"
        assert result["missing"] == {"bins": [], "env": [], "os": []}

    def test_all_required_keys_present(self):
        """Every transformed skill must have exactly these keys."""
        raw = {"name": "x"}
        result = _transform_skill(raw)
        expected_keys = {
            "id", "name", "description", "emoji",
            "eligible", "disabled", "enabled",
            "source", "missing",
        }
        assert set(result.keys()) == expected_keys


# ── _toggle_skill_in_config ──────────────────────────────────────

from server import _toggle_skill_in_config


class TestToggleSkillInConfig:
    """Tests for the pure helper that mutates the config dict."""

    # --- Disable a skill (enabled=False → add disabled entry) ---

    def test_disable_skill_empty_config(self):
        """Disabling a skill in a config with no skills section creates it."""
        config = {}
        result = _toggle_skill_in_config(config, "web-search", False)
        assert result["skills"]["entries"]["web-search"] == {"enabled": False}

    def test_disable_skill_no_entries(self):
        """Disabling when skills section exists but entries is missing."""
        config = {"skills": {}}
        result = _toggle_skill_in_config(config, "browser", False)
        assert result["skills"]["entries"]["browser"] == {"enabled": False}

    def test_disable_skill_existing_entries(self):
        """Disabling adds entry alongside existing disabled skills."""
        config = {"skills": {"entries": {"canvas": {"enabled": False}}}}
        result = _toggle_skill_in_config(config, "browser", False)
        assert result["skills"]["entries"]["browser"] == {"enabled": False}
        assert result["skills"]["entries"]["canvas"] == {"enabled": False}

    def test_disable_already_disabled(self):
        """Disabling an already-disabled skill is idempotent."""
        config = {"skills": {"entries": {"browser": {"enabled": False}}}}
        result = _toggle_skill_in_config(config, "browser", False)
        assert result["skills"]["entries"]["browser"] == {"enabled": False}

    # --- Enable a skill (enabled=True → remove disabled entry) ---

    def test_enable_skill_removes_entry(self):
        """Enabling a skill removes its disabled entry (clean config)."""
        config = {"skills": {"entries": {"browser": {"enabled": False}}}}
        result = _toggle_skill_in_config(config, "browser", True)
        assert "browser" not in result["skills"]["entries"]

    def test_enable_skill_not_in_entries(self):
        """Enabling a skill not in entries is a no-op (already enabled)."""
        config = {"skills": {"entries": {"canvas": {"enabled": False}}}}
        result = _toggle_skill_in_config(config, "browser", True)
        assert "browser" not in result["skills"]["entries"]
        assert result["skills"]["entries"]["canvas"] == {"enabled": False}

    def test_enable_skill_empty_config(self):
        """Enabling on empty config creates sections but no entries."""
        config = {}
        result = _toggle_skill_in_config(config, "web-search", True)
        assert result["skills"]["entries"] == {}

    def test_enable_skill_no_entries(self):
        """Enabling when entries section is missing."""
        config = {"skills": {}}
        result = _toggle_skill_in_config(config, "web-search", True)
        assert result["skills"]["entries"] == {}

    # --- Does not clobber other config keys ---

    def test_preserves_other_config_keys(self):
        """Toggle should not affect other top-level config keys."""
        config = {"agents": {"main": {}}, "channels": {"line": {}}}
        result = _toggle_skill_in_config(config, "browser", False)
        assert result["agents"] == {"main": {}}
        assert result["channels"] == {"line": {}}
        assert result["skills"]["entries"]["browser"] == {"enabled": False}

    def test_preserves_other_skills_keys(self):
        """Toggle should not remove other keys within the skills section."""
        config = {"skills": {"some_other_key": "value", "entries": {}}}
        result = _toggle_skill_in_config(config, "browser", False)
        assert result["skills"]["some_other_key"] == "value"
        assert result["skills"]["entries"]["browser"] == {"enabled": False}

    # --- Returns the same dict (mutates in place) ---

    def test_returns_same_dict(self):
        """The function should mutate and return the same config dict."""
        config = {"skills": {"entries": {}}}
        result = _toggle_skill_in_config(config, "browser", False)
        assert result is config

    # --- Round-trip: disable then enable ---

    def test_round_trip_disable_then_enable(self):
        """Disable then enable should leave config clean."""
        config = {}
        config = _toggle_skill_in_config(config, "browser", False)
        assert "browser" in config["skills"]["entries"]
        config = _toggle_skill_in_config(config, "browser", True)
        assert "browser" not in config["skills"]["entries"]
