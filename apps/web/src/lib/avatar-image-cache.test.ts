import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import loadConfig from "next/dist/server/config";
import { getNextConfigRuntime } from "next/dist/server/config-shared";
import { PHASE_PRODUCTION_SERVER } from "next/constants";
import {
  ImageError,
  ImageOptimizerCache
} from "next/dist/server/image-optimizer";
import ResponseCache, {
  type CachedRouteKind
} from "next/dist/server/response-cache";
import type { RouteKind } from "next/dist/server/route-kind";
import nextConfig from "../../next.config.mjs";

it("撤销的头像不读取或续存旧缩略图，源站 404 正常返回", async () => {
  const distDir = await mkdtemp(join(tmpdir(), "tsz-avatar-cache-"));
  try {
    const key = "revoked-avatar";
    const cacheDir = join(distDir, "cache", "images");
    const oldDir = join(cacheDir, key);
    await mkdir(oldDir, { recursive: true });
    await writeFile(
      join(oldDir, "300.9999999999999.old.upstream.webp"),
      "previously public avatar"
    );
    const config = await loadConfig(PHASE_PRODUCTION_SERVER, distDir, {
      customConfig: nextConfig,
      silent: true
    });
    const cache = new ImageOptimizerCache({
      distDir,
      nextConfig: getNextConfigRuntime(config)
    });
    expect(await cache.get(key)).toBeNull();
    await cache.set(
      "new-avatar",
      {
        kind: "IMAGE" as CachedRouteKind.IMAGE,
        buffer: Buffer.from("new avatar"),
        etag: "new",
        upstreamEtag: "upstream",
        extension: "webp"
      },
      { cacheControl: { revalidate: 300, expire: undefined } }
    );
    expect(await cache.get("new-avatar")).toBeNull();
    expect(await readdir(cacheDir)).toEqual([key]);

    const responses = new ResponseCache(false);
    await expect(
      responses.get(
        key,
        async () => {
          throw new ImageError(404, "avatar not found");
        },
        {
          routeKind: "IMAGE" as RouteKind.IMAGE,
          incrementalCache: cache,
          isFallback: false
        }
      )
    ).rejects.toMatchObject({ statusCode: 404 });
  } finally {
    await rm(distDir, { recursive: true, force: true });
  }
});
