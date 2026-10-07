import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  App,
  Alert,
  Button,
  Flex,
  Modal,
  Space,
  Table,
  Typography
} from "antd";
import { useEffect, useRef, useState } from "react";
import { HttpError } from "@tsz/api-client";
import type { PermissionPreviewResponse } from "@tsz/types";
import { api } from "@/lib/auth";

/** 单人和批量共用服务端展开的精确差异；前端不私自补依赖或整集覆盖。 */
export function permissionCommitFromPreview(
  preview: PermissionPreviewResponse
) {
  return {
    catalog_version: preview.catalog_version,
    targets: preview.targets.map(
      ({ admin_id, expected_version, grant, revoke }) => ({
        admin_id,
        expected_version,
        grant,
        revoke
      })
    )
  };
}

export function PermissionChangeDialog({
  catalogVersion,
  adminIds,
  adminNames,
  permissionLabels,
  expectedVersions,
  grant,
  revoke,
  onClose,
  onCommitted
}: {
  catalogVersion: string;
  adminIds: string[];
  adminNames?: Record<string, string>;
  permissionLabels?: Record<string, string>;
  expectedVersions?: Record<string, number>;
  grant: string[];
  revoke: string[];
  onClose: () => void;
  onCommitted: () => void;
}) {
  const { message } = App.useApp();
  const client = useQueryClient();
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const recoveryStarted = useRef(false);
  const [recovery, setRecovery] = useState<"reading" | "read" | "failed">();
  const conflict = recovery !== undefined;
  const [current, setCurrent] = useState<PermissionPreviewResponse>();
  const preview = useQuery({
    queryKey: [
      "permission-preview",
      catalogVersion,
      adminIds,
      expectedVersions,
      grant,
      revoke
    ],
    queryFn: () =>
      api.permissionSystem.preview({
        catalog_version: catalogVersion,
        targets: adminIds.map((admin_id) => ({
          admin_id,
          expected_version: expectedVersions?.[admin_id]
        })),
        grant,
        revoke
      }),
    retry: false,
    staleTime: 0
  });

  // 提交结果未知或版本冲突后只回读事实，不复用旧 expected_version 再次提交。
  // 不带增删和预期版本的 preview 是批量只读快照，无需逐人再发请求。
  const reread = async () => {
    setCurrent(undefined);
    setRecovery("reading");
    try {
      const catalog = await api.permissionSystem.catalog();
      const snapshot = await api.permissionSystem.preview({
        catalog_version: catalog.catalog_version,
        targets: adminIds.map((admin_id) => ({ admin_id })),
        grant: [],
        revoke: []
      });
      setCurrent(snapshot);
      setRecovery("read");
    } catch {
      setRecovery("failed");
    }
  };
  useEffect(() => {
    if (
      preview.error instanceof HttpError &&
      preview.error.status === 409 &&
      !recoveryStarted.current
    ) {
      recoveryStarted.current = true;
      void reread();
    }
    // 仅响应本次预览的确定性冲突，不随父级数组引用变化重复回读。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview.error]);

  const close = () => {
    if (saving || recovery === "reading") return;
    if (conflict)
      void client.invalidateQueries({ queryKey: ["permission-system"] });
    onClose();
  };
  const commit = async () => {
    if (!preview.data || conflict || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await api.permissionSystem.commit(
        permissionCommitFromPreview(preview.data)
      );
      await client.invalidateQueries({ queryKey: ["permission-system"] });
      message.success("权限已保存");
      onCommitted();
    } catch (error) {
      if (
        !(error instanceof HttpError) ||
        error.status >= 500 ||
        error.status === 409
      ) {
        recoveryStarted.current = true;
        await reread();
      } else {
        message.error(error.message);
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  const describePermissions = (keys: string[]) =>
    keys.map((key) => permissionLabels?.[key] ?? key).join("、") || "无";
  const renderChanges = (
    keys: string[],
    dependencies: string[],
    automaticLabel: "自动补齐" | "自动取消"
  ) => {
    const direct = keys.filter((key) => !dependencies.includes(key));
    return (
      <Flex vertical gap={4}>
        {(direct.length > 0 || dependencies.length === 0) && (
          <span title={direct.join("、")}>{describePermissions(direct)}</span>
        )}
        {dependencies.length > 0 && (
          <Typography.Text
            title={dependencies.join("、")}
            type={automaticLabel === "自动补齐" ? "warning" : "danger"}
            style={{ fontSize: 12 }}
          >
            {automaticLabel}：<span>{describePermissions(dependencies)}</span>
          </Typography.Text>
        )}
      </Flex>
    );
  };
  const adminColumn = {
    title: "管理员",
    render: (_: unknown, row: PermissionPreviewResponse["targets"][number]) => (
      <Typography.Text title={row.admin_id}>
        {adminNames?.[row.admin_id] ?? row.admin_id}
      </Typography.Text>
    )
  };

  return (
    <Modal
      open
      title="权限变更预览"
      width={720}
      closable={!saving && recovery !== "reading"}
      onCancel={close}
      footer={
        <Space>
          <Button disabled={saving || recovery === "reading"} onClick={close}>
            取消
          </Button>
          {conflict ? (
            <Button disabled={saving || recovery === "reading"} onClick={close}>
              返回查看
            </Button>
          ) : (
            <Button
              type="primary"
              disabled={!preview.data || preview.isFetching || preview.isError}
              loading={saving}
              onClick={() => void commit()}
            >
              保存变更
            </Button>
          )}
        </Space>
      }
    >
      {recovery === "reading" && (
        <Alert type="info" title="正在确认当前权限，请勿重复保存。" />
      )}
      {recovery === "read" && (
        <Alert
          type="warning"
          showIcon
          title="已重新读取当前权限。请核对后返回，重新选择需要的调整。"
        />
      )}
      {recovery === "failed" && (
        <Alert
          type="warning"
          showIcon
          title="暂时无法确认是否保存成功，请重新查看后再操作"
          action={<Button onClick={() => void reread()}>重新查看</Button>}
        />
      )}
      {preview.isError && !conflict && (
        <Alert
          type="error"
          title={preview.error.message}
          action={
            <Button onClick={() => void preview.refetch()}>重新查看</Button>
          }
        />
      )}
      {conflict ? (
        current && (
          <Table
            loading={recovery === "reading"}
            rowKey="admin_id"
            pagination={false}
            dataSource={current?.targets ?? []}
            columns={[
              adminColumn,
              {
                title: "当前权限",
                render: (_, row) => (
                  <span title={row.after.join("、")}>
                    {describePermissions(row.after)}
                  </span>
                )
              }
            ]}
          />
        )
      ) : (
        <Table
          loading={preview.isFetching}
          rowKey="admin_id"
          pagination={false}
          dataSource={preview.data?.targets ?? []}
          columns={[
            adminColumn,
            {
              title: "开通",
              render: (_, row) =>
                renderChanges(row.grant, row.dependency_grants, "自动补齐")
            },
            {
              title: "取消",
              render: (_, row) =>
                renderChanges(
                  row.revoke,
                  row.dependency_revocations,
                  "自动取消"
                )
            }
          ]}
        />
      )}
    </Modal>
  );
}
