#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# dependencies = ["oss2==2.19.1"]
# ///
"""Permanently clean one task-owned OSS test run; dry-run unless --apply."""

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sys
import uuid

BUCKET = "tshb-test-assets"
ROOT = "temporary-tests/"


class SafetyError(Exception):
    pass


def run_prefix(run_id):
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{7,79}", run_id):
        raise SafetyError("run-id 须为 8–80 位小写字母、数字、下划线或连字符")
    return ROOT + run_id + "/"


def inventory(bucket, prefix):
    items, seen, markers = [], set(), set()
    key_marker = version_marker = ""
    while True:
        page = bucket.list_object_versions(
            prefix=prefix, key_marker=key_marker,
            versionid_marker=version_marker, max_keys=1000,
        )
        for kind, rows in [("version", page.versions), ("delete_marker", page.delete_marker)]:
            for row in rows:
                if (not row.key.startswith(prefix) or not row.versionid
                        or any(part in (".", "..") for part in row.key.split("/"))):
                    raise SafetyError("OSS 返回越界 key 或缺失版本 ID，未执行删除")
                pair = (row.key, row.versionid)
                if pair not in seen:
                    seen.add(pair)
                    items.append({"key": row.key, "version_id": row.versionid, "kind": kind})
        if not page.is_truncated:
            return items
        marker = (page.next_key_marker, page.next_versionid_marker)
        if not marker[0] or marker in markers:
            raise SafetyError("OSS 分页标记未前进，未执行删除")
        markers.add(marker)
        key_marker, version_marker = marker


def safe_error(error):
    if isinstance(error, SafetyError):
        return {"error": str(error)}
    # SDK exceptions may contain signed headers or provider responses. Never log them.
    return {"error": type(error).__name__, "http_status": getattr(error, "status", None),
            "code": getattr(error, "code", None)}


def write_receipt(path, receipt):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp-" + uuid.uuid4().hex)
    try:
        with temporary.open("x", encoding="utf-8") as output:
            os.chmod(temporary, 0o600)
            json.dump(receipt, output, ensure_ascii=False, indent=2)
            output.write("\n")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def check_permissions(bucket, prefix):
    if inventory(bucket, prefix):
        raise SafetyError("测试批次已有资源，请先恢复或清理，不能当作新批次使用")
    key = prefix + ".permission-probe-" + uuid.uuid4().hex
    # Explicitly address a nonexistent null version: no object or delete marker is created.
    try:
        bucket.head_object(key, params={"versionId": "null"})
    except Exception as error:
        if getattr(error, "status", None) != 404:
            raise
    else:
        raise SafetyError("权限探测 key 意外存在，未执行删除")
    result = bucket.delete_object(key, params={"versionId": "null"})
    if result.status != 204 or inventory(bucket, prefix):
        raise SafetyError("版本删除权限探测未通过或测试批次出现并发写入")


def cleanup(bucket, run_id, receipt_path, apply=False, probe=False):
    prefix = run_prefix(run_id)
    receipt = {"bucket": BUCKET, "run_id": run_id, "prefix": prefix,
               "started_at": datetime.now(timezone.utc).isoformat(),
               "status": "checking", "planned": [], "deleted": [], "errors": []}
    write_receipt(receipt_path, receipt)
    try:
        if probe:
            check_permissions(bucket, prefix)
            receipt.update(status="permissions_ok", remaining=[])
        else:
            receipt["planned"] = inventory(bucket, prefix)
            receipt["status"] = "planned"
            write_receipt(receipt_path, receipt)  # Durable exact scope before any deletion.
            if apply:
                with ThreadPoolExecutor(max_workers=8) as pool:
                    futures = {pool.submit(bucket.delete_object, item["key"],
                               params={"versionId": item["version_id"]}): item
                               for item in receipt["planned"]}
                    for future in as_completed(futures):
                        item = futures[future]
                        try:
                            if future.result().status != 204:
                                raise SafetyError("版本删除未返回 HTTP 204")
                            receipt["deleted"].append(item)
                        except Exception as error:
                            receipt["errors"].append({**item, **safe_error(error)})
                        write_receipt(receipt_path, receipt)
                receipt["remaining"] = inventory(bucket, prefix)  # Independent, complete relist.
                receipt["status"] = "incomplete" if receipt["errors"] or receipt["remaining"] else "clean"
    except Exception as error:
        receipt["errors"].append(safe_error(error))
        receipt["status"] = "failed"
    receipt["finished_at"] = datetime.now(timezone.utc).isoformat()
    write_receipt(receipt_path, receipt)
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", required=True, help="本次测试独占的批次 ID")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="永久删除本批次所有对象版本及删除标记")
    mode.add_argument("--check-permissions", action="store_true", help="创建资源前探测权限，不上传资源")
    parser.add_argument("--receipt", type=Path, help="脱敏 JSON 回执路径")
    args = parser.parse_args()
    try:
        run_prefix(args.run_id)
        if os.environ.get("OSS_BUCKET", BUCKET) != BUCKET:
            raise SafetyError("只允许测试 bucket tshb-test-assets")
        for name in ["OSS_ENDPOINT", "OSS_REGION", "OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET"]:
            if not os.environ.get(name):
                raise SafetyError("缺少环境变量 " + name)
        endpoint = os.environ["OSS_ENDPOINT"]
        if not re.fullmatch(r"https://[a-z0-9.-]+\.aliyuncs\.com", endpoint):
            raise SafetyError("OSS_ENDPOINT 必须为阿里云 HTTPS endpoint，不能包含凭据、路径或查询参数")
        import oss2
        from oss2.credentials import EnvironmentVariableCredentialsProvider
        bucket = oss2.Bucket(oss2.ProviderAuthV4(EnvironmentVariableCredentialsProvider()),
                             endpoint, BUCKET, region=os.environ["OSS_REGION"], connect_timeout=15)
        path = args.receipt or Path("test-results/oss-cleanup") / (args.run_id + ".json")
        receipt = cleanup(bucket, args.run_id, path, apply=args.apply, probe=args.check_permissions)
        print(json.dumps({"run_id": args.run_id, "status": receipt["status"],
                          "planned": len(receipt["planned"]), "deleted": len(receipt["deleted"]),
                          "remaining": len(receipt["remaining"]) if "remaining" in receipt else None,
                          "receipt": str(path)}, ensure_ascii=False))
        return 0 if receipt["status"] in ["planned", "clean", "permissions_ok"] else 1
    except Exception as error:
        print(json.dumps(safe_error(error), ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
