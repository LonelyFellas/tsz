import { Col, Form, Input, Row } from "antd";
import type { DerivedNameField } from "./useDerivedNameDefaults";

export interface PartOfSpeechNamePlaceholders {
  name_zh: string;
  short_name_zh: string;
  name_en: string;
  abbreviation: string;
  full_name_en: string;
}

interface Props {
  placeholders: PartOfSpeechNamePlaceholders;
  /** 用户手动编辑派生字段时通知 useDerivedNameDefaults 停止覆盖。 */
  onTouch: (field: DerivedNameField) => void;
}

/**
 * 基本词性与细分词性共用的五个展示字段：正式中文 / 简洁显示、正式英文 / 英文缩写、英文全称。
 * 校验规则与后端契约一致（中英文名 64、简洁显示与缩写 16、英文全称 64 且须含英文字母）。
 */
export function PartOfSpeechNameFields({ placeholders, onTouch }: Props) {
  return (
    <>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="name_zh"
            label="正式中文"
            rules={[
              { required: true, whitespace: true, message: "请输入中文名称" },
              { max: 64, message: "中文名称不能超过 64 个字符" }
            ]}
          >
            <Input placeholder={placeholders.name_zh} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="short_name_zh"
            label="简洁显示"
            rules={[
              {
                required: true,
                whitespace: true,
                message: "请输入简洁显示名称"
              },
              { max: 16, message: "简洁显示不能超过 16 个字符" }
            ]}
          >
            <Input
              placeholder={placeholders.short_name_zh}
              onChange={() => onTouch("short_name_zh")}
            />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="name_en"
            label="正式英文"
            rules={[
              { required: true, whitespace: true, message: "请输入英文名称" },
              { max: 64, message: "英文名称不能超过 64 个字符" }
            ]}
          >
            <Input placeholder={placeholders.name_en} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="abbreviation"
            label="英文缩写"
            rules={[
              { required: true, whitespace: true, message: "请输入英文缩写" },
              { max: 16, message: "英文缩写不能超过 16 个字符" }
            ]}
          >
            <Input placeholder={placeholders.abbreviation} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item
        name="full_name_en"
        label="英文全称"
        rules={[
          { required: true, whitespace: true, message: "请输入英文全称" },
          { max: 64, message: "英文全称不能超过 64 个字符" },
          { pattern: /[A-Za-z]/, message: "英文全称需包含英文字母" }
        ]}
      >
        <Input
          placeholder={placeholders.full_name_en}
          onChange={() => onTouch("full_name_en")}
        />
      </Form.Item>
    </>
  );
}
