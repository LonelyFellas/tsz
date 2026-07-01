import { Form, Input, Modal, Select } from "antd";
import { useEffect } from "react";
import { toOptions } from "./editorConstants";
import {
  CEFR_OPTIONS,
  POS_OPTIONS,
  type DictWord,
  type WordType
} from "./types";

export interface WordFormValues {
  word: string;
  type: WordType;
  meaning: string;
  pos: DictWord["pos"];
  difficulty: DictWord["difficulty"];
}

interface Props {
  open: boolean;
  // 固定类型：从「创建单词/创建短语」入口带入，编辑时取词条自身类型。
  fixedType: WordType;
  // 编辑态传入初值；创建态为 null。
  initial: DictWord | null;
  readOnly?: boolean;
  onCancel: () => void;
  onSubmit: (values: WordFormValues) => void;
}

const posOpts = toOptions(POS_OPTIONS);
const cefrOpts = toOptions(CEFR_OPTIONS);

// 词条创建/编辑/查看三态复用的表单弹窗。readOnly 时禁用所有控件、隐藏确定按钮。
export function WordFormModal({
  open,
  fixedType,
  initial,
  readOnly = false,
  onCancel,
  onSubmit
}: Props) {
  const [form] = Form.useForm<WordFormValues>();

  // 打开时同步初值：编辑/查看回填词条，创建置空并预设类型。
  useEffect(() => {
    if (!open) return;
    if (initial) {
      form.setFieldsValue({
        word: initial.word,
        type: initial.type,
        meaning: initial.meaning,
        pos: initial.pos,
        difficulty: initial.difficulty
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ type: fixedType, pos: [], difficulty: [] });
    }
  }, [open, initial, fixedType, form]);

  const title = readOnly
    ? "查看词条"
    : initial
      ? `编辑${initial.type}`
      : `创建${fixedType}`;

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onCancel}
      okText="保存"
      cancelText={readOnly ? "关闭" : "取消"}
      okButtonProps={readOnly ? { style: { display: "none" } } : undefined}
      onOk={() => {
        form
          .validateFields()
          .then((values) => onSubmit({ ...values, type: fixedType }))
          .catch(() => undefined);
      }}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        disabled={readOnly}
        style={{ marginTop: 12 }}
      >
        <Form.Item
          name="word"
          label={fixedType === "短语" ? "短语" : "词汇"}
          rules={[{ required: true, message: "请输入内容" }]}
        >
          <Input placeholder={`请输入${fixedType}`} allowClear />
        </Form.Item>
        <Form.Item
          name="meaning"
          label="释义"
          rules={[{ required: true, message: "请输入释义" }]}
        >
          <Input.TextArea
            placeholder="请输入释义，多条释义以分号分隔"
            autoSize={{ minRows: 2, maxRows: 4 }}
            allowClear
          />
        </Form.Item>
        <Form.Item
          name="pos"
          label="基本词性"
          rules={[{ required: true, message: "请选择基本词性" }]}
        >
          <Select
            mode="multiple"
            placeholder="请选择基本词性"
            options={posOpts}
            allowClear
          />
        </Form.Item>
        <Form.Item
          name="difficulty"
          label="难度"
          rules={[{ required: true, message: "请选择难度" }]}
        >
          <Select
            mode="multiple"
            placeholder="请选择 CEFR 难度等级"
            options={cefrOpts}
            allowClear
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
