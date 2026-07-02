// 「添加关联词」搜索弹窗:GET /admin/words/related-search 选定目标词条+词义。
// 草稿阶段可只选词条不选词义(发布前必须补上,V10);快照字段服务端写,这里只回传选择。
import { useState } from "react";
import {
  Alert,
  Empty,
  Input,
  List,
  Modal,
  Space,
  Spin,
  Tag,
  Typography
} from "antd";
import type { RelatedWordResult } from "@tsz/types";
import { useRelatedSearch } from "../api";
import { KIND_LABEL } from "../labels";

const { Text } = Typography;

export interface RelatedTarget {
  wordId: string;
  senseId?: string;
  headword: string;
  gloss?: string;
}

export function RelatedWordModal({
  open,
  title,
  onSelect,
  onClose
}: {
  open: boolean;
  title: string;
  onSelect: (target: RelatedTarget) => void;
  onClose: () => void;
}) {
  // 回车/点按钮才搜(q 为提交后的词);空查询后端也返回空结果,直接不发请求。
  const [q, setQ] = useState("");
  const search = useRelatedSearch(q, open);

  const pick = (target: RelatedTarget) => {
    onSelect(target);
    onClose();
  };

  const results: RelatedWordResult[] = search.data?.results ?? [];

  return (
    <Modal
      open={open}
      title={title}
      footer={null}
      onCancel={onClose}
      afterOpenChange={(visible) => {
        if (!visible) setQ("");
      }}
      destroyOnHidden
    >
      <Input.Search
        placeholder="输入词汇搜索(前缀命中优先)"
        allowClear
        autoFocus
        enterButton
        onSearch={(value) => setQ(value)}
        style={{ marginBottom: 12 }}
      />
      {search.isError && (
        <Alert
          type="error"
          showIcon
          title="搜索失败"
          description={search.error.message}
          style={{ marginBottom: 12 }}
        />
      )}
      {search.isFetching ? (
        <Spin style={{ display: "block", margin: "24px auto" }} />
      ) : results.length === 0 ? (
        <Empty
          description={q ? "无匹配词条" : "输入词汇开始搜索"}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <List
          size="small"
          dataSource={results}
          style={{ maxHeight: 360, overflowY: "auto" }}
          renderItem={(item) => (
            <List.Item style={{ display: "block" }}>
              <Space size={8} style={{ marginBottom: 4 }}>
                <Text strong>{item.headword}</Text>
                <Tag>{KIND_LABEL[item.kind]}</Tag>
                {/* 草稿阶段允许只选词条,发布前再补词义 */}
                <a
                  onClick={() =>
                    pick({ wordId: item.word_id, headword: item.headword })
                  }
                >
                  仅选词条
                </a>
              </Space>
              {item.senses.map((s) => (
                <div key={s.sense_id} style={{ paddingLeft: 8 }}>
                  <a
                    onClick={() =>
                      pick({
                        wordId: item.word_id,
                        senseId: s.sense_id,
                        headword: item.headword,
                        gloss: s.gloss
                      })
                    }
                  >
                    {s.gloss || "(无释义)"}
                  </a>
                </div>
              ))}
            </List.Item>
          )}
        />
      )}
    </Modal>
  );
}
