import { useTableTranslation } from "@/components/table-i18n";
import { CheckIcon, GripVerticalIcon, SettingsIcon } from "lucide-react";
import { Button, Typography } from "@tsz/ui/admin/display";
import { Checkbox, Segmented } from "@tsz/ui/admin/forms";
import { Popover } from "@tsz/ui/admin/overlays";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { ConfigurableColumn } from "./column-settings";
import "./ColumnSettings.css";

const COLUMN_GROUPS = [
  { fixed: "left", label: "fixed_left", icon: "left" },
  { fixed: false, label: "fixed_none", icon: "none" },
  { fixed: "right", label: "fixed_right", icon: "right" }
] as const;

export function ColumnSettings({
  columns,
  onChange,
  onReset,
  fixedOverflow = false,
  buttonSize = "small",
  open: controlledOpen,
  onOpenChange,
  children
}: {
  columns: ConfigurableColumn[];
  onChange: (columns: ConfigurableColumn[]) => void;
  onReset: () => void;
  fixedOverflow?: boolean;
  buttonSize?: "small" | "middle";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}) {
  const { t } = useTableTranslation();
  const columnGroups = COLUMN_GROUPS.map((group) => ({
    ...group,
    label: t(group.label)
  }));
  const controlId = useId();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (value: boolean) => {
    setInternalOpen(value);
    onOpenChange?.(value);
  };
  const [draggingKey, setDraggingKey] = useState<string>();
  const [dragOverKey, setDragOverKey] = useState<string>();
  const fixedFocusKey = useRef<string | undefined>(undefined);
  const panelRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!fixedFocusKey.current) return;
    const control = [
      ...(panelRef.current?.querySelectorAll("[data-column-key]") ?? [])
    ].find(
      (node) => node.getAttribute("data-column-key") === fixedFocusKey.current
    );
    const input = control?.querySelector<HTMLInputElement>("input:checked");
    if (input) {
      input.focus({ preventScroll: true });
      fixedFocusKey.current = undefined;
    }
  });
  const visibleCount = columns.filter((column) => column.visible).length;
  const move = (sourceKey: string, targetKey: string) => {
    const sourceIndex = columns.findIndex((column) => column.key === sourceKey);
    const targetIndex = columns.findIndex((column) => column.key === targetKey);
    if (
      sourceIndex < 0 ||
      targetIndex < 0 ||
      sourceIndex === targetIndex ||
      columns[sourceIndex]!.fixed !== columns[targetIndex]!.fixed
    )
      return;
    const next = [...columns];
    next.splice(targetIndex, 0, next.splice(sourceIndex, 1)[0]!);
    onChange(next);
  };
  const finishDrag = () => {
    setDraggingKey(undefined);
    setDragOverKey(undefined);
  };
  return (
    <div
      className={`admin-column-settings-toolbar${children ? " admin-column-settings-custom-trigger" : ""}`}
    >
      <Popover
        trigger="click"
        placement="bottomRight"
        arrow={false}
        align={{
          offset: [0, 0],
          overflow: { adjustX: true, adjustY: true, shiftY: true }
        }}
        open={open}
        styles={{ root: { paddingBlock: 8 }, container: { padding: 0 } }}
        onOpenChange={(next) => {
          if (children && next) return;
          setOpen(next);
          if (!next) finishDrag();
        }}
        content={
          <section
            ref={panelRef}
            className="admin-column-settings"
            aria-label={t("settings_panel")}
          >
            <div className="admin-column-settings-heading">
              <div className="admin-column-settings-title">
                <Typography.Text strong>{t("settings")}</Typography.Text>
                <Typography.Text
                  type="secondary"
                  className="admin-column-settings-count"
                  aria-live="polite"
                >
                  {t("visible_columns", {
                    visible: visibleCount,
                    total: columns.length
                  })}
                </Typography.Text>
              </div>
              <Button type="link" size="small" onClick={onReset}>
                {t("reset")}
              </Button>
            </div>
            {fixedOverflow && (
              <Typography.Paragraph
                type="secondary"
                className="admin-column-settings-overflow"
              >
                {t("overflow")}
              </Typography.Paragraph>
            )}
            <div className="admin-column-settings-list">
              {columnGroups.map((group) => {
                const groupColumns = columns.filter(
                  (column) => column.fixed === group.fixed
                );
                return (
                  <section
                    key={group.icon}
                    role="group"
                    aria-label={t("group_columns", { group: group.label })}
                    className="admin-column-settings-group"
                  >
                    <div className="admin-column-settings-group-heading">
                      <span
                        aria-hidden="true"
                        className={`admin-column-position-icon admin-column-position-icon-${group.icon}`}
                      />
                      <span>{group.label}</span>
                      <span>{groupColumns.length}</span>
                    </div>
                    {groupColumns.length === 0 && (
                      <Typography.Text
                        type="secondary"
                        className="admin-column-settings-empty"
                      >
                        {group.fixed === false
                          ? t("all_pinned")
                          : t("none_pinned")}
                      </Typography.Text>
                    )}
                    {groupColumns.map((column) => {
                      const index = columns.findIndex(
                        (item) => item.key === column.key
                      );
                      const canReorder = groupColumns.length > 1;
                      return (
                        <div
                          className={[
                            "admin-column-settings-row",
                            !column.visible && "is-hidden",
                            draggingKey === column.key && "is-dragging",
                            dragOverKey === column.key &&
                              (columns.findIndex(
                                (item) => item.key === draggingKey
                              ) < index
                                ? "is-drop-after"
                                : "is-drop-before")
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          key={column.key}
                          onDragOver={(event) => {
                            const source = columns.find(
                              (item) => item.key === draggingKey
                            );
                            if (
                              !source ||
                              source.key === column.key ||
                              source.fixed !== column.fixed
                            ) {
                              setDragOverKey(undefined);
                              return;
                            }
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            setDragOverKey(column.key);
                          }}
                          onDragLeave={() => setDragOverKey(undefined)}
                          onDrop={(event) => {
                            if (!draggingKey) return;
                            event.preventDefault();
                            move(draggingKey, column.key);
                            finishDrag();
                          }}
                        >
                          <Button
                            size="small"
                            type="text"
                            className="admin-column-drag-handle"
                            icon={<GripVerticalIcon />}
                            aria-label={t("drag_column", {
                              label: column.label
                            })}
                            title={t("drag_help")}
                            disabled={!canReorder}
                            draggable={canReorder}
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData(
                                "application/x-tsz-admin-column",
                                column.key
                              );
                              const row =
                                event.currentTarget.closest<HTMLElement>(
                                  ".admin-column-settings-row"
                                );
                              if (row && event.dataTransfer.setDragImage)
                                event.dataTransfer.setDragImage(row, 16, 16);
                              setDraggingKey(column.key);
                            }}
                            onDragEnd={finishDrag}
                            onKeyDown={(event) => {
                              const offset =
                                event.key === "ArrowUp"
                                  ? -1
                                  : event.key === "ArrowDown"
                                    ? 1
                                    : 0;
                              const target = columns[index + offset];
                              if (
                                offset &&
                                target &&
                                target.fixed === column.fixed
                              ) {
                                event.preventDefault();
                                move(column.key, target.key);
                              }
                            }}
                          />
                          <Checkbox
                            title={column.label}
                            checked={column.visible}
                            disabled={column.visible && visibleCount === 1}
                            onChange={(event) =>
                              onChange(
                                columns.map((item) =>
                                  item.key === column.key
                                    ? { ...item, visible: event.target.checked }
                                    : item
                                )
                              )
                            }
                          >
                            {column.label}
                          </Checkbox>
                          <Segmented<"none" | "left" | "right">
                            name={`${controlId}-${column.key}`}
                            data-column-key={column.key}
                            size="small"
                            className="admin-column-pin-control"
                            aria-label={t("pin_position", {
                              label: column.label
                            })}
                            value={column.fixed || "none"}
                            options={[
                              { value: "left", label: t("side_left") },
                              { value: "none", label: t("fixed_none") },
                              { value: "right", label: t("side_right") }
                            ]}
                            onChange={(value) => {
                              fixedFocusKey.current = column.key;
                              onChange(
                                columns.map((item) =>
                                  item.key === column.key
                                    ? {
                                        ...item,
                                        fixed: value === "none" ? false : value
                                      }
                                    : item
                                )
                              );
                            }}
                          />
                        </div>
                      );
                    })}
                  </section>
                );
              })}
            </div>
            <div className="admin-column-settings-footer">
              <span>{t("drag_group")}</span>
              <span>
                <CheckIcon aria-hidden="true" />
                {t("browser_saved")}
              </span>
            </div>
          </section>
        }
      >
        {children ? (
          <span className="admin-column-settings-anchor">{children}</span>
        ) : (
          <Button
            size={buttonSize}
            icon={<SettingsIcon />}
            aria-expanded={open}
          >
            {t("settings")}
          </Button>
        )}
      </Popover>
    </div>
  );
}
