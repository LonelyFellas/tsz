import {
  MinusCircleOutlined,
  PlusOutlined,
  SearchOutlined
} from "@ant-design/icons";
import {
  Button,
  Divider,
  Flex,
  Form,
  Input,
  InputNumber,
  Tag,
  Typography
} from "antd";
import { useState } from "react";
import { RELATION_GROUPS, type RelationGroupKey } from "../editorConstants";
import { defaultRelation, type RelationRow } from "./mapping";
import { RelatedWordModal, type RelatedTarget } from "./RelatedWordModal";
import { FIELD_MAX, RELATION_WORD_MAX } from "./widths";

const { Text } = Typography;

// —— 关联词：近义词 / 反义词 / 派生词三组,各是「度量 + 目标词条/词义」列表。————————————
// 目标必须经 related-search 弹窗选定(自由文本无法给出 target_word_id);
// 目标词/释义为只读快照展示。孤儿关联词(目标已删,双 null)保留快照原样展示与带回。
export function RelationList({
  posName,
  senseName
}: {
  posName: number;
  senseName: number;
}) {
  const form = Form.useFormInstance();
  // 正在「选择目标」的行:记录组 key 与行号,弹窗选定后写回该行。
  const [picking, setPicking] = useState<{
    group: RelationGroupKey;
    row: number;
    title: string;
  } | null>(null);

  const applyTarget = (target: RelatedTarget) => {
    if (!picking) return;
    const path = [
      "posList",
      posName,
      "senses",
      senseName,
      picking.group,
      picking.row
    ];
    const current = (form.getFieldValue(path) ?? {}) as RelationRow;
    form.setFieldValue(path, {
      ...current,
      targetWordId: target.wordId,
      targetSenseId: target.senseId,
      targetHeadword: target.headword,
      targetGloss: target.gloss
    });
  };

  return (
    <>
      <Divider titlePlacement="start" style={{ margin: "16px 0 12px" }}>
        <Text strong>关联词</Text>
      </Divider>
      {RELATION_GROUPS.map((group) => (
        <div key={group.key} style={{ marginBottom: 16 }}>
          <Text strong>{group.title}</Text>
          <Form.List name={[senseName, group.key]}>
            {(items, { add, remove }) => (
              <div style={{ marginTop: 8 }}>
                {items.map((item, idx) => (
                  <Flex
                    key={item.key}
                    gap={8}
                    align="center"
                    wrap
                    style={{ marginBottom: 8, minWidth: 0 }}
                  >
                    <div style={{ width: 20, color: "#888", flexShrink: 0 }}>
                      {idx + 1}
                    </div>
                    <Text
                      type="secondary"
                      style={{ width: 52, fontSize: 12, flexShrink: 0 }}
                    >
                      {group.metric}
                    </Text>
                    <Form.Item name={[item.name, "score"]} noStyle>
                      <InputNumber
                        suffix="%"
                        min={0}
                        max={100}
                        precision={0}
                        style={{ width: 90 }}
                      />
                    </Form.Item>
                    {/* 目标词条/词义:只读快照 + 选择按钮 */}
                    <Form.Item name={[item.name, "targetHeadword"]} noStyle>
                      <Input
                        placeholder="点右侧放大镜选择目标词条"
                        readOnly
                        style={{
                          flex: "1 1 130px",
                          minWidth: 0,
                          maxWidth: RELATION_WORD_MAX
                        }}
                      />
                    </Form.Item>
                    <Form.Item name={[item.name, "targetGloss"]} noStyle>
                      <Input
                        placeholder="目标词义(发布前必选)"
                        readOnly
                        style={{
                          flex: "1 1 130px",
                          minWidth: 0,
                          maxWidth: FIELD_MAX
                        }}
                      />
                    </Form.Item>
                    {/* 目标已删除的孤儿关联词:提示但保留。
                        dependencies 只订阅本行快照字段,避免大表单任意击键都重渲染。 */}
                    <Form.Item
                      noStyle
                      dependencies={[
                        [
                          "posList",
                          posName,
                          "senses",
                          senseName,
                          group.key,
                          item.name,
                          "targetWordId"
                        ],
                        [
                          "posList",
                          posName,
                          "senses",
                          senseName,
                          group.key,
                          item.name,
                          "targetHeadword"
                        ]
                      ]}
                    >
                      {() => {
                        const row = form.getFieldValue([
                          "posList",
                          posName,
                          "senses",
                          senseName,
                          group.key,
                          item.name
                        ]) as RelationRow | undefined;
                        return row?.targetHeadword && !row.targetWordId ? (
                          <Tag color="orange" style={{ flexShrink: 0 }}>
                            目标已删除
                          </Tag>
                        ) : null;
                      }}
                    </Form.Item>
                    <Button
                      size="small"
                      icon={<SearchOutlined />}
                      onClick={() =>
                        setPicking({
                          group: group.key,
                          row: item.name,
                          title: `选择${group.title}目标`
                        })
                      }
                      style={{ flexShrink: 0 }}
                    >
                      选择
                    </Button>
                    <Button
                      type="text"
                      size="small"
                      icon={<MinusCircleOutlined />}
                      onClick={() => remove(item.name)}
                      style={{ flexShrink: 0 }}
                    />
                  </Flex>
                ))}
                <Button
                  type="dashed"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => add(defaultRelation())}
                >
                  增加{group.title}
                </Button>
              </div>
            )}
          </Form.List>
        </div>
      ))}
      {picking && (
        <RelatedWordModal
          open
          title={picking.title}
          onSelect={applyTarget}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  );
}
