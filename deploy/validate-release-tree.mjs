import assert from "node:assert/strict";
import { lstat, readdir, readlink, realpath } from "node:fs/promises";
import path from "node:path";

export async function validateReleaseTree(root, relative = "") {
  for (const name of await readdir(path.join(root, relative))) {
    const entry = path.join(relative, name);
    const absolute = path.join(root, entry);
    const info = await lstat(absolute);
    if (info.isDirectory()) await validateReleaseTree(root, entry);
    else if (info.isSymbolicLink()) {
      const link = await readlink(absolute);
      const target = path.relative(
        root,
        path.resolve(path.dirname(absolute), link)
      );
      assert.ok(
        !path.isAbsolute(link) &&
          target !== ".." &&
          !target.startsWith(`..${path.sep}`),
        `external release dependency: ${entry}`
      );
      const resolved = path.relative(
        await realpath(root),
        await realpath(absolute)
      );
      assert.ok(
        resolved !== ".." && !resolved.startsWith(`..${path.sep}`),
        `external release dependency chain: ${entry}`
      );
    } else assert.ok(info.isFile(), `unsupported release entry: ${entry}`);
  }
}
