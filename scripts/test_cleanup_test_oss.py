import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location("cleanup_test_oss", Path(__file__).with_name("cleanup-test-oss.py"))
cleanup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cleanup)
RUN = "20261017-oss-cleanup-fixture"
PREFIX = cleanup.run_prefix(RUN)


class ProviderError(Exception):
    def __init__(self, status=403):
        super().__init__("SECRET_SENTINEL must never enter receipts")
        self.status = status
        self.code = "AccessDenied" if status == 403 else "NoSuchVersion"


class Bucket:
    def __init__(self, objects=(), fail=(), inject=False):
        self.objects = set(objects)
        self.fail = set(fail)
        self.inject = inject
        self.calls = []
        self.lock = Lock()

    def list_object_versions(self, prefix, **kwargs):
        with self.lock:
            rows = sorted(x for x in self.objects if x[0].startswith(prefix))
        return SimpleNamespace(
            versions=[SimpleNamespace(key=k, versionid=v) for k, v, kind in rows if kind == "version"],
            delete_marker=[SimpleNamespace(key=k, versionid=v) for k, v, kind in rows if kind == "delete_marker"],
            is_truncated=False,
        )

    def delete_object(self, key, params):
        assert params and params.get("versionId")
        with self.lock:
            self.calls.append((key, params["versionId"]))
            if key in self.fail:
                raise ProviderError()
            self.objects = {x for x in self.objects if x[:2] != (key, params["versionId"])}
            if self.inject:
                self.inject = False
                self.objects.add((PREFIX + "images/concurrent.png", "new", "version"))
        return SimpleNamespace(status=204)

    def head_object(self, key, params):
        raise ProviderError(404)


class CleanupTest(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.receipt = Path(self.temp.name) / "receipt.json"
        self.owned = {
            (PREFIX + "audio/a.mp3", "v1", "version"),
            (PREFIX + "audio/a.mp3", "v2", "version"),
            (PREFIX + "audio/a.mp3", "marker", "delete_marker"),
            (PREFIX + "images/b.png", "null", "version"),
        }
        self.protected = {
            ("speech/previews/normal.mp3", "normal", "version"),
            ("avatars/normal.jpg", "normal", "version"),
            (cleanup.ROOT + RUN + "-other/images/c.jpg", "other-run", "version"),
        }

    def test_scope_rejects_traversal_and_partial_run_ids_before_any_io(self):
        for value in ["", "a", "..", "../normal", "x/../../", "/speech/", "正常测试", "20261017/other"]:
            with self.subTest(value=value), self.assertRaises(cleanup.SafetyError):
                cleanup.cleanup(Bucket(), value, self.receipt, apply=True)
        self.assertFalse(self.receipt.exists())

    def test_dryrun_and_apply_include_history_markers_audio_images_and_preserve_neighbors(self):
        bucket = Bucket(self.owned | self.protected)
        planned = cleanup.cleanup(bucket, RUN, self.receipt)
        self.assertEqual(planned["status"], "planned")
        self.assertEqual(len(planned["planned"]), 4)
        self.assertEqual(bucket.calls, [])
        result = cleanup.cleanup(bucket, RUN, self.receipt, apply=True)
        self.assertEqual(result["status"], "clean")
        self.assertEqual(result["remaining"], [])
        self.assertEqual(bucket.objects, self.protected)
        self.assertEqual(set(bucket.calls), {(k, v) for k, v, kind in self.owned})
        self.assertEqual(json.loads(self.receipt.read_text()), result)
        self.assertEqual(self.receipt.stat().st_mode & 0o777, 0o600)
        again = cleanup.cleanup(bucket, RUN, self.receipt, apply=True)
        self.assertEqual(again["status"], "clean")
        self.assertEqual(again["planned"], [])

    def test_all_pages_are_validated_before_deleting(self):
        bucket = Bucket()
        pages = [
            SimpleNamespace(versions=[SimpleNamespace(key=PREFIX + "audio/ok.mp3", versionid="v1")], delete_marker=[], is_truncated=True, next_key_marker="next", next_versionid_marker="v1"),
            SimpleNamespace(versions=[SimpleNamespace(key="speech/previews/normal.mp3", versionid="v2")], delete_marker=[], is_truncated=False),
        ]
        seen = []
        def listing(**kwargs):
            seen.append((kwargs["key_marker"], kwargs["versionid_marker"]))
            return pages.pop(0)
        bucket.list_object_versions = listing
        result = cleanup.cleanup(bucket, RUN, self.receipt, apply=True)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(seen, [("", ""), ("next", "v1")])
        self.assertEqual(bucket.calls, [])

    def test_missing_version_and_stuck_pagination_never_delete(self):
        for version, truncated in [("", False), ("v1", True)]:
            with self.subTest(version=version):
                bucket = Bucket()
                bucket.list_object_versions = lambda **kwargs: SimpleNamespace(versions=[SimpleNamespace(key=PREFIX + "audio/a.mp3", versionid=version)], delete_marker=[], is_truncated=truncated, next_key_marker="same", next_versionid_marker="same")
                result = cleanup.cleanup(bucket, RUN, self.receipt, apply=True)
                self.assertEqual(result["status"], "failed")
                self.assertEqual(bucket.calls, [])

    def test_valid_pagination_preserves_versions_and_markers(self):
        bucket = Bucket()
        pages = [
            SimpleNamespace(versions=[SimpleNamespace(key=PREFIX + "audio/a.mp3", versionid="old")], delete_marker=[], is_truncated=True, next_key_marker="next", next_versionid_marker="old"),
            SimpleNamespace(versions=[], delete_marker=[SimpleNamespace(key=PREFIX + "audio/a.mp3", versionid="marker")], is_truncated=False),
        ]
        bucket.list_object_versions = lambda **kwargs: pages.pop(0)
        self.assertEqual(cleanup.inventory(bucket, PREFIX), [
            {"key": PREFIX + "audio/a.mp3", "version_id": "old", "kind": "version"},
            {"key": PREFIX + "audio/a.mp3", "version_id": "marker", "kind": "delete_marker"},
        ])

    def test_denied_deletion_keeps_residuals_and_redacts_provider_messages(self):
        key = PREFIX + "images/b.png"
        bucket = Bucket(self.owned, fail=[key])
        result = cleanup.cleanup(bucket, RUN, self.receipt, apply=True)
        self.assertEqual(result["status"], "incomplete")
        self.assertEqual({x["key"] for x in result["remaining"]}, {key})
        self.assertEqual(result["errors"][0]["http_status"], 403)
        self.assertNotIn("SECRET_SENTINEL", self.receipt.read_text())

    def test_concurrent_write_is_reported_and_not_silently_chased(self):
        bucket = Bucket(self.owned, inject=True)
        result = cleanup.cleanup(bucket, RUN, self.receipt, apply=True)
        self.assertEqual(result["status"], "incomplete")
        self.assertEqual([x["key"] for x in result["remaining"]], [PREFIX + "images/concurrent.png"])
        self.assertNotIn((PREFIX + "images/concurrent.png", "new"), bucket.calls)

    def test_permission_probe_creates_no_object_or_delete_marker(self):
        bucket = Bucket()
        result = cleanup.cleanup(bucket, RUN, self.receipt, probe=True)
        self.assertEqual(result["status"], "permissions_ok")
        self.assertEqual(bucket.objects, set())
        self.assertEqual(len(bucket.calls), 1)
        self.assertEqual(bucket.calls[0][1], "null")
        bucket = Bucket(self.owned)
        self.assertEqual(cleanup.cleanup(bucket, RUN, self.receipt, probe=True)["status"], "failed")
        self.assertEqual(bucket.calls, [])
        bucket = Bucket()
        bucket.head_object = lambda *args, **kwargs: (_ for _ in ()).throw(ProviderError())
        self.assertEqual(cleanup.cleanup(bucket, RUN, self.receipt, probe=True)["status"], "failed")
        self.assertEqual(bucket.calls, [])

    def test_receipt_must_be_writable_before_cloud_mutations(self):
        self.receipt.mkdir()
        bucket = Bucket(self.owned)
        with self.assertRaises(OSError):
            cleanup.cleanup(bucket, RUN, self.receipt, apply=True)
        self.assertEqual(bucket.calls, [])


if __name__ == "__main__":
    unittest.main()
