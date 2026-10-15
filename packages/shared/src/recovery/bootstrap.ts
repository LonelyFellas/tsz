// 必须自包含：序列化后在应用入口模块之前执行，入口 JS/CSS 失败时仍可提示。
export function installResourceRecovery(releaseId: string, prefixes: string[]) {
  const attemptsKey = "tsz:resource-reload";
  const dismissedKey = "tsz:resource-dismissed";
  const stylesId = "tsz-resource-recovery-style";
  const edits = new Map<string, boolean>();
  let touched = false;
  let failed = false;
  let ready = false;
  let pending: Promise<void> | undefined;
  let lastCheck = 0;
  let latest = "";
  const reported = new Set<string>();
  // 一条说明 + 一个主操作的底部浮层：宽屏居中收窄成卡片，窄屏通栏，不遮挡导航。
  // 色值取会话内同一套语义色（--ch-*），应用 CSS 未加载时回退到品牌浅色。
  const bannerCss = `.tsz-recovery{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483647;box-sizing:border-box;display:flex;align-items:center;gap:12px;max-width:520px;margin:0 auto;padding:12px 12px 12px 14px;border:1px solid rgb(var(--ch-border,229 231 235));border-radius:16px;background:rgb(var(--ch-surface,255 255 255));color:rgb(var(--ch-foreground,17 24 39));box-shadow:0 12px 32px rgba(15,23,42,.14),0 2px 8px rgba(15,23,42,.08);font:14px/1.5 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;text-align:left}
.dark .tsz-recovery{background:#18181b;border-color:#3f3f46;color:#f4f4f5;box-shadow:0 16px 40px rgba(0,0,0,.55)}
.tsz-recovery-icon{display:flex;flex:0 0 auto;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9999px;background:rgb(var(--ch-primary-muted,239 246 255));color:rgb(var(--ch-primary,0 113 227))}
.dark .tsz-recovery-icon{background:#17253e;color:#0a84ff}
.tsz-recovery[data-tone="danger"] .tsz-recovery-icon{background:rgba(220,38,38,.1);color:#dc2626}
.dark .tsz-recovery[data-tone="danger"] .tsz-recovery-icon{background:rgba(248,113,113,.18);color:#f87171}
.tsz-recovery-text{flex:1 1 auto;min-width:0}
.tsz-recovery-title{margin:0;font-size:14px;font-weight:600;line-height:20px}
.tsz-recovery-body{margin:2px 0 0;font-size:12px;line-height:18px;color:rgb(var(--ch-foreground-muted,75 85 99))}
.dark .tsz-recovery-body{color:#a1a1aa}
.tsz-recovery-action{flex:0 0 auto;height:40px;padding:0 18px;border:0;border-radius:9999px;background:rgb(var(--ch-primary,0 113 227));color:#fff;font:inherit;font-weight:500;cursor:pointer;-webkit-appearance:none;appearance:none;transition:opacity .15s ease}
.dark .tsz-recovery-action{background:#0a84ff}
.tsz-recovery-action:hover{opacity:.88}
.tsz-recovery-close{display:none;flex:0 0 auto;align-items:center;justify-content:center;width:36px;height:36px;padding:0;border:0;border-radius:9999px;background:transparent;color:rgb(var(--ch-foreground-subtle,156 163 175));cursor:pointer;-webkit-appearance:none;appearance:none}
.tsz-recovery[data-dismissible="true"] .tsz-recovery-close{display:flex}
.tsz-recovery-close:hover{background:rgb(var(--ch-muted,243 244 246));color:rgb(var(--ch-foreground,17 24 39))}
.dark .tsz-recovery-close:hover{background:#27272a;color:#f4f4f5}
.tsz-recovery-action:focus-visible,.tsz-recovery-close:focus-visible{outline:2px solid rgb(var(--ch-primary,0 113 227));outline-offset:2px}
@media (prefers-reduced-motion:no-preference){.tsz-recovery{animation:tsz-recovery-in .24s cubic-bezier(.16,1,.3,1) both}@keyframes tsz-recovery-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}}
@media (max-width:480px){.tsz-recovery{padding:10px 10px 10px 12px;gap:10px}.tsz-recovery-action{height:38px;padding:0 14px}}`;
  const iconArrow =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 12.6V3.4"/><path d="M4.4 7 8 3.4 11.6 7"/></svg>';
  const iconAlert =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.6 14.9 14H1.1L8 2.6Z"/><path d="M8 6.6v3"/><path d="M8 11.9h.01"/></svg>';
  const iconClose =
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
  type Notice = {
    tone: "info" | "danger";
    title: string;
    body: string;
    action: string;
    dismissible: boolean;
    version: string;
  };
  let banner: HTMLDivElement | undefined;
  let layout:
    | {
        icon: HTMLSpanElement;
        title: HTMLParagraphElement;
        body: HTMLParagraphElement;
        action: HTMLButtonElement;
      }
    | undefined;
  let queued: Notice | undefined;
  const dirty = () => touched || [...edits.values()].some(Boolean);
  const reload = () => {
    if (
      dirty() &&
      !window.confirm(
        "可能有未保存的输入。请先保存；刷新后可在原编辑页面恢复已备份内容。仍要刷新吗？"
      )
    )
      return;
    window.location.reload();
  };
  const dismissed = (version: string) => {
    try {
      return sessionStorage.getItem(dismissedKey) === version;
    } catch {
      /* 存储不可用时按未关闭处理，避免漏掉提示。 */
      return false;
    }
  };
  // 「有新版本」只在确有未保存输入时劝阻立即刷新，其余情况一句到底。
  const versionNotice = (): Notice => ({
    tone: "info",
    title: "有新版本可用",
    body: dirty() ? "请先保存当前修改，再刷新更新。" : "刷新即可使用最新内容。",
    action: "刷新更新",
    dismissible: true,
    version: latest || releaseId
  });
  // 资源已失败：页面随时可能不可用，不提供关闭，只留重新加载这条路。
  const failureNotice = (title: string, body: string): Notice => ({
    tone: "danger",
    title,
    body,
    action: "刷新重试",
    dismissible: false,
    version: ""
  });
  const paint = (notice: Notice) => {
    if (!banner || !layout) return;
    banner.setAttribute("data-tone", notice.tone);
    banner.setAttribute(
      "data-dismissible",
      notice.dismissible ? "true" : "false"
    );
    banner.setAttribute("role", notice.tone === "danger" ? "alert" : "status");
    banner.setAttribute(
      "aria-live",
      notice.tone === "danger" ? "assertive" : "polite"
    );
    layout.icon.innerHTML = notice.tone === "danger" ? iconAlert : iconArrow;
    layout.title.textContent = notice.title;
    layout.body.textContent = notice.body;
    layout.action.textContent = notice.action;
    banner.style.display = "";
    if (!banner.isConnected)
      (document.body ?? document.documentElement).append(banner);
  };
  const show = (notice: Notice) => {
    // 用户关掉过这个版本：不再重复打扰，直到下一次发布或页面真的出错。
    if (notice.dismissible && dismissed(notice.version)) return;
    if (!banner) {
      const style = document.createElement("style");
      style.id = stylesId;
      if (!document.getElementById(stylesId)) {
        style.textContent = bannerCss;
        (document.head ?? document.documentElement).append(style);
      }
      banner = document.createElement("div");
      banner.className = "tsz-recovery";
      banner.setAttribute("data-resource-recovery", "");
      banner.style.display = "none";
      const icon = document.createElement("span");
      icon.className = "tsz-recovery-icon";
      const text = document.createElement("div");
      text.className = "tsz-recovery-text";
      const title = document.createElement("p");
      title.className = "tsz-recovery-title";
      const body = document.createElement("p");
      body.className = "tsz-recovery-body";
      text.append(title, body);
      const action = document.createElement("button");
      action.type = "button";
      action.className = "tsz-recovery-action";
      action.onclick = reload;
      const close = document.createElement("button");
      close.type = "button";
      close.className = "tsz-recovery-close";
      close.setAttribute("aria-label", "关闭提示");
      close.innerHTML = iconClose;
      close.onclick = () => {
        try {
          sessionStorage.setItem(dismissedKey, latest || releaseId);
        } catch {
          /* 关不掉时保留提示，用户仍可刷新。 */
        }
        if (banner) banner.style.display = "none";
      };
      banner.append(icon, text, action, close);
      layout = { icon, title, body, action };
      (document.body ?? document.documentElement).append(banner);
      // 插入当拍就带文案的 live region 常被读屏忽略：先空挂，再在下一拍填内容。
      queued = notice;
      window.setTimeout(() => {
        const next = queued;
        queued = undefined;
        if (next) paint(next);
      }, 0);
      return;
    }
    if (queued) {
      queued = notice;
      return;
    }
    paint(notice);
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
          show(versionNotice());
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
            failureNotice(
              "页面资源加载失败",
              "请检查网络后重试；已备份的编辑内容可在原页面恢复。"
            )
          );
      } catch {
        if (failed)
          show(
            failureNotice(
              "暂时无法连接到服务器",
              "请检查网络后重试，并保留未保存的输入。"
            )
          );
      } finally {
        pending = undefined;
      }
    })();
    return pending;
  };
  const resourceFailure = (url = "") => {
    failed = true;
    show(
      failureNotice("页面资源加载失败", "正在检查版本，请保留未保存的输入。")
    );
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
      if (latest && latest !== releaseId) show(versionNotice());
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
