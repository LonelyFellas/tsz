export function ShortcutHint({ shortcut }: { shortcut: string }) {
  const isMac =
    typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
  return (
    <div className="tsz-ve-shortcut-hint">
      {isMac ? "⌘" : "Ctrl"} + {shortcut}
    </div>
  );
}

export function ClipboardShortcutHint({ readOnly }: { readOnly?: boolean }) {
  return (
    <div className="tsz-ve-clipboard-hint">
      <span>复制</span>
      <ShortcutHint shortcut="C" />
      {!readOnly && (
        <>
          <span>粘贴</span>
          <ShortcutHint shortcut="V" />
          <span>剪切</span>
          <ShortcutHint shortcut="X" />
        </>
      )}
    </div>
  );
}
