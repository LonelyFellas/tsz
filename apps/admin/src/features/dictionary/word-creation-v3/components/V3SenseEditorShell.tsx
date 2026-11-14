import { useState, type ReactNode } from "react";
import { ChevronDownIcon, ChevronUpIcon, Trash2Icon } from "lucide-react";
import {
  Button,
  Collapse,
  Space,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { Modal, Tooltip } from "@tsz/ui/admin/overlays";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import {
  sortableRowClass,
  useSortableRows,
  type SortableRowsController
} from "../sortableRows";
import { referenceBlockedHint } from "../referenceGuardContext";
import { SortableDragHandle } from "./SortableDragHandle";
import { V3ReferenceBadge } from "./V3ReferenceBadge";

export function SortableRows<T>({
  items,
  scopeId,
  dragType,
  onChange,
  children
}: {
  items: readonly T[];
  scopeId: string;
  dragType: string;
  onChange: (next: T[]) => void;
  children: (sorting: SortableRowsController) => ReactNode;
}) {
  const sorting = useSortableRows({ items, scopeId, dragType, onChange });
  return children(sorting);
}

export function SenseEditorShell({
  children,
  index,
  level,
  summary,
  subPosLabel,
  sorting,
  expanded,
  onExpandedChange,
  onDelete,
  confirmDelete,
  canDelete,
  nodeId,
  referenceCount = 0
}: {
  children: ReactNode;
  index: number;
  level: string;
  summary: string;
  subPosLabel?: string;
  sorting: SortableRowsController;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onDelete: () => void;
  confirmDelete: boolean;
  canDelete: boolean;
  nodeId: string;
  /** 指向本词义的引用数；大于 0 时不能删除。 */
  referenceCount?: number;
}) {
  const { t } = useLexiconEditorTranslation();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const safeLevel = /^(?:A1|A2|B1|B2|C1|C2)$/u.test(level) ? level : "A1";
  return (
    <div
      data-v3-field="sense"
      data-v3-node-id={nodeId}
      tabIndex={-1}
      className={sortableRowClass("word-sense-sortable", sorting, index)}
      onDragOver={(event) => sorting.handleDragOver(event, index)}
      onDragLeave={sorting.handleDragLeave}
      onDrop={(event) => sorting.handleDrop(event, index)}
    >
      <Collapse
        activeKey={expanded ? [nodeId] : []}
        className={`word-sense-editor word-sense-editor-v3 word-sense-editor-${safeLevel.toLowerCase()}`}
        onChange={(keys) =>
          onExpandedChange(
            (Array.isArray(keys) ? keys : [keys]).includes(nodeId)
          )
        }
        items={[
          {
            key: nodeId,
            showArrow: false,
            label: (
              <div className="word-sense-header-label">
                <div className="word-sense-header-content">
                  <span
                    className="word-sort-leading"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <SortableDragHandle
                      sorting={sorting}
                      index={index}
                      label={t("drag_sense", { index: index + 1 })}
                      singleItemTitle={t("two_senses_required")}
                      dragImageSelector=".word-sense-sortable"
                    />
                  </span>
                  {level && (
                    <Tag className="word-sense-level-badge">{level}</Tag>
                  )}
                  <Typography.Text className="word-sense-summary tsz-entry-en">
                    {index + 1}. {summary}
                  </Typography.Text>
                  {subPosLabel ? (
                    <Tag className="word-sense-sub-pos-badge">
                      {subPosLabel}
                    </Tag>
                  ) : null}
                  <V3ReferenceBadge label={t("sense")} nodeIds={[nodeId]} />
                </div>
                <span className="word-form-card-toggle-state">
                  <span>{expanded ? t("collapse") : t("expand")}</span>
                  {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                </span>
              </div>
            ),
            extra: (
              <Space
                className="word-sense-header-actions"
                size={2}
                onClick={(event) => event.stopPropagation()}
              >
                <Tooltip
                  title={
                    !canDelete
                      ? t("one_sense_required")
                      : referenceCount > 0
                        ? referenceBlockedHint(referenceCount, t)
                        : undefined
                  }
                >
                  <Button
                    aria-label={t("delete_sense", { index: index + 1 })}
                    icon={<Trash2Icon />}
                    disabled={!canDelete || undefined}
                    danger
                    size="small"
                    type="text"
                    onClick={() => {
                      if (!canDelete) return;
                      if (confirmDelete) setDeleteOpen(true);
                      else onDelete();
                    }}
                  />
                </Tooltip>
              </Space>
            ),
            children
          }
        ]}
      />
      <Modal
        title={t("delete_sense_title")}
        open={deleteOpen}
        style={{ top: 48 }}
        maskClosable={false}
        okText={t("delete_confirm")}
        cancelText={t("cancel")}
        okButtonProps={{ danger: true, disabled: !canDelete }}
        cancelButtonProps={{ autoFocus: true }}
        onCancel={() => setDeleteOpen(false)}
        onOk={() => {
          setDeleteOpen(false);
          if (canDelete) onDelete();
        }}
      >
        <Typography.Text>{summary}</Typography.Text>
      </Modal>
    </div>
  );
}
