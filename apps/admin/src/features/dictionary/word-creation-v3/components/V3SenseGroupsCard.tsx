import { useAdminDisabled } from "@tsz/ui/admin/context";
import type { SenseGroupV3 } from "@tsz/types";
import { Button, Card, Space } from "@tsz/ui/admin/display";
import { Input } from "@tsz/ui/admin/forms";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { sortableRowClass, useSortableRows } from "../sortableRows";
import { SortableDragHandle } from "./SortableDragHandle";

const SENSE_GROUP_DRAG_TYPE = "application/x-tsz-v3-sense-group";
const SORTABLE_ROW_SELECTOR =
  ".word-sense-group-item, .word-grammar-row, .word-definition-row, .word-sentence-row";

export function V3SenseGroupsCard({
  groups,
  wordId,
  change,
  idFactory,
  onDelete
}: {
  groups: SenseGroupV3[];
  wordId?: string;
  change: (mutation: (groups: SenseGroupV3[]) => void) => void;
  onDelete: (id: string) => void;
  idFactory: () => string;
}) {
  const { t } = useLexiconEditorTranslation();
  const disabled = useAdminDisabled();
  const sorting = useSortableRows({
    items: disabled ? [] : groups,
    scopeId: wordId ?? "current-entry",
    dragType: SENSE_GROUP_DRAG_TYPE,
    onChange: (next) =>
      change((draft) => {
        // 按拖拽结果重排 draft 里已有的区间；draft 中晚于本次渲染快照新增的
        // 区间不在 next 里，保留在尾部而不是被整体重建时静默抹掉。
        const order = new Map(next.map((group, index) => [group.id, index]));
        const ordered = [
          ...draft
            .filter((group) => order.has(group.id))
            .sort((a, b) => order.get(a.id)! - order.get(b.id)!),
          ...draft.filter((group) => !order.has(group.id))
        ];
        draft.splice(0, draft.length, ...ordered);
      })
  });
  return (
    <Card
      className="word-sense-groups-card"
      data-v3-field="sense_groups"
      data-v3-node-id={wordId ?? "current-entry"}
      size="small"
      title={t("sense_groups")}
    >
      <div className="word-sense-group-list">
        {/* 列名只出一次：每行都重复「中文 / 英文」会把下一行的输入框推远，
            行与行之间的留白就跟着不对称了。 */}
        <div className="word-sense-group-heads">
          <span />
          <span>{t("chinese")}</span>
          <span>{t("english")}</span>
          <span />
        </div>
        {groups.map((group, groupIndex) => (
          <div
            className={sortableRowClass(
              "word-sense-group-item",
              sorting,
              groupIndex
            )}
            data-v3-node-id={group.id}
            key={group.id}
            onDragLeave={sorting.handleDragLeave}
            onDragOver={(event) => sorting.handleDragOver(event, groupIndex)}
            onDrop={(event) => sorting.handleDrop(event, groupIndex)}
          >
            <span className="word-sort-leading">
              <SortableDragHandle
                dragImageSelector={SORTABLE_ROW_SELECTOR}
                index={groupIndex}
                label={t("drag_group", { index: groupIndex + 1 })}
                singleItemTitle={t("two_groups_required")}
                sorting={sorting}
              />
              <span
                aria-label={t("group_index", { index: groupIndex + 1 })}
                className="word-sense-group-index"
              >
                {groupIndex + 1}
              </span>
            </span>
            <div className="word-sense-group-field">
              <Input
                aria-label={t("group_chinese", { index: groupIndex + 1 })}
                data-v3-field="name_zh"
                data-v3-node-id={group.id}
                onChange={(event) =>
                  change((draft) => {
                    const target = draft.find(
                      (candidate) => candidate.id === group.id
                    );
                    if (target) target.name_zh = event.target.value;
                  })
                }
                placeholder={t("group_placeholder_zh")}
                value={group.name_zh}
              />
            </div>
            <div className="word-sense-group-field">
              <Input
                aria-label={t("group_english", { index: groupIndex + 1 })}
                className="tsz-entry-en"
                data-v3-field="name_en"
                data-v3-node-id={group.id}
                onChange={(event) =>
                  change((draft) => {
                    const target = draft.find(
                      (candidate) => candidate.id === group.id
                    );
                    if (target) {
                      target.name_en = event.target.value;
                      if (target.name_en_rich) {
                        target.name_en_rich = {
                          version: 2,
                          text: event.target.value,
                          annotations: []
                        };
                      }
                    }
                  })
                }
                placeholder={t("group_placeholder_en")}
                value={group.name_en}
              />
            </div>
            <Space
              className="word-sort-actions"
              orientation="horizontal"
              size={8}
            >
              <Button
                aria-label={t("delete_group", { index: groupIndex + 1 })}
                danger
                disabled={disabled || groups.length <= 1}
                icon={<Trash2Icon />}
                onClick={() => onDelete(group.id)}
                size="small"
                type="text"
              />
            </Space>
          </div>
        ))}
      </div>
      <Button
        block
        className="word-section-add-button"
        icon={<PlusIcon aria-hidden />}
        onClick={() =>
          change((draft) => {
            draft.push({
              id: idFactory(),
              name_zh: "",
              name_en: ""
            });
          })
        }
        type="dashed"
      >
        {t("add_sense_group")}
      </Button>
    </Card>
  );
}
