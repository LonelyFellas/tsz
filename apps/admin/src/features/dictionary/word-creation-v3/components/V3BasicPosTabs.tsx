import {
  useLexiconEditorTranslation,
  LexiconEditorText
} from "@/features/dictionary/i18n/editor";
import { Button, Tabs } from "@tsz/ui/admin/display";
import { App, Tooltip } from "@tsz/ui/admin/overlays";
import { CircleMinusIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  sortableRowClass,
  sortableTabOffset,
  type SortableRowsController
} from "../sortableRows";
import { SortableDragHandle } from "./SortableDragHandle";
import "../posTabs.css";

interface BasicPosTab {
  key: string;
  label: string;
  posId?: string;
  disabled?: boolean;
  badges?: ReactNode;
  fallbackControl?: ReactNode;
  remove?: {
    onConfirm: () => void;
    disabled?: boolean;
    hint?: ReactNode;
  };
  children: ReactNode;
}

export function V3BasicPosTabs({
  items,
  activeKey,
  onChange,
  sorting,
  addControl,
  emptyToolbar = false,
  deleteDescription,
  className
}: {
  items: BasicPosTab[];
  activeKey?: string;
  onChange?: (key: string) => void;
  sorting: SortableRowsController;
  addControl?: ReactNode;
  emptyToolbar?: boolean;
  deleteDescription?: ReactNode;
  className?: string;
}) {
  const { t } = useLexiconEditorTranslation();
  const { modal } = App.useApp();
  if (emptyToolbar) {
    return (
      <div>
        <div className="word-forms-empty-pos-toolbar">{addControl}</div>
        {items[0]?.children}
      </div>
    );
  }
  return (
    <Tabs
      activeKey={activeKey}
      onChange={onChange}
      className={className ? `word-pos-tabs ${className}` : "word-pos-tabs"}
      tabBarExtraContent={
        items.length === 1 && items[0]?.disabled ? addControl : undefined
      }
      items={items.map(
        (
          {
            key,
            label,
            posId,
            disabled,
            badges,
            fallbackControl,
            remove,
            children
          },
          index
        ) => ({
          key,
          disabled,
          children,
          label: disabled ? (
            label
          ) : (
            <span
              className={sortableRowClass(
                "word-pos-tab-handle",
                sorting,
                index
              )}
              data-pos-id={posId}
              onDragLeave={sorting.handleDragLeave}
              onDragOver={(event) => sorting.handleDragOver(event, index)}
              onDrop={(event) => sorting.handleDrop(event, index)}
            >
              <span
                className="word-pos-tab-content"
                style={{
                  transform: `translateX(${sortableTabOffset(sorting, index)}px)`
                }}
              >
                <SortableDragHandle
                  dragImageSelector=".word-pos-tab-handle"
                  index={index}
                  label={t("drag_item", { label })}
                  singleItemTitle={t("two_pos_required")}
                  sorting={sorting}
                />
                <span className="word-pos-tab-label">
                  <strong>{label}</strong>
                  {badges}
                </span>
                {(addControl || fallbackControl || remove) && (
                  <span
                    className={
                      fallbackControl ? undefined : "word-pos-tab-actions"
                    }
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    {fallbackControl ?? addControl}
                    {remove && (
                      <Tooltip title={remove.hint}>
                        <Button
                          aria-label={t("delete_item", { label })}
                          danger
                          disabled={remove.disabled}
                          icon={<CircleMinusIcon />}
                          onClick={() =>
                            modal.confirm({
                              title: (
                                <LexiconEditorText
                                  message="delete_pos_title"
                                  params={{ label }}
                                />
                              ),
                              content: deleteDescription ?? (
                                <LexiconEditorText message="remove_pos_impact" />
                              ),
                              okText: <LexiconEditorText message="delete" />,
                              okButtonProps: { danger: true },
                              onOk: remove.onConfirm
                            })
                          }
                          size="small"
                          type="text"
                        />
                      </Tooltip>
                    )}
                  </span>
                )}
              </span>
            </span>
          )
        })
      )}
    />
  );
}
