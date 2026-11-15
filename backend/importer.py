"""Import a previous Grabbr (or another Foldreel) data folder into this one.

Everything here takes explicit paths instead of reading server.py's globals, so
it can be tested against throwaway folders. The source folder is only ever
opened read-only: importing never changes or deletes the old install's data.
"""
from __future__ import annotations

import json
import os
import shutil
import sqlite3
import tempfile
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, List, Optional

SOURCE_DB_NAMES = ("grabbr.db", "foldreel.db")
LEGACY_FOLDER_NAMES = ("Grabbr", "Foldr")

# Preferences that carry over. Deliberately absent: id/updated_at, the browser
# extension pairing (extension_*, a per-install secret), autostart (a Windows
# registry entry belonging to the old app), and output_dir (handled separately,
# because reusing the old download folder is a choice, not a default).
SETTINGS_COPY = (
    "filename_format", "folder_structure", "folder_custom", "default_range",
    "max_concurrent", "rate_limit", "proxy", "sleep_request", "retries",
    "skip_existing", "write_metadata", "default_photo_format", "default_video_format",
    "notifications_enabled", "cookies_mode", "cookies_browser", "cookies_file",
    "theme", "language",
)
PRESET_COPY = ("gdl_overrides", "presets")

# Only finished jobs are history. Queued/running/paused ones would be picked up
# and re-run by this install's queue, which is never what an import should do.
FINISHED_STATUSES = ("done", "error", "cancelled")

INCLUDE_KEYS = ("settings", "presets", "history", "watches", "sites", "cookies", "archive", "tokens")

_MEDIA_EXT = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".avif", ".heic", ".mp4", ".webm",
    ".mkv", ".mov", ".m4v", ".mp3", ".m4a", ".flac", ".wav", ".ogg",
}


@dataclass
class Dest:
    db_path: Path
    archive_path: Path
    cookies_dir: Path
    job_log_dir: Path
    cache_path: Path
    backup_dir: Path


class ImportFailure(Exception):
    """The chosen folder is not something we can import from."""


# ── locating a source ────────────────────────────────────────────────────────
def find_source_db(folder: Path) -> Optional[Path]:
    for name in SOURCE_DB_NAMES:
        candidate = folder / name
        if candidate.is_file():
            return candidate
    return None


def candidate_folders(appdata: str, exclude: Optional[Path] = None) -> List[Path]:
    """Known places an older install keeps its data, minus this install's own."""
    found = []
    for name in LEGACY_FOLDER_NAMES:
        folder = Path(appdata) / name
        if folder.is_dir() and find_source_db(folder) and not _same(folder, exclude):
            found.append(folder)
    return found


def _same(a: Optional[Path], b: Optional[Path]) -> bool:
    if not a or not b:
        return False
    try:
        return a.resolve() == b.resolve()
    except OSError:
        return False


@contextmanager
def _open_copy(db: Path):
    """Open a private copy of `db` (plus its WAL, so recent writes are included).

    Opening the original, even read-only, makes SQLite create -wal/-shm files
    beside it when the database is in WAL mode, which would leave marks in an
    install this import promises not to touch. A copy has no such problem."""
    with tempfile.TemporaryDirectory(prefix="foldreel-import-") as tmp:
        for suffix in ("", "-wal", "-shm"):
            f = db.with_name(db.name + suffix)
            if f.is_file():
                shutil.copyfile(f, Path(tmp) / f.name)
        conn = sqlite3.connect(str(Path(tmp) / db.name))
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()


def _tables(conn: sqlite3.Connection) -> set:
    return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}


def _columns(conn: sqlite3.Connection, table: str) -> List[str]:
    return [r[1] for r in conn.execute(f'PRAGMA table_info("{table}")')]


def _count(conn: sqlite3.Connection, table: str, where: str = "", params: tuple = ()) -> int:
    if table not in _tables(conn):
        return 0
    return conn.execute(f'SELECT COUNT(*) FROM "{table}" {where}', params).fetchone()[0]


def count_media_files(folder: Path, limit: int = 50_000, seconds: float = 1.5) -> tuple:
    """(count, truncated). Bounded on both axes: a download library can be huge
    and this runs while the user waits on a dialog."""
    deadline = time.monotonic() + seconds
    total = 0
    stack = [str(folder)]
    while stack:
        try:
            with os.scandir(stack.pop()) as it:
                for entry in it:
                    if entry.is_dir(follow_symlinks=False):
                        stack.append(entry.path)
                    elif os.path.splitext(entry.name)[1].lower() in _MEDIA_EXT:
                        total += 1
                if total >= limit or time.monotonic() > deadline:
                    return total, True
        except OSError:
            continue
    return total, False


# ── inspect ──────────────────────────────────────────────────────────────────
def inspect_source(folder: Path, *, this_install: Optional[Path] = None) -> dict:
    """What an import from `folder` would bring in. Raises ImportFailure if the
    folder has no recognisable database."""
    if _same(folder, this_install):
        raise ImportFailure("That is this app's own data folder.")
    db = find_source_db(folder)
    if not db:
        raise ImportFailure("No Grabbr or Foldreel data found in that folder.")
    try:
        with _open_copy(db) as conn:
            return _describe(folder, db, conn)
    except sqlite3.Error as e:
        raise ImportFailure(f"Could not read the database: {e}")


def _describe(folder: Path, db: Path, conn: sqlite3.Connection) -> dict:
    marks = ",".join("?" * len(FINISHED_STATUSES))
    out_dir = ""
    if "settings" in _tables(conn):
        row = conn.execute("SELECT * FROM settings LIMIT 1").fetchone()
        out_dir = (dict(row).get("output_dir") or "").strip() if row else ""
    out_exists = bool(out_dir) and Path(out_dir).is_dir()
    files, truncated = count_media_files(Path(out_dir)) if out_exists else (0, False)

    archive_entries = 0
    archive = folder / "archive.sqlite"
    if archive.is_file():
        try:
            with _open_copy(archive) as a:
                archive_entries = _count(a, "archive")
        except sqlite3.Error:
            pass

    presets_n = 0
    if "settings" in _tables(conn) and "presets" in _columns(conn, "settings"):
        try:
            raw = (conn.execute("SELECT presets FROM settings LIMIT 1").fetchone() or ["[]"])[0]
            presets_n = len(json.loads(raw or "[]"))
        except (ValueError, TypeError):
            presets_n = 0

    cookies_dir = folder / "cookies"
    finished = _count(conn, "jobs", f"WHERE status IN ({marks})", FINISHED_STATUSES)
    return {
        "path": str(folder),
        "app": "Grabbr" if db.name == "grabbr.db" else "Foldreel",
        "db": db.name,
        "history": finished,
        "unfinished_jobs": _count(conn, "jobs") - finished,
        "watches": _count(conn, "watches"),
        "sites": _count(conn, "site_auth"),
        "presets": presets_n,
        "cookie_files": len(list(cookies_dir.glob("*.txt"))) if cookies_dir.is_dir() else 0,
        "archive_entries": archive_entries,
        "has_tokens": (folder / "gallery-dl-cache.sqlite3").is_file(),
        "output_dir": out_dir,
        "output_exists": out_exists,
        "output_files": files,
        "output_files_truncated": truncated,
    }


# ── run ──────────────────────────────────────────────────────────────────────
def _backup_db(dest: Dest) -> Optional[Path]:
    if not dest.db_path.is_file():
        return None
    dest.backup_dir.mkdir(parents=True, exist_ok=True)
    target = dest.backup_dir / f"foldreel-before-import-{time.strftime('%Y%m%d-%H%M%S')}.db"
    src = sqlite3.connect(str(dest.db_path))
    bak = sqlite3.connect(str(target))
    try:
        src.backup(bak)  # consistent even while the app has the DB open
    finally:
        bak.close()
        src.close()
    return target


def _insert_rows(dst: sqlite3.Connection, table: str, rows: List[dict], columns: List[str],
                 *, verb: str = "INSERT OR IGNORE") -> int:
    """Insert only the columns both sides have, so a source from an older (or
    newer) schema never fails on a column the other doesn't know about."""
    cols = [c for c in columns if c in _columns(dst, table)]
    if not cols or not rows:
        return 0
    names = ", ".join(f'"{c}"' for c in cols)
    sql = f'{verb} INTO "{table}" ({names}) VALUES ({", ".join("?" * len(cols))})'
    before = dst.total_changes
    for r in rows:
        dst.execute(sql, [r.get(c) for c in cols])
    return dst.total_changes - before


def run_import(folder: Path, dest: Dest, include: Dict[str, bool], *, connect_folder: bool,
               this_install: Optional[Path] = None,
               on_cookies_changed: Optional[Callable[[], None]] = None) -> dict:
    """Performs the import and returns what was added, per category."""
    info = inspect_source(folder, this_install=this_install)  # validates the folder
    want = {k: bool(include.get(k)) for k in INCLUDE_KEYS}
    result: Dict[str, object] = {"backup": None, "skipped": {}}
    result["backup"] = str(_backup_db(dest) or "")

    src_db = find_source_db(folder)
    dst = sqlite3.connect(str(dest.db_path), timeout=10)
    dst.row_factory = sqlite3.Row
    try:
        with _open_copy(src_db) as src:
            _import_db_tables(src, dst, folder, dest, want, info, connect_folder, result)
        dst.commit()
    finally:
        dst.close()

    if want["cookies"]:
        result["cookies"] = _copy_cookies(folder / "cookies", dest.cookies_dir)
        if on_cookies_changed:
            on_cookies_changed()
    if want["archive"]:
        result["archive"] = _merge_archive(folder / "archive.sqlite", dest.archive_path)
    if want["tokens"]:
        result["tokens"] = _merge_tokens(folder / "gallery-dl-cache.sqlite3", dest.cache_path)
    result["connected_folder"] = info["output_dir"] if connect_folder and info["output_exists"] else ""
    return result


def _import_db_tables(src, dst, folder, dest, want, info, connect_folder, result) -> None:
    """The database-backed categories, all in one transaction on `dst`."""
    src_tables = _tables(src)

    # settings (+ the download folder, if the user chose to reconnect it)
    if (want["settings"] or connect_folder or want["presets"]) and "settings" in src_tables:
        row = src.execute("SELECT * FROM settings LIMIT 1").fetchone()
        if row:
            row = dict(row)
            sets = {}
            if want["settings"]:
                sets.update({k: row[k] for k in SETTINGS_COPY if k in row and row[k] is not None})
            if want["presets"]:
                sets.update({k: row[k] for k in PRESET_COPY if k in row and row[k] is not None})
            if connect_folder and info["output_exists"]:
                sets["output_dir"] = info["output_dir"]
            dst_cols = _columns(dst, "settings")
            sets = {k: v for k, v in sets.items() if k in dst_cols}
            if sets:
                assigns = ", ".join(f'"{k}"=?' for k in sets)
                dst.execute(f"UPDATE settings SET {assigns} WHERE id='singleton'", list(sets.values()))
            result["settings"] = len(sets)

    # logins: only sites this install has not configured yet
    if want["sites"] and "site_auth" in src_tables:
        have = {r[0] for r in dst.execute("SELECT site FROM site_auth")}
        rows = [dict(r) for r in src.execute("SELECT * FROM site_auth")]
        fresh = [r for r in rows if r["site"] not in have]
        result["sites"] = _insert_rows(dst, "site_auth", fresh, _columns(src, "site_auth"))
        result["skipped"]["sites"] = len(rows) - len(fresh)

    # watches: skip any URL already being watched here
    if want["watches"] and "watches" in src_tables:
        have_urls = {r[0] for r in dst.execute("SELECT url FROM watches")}
        rows = [dict(r) for r in src.execute("SELECT * FROM watches")]
        fresh = [r for r in rows if r["url"] not in have_urls]
        for r in fresh:
            r["last_job_id"] = ""  # the job it pointed at may not be imported
        result["watches"] = _insert_rows(dst, "watches", fresh, _columns(src, "watches"))
        result["skipped"]["watches"] = len(rows) - len(fresh)

    # history: finished jobs, with their logs brought along
    if want["history"] and "jobs" in src_tables:
        marks = ",".join("?" * len(FINISHED_STATUSES))
        rows = [dict(r) for r in src.execute(f"SELECT * FROM jobs WHERE status IN ({marks})", FINISHED_STATUSES)]
        dest.job_log_dir.mkdir(parents=True, exist_ok=True)
        for r in rows:
            new_log = dest.job_log_dir / f"{r['id']}.log"
            old = [Path(r["log_path"])] if r.get("log_path") else []
            old.append(folder / "logs" / "jobs" / f"{r['id']}.log")
            source_log = next((p for p in old if p.is_file()), None)
            if source_log and not new_log.exists():
                shutil.copyfile(source_log, new_log)
            r["log_path"] = str(new_log) if new_log.is_file() else ""
        result["history"] = _insert_rows(dst, "jobs", rows, _columns(src, "jobs"))
        result["skipped"]["history"] = len(rows) - int(result["history"])


def _copy_cookies(src_dir: Path, dst_dir: Path) -> int:
    """Copy cookie files, keeping whichever copy of a same-named file is newer."""
    if not src_dir.is_dir():
        return 0
    dst_dir.mkdir(parents=True, exist_ok=True)
    copied = 0
    for f in src_dir.glob("*.txt"):
        target = dst_dir / f.name
        if target.exists() and target.stat().st_mtime >= f.stat().st_mtime:
            continue
        shutil.copyfile(f, target)
        copied += 1
    return copied


def _merge_archive(src: Path, dst: Path) -> int:
    """Add the old install's downloaded-file records, so what it already fetched
    is skipped instead of downloaded a second time."""
    if not src.is_file():
        return 0
    conn = sqlite3.connect(str(dst), timeout=10)
    try:
        conn.execute("CREATE TABLE IF NOT EXISTS archive (entry PRIMARY KEY) WITHOUT ROWID")
        before = conn.total_changes
        with _open_copy(src) as old:
            if "archive" in _tables(old):
                cur = old.execute("SELECT entry FROM archive")
                conn.executemany("INSERT OR IGNORE INTO archive VALUES (?)", ((r[0],) for r in cur))
        conn.commit()
        return conn.total_changes - before
    finally:
        conn.close()


def _merge_tokens(src: Path, dst: Path) -> int:
    """gallery-dl's own cache (OAuth tokens, pagination cursors). Copied whole
    when this install has none yet; otherwise left alone, since merging another
    tool's cache row by row is not worth the risk."""
    if not src.is_file() or dst.exists():
        return 0
    shutil.copyfile(src, dst)
    return 1
