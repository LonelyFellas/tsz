export function ShortcutHint({ shortcut }: { shortcut: string }) {
  const isMac =
    typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
  return (
    <div className="tsz-ve-shortcut-hint">
      {isMac ? "⌘" : "Ctrl"} + {shortcut}
    </div>
  );
}
