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
    def __init__(self, port: int, data: Path, out: Path, appdata: Path, trash: Path):
        self.port, self.data, self.out, self.appdata, self.trash = port, data, out, appdata, trash

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
    trash = tmp_path_factory.mktemp("api-trash")  # stands in for the Recycle Bin, so tests never touch the real one
    port = _free_port()
    env = dict(os.environ, FOLDREEL_DATA=str(data), FOLDREEL_PORT=str(port), APPDATA=str(appdata),
               FOLDREEL_TOKEN=TOKEN, FOLDREEL_DEFAULT_OUTPUT=str(out), FOLDREEL_TRASH_DIR=str(trash))
    if REPO_BIN.is_dir():
        env["FOLDREEL_BUNDLED_BIN"] = str(REPO_BIN)  # the fetched ffmpeg, when present
    env.pop("FOLDREEL_PARENT_PID", None)
    proc = subprocess.Popen([sys.executable, str(BACKEND_DIR / "server.py")], env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    server = Live(port, data, out, appdata, trash)
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


def _out(live) -> Path:
    # Earlier tests (the Grabbr import) move the output folder, so ask the server.
    return Path(live.request("GET", "/api/settings")[1]["output_dir"])


def _add_job(live, job_id, files, dest, ok=0, skipped=0):
    c = sqlite3.connect(str(live.data / "foldreel.db"))
    c.execute("INSERT INTO jobs (id, url, status, files_ok, files_skipped, files_json, dest_dir) VALUES (?, ?, 'done', ?, ?, ?, ?)",
              (job_id, "https://example.test/" + job_id, ok, skipped, json.dumps([str(f) for f in files]), str(dest)))
    c.commit(); c.close()


def test_job_files_finds_a_file_whose_recorded_name_differs_from_disk(live):
    folder = _out(live) / "renamed"
    folder.mkdir()
    (folder / "123.video-ab12.mp4").write_bytes(b"x")  # the downloader added a tag before the extension
    _add_job(live, "files-renamed", [folder / "123.mp4"], folder, ok=1)
    status, body = live.request("GET", "/api/jobs/files-renamed/files")
    assert status == 200
    assert [f["name"] for f in body["files"]] == ["123.video-ab12.mp4"]


def test_job_files_counts_only_files_that_exist(live):
    folder = _out(live) / "partial"
    folder.mkdir()
    (folder / "a.jpg").write_bytes(b"x")
    _add_job(live, "files-partial", [folder / "a.jpg", folder / "gone.jpg"], folder, ok=2)
    body = live.request("GET", "/api/jobs/files-partial/files")[1]
    assert body["count"] == 1 and len(body["files"]) == 1


def test_job_files_shows_the_folder_when_everything_was_skipped(live):
    folder = _out(live) / "watched"
    folder.mkdir()
    for name in ("one.jpg", "two.mp4"):
        (folder / name).write_bytes(b"x")
    _add_job(live, "files-skipped", [], folder, ok=0, skipped=2)
    names = {f["name"] for f in live.request("GET", "/api/jobs/files-skipped/files")[1]["files"]}
    assert names == {"one.jpg", "two.mp4"}


def test_job_files_never_scans_the_shared_output_root(live):
    (_out(live) / "stray.jpg").write_bytes(b"x")
    _add_job(live, "files-root", [], _out(live), ok=0, skipped=3)
    assert live.request("GET", "/api/jobs/files-root/files")[1]["files"] == []

def _lib_tree(live, base):
    root = _out(live) / base
    for rel in ("a/one.jpg", "a/two.png", "b/clip.mp4", "top.webp", "a/deep/three.jpg"):
        f = root / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(b"x" * (len(rel) * 10))
    (root / "a" / "notes.txt").write_text("not media")
    return root


def _lib(live, query):
    status, body = live.request("GET", "/api/library?" + query)
    assert status == 200, body
    return body


def body_names(live, query):
    return [i["name"] for i in _lib(live, query)["items"]]


def _post(live, path, body):
    return live.request("POST", "/api/library/" + path, body)


def test_library_lists_folders_and_the_files_directly_inside(live):
    _lib_tree(live, "lib1")
    body = _lib(live, "folder=lib1&refresh=true")
    assert {f["name"]: f["count"] for f in body["folders"]} == {"a": 3, "b": 1}
    assert [i["name"] for i in body["items"]] == ["top.webp"]
    assert body["counts"] == {"image": 4, "video": 1}, "the chips count the whole subtree"
    assert body["scope_count"] == 5


def test_library_everything_view_searches_filters_and_sorts(live):
    _lib_tree(live, "lib2")
    q = "folder=lib2&view=all&refresh=true"
    assert body_names(live, q + "&sort=name") == ["clip.mp4", "one.jpg", "three.jpg", "top.webp", "two.png"]
    assert body_names(live, q + "&sort=name&order=desc")[0] == "two.png"
    assert body_names(live, q + "&q=thr") == ["three.jpg"]
    assert body_names(live, q + "&kind=video") == ["clip.mp4"]
    assert body_names(live, q + "&sort=size")[0] == "three.jpg", "largest first by default"
    assert body_names(live, "folder=lib2&q=clip") == ["clip.mp4"], "a search looks inside sub-folders too"


def test_library_sorts_names_the_way_a_file_manager_does(live):
    root = _out(live) / "lib-nat"
    root.mkdir()
    for n in ("img10.jpg", "img2.jpg", "img1.jpg"):
        (root / n).write_bytes(b"x")
    assert body_names(live, "folder=lib-nat&sort=name&refresh=true") == ["img1.jpg", "img2.jpg", "img10.jpg"]


def test_library_rejects_a_folder_that_escapes_the_download_folder(live):
    assert live.request("GET", "/api/library?folder=../..")[0] == 400


def test_library_groups_by_creator_and_reports_the_group_sizes(live):
    root = _out(live) / "lib-grp"
    for rel in ("insta/anna/a1.jpg", "insta/anna/a2.jpg", "insta/ben/b1.jpg", "x/ben/b2.jpg"):
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_bytes(b"x")
    # Under the download folder the first level is the site and the second the creator.
    body = _lib(live, "folder=lib-grp&view=all&group=creator&sort=name&refresh=true")
    got = {g["key"]: g["count"] for g in body["groups"]}
    assert sum(got.values()) == 4 and len(got) >= 2
    keys = [i.get("g", "") for i in body["items"]]
    assert keys == sorted(keys, key=lambda k: (k == "", k.lower())), "items arrive grouped, in group order"
    by_site = _lib(live, "folder=lib-grp&view=all&group=site&refresh=true")
    assert sum(g["count"] for g in by_site["groups"]) == 4


def test_library_reads_creator_and_series_from_a_sidecar(live):
    root = _out(live) / "lib-meta"
    root.mkdir()
    (root / "p1.jpg").write_bytes(b"x")
    (root / "p1.jpg.json").write_text(json.dumps({"category": "pixiv", "user": {"name": "Hoshi"}, "title": "Spring set"}))
    item = _lib(live, "folder=lib-meta&view=all&refresh=true")["items"][0]
    assert (item["site"], item["creator"], item["series"]) == ("pixiv", "Hoshi", "Spring set")
    assert body_names(live, "folder=lib-meta&view=all&q=hoshi") == ["p1.jpg"], "search covers creator and series"


def test_library_move_moves_files_renames_collisions_and_follows_history(live):
    root = _lib_tree(live, "lib3")
    (root / "b" / "one.jpg").write_bytes(b"older")           # same name already in the destination
    (root / "a" / "one.jpg.json").write_text("{}")           # metadata sidecar travels with the file
    _add_job(live, "lib3-job", [root / "a" / "one.jpg"], root / "a", ok=1)
    status, body = _post(live, "move", {"paths": [str(root / "a" / "one.jpg")], "dest": "lib3/b"})
    assert status == 200 and body["errors"] == []
    assert (root / "b" / "one.jpg").read_bytes() == b"older", "never overwrite"
    assert (root / "b" / "one (1).jpg").is_file() and not (root / "a" / "one.jpg").exists()
    assert (root / "b" / "one (1).jpg.json").is_file()
    files = live.request("GET", "/api/jobs/lib3-job/files")[1]["files"]
    assert [f["name"] for f in files] == ["one (1).jpg"], "history follows the moved file"
    assert "one (1).jpg" in body_names(live, "folder=lib3/b"), "the index follows too"


def test_library_move_can_create_a_folder_and_stays_inside_the_download_folder(live, tmp_path):
    root = _lib_tree(live, "lib4")
    ok = _post(live, "move", {"paths": [str(root / "top.webp")], "dest": "lib4", "new_folder": 'Best: of?'})[1]
    assert (root / "Best of" / "top.webp").is_file() and ok["errors"] == []
    outside = tmp_path / "elsewhere.jpg"
    outside.write_bytes(b"x")
    bad = _post(live, "move", {"paths": [str(outside)], "dest": "lib4"})[1]
    assert bad["moved"] == [] and len(bad["errors"]) == 1 and outside.exists()
    assert _post(live, "move", {"paths": [], "dest": "../.."})[0] == 400


def test_library_move_takes_a_whole_folder_but_not_into_itself(live):
    root = _lib_tree(live, "lib5")
    ok = _post(live, "move", {"paths": [str(root / "a")], "dest": "lib5/b"})[1]
    assert ok["errors"] == [] and (root / "b" / "a" / "deep" / "three.jpg").is_file()
    assert "three.jpg" in body_names(live, "folder=lib5/b/a&view=all")
    assert not any(f["rel"] == "lib5/a" for f in _lib(live, "folder=lib5")["folders"])
    bad = _post(live, "move", {"paths": [str(root / "b")], "dest": "lib5/b/a"})[1]
    assert bad["moved"] == [] and "inside itself" in bad["errors"][0]


def test_library_copy_leaves_the_original_and_never_overwrites(live):
    root = _lib_tree(live, "lib6")
    r = _post(live, "paste", {"op": "copy", "paths": [str(root / "top.webp")], "dest": "lib6"})[1]
    assert (root / "top.webp").is_file() and (root / "top (1).webp").is_file() and r["errors"] == []
    assert sorted(n for n in body_names(live, "folder=lib6") if n.startswith("top")) == ["top (1).webp", "top.webp"]


def test_library_rename_a_file_with_its_sidecar_and_refuses_clashes(live):
    root = _lib_tree(live, "lib7")
    (root / "a" / "one.jpg.json").write_text("{}")
    assert _post(live, "rename", {"path": str(root / "a" / "one.jpg"), "name": "uno.jpg"})[0] == 200
    assert (root / "a" / "uno.jpg").is_file() and (root / "a" / "uno.jpg.json").is_file()
    names = body_names(live, "folder=lib7/a")
    assert "uno.jpg" in names and "one.jpg" not in names
    assert _post(live, "rename", {"path": str(root / "a" / "uno.jpg"), "name": "two.png"})[0] == 409
    assert _post(live, "rename", {"path": str(root / "a" / "uno.jpg"), "name": "bad/name?.jpg"})[0] == 200
    assert (root / "a" / "badname.jpg").is_file(), "characters Windows forbids are dropped"
    assert _post(live, "rename", {"path": str(root / "a" / "badname.jpg"), "name": "CON"})[0] == 400


def test_library_rename_a_folder_moves_everything_in_it(live):
    root = _lib_tree(live, "lib8")
    _add_job(live, "lib8-job", [root / "a" / "deep" / "three.jpg"], root / "a" / "deep", ok=1)
    live.request("GET", "/api/library?refresh=true")
    _post(live, "favorite", {"paths": [str(root / "a" / "one.jpg")], "value": True})
    assert _post(live, "rename", {"path": str(root / "a"), "name": "album"})[0] == 200
    assert (root / "album" / "deep" / "three.jpg").is_file() and not (root / "a").exists()
    assert "three.jpg" in body_names(live, "folder=lib8/album&view=all")
    files = live.request("GET", "/api/jobs/lib8-job/files")[1]["files"]
    assert [f["name"] for f in files] == ["three.jpg"], "history follows the renamed folder"
    fav = _lib(live, "folder=lib8&view=all&place=favorites")["items"]
    assert [Path(i["path"]) for i in fav] == [root / "album" / "one.jpg"], "favorites follow it too"


def test_library_mkdir_numbers_a_clash(live):
    root = _lib_tree(live, "lib9")
    live.request("GET", "/api/library?refresh=true")
    a = _post(live, "mkdir", {"parent": "lib9"})[1]
    b = _post(live, "mkdir", {"parent": "lib9"})[1]
    assert (a["name"], b["name"]) == ("New folder", "New folder (1)") and (root / "New folder (1)").is_dir()
    assert any(f["name"] == "New folder" for f in _lib(live, "folder=lib9")["folders"]), "empty folders show"
    assert _post(live, "mkdir", {"parent": "../..", "name": "x"})[0] == 400


def test_library_delete_to_the_recycle_bin_and_permanently(live):
    root = _lib_tree(live, "lib10")
    live.request("GET", "/api/library?refresh=true")
    (root / "a" / "one.jpg.json").write_text("{}")
    r = _post(live, "delete", {"paths": [str(root / "a" / "one.jpg")], "mode": "recycle"})[1]
    assert r["errors"] == [] and r["mode"] == "recycle"
    assert not (root / "a" / "one.jpg").exists() and not (root / "a" / "one.jpg.json").exists()
    assert (live.trash / "one.jpg").is_file(), "it went to the bin, not into the void"
    assert "one.jpg" not in body_names(live, "folder=lib10/a")

    r = _post(live, "delete", {"paths": [str(root / "b")], "mode": "permanent"})[1]
    assert r["errors"] == [] and not (root / "b").exists()
    assert not list(live.trash.glob("clip.mp4")), "permanent means it is not in the bin"
    assert not any(f["name"] == "b" for f in _lib(live, "folder=lib10")["folders"])


def test_library_delete_never_leaves_the_download_folder_or_removes_it(live, tmp_path):
    outside = tmp_path / "keep.jpg"
    outside.write_bytes(b"x")
    r = _post(live, "delete", {"paths": [str(outside), str(_out(live))], "mode": "permanent"})[1]
    assert outside.exists() and _out(live).is_dir() and r["deleted"] == [] and len(r["errors"]) == 2


def test_library_favorites_and_tags_filter_follow_a_move_and_list_in_the_tree(live):
    root = _lib_tree(live, "lib11")
    live.request("GET", "/api/library?refresh=true")
    one, two = str(root / "a" / "one.jpg"), str(root / "a" / "two.png")
    _post(live, "favorite", {"paths": [one], "value": True})
    _post(live, "tags", {"paths": [one, two], "add": ["Holiday", "holiday", " beach "]})
    _post(live, "tags", {"paths": [two], "remove": ["BEACH"]})
    assert body_names(live, "folder=lib11&view=all&place=favorites") == ["one.jpg"]
    assert sorted(body_names(live, "folder=lib11&view=all&tag=holiday")) == ["one.jpg", "two.png"]
    assert body_names(live, "folder=lib11&view=all&tag=beach") == ["one.jpg"]
    assert body_names(live, "folder=lib11&view=all&q=holi") != [], "search finds a tag"
    item = next(i for i in _lib(live, "folder=lib11&view=all")["items"] if i["name"] == "one.jpg")
    assert item["fav"] is True and item["tags"] == ["beach", "Holiday"]
    _post(live, "move", {"paths": [one], "dest": "lib11/b"})
    moved = next(i for i in _lib(live, "folder=lib11/b&view=all")["items"] if i["name"] == "one.jpg")
    assert moved["fav"] is True and moved["tags"] == ["beach", "Holiday"], "the file keeps what you told the library about it"
    tree = live.request("GET", "/api/library/tree")[1]
    counts = {t["tag"].lower(): t["count"] for t in tree["tags"]}
    assert counts["holiday"] >= 2 and counts["beach"] >= 1 and tree["favorites"] >= 1
    _post(live, "favorite", {"paths": [str(root / "b" / "one.jpg")], "value": False})
    assert body_names(live, "folder=lib11&view=all&place=favorites") == []


def test_library_notices_changes_made_outside_the_app(live):
    root = _lib_tree(live, "lib12")
    live.request("GET", "/api/library?refresh=true")
    v0 = live.request("GET", "/api/library/status")[1]["version"]
    (root / "new.jpg").write_bytes(b"x")
    assert "new.jpg" in body_names(live, "folder=lib12&refresh=true")
    assert live.request("GET", "/api/library/status")[1]["version"] > v0
    _post(live, "favorite", {"paths": [str(root / "new.jpg")], "value": True})
    (root / "new.jpg").unlink()
    assert "new.jpg" not in body_names(live, "folder=lib12&refresh=true")
    assert _lib(live, "folder=lib12&view=all&place=favorites")["items"] == [], "a vanished file leaves no stale favorite"


def test_library_finds_duplicates_by_content(live):
    root = _out(live) / "lib-dup"
    root.mkdir()
    (root / "a.jpg").write_bytes(b"same" * 100)
    (root / "copy of a.jpg").write_bytes(b"same" * 100)
    (root / "other.jpg").write_bytes(b"diff" * 100)      # same size, different content
    (root / "single.jpg").write_bytes(b"alone")
    live.request("GET", "/api/library?refresh=true")
    groups = live.request("GET", "/api/library/duplicates")[1]["groups"]
    mine = [g for g in groups if {f["name"] for f in g["files"]} == {"a.jpg", "copy of a.jpg"}]
    assert len(mine) == 1 and mine[0]["size"] == 400
    assert not any("other.jpg" in {f["name"] for f in g["files"]} for g in groups)


def test_library_undo_puts_a_moved_file_back(live):
    root = _lib_tree(live, "lib13")
    moved = _post(live, "move", {"paths": [str(root / "top.webp")], "dest": "lib13/b"})[1]["moved"]
    back = _post(live, "relocate", {"items": [{"from": m["to"], "to": m["from"]} for m in moved]})[1]
    assert back["errors"] == [] and (root / "top.webp").is_file() and not (root / "b" / "top.webp").exists()
    assert "top.webp" in body_names(live, "folder=lib13")


def test_library_paths_lists_everything_in_order(live):
    _lib_tree(live, "lib14")
    live.request("GET", "/api/library?refresh=true")
    paths = live.request("GET", "/api/library/paths?folder=lib14&view=all&sort=name")[1]["paths"]
    assert [Path(p).name for p in paths] == ["clip.mp4", "one.jpg", "three.jpg", "top.webp", "two.png"]


def test_library_info_reports_size_and_dimensions(live):
    root = _out(live) / "lib-info"
    root.mkdir()
    _tiny_png(root / "px.png")
    live.request("GET", "/api/library?refresh=true")
    from urllib.parse import quote
    info = live.request("GET", "/api/library/info?path=" + quote(str(root / "px.png")))[1]
    assert (info["width"], info["height"]) == (1, 1) and info["kind"] == "image"
    assert live.request("GET", "/api/library/info?path=" + quote(str(Path(sys.executable))))[0] == 400


def test_delete_mode_is_a_setting_that_only_takes_two_values(live):
    assert live.request("PUT", "/api/settings", {"delete_mode": "permanent"})[1]["delete_mode"] == "permanent"
    assert live.request("PUT", "/api/settings", {"delete_mode": "shred"})[0] == 400
    assert live.request("PUT", "/api/settings", {"delete_mode": "recycle"})[1]["delete_mode"] == "recycle"


# ── extension check-in and one-click linking ─────────────────────────────────
def test_extension_hello_only_answers_a_browser_extension(live):
    hello = {"version": "1.2.3", "paired": False}
    # A web page (or anything without an extension origin) is refused, with or without the app token.
    assert live.request("POST", "/api/extension-hello", hello, token=False)[0] == 403
    assert live.request("POST", "/api/extension-hello", hello, headers={"Origin": "https://evil.example"}, token=False)[0] == 403
    ext = {"Origin": "chrome-extension://abcdefghijklmnop"}
    status, body = live.request("POST", "/api/extension-hello", hello, headers=ext, token=False)
    assert status == 200 and body["linked"] is False and "secret" not in body
    _, s = live.request("GET", "/api/settings")
    assert s["extension_version"] == "1.2.3" and s["extension_seen_at"]


def test_extension_link_window_hands_over_the_code_once(live):
    live.request("DELETE", "/api/extension-pairing")
    ext = {"Origin": "chrome-extension://abcdefghijklmnop"}
    # Closed window: nothing is handed over.
    _, body = live.request("POST", "/api/extension-hello", {"version": "1.2.3"}, headers=ext, token=False)
    assert body["linked"] is False
    assert live.request("POST", "/api/extension-link")[0] == 200
    _, body = live.request("POST", "/api/extension-hello", {"version": "1.2.3"}, headers=ext, token=False)
    assert body["linked"] is True and len(body["secret"]) >= 32
    # The code works on the extension routes, and the window is closed again.
    assert live.request("GET", "/api/extension/ping", headers={"X-Foldreel-Extension-Token": body["secret"]}, token=False)[0] == 200
    _, again = live.request("POST", "/api/extension-hello", {"version": "1.2.3"}, headers=ext, token=False)
    assert again["linked"] is False and "secret" not in again
    live.request("DELETE", "/api/extension-pairing")


def test_extension_link_can_be_cancelled(live):
    live.request("POST", "/api/extension-link")
    assert live.request("DELETE", "/api/extension-link")[0] == 200
    ext = {"Origin": "chrome-extension://abcdefghijklmnop"}
    _, body = live.request("POST", "/api/extension-hello", {"version": "1"}, headers=ext, token=False)
    assert body["linked"] is False


# ── watched creator pictures ─────────────────────────────────────────────────
def test_watch_avatar_endpoint_and_flag(live):
    status, w = live.request("POST", "/api/watches", {"url": "https://example.org/u/someone", "interval_min": 60})
    assert status == 200 and w["has_avatar"] is False
    assert live.request("GET", f"/api/watches/{w['id']}/avatar")[0] == 404
    (live.data / "avatars").mkdir(exist_ok=True)
    (live.data / "avatars" / f"{w['id']}.img").write_bytes(b"\x89PNG\r\n\x1a\n" + b"0" * 32)
    _, listed = live.request("GET", "/api/watches")
    assert [x for x in listed if x["id"] == w["id"]][0]["has_avatar"] is True
    assert live.request("GET", f"/api/watches/{w['id']}/avatar")[0] == 200
    assert live.request("DELETE", f"/api/watches/{w['id']}")[0] == 200
    assert not (live.data / "avatars" / f"{w['id']}.img").exists()


# ── Edit page: probing, previews and exports (needs the bundled ffmpeg) ──────
FFMPEG = next((str(p) for p in (REPO_BIN / "ffmpeg.exe", REPO_BIN / "ffmpeg") if p.exists()), None)
needs_ffmpeg = pytest.mark.skipif(not FFMPEG, reason="bundled ffmpeg not present")


def _make_clip(path: Path, seconds=3, size="320x240", audio=True):
    cmd = [FFMPEG, "-y", "-f", "lavfi", "-i", f"testsrc=size={size}:rate=15:duration={seconds}"]
    if audio:
        cmd += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}", "-c:a", "aac"]
    cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-shortest", str(path)]
    subprocess.run(cmd, check=True, capture_output=True)


def _wait_export(live, job_id, timeout=60):
    end = time.time() + timeout
    while time.time() < end:
        _, j = live.request("GET", f"/api/edit/export/{job_id}")
        if j["status"] != "running":
            return j
        time.sleep(0.3)
    raise AssertionError("export did not finish")


def _q(p):
    from urllib.parse import quote
    return quote(str(p), safe="")


@needs_ffmpeg
def test_edit_probe_and_preview_images(live, tmp_path):
    clip = tmp_path / "clip.mp4"
    _make_clip(clip)
    status, info = live.request("GET", f"/api/edit/info?path={_q(clip)}")
    assert status == 200 and info["kind"] == "video" and info["has_audio"] is True
    assert (info["width"], info["height"]) == (320, 240) and 2.5 < info["duration"] < 3.5
    for url in (f"/api/edit/filmstrip?path={_q(clip)}&count=6&height=40", f"/api/edit/waveform?path={_q(clip)}&width=400&height=40"):
        conn = http.client.HTTPConnection("127.0.0.1", live.port, timeout=30)
        conn.request("GET", url, headers={"X-Foldreel-Token": TOKEN})
        r = conn.getresponse()
        body = r.read()
        conn.close()
        assert r.status == 200 and body[:4] == b"\x89PNG"
    assert live.request("GET", f"/api/edit/info?path={_q(tmp_path / 'nope.mp4')}")[0] == 404
    assert live.request("GET", f"/api/edit/info?path={_q(tmp_path)}")[0] == 404


@needs_ffmpeg
def test_media_endpoint_supports_seeking(live, tmp_path):
    clip = tmp_path / "seek.mp4"
    _make_clip(clip)
    conn = http.client.HTTPConnection("127.0.0.1", live.port, timeout=15)
    conn.request("GET", f"/api/media?path={_q(clip)}", headers={"X-Foldreel-Token": TOKEN, "Range": "bytes=0-99"})
    r = conn.getresponse()
    data = r.read()
    conn.close()
    assert r.status == 206 and len(data) == 100
    assert live.request("GET", f"/api/media?path={_q(tmp_path / 'x.exe')}")[0] == 404


@needs_ffmpeg
def test_edit_export_trims_rotates_and_crops_a_video(live, tmp_path):
    clip = tmp_path / "work.mp4"
    _make_clip(clip, seconds=4)
    ops = {"trim_start": 1.0, "trim_end": 3.0, "rotate": 90, "crop": [0, 0, 1, 0.5], "speed": 1.0, "volume": 0.5, "fade_out": 0.5}
    status, job = live.request("POST", "/api/edit/export", {"path": str(clip), "ops": ops})
    assert status == 200 and job["out_name"] == "work (edited).mp4"
    done = _wait_export(live, job["id"])
    assert done["status"] == "done", done
    _, out = live.request("GET", f"/api/edit/info?path={_q(done['out_path'])}")
    # 320x240 turned a quarter turn is 240x320; the top half of that is 240x160
    assert (out["width"], out["height"]) == (240, 160)
    assert 1.7 < out["duration"] < 2.4 and out["has_audio"] is True
    # a second export does not overwrite the first
    _, again = live.request("POST", "/api/edit/export", {"path": str(clip), "ops": {}})
    assert again["out_name"] == "work (edited 2).mp4"
    _wait_export(live, again["id"])


@needs_ffmpeg
def test_edit_export_speed_mute_and_audio_only(live, tmp_path):
    clip = tmp_path / "fast.mp4"
    _make_clip(clip, seconds=4)
    _, job = live.request("POST", "/api/edit/export", {"path": str(clip), "ops": {"speed": 2.0, "mute": True}})
    done = _wait_export(live, job["id"])
    assert done["status"] == "done", done
    _, out = live.request("GET", f"/api/edit/info?path={_q(done['out_path'])}")
    assert 1.6 < out["duration"] < 2.5 and out["has_audio"] is False
    _, job = live.request("POST", "/api/edit/export", {"path": str(clip), "ops": {"format": "mp3", "trim_start": 1, "trim_end": 3}})
    done = _wait_export(live, job["id"])
    assert done["status"] == "done" and done["out_name"].endswith(".mp3"), done
    _, out = live.request("GET", f"/api/edit/info?path={_q(done['out_path'])}")
    assert out["kind"] == "audio" and 1.7 < out["duration"] < 2.4
    silent = tmp_path / "silent.mp4"
    _make_clip(silent, audio=False)
    assert live.request("POST", "/api/edit/export", {"path": str(silent), "ops": {"format": "mp3"}})[0] == 400


@needs_ffmpeg
def test_edit_export_photo_crop_rotate_flip(live, tmp_path):
    img = tmp_path / "pic.png"
    subprocess.run([FFMPEG, "-y", "-f", "lavfi", "-i", "testsrc=size=400x200:rate=1:duration=1", "-frames:v", "1", str(img)], check=True, capture_output=True)
    ops = {"rotate": 270, "flip_h": True, "crop": [0.25, 0.25, 0.5, 0.5], "brightness": 0.3, "contrast": 0.2, "saturation": -0.5, "format": "jpg"}
    _, job = live.request("POST", "/api/edit/export", {"path": str(img), "ops": ops})
    done = _wait_export(live, job["id"])
    assert done["status"] == "done" and done["out_name"] == "pic (edited).jpg", done
    _, out = live.request("GET", f"/api/edit/info?path={_q(done['out_path'])}")
    # 400x200 turned is 200x400; half of each side is 100x200
    assert out["kind"] == "image" and (out["width"], out["height"]) == (100, 200)
    assert live.request("POST", "/api/edit/export", {"path": str(img), "ops": {"rotate": 45}})[0] == 400
    assert live.request("POST", "/api/edit/export", {"path": str(tmp_path / "missing.png"), "ops": {}})[0] == 404


def test_edit_command_builder_without_ffmpeg():
    sys.path.insert(0, str(BACKEND_DIR))
    import importlib
    os.environ.setdefault("FOLDREEL_DATA", str(Path(os.environ.get("TEMP", "/tmp")) / "foldreel-edit-unit"))
    srv = importlib.import_module("server")
    info = {"kind": "video", "duration": 10.0, "has_audio": True}
    ops = srv.EditOps(trim_start=2, trim_end=6, speed=4.0, fade_in=1, rotate=180)
    cmd, out_len, _temps = srv._edit_command("ffmpeg", Path("a.mp4"), info, ops, Path("b.mp4"), "mp4")
    joined = " ".join(cmd)
    assert out_len == 1.0 and "-ss 2.000 -t 4.000" in joined
    assert "hflip,vflip" in joined and "setpts=PTS/4.0000" in joined
    assert "atempo=2.0,atempo=2.0000" in joined and "afade=t=in:st=0:d=0.500" in joined  # fade is capped to half the result
    assert srv._edit_atempo(0.25) == "atempo=0.5,atempo=0.5000"


def test_library_listing_says_whether_the_folder_exists(live):
    _, top = live.request("GET", "/api/library")
    assert top["folder_exists"] is True
    _, gone = live.request("GET", "/api/library?folder=nothing%2Fhere")
    assert gone["folder_exists"] is False and gone["total"] == 0


@needs_ffmpeg
def test_edit_export_looks_text_fades_size_and_a_saved_frame(live, tmp_path):
    clip = tmp_path / "show.mp4"
    _make_clip(clip, seconds=4, size="640x360")
    base_ops = {"trim_start": 0.5, "trim_end": 3.5}
    # a look, text with a box, picture fades and a size cap together
    ops = dict(base_ops, tone="sepia", brightness=0.1, v_fade_in=0.5, v_fade_out=0.5, height=180,
               texts=[{"text": "Hello: 100% 'test'", "x": 0.5, "y": 0.8, "size": 0.1, "color": "#ffd60a", "box": True}])
    _, job = live.request("POST", "/api/edit/export", {"path": str(clip), "ops": ops})
    done = _wait_export(live, job["id"])
    assert done["status"] == "done", done
    _, out = live.request("GET", f"/api/edit/info?path={_q(done['out_path'])}")
    assert (out["width"], out["height"]) == (320, 180) and 2.5 < out["duration"] < 3.5
    # the text really is drawn: the same export without it is a different file
    _, plain_job = live.request("POST", "/api/edit/export", {"path": str(clip), "ops": dict(ops, texts=[])})
    plain = _wait_export(live, plain_job["id"])
    assert plain["status"] == "done"
    assert Path(done["out_path"]).read_bytes() != Path(plain["out_path"]).read_bytes()
    # the text files used for drawing are cleaned up
    assert not list((live.data / "logs" / "jobs").glob("edit_*.txt"))
    # save one frame of the video as a picture
    _, fjob = live.request("POST", "/api/edit/export", {"path": str(clip), "ops": {"frame_at": 2.0, "format": "png", "rotate": 90, "tone": "bw"}})
    frame = _wait_export(live, fjob["id"])
    assert frame["status"] == "done" and frame["out_name"].endswith(".png"), frame
    _, fo = live.request("GET", f"/api/edit/info?path={_q(frame['out_path'])}")
    assert fo["kind"] == "image" and (fo["width"], fo["height"]) == (360, 640)
    # animated GIF with a size cap
    _, gjob = live.request("POST", "/api/edit/export", {"path": str(clip), "ops": {"format": "gif", "trim_end": 1.5, "height": 120}})
    gif = _wait_export(live, gjob["id"])
    assert gif["status"] == "done" and gif["out_name"].endswith(".gif"), gif
    _, go = live.request("GET", f"/api/edit/info?path={_q(gif['out_path'])}")
    assert go["height"] == 120


def test_edit_new_commands_without_ffmpeg():
    sys.path.insert(0, str(BACKEND_DIR))
    import importlib
    os.environ.setdefault("FOLDREEL_DATA", str(Path(os.environ.get("TEMP", "/tmp")) / "foldreel-edit-unit"))
    srv = importlib.import_module("server")
    info = {"kind": "video", "duration": 10.0, "has_audio": True, "width": 1000, "height": 500}
    ops = srv.EditOps(tone="warm", v_fade_out=1, height=360, rotate=90)
    cmd, out_len, temps = srv._edit_command("ffmpeg", Path("a.mp4"), info, ops, Path("b.mp4"), "mp4")
    joined = " ".join(cmd)
    assert "colorchannelmixer=rr=1.1000" in joined and "fade=t=out:st=9.000:d=1.000" in joined and "min(360,ih)" in joined
    assert out_len == 10.0 and temps == []
    # a frame needs no trim, speed or fades, and is written as a still
    still = srv.EditOps(frame_at=3, format="jpg", speed=2, v_fade_in=1)
    assert srv._edit_out_format("video", still, Path("a.mp4")) == "jpg"
    cmd, out_len, _ = srv._edit_command("ffmpeg", Path("a.mp4"), info, still, Path("b.jpg"), "jpg")
    j = " ".join(cmd)
    assert "-ss 3.000" in j and "-frames:v 1" in j and "setpts" not in j and "fade=" not in j and out_len == 0
    assert srv._edit_out_format("video", srv.EditOps(frame_at=1), Path("a.mp4")) == "png"
    # the TikTok 403 is a block, not a login problem
    assert srv._BLOCKED_BY_SITE.search("[tiktok:user] Unable to download user webpage: HTTP Error 403: Forbidden")
    assert srv._BLOCKED_BY_SITE.search("Unable to extract secondary user ID")
    assert not srv._BLOCKED_BY_SITE.search("login required")


def _watch(live, **opts):
    _, w = live.request("POST", "/api/watches", {"url": f"https://example.org/u/{uuid_hex()}", "interval_min": 60, "options": opts or None})
    return w


def uuid_hex():
    import uuid
    return uuid.uuid4().hex[:8]


def test_watch_destination_folder(live, tmp_path):
    dest = str(tmp_path / "watched here")
    status, w = live.request("POST", "/api/watches", {"url": "https://example.org/u/dest1", "interval_min": 60, "options": {"dest_dir": dest}})
    assert status == 200 and w["options"]["dest_dir"] == dest
    # change it, then go back to the normal folder
    status, w2 = live.request("PATCH", f"/api/watches/{w['id']}", {"dest_dir": str(tmp_path / "other")})
    assert status == 200 and w2["options"]["dest_dir"] == str(tmp_path / "other")
    status, w3 = live.request("PATCH", f"/api/watches/{w['id']}", {"dest_dir": ""})
    assert status == 200 and "dest_dir" not in w3["options"]
    # relative paths are refused
    assert live.request("PATCH", f"/api/watches/{w['id']}", {"dest_dir": "relative/folder"})[0] == 400
    assert live.request("POST", "/api/watches", {"url": "https://example.org/u/dest2", "options": {"dest_dir": "rel"}})[0] == 400
    # interval changes do not touch the folder
    live.request("PATCH", f"/api/watches/{w['id']}", {"dest_dir": dest})
    _, w4 = live.request("PATCH", f"/api/watches/{w['id']}", {"interval_min": 120})
    assert w4["options"]["dest_dir"] == dest and w4["interval_min"] == 120
    live.request("DELETE", f"/api/watches/{w['id']}")


def _add_finished_job(live, status, url):
    con = sqlite3.connect(str(live.data / "foldreel.db"), timeout=20)
    con.execute("INSERT INTO jobs (id, url, status, created_at, finished_at) VALUES (?,?,?,datetime('now'),datetime('now'))",
                (os.urandom(8).hex(), url, status))
    con.commit()
    con.close()


def test_clear_finished_only_clears_the_chosen_status(live):
    live.request("DELETE", "/api/jobs")
    for st in ("done", "done", "error", "canceled"):
        _add_finished_job(live, st, f"https://example.org/{st}")
    count = lambda: {s: len([j for j in live.request("GET", "/api/jobs")[1] if j["status"] == s]) for s in ("done", "error", "canceled")}
    assert count() == {"done": 2, "error": 1, "canceled": 1}
    assert live.request("DELETE", "/api/jobs?status=error")[0] == 200
    assert count() == {"done": 2, "error": 0, "canceled": 1}
    assert live.request("DELETE", "/api/jobs?status=bogus")[0] == 400
    assert live.request("DELETE", "/api/jobs?status=done")[0] == 200
    assert count() == {"done": 0, "error": 0, "canceled": 1}
    assert live.request("DELETE", "/api/jobs")[0] == 200
    assert count() == {"done": 0, "error": 0, "canceled": 0}


def test_tiktok_browser_mode_setting_and_command():
    sys.path.insert(0, str(BACKEND_DIR))
    import importlib
    os.environ.setdefault("FOLDREEL_DATA", str(Path(os.environ.get("TEMP", "/tmp")) / "foldreel-edit-unit"))
    srv = importlib.import_module("server")
    assert srv._is_tiktok_url("https://www.tiktok.com/@someone") and srv._is_tiktok_url("https://vm.tiktok.com/abc/")
    assert not srv._is_tiktok_url("https://nottiktok.com/@x") and not srv._is_tiktok_url("https://example.org/tiktok.com")
    on = {"tiktok_impersonate": 1}
    assert srv._tiktok_impersonate("https://www.tiktok.com/@a", on)
    assert not srv._tiktok_impersonate("https://www.tiktok.com/@a", {"tiktok_impersonate": 0})
    assert not srv._tiktok_impersonate("https://www.instagram.com/a", on)
    argv = srv.build_tiktok_ytdlp_argv("https://www.tiktok.com/@a", {"default_range": "5", "retries": 3, "sleep_request": 1.5}, {}, "out.txt", "D:/dl", True)
    j = " ".join(argv)
    assert "--impersonate chrome" in j and "--playlist-items 1-5" in j and "--download-archive" in j and "--no-playlist" not in j
    assert "-P D:/dl" in j and "tiktok/%(uploader" in j and "--sleep-requests 1.5" in j and "--retries 3" in j
    assert "--download-archive" not in " ".join(srv.build_tiktok_ytdlp_argv("https://www.tiktok.com/@a", {}, {}, "o", "D:/dl", False))


def test_tiktok_browser_mode_is_a_saved_setting(live):
    assert live.request("PUT", "/api/settings", {"tiktok_impersonate": 1})[0] == 200
    assert live.request("GET", "/api/settings")[1]["tiktok_impersonate"] == 1
    assert live.request("PUT", "/api/settings", {"tiktok_impersonate": 0})[0] == 200
    assert live.request("GET", "/api/settings")[1]["tiktok_impersonate"] == 0
