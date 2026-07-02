import {
  MinusCircleOutlined,
  PlusCircleOutlined,
  PlusOutlined
} from "@ant-design/icons";
import {
  Button,
  Card,
  Flex,
  Form,
  Input,
  Select,
  Space,
  Typography
} from "antd";
import type { ReactNode } from "react";
import type { Dialect } from "@tsz/types";
import {
  DIALECT_LABEL,
  FORM_TYPE_OPTIONS,
  PRON_STYLE_OPTIONS,
  shownDialects
} from "../editorConstants";
import { defaultInflectionRow } from "./mapping";
import { SectionTitle } from "./SectionTitle";
import { VoiceActions } from "./VoiceActions";
import { TABLE_MAX } from "./widths";

const { Text } = Typography;

function ColHead({ children, flex }: { children: ReactNode; flex: string }) {
  return (
    <Text type="secondary" style={{ flex, fontSize: 12, whiteSpace: "nowrap" }}>
      {children}
    </Text>
  );
}

// —— 词形变化：某个词性下、按方言分块，每块一张表（首行固定为「原形」+ 动态词形行）。——
// 一行 = 一个读音;相邻且「类别+拼写」相同的行保存时合并为同一词形的多个读音。
// 未区分方言时用单一 common 块。多列行较宽，窄屏整块横向滚动、超宽屏封顶避免过散。
export function InflectionSection({
  posName,
  dialects
}: {
  posName: number;
  dialects: Dialect[];
}) {
  const shown = shownDialects(dialects);
  return (
    <>
      <SectionTitle ai>词形变化</SectionTitle>
      {shown.map((dialect) => (
        <Card
          key={dialect}
          size="small"
          style={{ marginBottom: 12, background: "#f5f8ff" }}
        >
          <Text strong>
            方言类型{" "}
            <Text style={{ color: "#0071e3" }}>{DIALECT_LABEL[dialect]}</Text>
          </Text>
          <Form.List name={[posName, "inflections", dialect]}>
            {(rows, { add, remove }) => (
              <div style={{ marginTop: 12, overflowX: "auto" }}>
                <div style={{ minWidth: 760, maxWidth: TABLE_MAX }}>
                  <Flex gap={8} style={{ padding: "0 4px", marginBottom: 6 }}>
                    <ColHead flex="0 0 150px">词形类别</ColHead>
                    <ColHead flex="1">单词拼写</ColHead>
                    <ColHead flex="1">字典音标</ColHead>
                    <ColHead flex="1">实际发音</ColHead>
                    <ColHead flex="0 0 96px">发音方式</ColHead>
                    <ColHead flex="0 0 160px"> </ColHead>
                  </Flex>
                  {rows.map((row, idx) => (
                    <Flex
                      key={row.key}
                      gap={8}
                      align="center"
                      style={{ marginBottom: 8 }}
                    >
                      <div style={{ flex: "0 0 150px" }}>
                        {idx === 0 ? (
                          <Input value="原形" disabled />
                        ) : (
                          <Form.Item name={[row.name, "category"]} noStyle>
                            <Select
                              placeholder="词形类别"
                              options={FORM_TYPE_OPTIONS}
                              style={{ width: "100%" }}
                            />
                          </Form.Item>
                        )}
                      </div>
                      <Form.Item name={[row.name, "spelling"]} noStyle>
                        <Input
                          placeholder="单词拼写"
                          style={{ flex: 1, minWidth: 0 }}
                        />
                      </Form.Item>
                      <Form.Item name={[row.name, "ipa"]} noStyle>
                        <Input
                          placeholder="字典音标"
                          style={{ flex: 1, minWidth: 0 }}
                        />
                      </Form.Item>
                      <Form.Item name={[row.name, "phonetic"]} noStyle>
                        <Input
                          placeholder="实际发音"
                          style={{ flex: 1, minWidth: 0 }}
                        />
                      </Form.Item>
                      <Form.Item name={[row.name, "style"]} noStyle>
                        <Select
                          options={PRON_STYLE_OPTIONS}
                          style={{ flex: "0 0 96px", width: 96 }}
                        />
                      </Form.Item>
                      <Space size={2} style={{ flex: "0 0 160px" }}>
                        <Button
                          type="text"
                          size="small"
                          icon={<PlusCircleOutlined />}
                          onClick={() =>
                            add(defaultInflectionRow("base"), idx + 1)
                          }
                        />
                        <Button
                          type="text"
                          size="small"
                          icon={<MinusCircleOutlined />}
                          disabled={idx === 0}
                          onClick={() => remove(row.name)}
                        />
                        <VoiceActions />
                      </Space>
                    </Flex>
                  ))}
                  <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() => add(defaultInflectionRow("base"))}
                    style={{ marginTop: 4 }}
                  >
                    增加词形
                  </Button>
                </div>
              </div>
            )}
          </Form.List>
        </Card>
      ))}
    </>
  );
}
