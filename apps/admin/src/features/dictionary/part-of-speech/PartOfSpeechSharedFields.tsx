import { InfoCircleOutlined } from "@ant-design/icons";
import { Col, Form, Input, InputNumber, Popover, Row } from "antd";
import type { ReactNode } from "react";
import type { DerivedNameField } from "./useDerivedNameDefaults";

/**
 * 字段说明收进标签右侧的问号：这些话挂在输入框下面会把弹窗撑高一截，
 * 又不是每次填都要读。标签文本只保留字段名，按标签定位的测试不受影响。
 */
export function LabelWithHint({
  label,
  hint
}: {
  label: string;
  hint: ReactNode;
}) {
  return (
    <span>
      {label}
      <Popover content={hint}>
        <InfoCircleOutlined
          aria-hidden
          style={{
            marginInlineStart: 4,
            color: "rgba(0, 0, 0, 0.45)",
            cursor: "help"
          }}
        />
      </Popover>
    </span>
  );
}

export interface PartOfSpeechSharedPlaceholders {
  name_zh: string;
  short_name_zh: string;
  name_en: string;
  abbreviation: string;
  full_name_en: string;
}

/** 后端 sort_order 是 PostgreSQL INTEGER，超出范围会被 422 挡回。 */
const SORT_ORDER_MIN = -2147483648;
const SORT_ORDER_MAX = 2147483647;

interface Props {
  placeholders: PartOfSpeechSharedPlaceholders;
  /** 用户手动编辑派生字段时通知 useDerivedNameDefaults 停止覆盖。 */
  onTouch: (field: DerivedNameField) => void;
}

/**
 * 基本词性、细分词性与词形变化共用的表单字段：正式中文 / 简洁显示、正式英文 / 英文缩写、
 * 英文全称 / 序号。校验规则与后端契约一致（中英文名 64、简洁显示与缩写 16、
 * 英文全称 64 且须含英文字母、序号是 32 位有符号整数）。
 */
export function PartOfSpeechSharedFields({ placeholders, onTouch }: Props) {
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
      <Row gutter={16}>
        {/* 与上面两行同样对半分，四个输入框才在一条竖线上。 */}
        <Col span={12}>
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
        </Col>
        <Col span={12}>
          <Form.Item
            name="sort_order"
            // 列表按序号从小到大排，相同序号再按创建时间。留出间隔就能插队。
            label={
              <LabelWithHint
                label="序号"
                hint="数字越小越靠前，允许与别的行相同"
              />
            }
            rules={[{ required: true, message: "请输入序号" }]}
          >
            <InputNumber
              style={{ width: "100%" }}
              // 细分词性要选完父级才预填，空着的时候框里就是这句引导。
              placeholder="数字越小越靠前，允许与别的行相同"
              precision={0}
              min={SORT_ORDER_MIN}
              max={SORT_ORDER_MAX}
            />
          </Form.Item>
        </Col>
      </Row>
    </>
  );
}
