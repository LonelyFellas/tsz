import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CertificationFile,
  TeacherApplication,
  TeacherApplicationStatus
} from "@tsz/types";
import {
  Alert,
  App,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Flex,
  Form,
  Image,
  Input,
  Modal,
  Result,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography
} from "antd";
import { useEffect, useState } from "react";
import { api, useAuthStore, useIsSuperAdmin } from "@/lib/auth";
import { RevokeTeacherButton } from "./RevokeTeacherButton";

const statuses: Record<
  TeacherApplicationStatus,
  { label: string; color: string }
> = {
  pending: { label: "待审核", color: "blue" },
  approved: { label: "已通过", color: "green" },
  rejected: { label: "已驳回", color: "orange" },
  revoked: { label: "已撤销", color: "red" }
};
const kinds = {
  id_front: "身份证人像面",
  id_back: "身份证国徽面",
  education: "学历证书",
  language: "语言成绩"
};

export function TeacherApplicationsPage() {
  const allowed = useIsSuperAdmin();
  return allowed ? (
    <ApplicationQueue />
  ) : (
    <Result status="403" title="仅超级管理员可查看认证材料与审核" />
  );
}

function PrivateMaterial({ file }: { file: CertificationFile }) {
  const owner = useAuthStore((state) => state.profile?.id);
  const [preview, setPreview] = useState<{
    id: string;
    owner?: string;
    url?: string;
    failed?: boolean;
  }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    void api.teacherCertification
      .file(file.id, { signal: controller.signal })
      .then((blob) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setPreview({ id: file.id, owner, url });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setPreview({ id: file.id, owner, failed: true });
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [file.id, owner, attempt]);
  const current =
    preview?.id === file.id && preview.owner === owner ? preview : undefined;
  return (
    <div style={{ width: 160 }}>
      <Typography.Text type="secondary">{kinds[file.kind]}</Typography.Text>
      <div style={{ minHeight: 120, marginTop: 8 }}>
        {current?.url ? (
          <Image
            src={current.url}
            alt={kinds[file.kind]}
            width={160}
            height={120}
            style={{ objectFit: "contain" }}
          />
        ) : current?.failed ? (
          <Button onClick={() => setAttempt((value) => value + 1)}>
            重新读取
          </Button>
        ) : (
          <Spin />
        )}
      </div>
    </div>
  );
}

function ApplicationQueue() {
  const adminId = useAuthStore((state) => state.profile?.id);
  const client = useQueryClient();
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<TeacherApplicationStatus | undefined>(
    "pending"
  );
  const [selected, setSelected] = useState<string>();
  const [action, setAction] = useState<{
    application: TeacherApplication;
    decision: "approve" | "reject";
  }>();
  const [form] = Form.useForm<{ reason?: string }>();
  const list = useQuery({
    queryKey: ["teacher-applications", adminId, page, pageSize, status],
    queryFn: () => api.teacherCertification.list(page, pageSize, status)
  });
  const detail = useQuery({
    queryKey: ["teacher-application", adminId, selected],
    queryFn: () => api.teacherCertification.detail(selected!),
    enabled: !!selected
  });
  const mutation = useMutation({
    mutationFn: ({ reason }: { reason?: string }) =>
      api.teacherCertification.review(
        action!.application.id,
        action!.decision,
        reason?.trim()
      ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["teacher-applications"] }),
        client.invalidateQueries({ queryKey: ["teacher-application"] }),
        client.invalidateQueries({ queryKey: ["admin-users"] })
      ]);
      setAction(undefined);
      void message.success("审核结果已保存并通知申请人");
    }
  });
  function review(
    application: TeacherApplication,
    decision: "approve" | "reject"
  ) {
    form.resetFields();
    mutation.reset();
    setAction({ application, decision });
  }
  const application = detail.data?.application;
  return (
    <>
      <Flex
        align="center"
        justify="space-between"
        wrap
        gap={16}
        style={{ marginBottom: 20 }}
      >
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            教师申请审核
          </Typography.Title>
          <Typography.Text type="secondary">
            认证材料仅限超级管理员查看，审核结果将发送站内通知。
          </Typography.Text>
        </div>
        <Space>
          <Select
            aria-label="认证状态"
            allowClear
            placeholder="全部状态"
            value={status}
            style={{ width: 140 }}
            options={Object.entries(statuses).map(([value, label]) => ({
              value,
              label: label.label
            }))}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
          <Button onClick={() => void list.refetch()}>刷 新</Button>
        </Space>
      </Flex>
      {list.isError && (
        <Alert
          type="error"
          title={list.error.message}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      <Table<TeacherApplication>
        rowKey="id"
        loading={list.isFetching}
        dataSource={list.data?.items ?? []}
        scroll={{ x: 760 }}
        pagination={{
          current: page,
          pageSize,
          total: list.data?.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
          onChange: (next, size) => {
            setPage(next);
            setPageSize(size);
          }
        }}
        columns={[
          { title: "姓名", dataIndex: "real_name" },
          { title: "联系方式", dataIndex: "contact" },
          {
            title: "提交时间",
            dataIndex: "submitted_at",
            render: (value: string) => new Date(value).toLocaleString()
          },
          {
            title: "状态",
            dataIndex: "status",
            render: (value: TeacherApplicationStatus) => (
              <Tag color={statuses[value].color}>{statuses[value].label}</Tag>
            )
          },
          {
            title: "操作",
            key: "actions",
            render: (_, row) => (
              <Button type="link" onClick={() => setSelected(row.id)}>
                查看材料
              </Button>
            )
          }
        ]}
      />
      <Drawer
        title="认证资料"
        open={!!selected}
        onClose={() => setSelected(undefined)}
        size={820}
        destroyOnHidden
      >
        {detail.isPending ? (
          <Spin />
        ) : detail.isError ? (
          <Alert
            type="error"
            title={detail.error.message}
            action={
              <Button onClick={() => void detail.refetch()}>重 试</Button>
            }
          />
        ) : application ? (
          <Space orientation="vertical" size="large" style={{ width: "100%" }}>
            <Descriptions
              column={1}
              bordered
              items={[
                { key: "name", label: "姓名", children: application.real_name },
                {
                  key: "contact",
                  label: "联系方式",
                  children: application.contact
                },
                {
                  key: "status",
                  label: "状态",
                  children: statuses[application.status].label
                },
                {
                  key: "statement",
                  label: "认证说明",
                  children: (
                    <div style={{ whiteSpace: "pre-wrap" }}>
                      {application.statement}
                    </div>
                  )
                },
                ...(application.review_reason
                  ? [
                      {
                        key: "review",
                        label: "审核原因",
                        children: application.review_reason
                      }
                    ]
                  : []),
                ...(application.revoke_reason
                  ? [
                      {
                        key: "revoke",
                        label: "撤销原因",
                        children: application.revoke_reason
                      }
                    ]
                  : [])
              ]}
            />
            <Image.PreviewGroup>
              <Flex wrap gap={16}>
                {detail.data.files.map((file) => (
                  <PrivateMaterial key={file.id} file={file} />
                ))}
              </Flex>
            </Image.PreviewGroup>
            {application.status === "pending" && (
              <Space>
                <Button
                  type="primary"
                  onClick={() => review(application, "approve")}
                >
                  通 过
                </Button>
                <Button danger onClick={() => review(application, "reject")}>
                  驳 回
                </Button>
              </Space>
            )}
            {application.status === "approved" && (
              <RevokeTeacherButton userId={application.user_id} />
            )}
          </Space>
        ) : (
          <Empty />
        )}
      </Drawer>
      <Modal
        title={action?.decision === "approve" ? "通过教师认证" : "驳回教师申请"}
        open={!!action}
        confirmLoading={mutation.isPending}
        okText={action?.decision === "approve" ? "确认通过" : "确认驳回"}
        cancelText="取 消"
        onOk={() => form.submit()}
        onCancel={() => {
          if (!mutation.isPending) setAction(undefined);
        }}
        destroyOnHidden
      >
        {action?.decision === "approve" && (
          <p>通过后，该账号将新增教师身份，学生身份保持不变。</p>
        )}
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          onFinish={(value) => mutation.mutate(value)}
        >
          {action?.decision === "reject" && (
            <Form.Item
              name="reason"
              label="驳回原因"
              rules={[
                { required: true, whitespace: true, message: "请填写驳回原因" },
                { max: 2000 }
              ]}
            >
              <Input.TextArea
                rows={4}
                maxLength={2000}
                showCount
                disabled={mutation.isPending}
              />
            </Form.Item>
          )}
        </Form>
        {mutation.error && (
          <Alert type="error" title={mutation.error.message} showIcon />
        )}
      </Modal>
    </>
  );
}
