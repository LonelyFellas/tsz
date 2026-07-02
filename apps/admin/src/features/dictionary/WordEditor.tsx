import {
  Alert,
  App,
  Breadcrumb,
  Button,
  Card,
  Flex,
  Form,
  Spin,
  Tag
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { AdminWord, Dialect, DialectMode } from "@tsz/types";
import { HttpError, isIncompleteHttpError } from "@tsz/api-client/http";
import { usePublishWord, useSaveWordContent, useWordDetail } from "./api";
import { DetailsList } from "./DetailsList";
import { KIND_LABEL, STATUS_LABEL } from "./labels";
import { BasicInfoSection } from "./word-editor/BasicInfoSection";
import { EditorFooter } from "./word-editor/EditorFooter";
import { fromWire, toWire, type EditorFormValues } from "./word-editor/mapping";
import { PosTabsSection } from "./word-editor/PosTabsSection";
import { SectionTitle } from "./word-editor/SectionTitle";
import { SenseRangesSection } from "./word-editor/SenseRangesSection";

/** 非表单的词条元信息:headword/kind 创建后不可改;updatedAt 是乐观锁基准。 */
interface WordMeta {
  headword: string;
  kind: AdminWord["kind"];
  status: AdminWord["status"];
  updatedAt: string;
}

// 词条编辑整页富表单的组合根:按路由 :wordId 加载整棵树 → 表单;
// 保存 = PUT 整树替换(带 base_updated_at 乐观锁);提交 = 先保存再 publish。
export function WordEditor() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const { wordId = "" } = useParams();
  const [form] = Form.useForm<EditorFormValues>();

  const detail = useWordDetail(wordId);
  const saveContent = useSaveWordContent();
  const publishWord = usePublishWord();
  const [meta, setMeta] = useState<WordMeta | null>(null);

  const dialectMode = Form.useWatch("dialectMode", form) as
    DialectMode | undefined;
  const dialects = Form.useWatch("dialects", form) as Dialect[] | undefined;
  // 仅在「需区分方言」时按所选方言渲染词形/语法分块;否则各分区回退到单一 common 块。
  // memo 保引用稳定:保存等状态翻转的重渲染不击穿 PosTabPane 的 memo。
  const activeDialects = useMemo<Dialect[]>(
    () => (dialectMode === "distinguish" ? (dialects ?? []) : []),
    [dialectMode, dialects]
  );

  /** 用服务端返回的整棵树刷新表单与乐观锁基准(保存/加载/冲突重载共用)。 */
  const syncFromWord = useCallback(
    (word: AdminWord) => {
      setMeta({
        headword: word.headword,
        kind: word.kind,
        status: word.status,
        updatedAt: word.updated_at
      });
      form.resetFields();
      form.setFieldsValue(fromWire(word));
    },
    [form]
  );

  // 首次加载与「他人已修改」后的重取:updated_at 变了才同步,
  // 避免保存后的缓存失效重取把用户刚开始的下一轮编辑清掉。
  useEffect(() => {
    const word = detail.data?.word;
    if (word && word.updated_at !== meta?.updatedAt) syncFromWord(word);
  }, [detail.data, meta?.updatedAt, syncFromWord]);

  const handleSaveError = (err: unknown) => {
    if (err instanceof HttpError && err.status === 409) {
      // 乐观锁冲突:不能拿原 body 直接重试(会覆盖别人的工作),引导重新加载。
      modal.confirm({
        title: "词条已被他人修改",
        content:
          "在你编辑期间其他人保存过该词条。需要重新加载最新内容(当前未保存的修改将丢失),再重新编辑。",
        okText: "重新加载",
        cancelText: "留在本页",
        onOk: () => detail.refetch()
      });
      return;
    }
    if (isIncompleteHttpError(err)) {
      // 已发布词条的保存也要过完整性检查:不能把线上词条改残。
      modal.warning({
        title: "已发布词条不能保存为不完整状态",
        content: <DetailsList details={err.details} />
      });
      return;
    }
    message.error(err instanceof Error ? err.message : "保存失败");
  };

  /** 保存整树;成功返回最新 Word(已同步进表单),失败返回 null(错误已就地提示)。 */
  const doSave = async (): Promise<AdminWord | null> => {
    if (!meta) return null;
    const values = form.getFieldsValue(true) as EditorFormValues;
    try {
      const { word } = await saveContent.mutateAsync({
        wordId,
        input: toWire(values, meta.updatedAt)
      });
      syncFromWord(word);
      return word;
    } catch (err) {
      handleSaveError(err);
      return null;
    }
  };

  const handleSaveDraft = async () => {
    const word = await doSave();
    if (word) message.success("已保存");
  };

  const handlePublish = async (retried = false): Promise<void> => {
    try {
      const { word } = await publishWord.mutateAsync(wordId);
      syncFromWord(word);
      message.success(`「${word.headword}」已发布`);
    } catch (err) {
      if (isIncompleteHttpError(err)) {
        modal.warning({
          title: "内容不完整,无法发布",
          content: <DetailsList details={err.details} />
        });
        return;
      }
      // 检查与发布之间恰好有并发保存 → 按文档重试一次提交即可。
      if (err instanceof HttpError && err.status === 409 && !retried) {
        return handlePublish(true);
      }
      message.error(err instanceof Error ? err.message : "发布失败");
    }
  };

  const handleSubmit = async () => {
    try {
      await form.validateFields();
    } catch {
      message.warning("请完善必填项");
      return;
    }
    // 提交 = 先落盘再发布:发布检查跑在服务端已保存的树上。
    const word = await doSave();
    if (word) await handlePublish();
  };

  if (detail.isPending) {
    return (
      <Flex justify="center" style={{ paddingTop: 120 }}>
        <Spin size="large" />
      </Flex>
    );
  }

  if (detail.isError || !meta) {
    return (
      <Alert
        type="error"
        showIcon
        title="词条加载失败"
        description={detail.error?.message ?? "词条不存在或已被删除"}
        action={
          <Flex vertical gap={8}>
            <Button size="small" onClick={() => void detail.refetch()}>
              重试
            </Button>
            <Button size="small" onClick={() => navigate("/words")}>
              返回列表
            </Button>
          </Flex>
        }
      />
    );
  }

  return (
    // 满宽填满内容区（与列表页一致），不设上限——超宽屏也不留两侧空白。
    // 单词等易过宽的字段各自设了 maxWidth，不会因满宽被拉伸失衡。
    <div style={{ paddingBottom: 72 }}>
      <Flex align="center" gap={12} style={{ marginBottom: 16 }}>
        <Breadcrumb
          items={[
            { title: "词库管理" },
            { title: <a onClick={() => navigate("/words")}>智能词库</a> },
            { title: `${KIND_LABEL[meta.kind]}「${meta.headword}」` }
          ]}
        />
        <Tag color={meta.status === "published" ? "success" : "default"}>
          {STATUS_LABEL[meta.status]}
        </Tag>
      </Flex>

      <Form form={form} layout="vertical">
        <Flex gap={16} wrap align="stretch" style={{ marginBottom: 16 }}>
          <BasicInfoSection
            headword={meta.headword}
            dialectMode={dialectMode}
          />
          <SenseRangesSection />
        </Flex>

        <Card
          title={<SectionTitle ai>基本词性</SectionTitle>}
          styles={{ header: { border: "none" }, body: { paddingTop: 0 } }}
        >
          <PosTabsSection form={form} activeDialects={activeDialects} />
        </Card>
      </Form>

      <EditorFooter
        saving={saveContent.isPending}
        publishing={publishWord.isPending}
        onSaveDraft={() => void handleSaveDraft()}
        onGenerateVoice={() => message.info("生成语音属于后续的音频模块")}
        onSubmit={() => void handleSubmit()}
      />
    </div>
  );
}
