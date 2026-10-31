import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Checkbox,
  Flex,
  Modal,
  Space,
  Spin,
  Table,
  Tag,
  Typography
} from "antd";
import { ImportOutlined, ReloadOutlined } from "@ant-design/icons";
import { HttpError } from "@tsz/api-client";
import type { LexiconFormCandidatesResponse } from "@tsz/types";
import { expandFormContents, isSharedForms } from "@tsz/shared";
import { api } from "@/lib/auth";
import { newWordNodeId } from "../word-model/primitives";
import { formTypeLabel } from "../word-creation-v3/presentation";
import { assistantSnapshot, type AssistantEditorContext } from "./context";
import {
  planFormCandidates,
  type CandidateImportRow
} from "./formCandidatesModel";

interface Preview {
  response: LexiconFormCandidatesResponse;
  formsSnapshot: string;
  catalogSnapshot: string;
}

export function FormCandidates({
  context,
  disabled,
  onBusyChange
}: {
  context: AssistantEditorContext;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<Preview>();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const request = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => request.current?.abort(), []);
  const allowed =
    !!context.applyForms && !!context.catalog && isSharedForms(context.forms);
  const stale =
    !!preview &&
    (preview.formsSnapshot !== JSON.stringify(context.forms) ||
      preview.catalogSnapshot !== JSON.stringify(context.catalog) ||
      preview.response.base_revision !== context.word.revision ||
      preview.response.entry_id !== context.word.id);
  const plan = useMemo(() => {
    if (!preview || !context.catalog || stale) return undefined;
    try {
      return planFormCandidates(
        context.forms,
        preview.response.pos.filter((row) => selected.includes(row.pos)),
        context.catalog.items
      );
    } catch {
      return undefined;
    }
  }, [preview, selected, context.forms, context.catalog, stale]);
  const generate = async () => {
    if (!allowed || disabled || request.current || !context.catalog) return;
    const snapshot = assistantSnapshot(context);
    const forms = expandFormContents(context.forms);
    const base = forms.pos
      .flatMap((pos) => pos.forms)
      .find((form) => form.form_type === "base")?.regional_variants;
    const baseSpelling = base
      ? base.mode === "common"
        ? base.common.spelling
        : base.us.spelling.trim() || base.uk.spelling
      : "";
    const headword = (
      baseSpelling.trim() ||
      (context.word.presentation.matched_surfaces.find(
        (value) => value.trim() && !/^未命名词条/u.test(value)
      ) ??
        context.word.presentation.label)
    ).trim();
    if (!headword || /^未命名词条/u.test(headword)) {
      setError("请先填写词条拼写");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    onBusyChange(true);
    setError(undefined);
    const formsSnapshot = JSON.stringify(context.forms),
      catalogSnapshot = JSON.stringify(context.catalog);
    try {
      const response = await api.lexiconAssistant.formCandidates(
        {
          entry_id: context.word.id,
          base_revision: context.word.revision,
          context_id: newWordNodeId(),
          catalog_version: context.catalog.catalog_version,
          headword,
          local_content: snapshot.local_content
        },
        controller.signal
      );
      if (request.current !== controller || controller.signal.aborted) return;
      setPreview({ response, formsSnapshot, catalogSnapshot });
      setSelected(response.pos.map((row) => row.pos));
    } catch (cause) {
      if (request.current === controller && !controller.signal.aborted)
        setError(
          cause instanceof HttpError && cause.status === 409
            ? "词条或词性目录已更新，请刷新后重新生成。"
            : "未能生成有效候选，请重试。当前草稿已保留。"
        );
    } finally {
      if (request.current === controller) {
        request.current = undefined;
        setPending(false);
        onBusyChange(false);
      }
    }
  };
  const close = () => {
    request.current?.abort();
    request.current = undefined;
    setPending(false);
    onBusyChange(false);
    setOpen(false);
  };
  const apply = () => {
    if (!plan?.changed || !preview || stale || !allowed || pending || disabled)
      return;
    if (!context.applyForms?.(plan.forms, preview.formsSnapshot)) {
      setError("草稿或编辑状态已变化，请重新生成候选。");
      return;
    }
    setOpen(false);
    void message.success(`已导入 ${plan.changed} 项词形内容，请核对后保存草稿`);
  };
  const pronunciation = (side: "uk" | "us", row: CandidateImportRow) => (
    <Flex vertical gap={4}>
      <Typography.Text strong>{row[side].spelling}</Typography.Text>
      <Typography.Text>
        {row[side].dict_phonetic || "音标待填写"}
      </Typography.Text>
      <Typography.Text type="secondary">
        实际发音：{row[`${side}_actual`] || "转换未完成，需核对"}
      </Typography.Text>
    </Flex>
  );
  return (
    <>
      <Button
        icon={<ImportOutlined />}
        disabled={!allowed || disabled || pending}
        onClick={() => {
          setOpen(true);
          void generate();
        }}
      >
        生成词性与发音候选
      </Button>
      <Modal
        title="预览词性与发音候选"
        centered
        styles={{
          body: { maxHeight: "calc(100dvh - 200px)", overflowY: "auto" }
        }}
        open={open}
        onCancel={close}
        width="min(960px, calc(100vw - 32px))"
        footer={
          <Space wrap>
            <Button aria-label="取消" onClick={close}>
              取消
            </Button>
            <Button
              icon={<ReloadOutlined />}
              loading={pending}
              disabled={!allowed || disabled}
              onClick={() => void generate()}
            >
              重新生成
            </Button>
            <Button
              type="primary"
              disabled={
                !allowed || disabled || pending || stale || !plan?.changed
              }
              onClick={apply}
            >
              导入当前草稿{plan?.changed ? `（${plan.changed}）` : ""}
            </Button>
          </Space>
        }
      >
        <Flex vertical gap={16}>
          <Alert
            type="info"
            showIcon
            title="AI 候选需人工核对"
            description="导入所选词性下可补充的内容，保留已有填写。实际发音及 Azure IPA 使用系统转换；不会自动生成音频、保存或发布。"
          />
          {error && <Alert type="error" showIcon title={error} />}
          {stale && (
            <Alert
              type="warning"
              showIcon
              title="当前草稿或词性目录已变化，请重新生成候选"
            />
          )}
          {pending && (
            <Spin description="正在生成词性、词形和音标候选…">
              <div style={{ minHeight: 100 }} />
            </Spin>
          )}
          {preview && (
            <>
              <Typography.Text type="secondary">
                {preview.response.headword} · AI 建议 ·{" "}
                {preview.response.usage.model}
              </Typography.Text>
              <Checkbox.Group
                value={selected}
                onChange={(value) => setSelected(value as string[])}
                options={preview.response.pos.map((row) => ({
                  value: row.pos,
                  label:
                    context.catalog?.items.find((item) => item.code === row.pos)
                      ?.name_zh ?? row.pos
                }))}
                disabled={pending || stale}
              />
              <Table<CandidateImportRow>
                size="small"
                pagination={false}
                rowKey="key"
                scroll={{ x: 700 }}
                dataSource={plan?.rows ?? []}
                columns={[
                  {
                    title: "词性 / 词形",
                    key: "form",
                    width: 140,
                    render: (_, row) => (
                      <Flex vertical>
                        <span>
                          {context.catalog?.items.find(
                            (item) => item.code === row.pos
                          )?.name_zh ?? row.pos}
                        </span>
                        <span>
                          {context.catalog?.form_types?.find(
                            (type) => type.code === row.form_type
                          )?.name_zh ?? formTypeLabel(row.form_type)}
                        </span>
                      </Flex>
                    )
                  },
                  {
                    title: "英式",
                    key: "uk",
                    render: (_, row) => pronunciation("uk", row)
                  },
                  {
                    title: "美式",
                    key: "us",
                    render: (_, row) => pronunciation("us", row)
                  },
                  {
                    title: "导入处理",
                    key: "result",
                    width: 180,
                    render: (_, row) => (
                      <>
                        <Tag color={row.changed ? "blue" : "default"}>
                          {row.changed ? "待导入" : "保留现有"}
                        </Tag>
                        <div>{row.message}</div>
                      </>
                    )
                  }
                ]}
              />
              {preview.response.notes.length > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  title="核查提示"
                  description={preview.response.notes.join("；")}
                />
              )}
              {!pending && !stale && !plan?.changed && (
                <Typography.Text type="secondary">
                  当前没有可安全补充的内容，可在编辑器中核对后重试。
                </Typography.Text>
              )}
            </>
          )}
        </Flex>
      </Modal>
    </>
  );
}
