#!/usr/bin/env python3
"""Consistent daily SQLite snapshot; run as root via the systemd timer."""
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

os.umask(0o077)
folder = Path('/var/backups/typewell/accounts')
folder.mkdir(parents=True, exist_ok=True, mode=0o700)
name = folder / (datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S') + '.sqlite3')
with sqlite3.connect('file:/var/lib/typewell/typewell.sqlite3?mode=ro', uri=True) as source:
    with sqlite3.connect(name) as destination:
        source.backup(destination)
# Retain the newest 30 daily snapshots. No database or backup goes in the web root.
for old in sorted(folder.glob('*.sqlite3'), reverse=True)[30:]:
    old.unlink()
