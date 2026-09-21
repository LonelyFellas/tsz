import { useState } from "react";
import { Button, Modal, Typography } from "antd";
import { SwapOutlined, UndoOutlined } from "@ant-design/icons";
import type { WordPronunciationV3 } from "@tsz/types";
export function V3ActualPronunciationCopy({
  pronunciation,
  onChange
}: {
  pronunciation: WordPronunciationV3;
  onChange: (patch: Partial<WordPronunciationV3>) => void;
}) {
  const [pending, setPending] = useState<{
    source: string;
    previous: string;
  }>();
  const [history, setHistory] = useState<{
    value: string;
    rich: WordPronunciationV3["actual_pron_rich"];
    applied: string;
  }>();
  const hasAnnotations =
    pronunciation.actual_pron_rich &&
    (!("annotations" in pronunciation.actual_pron_rich) ||
      pronunciation.actual_pron_rich.annotations.length > 0);
  const apply = () => {
    setHistory({
      value: pronunciation.actual_pron,
      rich: pronunciation.actual_pron_rich,
      applied: pronunciation.dict_phonetic
    });
    onChange({
      actual_pron: pronunciation.dict_phonetic,
      actual_pron_rich: {
        version: 2,
        text: pronunciation.dict_phonetic,
        annotations: []
      }
    });
    setPending(undefined);
  };
  return (
    <>
      <Button
        type="text"
        icon={<SwapOutlined />}
        aria-label="从字典音标填入实际发音"
        title="从字典音标填入实际发音（不自动生成连读）"
        disabled={!pronunciation.dict_phonetic.trim()}
        onClick={() =>
          pronunciation.actual_pron || hasAnnotations
            ? setPending({
                source: pronunciation.dict_phonetic,
                previous: JSON.stringify([
                  pronunciation.actual_pron,
                  pronunciation.actual_pron_rich
                ])
              })
            : apply()
        }
      />
      {history &&
        history.applied === pronunciation.actual_pron &&
        !hasAnnotations && (
          <Button
            type="text"
            icon={<UndoOutlined />}
            aria-label="撤销实际发音填入"
            onClick={() => {
              onChange({
                actual_pron: history.value,
                actual_pron_rich: history.rich ?? {
                  version: 2,
                  text: history.value,
                  annotations: []
                }
              });
              setHistory(undefined);
            }}
          />
        )}
      <Modal
        title="替换实际发音？"
        open={Boolean(pending)}
        okText="应用"
        cancelText="取消"
        onCancel={() => setPending(undefined)}
        onOk={() => {
          if (
            pending?.source === pronunciation.dict_phonetic &&
            pending.previous ===
              JSON.stringify([
                pronunciation.actual_pron,
                pronunciation.actual_pron_rich
              ])
          )
            apply();
          else setPending(undefined);
        }}
      >
        <Typography.Paragraph>
          将填入字典音标，并清除原实际发音上的标注；应用后可以撤销。
        </Typography.Paragraph>
        <Typography.Text>{pending?.source}</Typography.Text>
      </Modal>
    </>
  );
}
