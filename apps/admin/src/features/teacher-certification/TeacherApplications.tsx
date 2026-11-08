import { AdminTable as Table } from "@/components/AdminTable";
import { TableEmptyState } from "@/components/TableEmptyState";
import { RotateCwIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CertificationFile,
  TeacherApplication,
  TeacherApplicationStatus
} from "@tsz/types";
import {
  Alert,
  Breadcrumb,
  PageHeader,
  Button,
  Card,
  Descriptions,
  Empty,
  Flex,
  Image,
  Result,
  Space,
  Spin,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { App, Drawer, Modal } from "@tsz/ui/admin/overlays";
import { Form, Input, Select } from "@tsz/ui/admin/forms";
import { useEffect, useState } from "react";
import { api, useAuthStore, usePermission } from "@/lib/auth";
import { useTeacherTranslation, TeacherText, TeacherError } from "./i18n";
import { RevokeTeacherButton } from "./RevokeTeacherButton";

const statuses: Record<TeacherApplicationStatus, { color: string }> = {
  pending: { color: "blue" },
  approved: { color: "green" },
  rejected: { color: "orange" },
  revoked: { color: "red" }
};

export function TeacherApplicationsPage() {
  const { t } = useTeacherTranslation();
  const allowed = usePermission("teacherapply.access");
  return allowed ? (
    <ApplicationQueue />
  ) : (
    <Result status="403" title={t("no_access")} />
  );
}

function PrivateMaterial({ file }: { file: CertificationFile }) {
  const { t } = useTeacherTranslation();
  const allowed = usePermission(
    file.kind === "id_front" || file.kind === "id_back"
      ? "teacherapply.read_identity"
      : "teacherapply.read_certificates"
  );
  const owner = useAuthStore((state) => state.profile?.id);
  const [preview, setPreview] = useState<{
    id: string;
    owner?: string;
    url?: string;
    failed?: boolean;
  }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!allowed) return;
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
  }, [file.id, owner, attempt, allowed]);
  const current =
    preview?.id === file.id && preview.owner === owner ? preview : undefined;
  if (!allowed) return null;
  return (
    <div style={{ width: 160 }}>
      <Typography.Text type="secondary">{t(file.kind)}</Typography.Text>
      <div style={{ minHeight: 120, marginTop: 8 }}>
        {current?.url ? (
          <Image
            src={current.url}
            alt={t(file.kind)}
            width={160}
            height={120}
            style={{ objectFit: "contain" }}
          />
        ) : current?.failed ? (
          <Button onClick={() => setAttempt((value) => value + 1)}>
            {t("reread")}
          </Button>
        ) : (
          <Spin />
        )}
      </div>
    </div>
  );
}

function ApplicationQueue() {
  const { t } = useTeacherTranslation();
  const canReview = usePermission("teacherapply.review");
  const canReadCertificates = usePermission("teacherapply.read_certificates");
  const canReadIdentity = usePermission("teacherapply.read_identity");
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
      void message.success(<TeacherText message="success" />);
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
    <Flex vertical gap={16}>
      <PageHeader
        title={t("title")}
        breadcrumb={
          <Breadcrumb
            aria-label={t("breadcrumb")}
            items={[{ title: t("reviews") }]}
          />
        }
      />

      <Card size="small">
        {list.isError && (
          <Alert
            type="error"
            title={<TeacherError error={list.error} />}
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        <Table<TeacherApplication>
          toolbar={
            <Form className="admin-filter-form" colon={false} layout="inline">
              <Form.Item label={t("review_status")}>
                <Select
                  aria-label={t("certification_status")}
                  allowClear
                  placeholder={t("all_statuses")}
                  value={status}
                  style={{ width: 140 }}
                  options={Object.keys(statuses).map((value) => ({
                    value,
                    label: t(value as TeacherApplicationStatus)
                  }))}
                  onChange={(value) => {
                    setStatus(value);
                    setPage(1);
                  }}
                />
              </Form.Item>
              <Form.Item className="admin-filter-actions">
                <Button
                  icon={<RotateCwIcon />}
                  onClick={() => void list.refetch()}
                >
                  {t("refresh")}
                </Button>
              </Form.Item>
            </Form>
          }

          tableId="teacher-applications"
          locale={{
            emptyText: (
              <TableEmptyState
                message={t(status === "pending" ? "empty_pending" : "empty")}
                filtered={status !== undefined && status !== "pending"}
                onResetFilters={() => {
                  setStatus("pending");
                  setPage(1);
                }}
              />
            )
          }}
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
            { title: t("name"), dataIndex: "real_name" },
            { title: t("contact"), dataIndex: "contact" },
            {
              title: t("submitted"),
              dataIndex: "submitted_at",
              render: (value: string) => new Date(value).toLocaleString()
            },
            {
              title: t("status"),
              dataIndex: "status",
              render: (value: TeacherApplicationStatus) => (
                <Tag color={statuses[value].color}>{t(value)}</Tag>
              )
            },
            {
              title: t("actions"),
              key: "actions",
              render: (_, row) => (
                <Button type="link" onClick={() => setSelected(row.id)}>
                  {t("view")}
                </Button>
              )
            }
          ]}
        />
      </Card>
      <Drawer
        title={t("materials")}
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
            title={<TeacherError error={detail.error} />}
            action={
              <Button onClick={() => void detail.refetch()}>
                {t("retry")}
              </Button>
            }
          />
        ) : application ? (
          <Space orientation="vertical" size="large" style={{ width: "100%" }}>
            <Descriptions
              column={1}
              bordered
              items={[
                {
                  key: "name",
                  label: t("name"),
                  children: application.real_name
                },
                {
                  key: "contact",
                  label: t("contact"),
                  children: application.contact
                },
                {
                  key: "status",
                  label: t("status"),
                  children: t(application.status)
                },
                {
                  key: "statement",
                  label: t("statement"),
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
                        label: t("review_reason"),
                        children: application.review_reason
                      }
                    ]
                  : []),
                ...(application.revoke_reason
                  ? [
                      {
                        key: "revoke",
                        label: t("revoke_reason"),
                        children: application.revoke_reason
                      }
                    ]
                  : [])
              ]}
            />
            {canReadCertificates || canReadIdentity ? (
              <Image.PreviewGroup>
                <Flex wrap gap={16}>
                  {detail.data.files.map((file) => (
                    <PrivateMaterial key={file.id} file={file} />
                  ))}
                </Flex>
              </Image.PreviewGroup>
            ) : (
              <Alert type="info" title={t("no_material_access")} />
            )}
            {canReview && application.status === "pending" && (
              <Space>
                <Button
                  type="primary"
                  onClick={() => review(application, "approve")}
                >
                  {t("approve")}
                </Button>
                <Button danger onClick={() => review(application, "reject")}>
                  {t("reject")}
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
        title={t(
          action?.decision === "approve" ? "approve_title" : "reject_title"
        )}
        open={!!action}
        confirmLoading={mutation.isPending}
        okText={t(
          action?.decision === "approve" ? "confirm_approve" : "confirm_reject"
        )}
        cancelText={t("cancel")}
        onOk={() => form.submit()}
        onCancel={() => {
          if (!mutation.isPending) setAction(undefined);
        }}
        destroyOnHidden
      >
        {action?.decision === "approve" && <p>{t("approve_help")}</p>}
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          onFinish={(value) => {
            if (canReview) mutation.mutate(value);
          }}
        >
          {action?.decision === "reject" && (
            <Form.Item
              name="reason"
              label={t("rejection_reason")}
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: <TeacherText message="reason_required" />
                },
                {
                  max: 2000,
                  message: (
                    <TeacherText message="reason_max" params={{ max: 2000 }} />
                  )
                }
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
          <Alert
            type="error"
            title={<TeacherError error={mutation.error} />}
            showIcon
          />
        )}
      </Modal>
    </Flex>
  );
}
