import {
  CheckOutlined,
  HolderOutlined,
  SettingOutlined
} from "@ant-design/icons";
import { Button, Checkbox, Popover, Segmented, Typography } from "antd";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { ConfigurableColumn } from "./column-settings";
import "./ColumnSettings.css";

const columnGroups = [
  { fixed: "left", label: "左侧固定", icon: "left" },
  { fixed: false, label: "不固定", icon: "none" },
  { fixed: "right", label: "右侧固定", icon: "right" }
] as const;

export function ColumnSettings({
  columns,
  onChange,
  onReset,
  fixedOverflow = false,
  buttonSize = "small"
}: {
  columns: ConfigurableColumn[];
  onChange: (columns: ConfigurableColumn[]) => void;
  onReset: () => void;
  fixedOverflow?: boolean;
  buttonSize?: "small" | "middle";
}) {
  const controlId = useId();
  const [open, setOpen] = useState(false);
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
    <div className="admin-column-settings-toolbar">
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
          setOpen(next);
          if (!next) finishDrag();
        }}
        content={
          <section
            ref={panelRef}
            className="admin-column-settings"
            aria-label="表格列设置"
          >
            <div className="admin-column-settings-heading">
              <div className="admin-column-settings-title">
                <Typography.Text strong>列设置</Typography.Text>
                <Typography.Text
                  type="secondary"
                  className="admin-column-settings-count"
                  aria-live="polite"
                >
                  {visibleCount} / {columns.length} 列
                </Typography.Text>
              </div>
              <Button type="link" size="small" onClick={onReset}>
                恢复默认
              </Button>
            </div>
            {fixedOverflow && (
              <Typography.Paragraph
                type="secondary"
                className="admin-column-settings-overflow"
              >
                固定列超出可视宽度，已临时改为横向滚动；表格变宽后恢复固定。
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
                    aria-label={`${group.label}列`}
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
                          ? "所有列均已固定"
                          : "暂无固定列"}
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
                            icon={<HolderOutlined />}
                            aria-label={`拖动${column.label}排序`}
                            title="拖动排序，也可使用上下方向键"
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
                            aria-label={`${column.label}固定位置`}
                            value={column.fixed || "none"}
                            options={[
                              { value: "left", label: "左侧" },
                              { value: "none", label: "不固定" },
                              { value: "right", label: "右侧" }
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
              <span>组内拖动排序</span>
              <span>
                <CheckOutlined aria-hidden="true" /> 仅当前浏览器自动保存
              </span>
            </div>
          </section>
        }
      >
        <Button
          size={buttonSize}
          icon={<SettingOutlined />}
          aria-expanded={open}
        >
          列设置
        </Button>
      </Popover>
    </div>
  );
}
