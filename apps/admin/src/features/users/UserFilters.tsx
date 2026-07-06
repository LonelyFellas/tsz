// 用户管理搜索行：用户昵称 / 手机号 / 邮箱号码 / 注册时间 + 搜索 / 重置。
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
        <Form.Item name="nickname" label="用户昵称">
          <Input
            placeholder="请输入用户昵称"
            allowClear
            style={{ width: 180 }}
          />
        </Form.Item>
        <Form.Item name="phone" label="手机号">
          <Input placeholder="请输入手机号" allowClear style={{ width: 160 }} />
        </Form.Item>
        <Form.Item name="email" label="邮箱号码">
          <Input
            placeholder="请输入邮箱号码"
            allowClear
            style={{ width: 200 }}
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
