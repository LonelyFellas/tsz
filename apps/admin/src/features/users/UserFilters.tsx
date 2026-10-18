// 用户管理搜索行：单一关键词（昵称 / 手机号 / 邮箱）+ 注册时间 + 搜索 / 重置。
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Card, DatePicker, Form, Input, Space } from "antd";
import type { UserFilterValues } from "./listQuery";

interface Props {
  onSearch: (values: UserFilterValues) => void;
  onReset: () => void;
}

export function UserFilters({ onSearch, onReset }: Props) {
  const [form] = Form.useForm<UserFilterValues>();

  return (
    <Card size="small" styles={{ body: { paddingBottom: 8 } }}>
      <Form
        form={form}
        layout="inline"
        onFinish={onSearch}
        style={{ rowGap: 12, columnGap: 8, display: "flex", flexWrap: "wrap" }}
      >
        <Form.Item name="q" label="关键词">
          <Input
            placeholder="手机号 / 邮箱 / 用户昵称"
            allowClear
            style={{ width: 240 }}
          />
        </Form.Item>
        <Form.Item name="registeredDate" label="注册时间">
          <DatePicker placeholder="请选择日期" style={{ width: 160 }} />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" icon={<SearchOutlined />} htmlType="submit">
              搜索
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                form.resetFields();
                onReset();
              }}
            >
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
}
