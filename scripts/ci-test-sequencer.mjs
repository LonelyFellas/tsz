import { isAbsolute, relative, resolve, sep } from "node:path";
import { BaseSequencer } from "vitest/node";
import profile from "./ci-test-durations.json" with { type: "json" };
import { balanceTestFiles } from "./ci-test-sharding.mjs";

export default class CiTestSequencer extends BaseSequencer {
  async shard(files) {
    if (files.some((file) => file.project.name !== "admin")) {
      return super.shard(files);
    }
    const root = this.ctx.config.root;
    const { index, count } = this.ctx.config.shard;
    if (!Number.isSafeInteger(index) || index < 1 || index > count) {
      throw new Error("invalid CI shard index");
    }
    const byPath = new Map();
    for (const file of files) {
      const path = relative(root, resolve(root, file.moduleId));
      if (
        !path ||
        isAbsolute(path) ||
        path === ".." ||
        path.startsWith(`..${sep}`)
      ) {
        throw new Error("test module is outside the repository");
      }
      const key = path.split(sep).join("/");
      if (byPath.has(key)) throw new Error("duplicate test module");
      byPath.set(key, file);
    }
    return balanceTestFiles([...byPath.keys()], count, profile.files)[
      index - 1
    ].map((path) => byPath.get(path));
  }
}
