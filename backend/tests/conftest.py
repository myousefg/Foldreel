"""Test harness.

server.py resolves BASE_DIR, DB_PATH, COOKIES_DIR and friends at import time, so
the env vars below must be set before it is imported. They point the whole
suite at throwaway directories so it can never read or write a real
%APPDATA%\\Foldreel (which holds a user's actual cookies and download history).
"""
import os
import shutil
import sys
import tempfile
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent

_DATA = tempfile.mkdtemp(prefix="foldreel-test-data-")
_OUT = tempfile.mkdtemp(prefix="foldreel-test-out-")
os.environ["FOLDREEL_DATA"] = _DATA
os.environ["FOLDREEL_DEFAULT_OUTPUT"] = _OUT
os.environ.pop("FOLDREEL_TOKEN", None)
sys.path.insert(0, str(BACKEND_DIR))


def pytest_unconfigure(config):
    shutil.rmtree(_DATA, ignore_errors=True)
    shutil.rmtree(_OUT, ignore_errors=True)


@pytest.fixture(scope="session")
def server():
    import server as srv
    srv.init_db()  # tables are normally created at app startup, not on import
    return srv


@pytest.fixture()
def data_dir():
    return Path(_DATA)
