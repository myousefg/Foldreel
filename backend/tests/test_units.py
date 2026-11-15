"""Unit tests for pure(ish) backend logic. Several are regressions for bugs that
shipped and were fixed: each says which."""
from pathlib import Path

import pytest


# ── _normalize_url ───────────────────────────────────────────────────────────
@pytest.mark.parametrize("url,expected", [
    ("https://www.instagram.com/foo/", "https://www.instagram.com/foo"),
    ("https://example.com/a/b", "https://example.com/a/b"),
    ("https://example.com/", "https://example.com/"),
    ("https://example.com", "https://example.com"),
    # A "/" that ends a query string or fragment is not a path slash.
    ("https://example.com/search?next=/foo/", "https://example.com/search?next=/foo/"),
    ("https://example.com/a/#frag/", "https://example.com/a#frag/"),
    ("not a url at all", "not a url at all"),
    ("http://[invalid", "http://[invalid"),
])
def test_normalize_url(server, url, expected):
    assert server._normalize_url(url) == expected


# ── cookie parsing and filenames ─────────────────────────────────────────────
def test_cookie_lines_handles_httponly_and_skips_junk(server):
    text = (
        "# Netscape HTTP Cookie File\n"
        "#HttpOnly_.instagram.com\tTRUE\t/\tTRUE\t1791318293\tsessionid\tabc123\n"
        ".example.com\tTRUE\t/\tFALSE\t0\tfoo\tbar\n"
        "too few columns\n"
        "\n"
    )
    rows = list(server._cookie_lines(text))
    assert [d for d, _ in rows] == ["instagram.com", "example.com"]
    assert rows[0][1].split("\t")[5] == "sessionid"


def test_cookie_lines_accepts_space_separated_columns(server):
    rows = list(server._cookie_lines(".example.com TRUE / FALSE 0 foo bar"))
    assert len(rows) == 1 and rows[0][0] == "example.com"


@pytest.mark.parametrize("hostile", [
    "../../etc/passwd", "..\\..\\windows\\system32", "/abs/path", "a/b/c",
    "....", "", "   ", "con<>:\"|?*", "x" * 500,
])
def test_safe_cookie_name_never_escapes_directory(server, hostile):
    name = server._safe_cookie_name(hostile)
    assert name.endswith(".txt")
    assert Path(name).name == name
    assert "/" not in name and "\\" not in name and ".." not in name
    assert len(name) <= 64


# ── gallery-dl config generation ─────────────────────────────────────────────
def _settings(**over):
    base = {"output_dir": "", "skip_existing": 1, "sleep_request": 0,
            "retries": 4, "cookies_browser": "", "folder_structure": "site_user"}
    base.update(over)
    return base


def test_instagram_sleep_floor_applies_with_no_site_config(server):
    ex = server.build_gdl_config(_settings(), [])["extractor"]
    assert ex["instagram"]["sleep-request"] == 2.0


def test_instagram_sleep_floor_survives_cookie_configured_site(server):
    """Regression: the per-site loop used to replace ex['instagram'] wholesale
    and silently wipe the floor for exactly the logged-in users it protects."""
    sites = [{"site": "instagram", "cookies_mode": "none"}]
    ex = server.build_gdl_config(_settings(), sites)["extractor"]
    assert ex["instagram"]["sleep-request"] == 2.0
    assert ex["instagram"]["cookies"] is None  # the site's own settings kept


def test_user_sleep_above_floor_wins(server):
    ex = server.build_gdl_config(_settings(sleep_request=5), [])["extractor"]
    assert ex["instagram"]["sleep-request"] == 5.0
    assert ex["sleep-request"] == 5.0


def test_other_sites_get_no_forced_sleep(server):
    ex = server.build_gdl_config(_settings(), [])["extractor"]
    assert "sleep-request" not in ex
    assert "twitter" not in ex


def test_skip_existing_off_disables_both_archive_and_skip(server):
    ex = server.build_gdl_config(_settings(skip_existing=0), [])["extractor"]
    assert "archive" not in ex and ex["skip"] is False


# ── job logs ─────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("log_path", ["", None, "C:/definitely/not/here.log"])
def test_job_log_without_a_readable_file_is_empty_not_an_error(server, log_path):
    """Regression: an empty log_path became Path('') == '.', which exists, so
    read_text raised IsADirectoryError (a 500) for queued/imported jobs."""
    job_id = f"test-log-{abs(hash(str(log_path)))}"
    server.db_run("INSERT OR REPLACE INTO jobs (id, url, status, log_path) VALUES (?, 'https://x.example', 'queued', ?)",
                  (job_id, log_path))
    assert server.get_job_log(job_id) == {"log": ""}


def test_job_log_reads_an_existing_file(server, tmp_path):
    log = tmp_path / "j.log"
    log.write_text("hello log", encoding="utf-8")
    server.db_run("INSERT OR REPLACE INTO jobs (id, url, status, log_path) VALUES ('test-log-real', 'https://x.example', 'done', ?)", (str(log),))
    assert server.get_job_log("test-log-real") == {"log": "hello log"}


# ── conversions ──────────────────────────────────────────────────────────────
def test_convert_kind_for(server):
    assert server.convert_kind_for(".png") == "photo"
    assert server.convert_kind_for(".mp4") == "video"
    assert server.convert_kind_for(".exe") is None


# ── components: update check and install safeguards ─────────────────────────
def test_urlopen_retries_with_certifi_when_verification_fails(server, monkeypatch):
    """Regression: TLS verification to api.github.com intermittently failed with
    'unable to get issuer certificate', which silently turned into 'could not check'."""
    import ssl
    import urllib.error
    import urllib.request

    contexts = []

    def fake(req, timeout=None, context=None):
        contexts.append(context)
        if context is None:
            raise urllib.error.URLError(ssl.SSLCertVerificationError("unable to get issuer certificate"))
        return "RESPONSE"

    monkeypatch.setattr(urllib.request, "urlopen", fake)
    assert server._urlopen("req") == "RESPONSE"
    assert contexts[0] is None and contexts[1] is not None


def test_urlopen_does_not_retry_unrelated_errors(server, monkeypatch):
    import urllib.error
    import urllib.request

    calls = []

    def fake(req, timeout=None, context=None):
        calls.append(1)
        raise urllib.error.URLError(ConnectionRefusedError("refused"))

    monkeypatch.setattr(urllib.request, "urlopen", fake)
    with pytest.raises(urllib.error.URLError):
        server._urlopen("req")
    assert len(calls) == 1


@pytest.mark.parametrize("installed,latest,up_to_date", [
    ("1.32.12-dev:2026.09.08", "2026.11.14", False),   # gallery-dl dev build, newer date upstream
    ("1.32.12-dev:2026.11.14", "2026.11.14", True),
    ("2026.08.19", "2026.10.26", False),               # yt-dlp
    ("1.37.0", "1.37.0", True),                        # aria2c
    ("9.0.2", "9.1.0", False),                         # ffmpeg
])
def test_version_comparison(server, installed, latest, up_to_date):
    assert server._ver_ge(installed, latest) is up_to_date


def _stub_bundled(server, monkeypatch, version, latest):
    monkeypatch.setattr(server, "tool_path", lambda name: "C:/x/tool.exe")
    monkeypatch.setattr(server, "tool_is_bundled", lambda name: True)
    monkeypatch.setattr(server, "_run_version", lambda exe: version)
    monkeypatch.setattr(server, "latest_version", lambda name: latest)


def test_bundled_tool_is_only_compared_when_the_user_asks(server, monkeypatch):
    _stub_bundled(server, monkeypatch, "2026.08.19", "2026.10.26")
    assert server.find_tool("yt-dlp")["avail"] == "current"            # no check: nothing to say
    checked = server.find_tool("yt-dlp", check=True)
    assert checked["avail"] == "update" and checked["latest"] == "2026.10.26"


def test_check_says_current_when_up_to_date_and_unknown_when_unreachable(server, monkeypatch):
    _stub_bundled(server, monkeypatch, "2026.10.26", "2026.10.26")
    assert server.find_tool("yt-dlp", check=True)["avail"] == "current"
    _stub_bundled(server, monkeypatch, "2026.10.26", None)             # feed unreachable
    assert server.find_tool("yt-dlp", check=True)["avail"] == "installed"


def test_asset_digest_url_forms(server, monkeypatch):
    import io
    import json as _json

    seen = []

    def fake_urlopen(req, timeout=None):
        seen.append(req.full_url)
        body = _json.dumps({"assets": [{"name": "tool.exe", "digest": "sha256:ABCDEF"}, {"name": "other.zip"}]}).encode()
        return io.BytesIO(body)

    class Ctx(io.BytesIO):
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(server, "_urlopen", lambda req, timeout=None: Ctx(fake_urlopen(req).read()))
    assert server._gh_asset_digest("https://github.com/o/r/releases/latest/download/tool.exe") == "abcdef"
    assert server._gh_asset_digest("https://github.com/o/r/releases/download/v1.2/tool.exe") == "abcdef"
    assert server._gh_asset_digest("https://github.com/o/r/releases/download/v1.2/other.zip") is None   # no digest listed
    assert server._gh_asset_digest("https://example.com/tool.exe") is None                              # not GitHub
    assert seen[0].endswith("/repos/o/r/releases/latest") and seen[1].endswith("/repos/o/r/releases/tags/v1.2")


def test_store_build_refuses_to_download_components(server, monkeypatch):
    import asyncio
    from fastapi import HTTPException
    monkeypatch.setattr(server, "IS_STORE", True)
    with pytest.raises(HTTPException) as err:
        asyncio.run(server.install_tool("yt-dlp"))
    assert err.value.status_code == 403


def test_tools_list_marks_nothing_installable_in_a_store_build(server, monkeypatch):
    monkeypatch.setattr(server, "IS_STORE", True)
    monkeypatch.setattr(server, "find_tool", lambda name, check=False: {"name": name, "avail": "current"})
    out = server.list_tools(check=False)
    assert list(out) == ["gallery-dl", "yt-dlp", "ffmpeg", "aria2c"]
    assert not any(t["can_install"] for t in out.values())


def test_stale_updated_tools_are_removed_after_an_app_upgrade(server, monkeypatch, tmp_path):
    """A copy fetched by an in-app update must not shadow the newer bundled tool
    forever, and a file the user dropped in by hand must never be touched."""
    import json as _json
    exe = server._EXE
    monkeypatch.setattr(server, "TOOLS_DIR", tmp_path)
    monkeypatch.setattr(server, "_MANAGED_FILE", tmp_path / ".managed.json")
    for base in ("yt-dlp", "ffmpeg", "ffprobe", "gallery-dl", "aria2c"):
        (tmp_path / f"{base}{exe}").write_bytes(b"x")
    (tmp_path / ".managed.json").write_text(_json.dumps({
        "yt-dlp": "0.0.1",                  # installed by an older app version -> removed
        "ffmpeg": "0.0.1",                  # a pair: ffmpeg and ffprobe both go
        "aria2c": server.APP_VERSION,       # installed by this version -> kept
    }), encoding="utf-8")                   # gallery-dl is unrecorded (user's own) -> kept

    server._cleanup_stale_managed_tools()

    left = {f.name for f in tmp_path.glob(f"*{exe}")}
    assert left == {f"gallery-dl{exe}", f"aria2c{exe}"}
    assert _json.loads((tmp_path / ".managed.json").read_text(encoding="utf-8")) == {"aria2c": server.APP_VERSION}


# ── thumbnails at several sizes (the Library inspector shows pictures near full width) ──
@pytest.mark.parametrize("asked,bucket", [(64, 320), (320, 320), (321, 640), (1000, 1080), (1600, 1600), (4000, 1600)])
def test_thumb_size_snaps_to_a_bucket(server, asked, bucket):
    assert server._thumb_size(asked) == bucket


def test_image_thumb_honours_size_and_caches_each_rendition(server, tmp_path):
    from PIL import Image
    src = tmp_path / "big.jpg"
    Image.new("RGB", (2400, 1600), (30, 90, 160)).save(src)
    small = server._image_thumb(src)
    large = server._image_thumb(src, 1080)
    assert small and large and small != large
    with Image.open(small) as a, Image.open(large) as b:
        assert max(a.size) == 320
        assert max(b.size) == 1080
        assert b.size[0] / b.size[1] == pytest.approx(1.5, abs=0.01)  # proportions kept
    assert server._image_thumb(src, 1080) == large  # second call is served from the cache
