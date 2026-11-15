"""Importing a Grabbr data folder. Uses Foldreel's real schema (copied from the
initialised test database) so a column mismatch would actually surface."""
import json
import os
import shutil
import sqlite3
import time
from pathlib import Path

import pytest

import importer
from importer import Dest, ImportFailure

ALL = {k: True for k in importer.INCLUDE_KEYS}


def _clone_schema(server, target: Path) -> None:
    src = sqlite3.connect(str(server.DB_PATH))
    dst = sqlite3.connect(str(target))
    try:
        src.backup(dst)
    finally:
        src.close(); dst.close()
    conn = sqlite3.connect(str(target))
    for (name,) in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
        if not name.startswith("sqlite_"):
            conn.execute(f'DELETE FROM "{name}"')
    conn.commit(); conn.close()


@pytest.fixture()
def world(server, tmp_path):
    """A populated old install ("Grabbr") and an empty new one."""
    old = tmp_path / "Grabbr"; old.mkdir()
    downloads = tmp_path / "downloads"; (downloads / "site").mkdir(parents=True)
    for i in range(3):
        (downloads / "site" / f"f{i}.jpg").write_bytes(b"x")
    (old / "logs" / "jobs").mkdir(parents=True)
    (old / "logs" / "jobs" / "job-done-1.log").write_text("old log text", encoding="utf-8")

    _clone_schema(server, old / "grabbr.db")
    c = sqlite3.connect(str(old / "grabbr.db"))
    c.execute("INSERT INTO settings (id, output_dir, theme, language, retries, extension_secret) "
              "VALUES ('singleton', ?, 'dark', 'fr', 9, 'OLD-SECRET')", (str(downloads),))
    c.execute("UPDATE settings SET presets=?, gdl_overrides=? WHERE id='singleton'",
              (json.dumps([{"name": "a"}, {"name": "b"}]), json.dumps({"extractor": {"x": 1}})))
    for jid, status in [("job-done-1", "done"), ("job-done-2", "done"), ("job-err", "error"),
                        ("job-running", "running"), ("job-queued", "queued")]:
        c.execute("INSERT INTO jobs (id, url, status, log_path) VALUES (?, ?, ?, ?)",
                  (jid, f"https://x.example/{jid}", status, str(old / "logs" / "jobs" / f"{jid}.log")))
    c.execute("INSERT INTO watches (id, url, interval_min, enabled, last_job_id) VALUES ('w1','https://a.example/u',60,1,'job-done-1')")
    c.execute("INSERT INTO watches (id, url, interval_min, enabled) VALUES ('w2','https://b.example/u',180,1)")
    c.execute("INSERT INTO site_auth (site, username, password) VALUES ('danbooru', 'me', 'pw')")
    c.execute("INSERT INTO site_auth (site, username) VALUES ('e621', 'me2')")
    c.commit(); c.close()

    (old / "cookies").mkdir()
    (old / "cookies" / "instagram.com.txt").write_text("# old ig\n", encoding="utf-8")
    (old / "cookies" / "x.com.txt").write_text("# old x\n", encoding="utf-8")
    a = sqlite3.connect(str(old / "archive.sqlite"))
    a.execute("CREATE TABLE archive (entry PRIMARY KEY) WITHOUT ROWID")
    a.executemany("INSERT INTO archive VALUES (?)", [("e1",), ("e2",), ("e3",)])
    a.commit(); a.close()
    (old / "gallery-dl-cache.sqlite3").write_bytes(b"cache")

    new = tmp_path / "Foldreel"; new.mkdir()
    _clone_schema(server, new / "foldreel.db")
    c = sqlite3.connect(str(new / "foldreel.db"))
    c.execute("INSERT INTO settings (id, output_dir, theme, retries, extension_secret) "
              "VALUES ('singleton', 'C:/new/place', 'light', 4, 'NEW-SECRET')")
    c.commit(); c.close()
    dest = Dest(db_path=new / "foldreel.db", archive_path=new / "archive.sqlite",
                cookies_dir=new / "cookies", job_log_dir=new / "logs" / "jobs",
                cache_path=new / "gallery-dl-cache.sqlite3", backup_dir=new / "backups")
    return old, new, dest, downloads


def _rows(db, sql, *p):
    c = sqlite3.connect(str(db)); c.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in c.execute(sql, p).fetchall()]
    finally:
        c.close()


# ── inspect ──────────────────────────────────────────────────────────────────
def test_inspect_reports_what_is_importable(world):
    old, _, _, downloads = world
    info = importer.inspect_source(old)
    assert info["app"] == "Grabbr"
    assert (info["history"], info["unfinished_jobs"]) == (3, 2)
    assert (info["watches"], info["sites"], info["presets"]) == (2, 2, 2)
    assert (info["cookie_files"], info["archive_entries"], info["has_tokens"]) == (2, 3, True)
    assert info["output_dir"] == str(downloads) and info["output_exists"] and info["output_files"] == 3


def test_inspect_rejects_empty_and_own_folder(world, tmp_path):
    old, new, _, _ = world
    with pytest.raises(ImportFailure):
        importer.inspect_source(tmp_path)
    with pytest.raises(ImportFailure):
        importer.inspect_source(old, this_install=old)


def test_candidate_folders_finds_grabbr_and_skips_own(world, tmp_path):
    old, new, _, _ = world
    assert importer.candidate_folders(str(tmp_path)) == [old]
    assert importer.candidate_folders(str(tmp_path), exclude=old) == []


# ── run ──────────────────────────────────────────────────────────────────────
def test_full_import(world):
    old, new, dest, downloads = world
    result = importer.run_import(old, dest, ALL, connect_folder=True)

    assert result["history"] == 3 and result["watches"] == 2 and result["sites"] == 2
    assert result["archive"] == 3 and result["cookies"] == 2 and result["tokens"] == 1

    jobs = {r["id"]: r for r in _rows(dest.db_path, "SELECT id, status, log_path FROM jobs")}
    assert set(jobs) == {"job-done-1", "job-done-2", "job-err"}, "running/queued jobs must not be imported"
    assert Path(jobs["job-done-1"]["log_path"]).read_text(encoding="utf-8") == "old log text"
    assert jobs["job-done-2"]["log_path"] == ""  # no log existed, and no dangling path is left behind

    assert all(w["last_job_id"] == "" for w in _rows(dest.db_path, "SELECT last_job_id FROM watches"))

    s = _rows(dest.db_path, "SELECT * FROM settings")[0]
    assert (s["theme"], s["language"], s["retries"]) == ("dark", "fr", 9)
    assert s["output_dir"] == str(downloads), "the old download folder is reconnected"
    assert len(json.loads(s["presets"])) == 2
    assert s["extension_secret"] == "NEW-SECRET", "the extension pairing must never be imported"

    assert {r["entry"] for r in _rows(dest.archive_path, "SELECT entry FROM archive")} == {"e1", "e2", "e3"}
    assert sorted(p.name for p in dest.cookies_dir.glob("*.txt")) == ["instagram.com.txt", "x.com.txt"]
    assert dest.cache_path.read_bytes() == b"cache"


def test_import_backs_up_the_database_first(world):
    old, new, dest, _ = world
    result = importer.run_import(old, dest, ALL, connect_folder=False)
    backup = Path(result["backup"])
    assert backup.is_file()
    before = _rows(backup, "SELECT output_dir, theme FROM settings")[0]
    assert (before["output_dir"], before["theme"]) == ("C:/new/place", "light")
    assert _rows(backup, "SELECT COUNT(*) AS n FROM jobs")[0]["n"] == 0


def test_connect_folder_off_keeps_existing_download_folder(world):
    old, _, dest, _ = world
    importer.run_import(old, dest, ALL, connect_folder=False)
    assert _rows(dest.db_path, "SELECT output_dir FROM settings")[0]["output_dir"] == "C:/new/place"


def test_import_twice_adds_nothing_the_second_time(world):
    old, _, dest, _ = world
    importer.run_import(old, dest, ALL, connect_folder=True)
    again = importer.run_import(old, dest, ALL, connect_folder=True)
    assert (again["history"], again["watches"], again["sites"], again["archive"]) == (0, 0, 0, 0)
    assert len(_rows(dest.db_path, "SELECT id FROM jobs")) == 3
    assert len(_rows(dest.db_path, "SELECT id FROM watches")) == 2


def test_existing_sites_and_watches_are_kept_not_overwritten(world):
    old, _, dest, _ = world
    c = sqlite3.connect(str(dest.db_path))
    c.execute("INSERT INTO site_auth (site, username) VALUES ('danbooru', 'already-here')")
    c.execute("INSERT INTO watches (id, url, interval_min, enabled) VALUES ('mine', 'https://a.example/u', 5, 1)")
    c.commit(); c.close()
    result = importer.run_import(old, dest, ALL, connect_folder=False)
    assert _rows(dest.db_path, "SELECT username FROM site_auth WHERE site='danbooru'")[0]["username"] == "already-here"
    assert result["sites"] == 1 and result["skipped"]["sites"] == 1
    assert result["watches"] == 1 and result["skipped"]["watches"] == 1


def test_only_selected_categories_are_imported(world):
    old, _, dest, _ = world
    result = importer.run_import(old, dest, {"archive": True}, connect_folder=False)
    assert result["archive"] == 3 and "history" not in result and "watches" not in result
    assert _rows(dest.db_path, "SELECT COUNT(*) AS n FROM jobs")[0]["n"] == 0
    assert _rows(dest.db_path, "SELECT theme FROM settings")[0]["theme"] == "light"


def test_newer_cookie_file_wins_and_older_does_not_overwrite(world):
    old, _, dest, _ = world
    dest.cookies_dir.mkdir(parents=True)
    newer = dest.cookies_dir / "instagram.com.txt"
    newer.write_text("# fresh login", encoding="utf-8")
    os.utime(newer, (time.time() + 100, time.time() + 100))
    importer.run_import(old, dest, {"cookies": True}, connect_folder=False)
    assert newer.read_text(encoding="utf-8") == "# fresh login"
    assert (dest.cookies_dir / "x.com.txt").read_text(encoding="utf-8") == "# old x\n"


def test_source_folder_is_never_modified(world):
    old, _, dest, _ = world
    def snapshot():
        return {p.relative_to(old): (p.stat().st_size, p.stat().st_mtime_ns) for p in old.rglob("*") if p.is_file()}
    before = snapshot()
    importer.run_import(old, dest, ALL, connect_folder=True)
    assert snapshot() == before


def test_reconnect_ignored_when_old_download_folder_is_gone(world):
    old, _, dest, downloads = world
    shutil.rmtree(downloads)
    importer.run_import(old, dest, ALL, connect_folder=True)
    assert _rows(dest.db_path, "SELECT output_dir FROM settings")[0]["output_dir"] == "C:/new/place"
