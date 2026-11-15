"""Integration tests against a real server process.

Starts `python server.py` on a free port with an isolated data dir and talks to
it over plain HTTP, so the middleware stack (Host guard, CORS, token auth,
extension-secret scoping) is exercised exactly as shipped. Standard library
only; no extra test dependencies.
"""
import http.client
import json
import os
import socket
import sqlite3
import struct
import subprocess
import sys
import threading
import time
import zlib
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_BIN = BACKEND_DIR.parent / "bin"
TOKEN = "test-token-abc123"


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Live:
    def __init__(self, port: int, data: Path, out: Path, appdata: Path):
        self.port, self.data, self.out, self.appdata = port, data, out, appdata

    def request(self, method, path, body=None, headers=None, token=True):
        h = {"Content-Type": "application/json"}
        if token:
            h["X-Foldreel-Token"] = TOKEN
        h.update(headers or {})
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=15)
        try:
            conn.request(method, path, json.dumps(body) if body is not None else None, h)
            resp = conn.getresponse()
            raw = resp.read()
            try:
                payload = json.loads(raw) if raw else None
            except ValueError:
                payload = raw
            return resp.status, payload
        finally:
            conn.close()


@pytest.fixture(scope="module")
def live(tmp_path_factory):
    data = tmp_path_factory.mktemp("api-data")
    out = tmp_path_factory.mktemp("api-out")
    appdata = tmp_path_factory.mktemp("api-appdata")  # so import detection never sees a real Grabbr install
    port = _free_port()
    env = dict(os.environ, FOLDREEL_DATA=str(data), FOLDREEL_PORT=str(port), APPDATA=str(appdata),
               FOLDREEL_TOKEN=TOKEN, FOLDREEL_DEFAULT_OUTPUT=str(out))
    if REPO_BIN.is_dir():
        env["FOLDREEL_BUNDLED_BIN"] = str(REPO_BIN)  # the fetched ffmpeg, when present
    env.pop("FOLDREEL_PARENT_PID", None)
    proc = subprocess.Popen([sys.executable, str(BACKEND_DIR / "server.py")], env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    server = Live(port, data, out, appdata)
    try:
        for _ in range(120):
            try:
                status, _ = server.request("GET", "/api/", token=False)
                if status == 200:
                    break
            except OSError:
                pass
            if proc.poll() is not None:
                pytest.fail("backend exited during startup")
            time.sleep(0.25)
        else:
            pytest.fail("backend did not start in time")
        yield server
    finally:
        proc.terminate()
        try:
            proc.wait(10)
        except subprocess.TimeoutExpired:
            proc.kill()


def _tiny_png(path: Path):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    raw = zlib.compress(b"\x00\xff\x00\x00")  # 1x1 red pixel
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", raw) + chunk(b"IEND", b""))


# ── auth, host guard, origin ─────────────────────────────────────────────────
def test_health_is_open_and_reports_version(live):
    status, body = live.request("GET", "/api/", token=False)
    assert status == 200 and body["ok"] is True and body["app"] == "foldreel"


def test_api_requires_token(live):
    assert live.request("GET", "/api/settings", token=False)[0] == 401
    assert live.request("GET", "/api/settings", headers={"X-Foldreel-Token": "wrong"})[0] == 401
    assert live.request("GET", "/api/settings")[0] == 200


def test_token_query_param_works_for_media_tags(live):
    assert live.request("GET", f"/api/settings?token={TOKEN}", token=False)[0] == 200


def test_rejects_non_loopback_host_header(live):
    status, _ = live.request("GET", "/api/", headers={"Host": "evil.example.com"})
    assert status == 403


def test_rejects_foreign_origin_even_with_valid_token(live):
    status, _ = live.request("GET", "/api/settings", headers={"Origin": "http://evil.example"})
    assert status == 403


# ── browser-extension trust boundary ─────────────────────────────────────────
def _pair(live) -> str:
    status, body = live.request("POST", "/api/extension-pairing")
    assert status == 200
    return body["extension_secret"]


COOKIE_TEXT = ("# Netscape HTTP Cookie File\n"
               ".example.com\tTRUE\t/\tTRUE\t1791318293\tsessionid\tabc\n")


def test_extension_routes_reject_without_secret(live):
    _pair(live)
    ext = lambda h: live.request("POST", "/api/extension/cookies",
                                 {"domain": "example.com", "text": COOKIE_TEXT}, headers=h, token=False)
    assert ext({})[0] == 401
    assert ext({"X-Foldreel-Extension-Token": "nope"})[0] == 401


def test_extension_secret_cannot_reach_main_api(live):
    secret = _pair(live)
    status, _ = live.request("GET", "/api/settings", token=False,
                             headers={"X-Foldreel-Extension-Token": secret})
    assert status == 401


def test_extension_cookies_cannot_escape_cookie_folder(live):
    secret = _pair(live)
    status, body = live.request(
        "POST", "/api/extension/cookies",
        {"domain": "../../../escaped", "text": COOKIE_TEXT},
        headers={"X-Foldreel-Extension-Token": secret}, token=False)
    assert status == 200 and body["cookies"] == 1
    cookies_dir = live.data / "cookies"
    assert (cookies_dir / body["file"]).is_file()
    assert not list(live.data.parent.glob("escaped*"))
    assert not list(live.data.glob("escaped*"))


def test_extension_cookies_replace_same_domain_file(live):
    secret = _pair(live)
    send = lambda text: live.request(
        "POST", "/api/extension/cookies", {"domain": "replace.example", "text": text},
        headers={"X-Foldreel-Extension-Token": secret}, token=False)
    one = COOKIE_TEXT.replace("example.com", "replace.example")
    two = one + ".replace.example\tTRUE\t/\tTRUE\t1791318293\tother\tzzz\n"
    first, second = send(one)[1], send(two)[1]
    assert first["cookies"] == 1 and first["replaced"] is False
    assert second["cookies"] == 2 and second["replaced"] is True


def test_extension_cookie_status_reports_existing_file(live):
    secret = _pair(live)
    hdr = {"X-Foldreel-Extension-Token": secret}
    status = lambda d: live.request("GET", f"/api/extension/cookies?domain={d}", headers=hdr, token=False)

    assert status("never-sent.example") == (200, {"exists": False, "file": "never-sent.example.txt"})
    live.request("POST", "/api/extension/cookies",
                 {"domain": "known.example", "text": COOKIE_TEXT.replace("example.com", "known.example")},
                 headers=hdr, token=False)
    code, body = status("known.example")
    assert code == 200 and body["exists"] is True and body["cookies"] == 1 and body["updated_at"]
    # A leading dot and hostile input map to the same sanitized name the POST uses.
    assert status(".known.example")[1]["exists"] is True
    assert status("../../known.example")[1]["file"].count("/") == 0


def test_extension_cookie_status_requires_secret(live):
    _pair(live)
    assert live.request("GET", "/api/extension/cookies?domain=x.example", token=False)[0] == 401


# ── conversions ──────────────────────────────────────────────────────────────
def test_duplicate_items_in_one_batch_get_distinct_outputs(live, tmp_path):
    """Regression: two staged copies of one file shared a dest path, so the
    concurrent conversions clobbered each other's temp file."""
    src = tmp_path / "pic.png"
    _tiny_png(src)
    item = {"path": str(src), "target": "jpg"}
    status, body = live.request("POST", "/api/convert", {"items": [item, item, item]})
    assert status == 200
    dests = [c["dest_path"] for c in body["created"]]
    assert len(set(dests)) == 3
    assert {Path(d).name for d in dests} == {"pic.jpg", "pic (1).jpg", "pic (2).jpg"}


def _find_ffmpeg():
    import shutil
    local = REPO_BIN / "ffmpeg.exe"
    return str(local) if local.is_file() else shutil.which("ffmpeg")


def _wait_conversion(live, conv_id, timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        status, rows = live.request("GET", "/api/convert")
        row = next((r for r in rows if r["id"] == conv_id), None)
        if row and row["status"] in ("done", "error"):
            return row
        time.sleep(0.3)
    pytest.fail("conversion did not finish")


@pytest.fixture(scope="module")
def sample_video(tmp_path_factory):
    ff = _find_ffmpeg()
    if not ff:
        pytest.skip("ffmpeg not available")
    out = tmp_path_factory.mktemp("vid") / "clip.mp4"
    subprocess.run([ff, "-y", "-loglevel", "error", "-f", "lavfi", "-i",
                    "testsrc=duration=2:size=160x120:rate=10", "-pix_fmt", "yuv420p", str(out)], check=True)
    return out


@pytest.mark.parametrize("target,magic", [("jpg", b"\xff\xd8\xff"), ("png", b"\x89PNG"), ("webp", b"RIFF")])
def test_video_converts_to_still_image(live, sample_video, target, magic):
    status, body = live.request("POST", "/api/convert",
                                {"items": [{"path": str(sample_video), "target": target, "start": 1.0}]})
    assert status == 200
    row = _wait_conversion(live, body["created"][0]["id"])
    assert row["status"] == "done", row.get("error_text")
    assert Path(row["dest_path"]).read_bytes().startswith(magic)
    assert not list(sample_video.parent.glob("*.foldreel-tmp*"))


def test_video_frame_past_end_gives_a_clear_error(live, sample_video):
    status, body = live.request("POST", "/api/convert",
                                {"items": [{"path": str(sample_video), "target": "jpg", "start": 999}]})
    row = _wait_conversion(live, body["created"][0]["id"])
    assert row["status"] == "error" and "No frame at that time" in row["error_text"]


def test_photo_still_cannot_target_video_formats(live, tmp_path):
    src = tmp_path / "p.png"
    _tiny_png(src)
    assert live.request("POST", "/api/convert", {"items": [{"path": str(src), "target": "mp4"}]})[0] == 400


def test_convert_rejects_unsupported_input(live, tmp_path):
    bad = tmp_path / "x.exe"
    bad.write_bytes(b"MZ")
    status, _ = live.request("POST", "/api/convert", {"items": [{"path": str(bad), "target": "jpg"}]})
    assert status == 400
    status, _ = live.request("POST", "/api/convert", {"items": [{"path": str(tmp_path / "missing.png"), "target": "jpg"}]})
    assert status == 400


# ── config file integrity under concurrent writers ───────────────────────────
def test_gallery_dl_config_stays_valid_json_under_concurrent_writes(live):
    """Regression for the unlocked CONFIG_PATH write: hammer the routes that
    rewrite gallery-dl.json from several threads, then require a parseable file."""
    errors = []

    def hammer(i):
        try:
            for n in range(15):
                live.request("PUT", "/api/sites/twitter", {"username": f"user{i}-{n}"})
                live.request("PUT", "/api/config/overrides", {"overrides": json.dumps({"extractor": {"x": {"n": n}}})})
        except Exception as e:  # pragma: no cover
            errors.append(e)

    threads = [threading.Thread(target=hammer, args=(i,)) for i in range(6)]
    [t.start() for t in threads]
    [t.join(60) for t in threads]
    assert not errors
    cfg = json.loads((live.data / "gallery-dl.json").read_text(encoding="utf-8"))
    assert "extractor" in cfg


# ── import from Grabbr ───────────────────────────────────────────────────────
@pytest.fixture()
def grabbr_folder(live, tmp_path):
    """A small old install inside this server's (temporary) APPDATA."""
    old = live.appdata / "Grabbr"
    old.mkdir(exist_ok=True)
    src = sqlite3.connect(str(live.data / "foldreel.db"))
    dst = sqlite3.connect(str(old / "grabbr.db"))
    src.backup(dst); src.close(); dst.close()
    c = sqlite3.connect(str(old / "grabbr.db"))
    for (name,) in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
        if not name.startswith("sqlite_"):
            c.execute(f'DELETE FROM "{name}"')
    downloads = tmp_path / "old-downloads"
    downloads.mkdir()
    c.execute("INSERT INTO settings (id, output_dir, theme) VALUES ('singleton', ?, 'dark')", (str(downloads),))
    c.execute("INSERT INTO jobs (id, url, status) VALUES ('imp-1', 'https://old.example/1', 'done')")
    c.execute("INSERT INTO jobs (id, url, status) VALUES ('imp-2', 'https://old.example/2', 'queued')")
    c.commit(); c.close()
    return old


def test_import_endpoints_require_the_token(live):
    for method, path in [("GET", "/api/import/detect"), ("POST", "/api/import/inspect"), ("POST", "/api/import/run")]:
        assert live.request(method, path, {"path": "x"}, token=False)[0] == 401


def test_import_detect_finds_grabbr_in_appdata(live, grabbr_folder):
    status, body = live.request("GET", "/api/import/detect")
    assert status == 200
    sources = body["sources"]
    assert len(sources) == 1 and sources[0]["app"] == "Grabbr"
    assert sources[0]["history"] == 1 and sources[0]["unfinished_jobs"] == 1


def test_import_inspect_rejects_bad_folders(live, tmp_path):
    assert live.request("POST", "/api/import/inspect", {"path": str(tmp_path)})[0] == 400
    assert live.request("POST", "/api/import/inspect", {"path": str(live.data)})[0] == 400  # its own folder


def test_import_run_brings_history_and_reconnects_the_folder(live, grabbr_folder, tmp_path):
    include = {"settings": True, "history": True}
    status, result = live.request("POST", "/api/import/run",
                                  {"path": str(grabbr_folder), "include": include, "connect_folder": True})
    assert status == 200 and result["history"] == 1 and Path(result["backup"]).is_file()

    ids = {j["id"] for j in live.request("GET", "/api/jobs")[1]}
    assert "imp-1" in ids and "imp-2" not in ids, "only finished jobs are history"
    settings = live.request("GET", "/api/settings")[1]
    assert settings["theme"] == "dark"
    assert settings["output_dir"] == str(tmp_path / "old-downloads")
