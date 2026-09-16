// 必须自包含：序列化后在应用入口模块之前执行，入口 JS/CSS 失败时仍可提示。
export function installResourceRecovery(releaseId: string, prefixes: string[]) {
  const attemptsKey = "tsz:resource-reload";
  const edits = new Map<string, boolean>();
  let touched = false;
  let failed = false;
  let ready = false;
  let pending: Promise<void> | undefined;
  let lastCheck = 0;
  let latest = "";
  const reported = new Set<string>();
  let banner: HTMLDivElement | undefined;
  const dirty = () => touched || [...edits.values()].some(Boolean);
  const show = (message: string) => {
    if (!banner) {
      banner = document.createElement("div");
      banner.setAttribute("role", "alert");
      banner.setAttribute("data-resource-recovery", "");
      banner.style.cssText =
        "position:fixed;bottom:16px;left:16px;right:16px;z-index:2147483647;background:white;color:#222;border:1px solid #bbb;border-radius:12px;padding:16px;font:14px/1.6 system-ui;box-shadow:0 4px 20px #0002";
      const text = document.createElement("span");
      banner.append(text);
      const button = document.createElement("button");
      button.textContent = "刷新重试";
      button.style.cssText = "margin-left:16px;padding:6px 12px;cursor:pointer";
      button.onclick = () => {
        if (
          dirty() &&
          !window.confirm(
            "可能有未保存的输入。请先保存；刷新后可在原编辑页面恢复已备份内容。仍要刷新吗？"
          )
        )
          return;
        window.location.reload();
      };
      banner.append(button);
      (document.body ?? document.documentElement).append(banner);
    }
    if (!banner.isConnected)
      (document.body ?? document.documentElement).append(banner);
    banner.firstChild!.textContent = message;
  };
  const probe = (force = false) => {
    if (pending) return pending;
    if (!force && Date.now() - lastCheck < 30_000) return Promise.resolve();
    lastCheck = Date.now();
    pending = (async () => {
      try {
        const response = await fetch("/version.json", {
          cache: "no-store",
          signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) throw new Error("version unavailable");
        const value = await response.json();
        if (
          typeof value.release_id !== "string" ||
          !/^[a-zA-Z0-9-]{1,100}$/.test(value.release_id)
        )
          throw new Error("invalid version");
        latest = value.release_id;
        if (latest !== releaseId && (ready || failed)) {
          show(
            dirty()
              ? "页面已有新版本，请先保存当前修改再更新。"
              : "页面已有新版本，可刷新更新。"
          );
          // 只在明确没有编辑功能的入口自动恢复；其他页面必须人工选择。
          if (
            failed &&
            !dirty() &&
            ["/", "/login"].includes(location.pathname)
          ) {
            try {
              if (!sessionStorage.getItem(attemptsKey)) {
                sessionStorage.setItem(attemptsKey, "1");
                location.reload();
              }
            } catch {
              /* 存储不可用时保持手动恢复，避免刷新循环。 */
            }
          }
        } else if (failed)
          show(
            "页面资源加载失败，请检查网络后重试。已备份的编辑内容可在原页面恢复。"
          );
      } catch {
        if (failed)
          show("页面资源暂时无法加载，请检查网络后重试。请保留未保存的输入。");
      } finally {
        pending = undefined;
      }
    })();
    return pending;
  };
  const resourceFailure = (url = "") => {
    failed = true;
    show("页面资源加载失败，正在检查版本。请保留未保存的输入。");
    // 只发送静态资源路径，不发送查询、表单、凭据或原始错误内容。
    let asset = "";
    try {
      const parsed = new URL(url, location.href);
      if (
        parsed.origin === location.origin &&
        prefixes.some((prefix) => parsed.pathname.startsWith(prefix))
      )
        asset = parsed.pathname.slice(0, 300);
    } catch {
      /* 无可识别 URL 的动态导入错误只报告类型。 */
    }
    if (!reported.has(asset) && reported.size < 10) {
      reported.add(asset);
      void fetch(
        `/client-resource-error?release=${encodeURIComponent(releaseId)}&asset=${encodeURIComponent(asset)}`,
        { method: "POST", keepalive: true }
      ).catch(() => {});
    }
    void probe(true);
  };
  window.addEventListener(
    "error",
    (event) => {
      const target = event.target;
      if (
        target instanceof HTMLScriptElement ||
        (target instanceof HTMLLinkElement &&
          ["stylesheet", "modulepreload"].includes(target.rel))
      ) {
        const url =
          target instanceof HTMLScriptElement ? target.src : target.href;
        try {
          const parsed = new URL(url);
          if (
            parsed.origin === location.origin &&
            prefixes.some((prefix) => parsed.pathname.startsWith(prefix))
          )
            resourceFailure(url);
        } catch {
          /* 不接管其他应用错误。 */
        }
      }
    },
    true
  );
  // 不吞掉拒绝：React Router 仍保留正常错误语义，草稿快照在卸载前持续写入。
  window.addEventListener("vite:preloadError", () => resourceFailure());
  window.addEventListener("tsz:resource-error", () => resourceFailure());
  window.addEventListener("tsz:edit-state", (event) => {
    const detail = (event as CustomEvent<{ id: string; dirty: boolean }>)
      .detail;
    if (detail.dirty) edits.set(detail.id, true);
    else edits.delete(detail.id);
  });
  document.addEventListener(
    "input",
    (event) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      )
        touched = true;
    },
    true
  );
  window.addEventListener(
    "tsz:app-ready",
    () => {
      ready = true;
      if (latest && latest !== releaseId)
        show("页面已有新版本，请先保存当前修改再更新。");
      window.setTimeout(() => {
        if (ready && !failed) {
          try {
            sessionStorage.removeItem(attemptsKey);
          } catch {
            /* 手动恢复仍可用。 */
          }
        }
      }, 60_000);
    },
    { once: true }
  );
  window.addEventListener("beforeunload", (event) => {
    if ([...edits.values()].some(Boolean)) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  window.addEventListener("online", () => {
    if (failed) void probe(true);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void probe();
  });
  void probe();
}

export const resourceRecoveryScript = (releaseId: string, prefixes: string[]) =>
  `(${installResourceRecovery.toString()})(${JSON.stringify(releaseId).replace(/</g, "\\u003c")},${JSON.stringify(prefixes)});`;

export function isResourceError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /Unable to preload CSS|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading (?:CSS )?chunk .+ failed/i.test(
      `${error.name}: ${error.message}`
    )
  );
}
