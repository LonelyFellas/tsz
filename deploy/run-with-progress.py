#!/usr/bin/env python3
"""Bound deployment IO and stop its entire process group before returning."""

import os
from contextlib import ExitStack
import signal
import subprocess
import sys
import time


def stop_group(process):
    def send(sig):
        try:
            os.killpg(process.pid, sig)
            return True
        except ProcessLookupError:
            return False
        except PermissionError as error:
            # Darwin can report EPERM while the session leader is a zombie.
            # Reap our own completed child, then retry once; real permission
            # failures are still raised rather than silently hiding live IO.
            try:
                process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                raise error
            try:
                os.killpg(process.pid, sig)
                return True
            except ProcessLookupError:
                return False

    if send(signal.SIGTERM):
        deadline = time.monotonic() + 1
        while time.monotonic() < deadline:
            process.poll()
            if not send(0):
                break
            time.sleep(0.05)
        send(signal.SIGKILL)
    process.wait()


def forward_log(reader):
    if reader is None:
        return
    # Read a fixed snapshot of a regular file, never wait for pipe EOF. A shared
    # SSH master can retain the remote command's output FD after its client exits.
    remaining = os.fstat(reader.fileno()).st_size - reader.tell()
    while remaining > 0:
        data = reader.read(min(remaining, 65536))
        if not data:
            break
        sys.stdout.buffer.write(data)
        remaining -= len(data)
    sys.stdout.buffer.flush()


def run(seconds, label, arguments, log_path=None):
    with ExitStack() as stack:
        output = reader = None
        if log_path is not None:
            fd = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            output = stack.enter_context(os.fdopen(fd, "wb", buffering=0))
            reader = stack.enter_context(open(log_path, "rb", buffering=0))
        process = subprocess.Popen(
            arguments, start_new_session=True, stdout=output,
            stderr=subprocess.STDOUT if log_path is not None else None,
        )
        started = time.monotonic()
        tick = started + 30
        try:
            while True:
                try:
                    return process.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    forward_log(reader)
                    now = time.monotonic()
                    if now - started >= seconds:
                        print(f"deployment phase {label}: timed out after {seconds}s", file=sys.stderr)
                        return 124
                    if now >= tick:
                        print(f"deployment phase {label}: running {int(now - started)}s", file=sys.stderr, flush=True)
                        tick = now + 30
        finally:
            stop_group(process)
            forward_log(reader)


if __name__ == "__main__":
    def interrupted(signum, frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        args = sys.argv[1:]
        log_path = None
        if args[0] == "--log-file":
            log_path = args[1]
            args = args[2:]
        sys.exit(run(int(args[0]), args[1], args[2:], log_path))
    except KeyboardInterrupt:
        sys.exit(130)
