#!/usr/bin/env python3
"""Bound deployment IO and stop its entire process group before returning."""

import os
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

    if send(signal.SIGTERM):
        deadline = time.monotonic() + 1
        while time.monotonic() < deadline:
            process.poll()
            if not send(0):
                break
            time.sleep(0.05)
        send(signal.SIGKILL)
    process.wait()


def run(seconds, label, arguments):
    process = subprocess.Popen(arguments, start_new_session=True)
    started = time.monotonic()
    tick = started + 30
    try:
        while True:
            try:
                return process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                now = time.monotonic()
                if now - started >= seconds:
                    print(f"deployment phase {label}: timed out after {seconds}s", file=sys.stderr)
                    return 124
                if now >= tick:
                    print(f"deployment phase {label}: running {int(now - started)}s", file=sys.stderr, flush=True)
                    tick = now + 30
    finally:
        stop_group(process)


if __name__ == "__main__":
    def interrupted(signum, frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        sys.exit(run(int(sys.argv[1]), sys.argv[2], sys.argv[3:]))
    except KeyboardInterrupt:
        sys.exit(130)
