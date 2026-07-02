import {
  MinusCircleOutlined,
  PlusCircleOutlined,
  PlusOutlined
} from "@ant-design/icons";
import { Button, Divider, Flex, Form, Input, Select, Typography } from "antd";
import { useMemo } from "react";
import type { Dialect } from "@tsz/types";
import {
  DEF_TYPE_OPTIONS,
  SENSE_LEVEL_OPTIONS,
  shownDialects,
  toOptions
} from "../editorConstants";
import { defaultDefinition, type GrammarRow } from "./mapping";
import { VoiceActions } from "./VoiceActions";
import { FIELD_MAX, SENTENCE_MAX } from "./widths";

const { Text } = Typography;

// —— 多维释义：某个词义下的释义列表。每条 = 等级 + 释义类型 + 释义文本 + 关联语法结构。——
// 语法结构下拉引用**同一 pos** 下的结构(存 id,显示编号+首个方言措辞)。
export function DefinitionList({
  posName,
  senseName
}: {
  posName: number;
  senseName: number;
}) {
  // ⚠️ preserve 必须开:GrammarRow 的 id/variantIds 没有对应 Form.Item(隐藏簿记),
  // 默认 useWatch 只回已注册字段,拿不到 id 会让选项 value 变 undefined,点了也选不上。
  const grammar = Form.useWatch<GrammarRow[] | undefined>(
    ["posList", posName, "grammar"],
    { preserve: true }
  );
  const dialects = Form.useWatch<Dialect[] | undefined>("dialects", {
    preserve: true
  });
  // memo:词义下每行释义共用这份选项,别让无关字段的输入反复重建(Select 选项引用稳定)。
  const grammarOptions = useMemo(() => {
    const shown = shownDialects(dialects ?? []);
    return (grammar ?? [])
      .map((g, idx) => {
        if (!g) return null;
        const text = shown.map((d) => g.texts?.[d]).find((t) => t?.trim());
        return { value: g.id, label: `${idx + 1}. ${text ?? "(未填写)"}` };
      })
      .filter((o): o is { value: string; label: string } => o !== null);
  }, [grammar, dialects]);

  return (
    <>
      <Divider titlePlacement="start" style={{ margin: "8px 0 12px" }}>
        <Text strong>多维释义</Text>
      </Divider>
      <Form.List name={[senseName, "definitions"]}>
        {(defs, { add, remove }) => (
          <>
            {defs.map((def, idx) => (
              <Flex
                key={def.key}
                gap={8}
                align="start"
                style={{ marginBottom: 10, minWidth: 0 }}
              >
                <div style={{ width: 20, paddingTop: 6, color: "#888" }}>
                  {idx + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Flex gap={8} align="center" wrap>
                    <Form.Item name={[def.name, "level"]} noStyle>
                      <Select
                        options={toOptions(SENSE_LEVEL_OPTIONS)}
                        style={{ width: 80 }}
                      />
                    </Form.Item>
                    <Form.Item name={[def.name, "defType"]} noStyle>
                      <Select
                        options={DEF_TYPE_OPTIONS}
                        style={{ width: 120 }}
                      />
                    </Form.Item>
                    <Form.Item name={[def.name, "text"]} noStyle>
                      <Input
                        placeholder="请输入释义"
                        style={{
                          flex: "1 1 180px",
                          minWidth: 0,
                          maxWidth: FIELD_MAX
                        }}
                      />
                    </Form.Item>
                    <Flex gap={2} align="center">
                      <VoiceActions />
                      <Button
                        type="text"
                        size="small"
                        icon={<PlusCircleOutlined />}
                        onClick={() => add(defaultDefinition(), idx + 1)}
                      />
                      <Button
                        type="text"
                        size="small"
                        icon={<MinusCircleOutlined />}
                        onClick={() => remove(def.name)}
                      />
                    </Flex>
                  </Flex>
                  <Flex
                    gap={8}
                    align="center"
                    style={{ marginTop: 6, minWidth: 0 }}
                  >
                    <Text
                      type="secondary"
                      style={{ width: 64, fontSize: 12, flexShrink: 0 }}
                    >
                      语法结构
                    </Text>
                    <Form.Item name={[def.name, "grammarId"]} noStyle>
                      <Select
                        placeholder="关联本词性下的语法结构(可空)"
                        options={grammarOptions}
                        allowClear
                        style={{ flex: 1, minWidth: 0, maxWidth: SENTENCE_MAX }}
                      />
                    </Form.Item>
                  </Flex>
                </div>
              </Flex>
            ))}
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => add(defaultDefinition())}
              style={{ marginInlineStart: 28 }}
            >
              增加释义
            </Button>
          </>
        )}
      </Form.List>
    </>
  );
}
