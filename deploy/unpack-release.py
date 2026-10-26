#!/usr/bin/env python3
"""Extract release data into a new directory without executing archive contents."""

import contextlib
import gzip
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import sys
import tarfile
import tempfile
import zipfile


def extract(kind, archive, destination):
    destination = Path(destination)
    destination.mkdir(mode=0o700)  # Existing destinations must never be overwritten.
    with contextlib.ExitStack() as stack:
        if kind == "tar":
            # Decompress once; preflight and extraction can seek the uncompressed tar.
            raw = stack.enter_context(tempfile.TemporaryFile())
            with gzip.open(archive, "rb") as compressed:
                shutil.copyfileobj(compressed, raw, length=1048576)
            raw.seek(0)
            container = stack.enter_context(tarfile.open(fileobj=raw, mode="r:"))
            entries = [(item.name, "dir" if item.isdir() else "file" if item.isfile() else
                        "link" if item.issym() else "invalid", item.linkname, item)
                       for item in container.getmembers()]
        elif kind == "zip":
            container = stack.enter_context(zipfile.ZipFile(archive))
            entries = [(item.filename, "invalid" if stat.S_ISLNK(item.external_attr >> 16) else
                        "dir" if item.is_dir() else "file", "", item) for item in container.infolist()]
        else:
            raise ValueError("unsupported_archive_format")
        seen = {}
        for name, node, link, item in entries:
            path = PurePosixPath(name)
            if path.is_absolute() or ".." in path.parts or "\\" in name or node == "invalid":
                raise ValueError("unsafe_archive_entry")
            key = path.as_posix()
            if key == "." and node == "dir":
                continue
            if not path.parts or key in seen:
                raise ValueError("duplicate_archive_entry")
            seen[key] = node
            if node == "link":
                target = PurePosixPath(link)
                resolved = os.path.normpath(str(path.parent / target))
                if target.is_absolute() or "\\" in link or resolved == ".." or resolved.startswith("../"):
                    raise ValueError("external_archive_link")
        for name in seen:
            if any(seen.get(parent.as_posix()) in ("link", "file") for parent in PurePosixPath(name).parents):
                raise ValueError("archive_link_ancestor")
        for name, node, link, item in entries:
            target = destination / name
            if node == "dir":
                target.mkdir(parents=True, exist_ok=True)
            elif node == "file":
                target.parent.mkdir(parents=True, exist_ok=True)
                source = container.extractfile(item) if kind == "tar" else container.open(item)
                with source, target.open("xb") as output:
                    shutil.copyfileobj(source, output)
                target.chmod(0o755 if kind == "tar" and item.mode & 0o111 else 0o644)
        for name, node, link, item in entries:
            if node == "link":
                target = destination / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.symlink_to(link)
        for name, node, link, item in entries:
            if node == "link":
                (destination / name).resolve().relative_to(destination.resolve())
        if kind == "tar":
            # Publishable directories must be traversable by nginx workers. Keep the
            # downloaded ZIP bundle and the caller's temporary parent private.
            for directory, _, _ in os.walk(destination, followlinks=False):
                Path(directory).chmod(0o755)


if __name__ == "__main__":
    try:
        extract(*sys.argv[1:])
    except (OSError, ValueError, tarfile.TarError, zipfile.BadZipFile) as error:
        print("release extraction failed: " + type(error).__name__, file=sys.stderr)
        sys.exit(1)
