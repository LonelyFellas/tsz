import { PlusOutlined } from "@ant-design/icons";
import { Select } from "antd";
import type {
  DraftFormsStepContentV3,
  PartOfSpeechCatalogItem,
  PartOfSpeechCatalogResponse
} from "@tsz/types";

export interface V3AddBasicPosSelectProps {
  catalog?: PartOfSpeechCatalogResponse;
  forms: DraftFormsStepContentV3;
  isError?: boolean;
  isPending?: boolean;
  onAdd: (item: PartOfSpeechCatalogItem) => void;
}

export function V3AddBasicPosSelect({
  catalog,
  forms,
  isError = false,
  isPending = false,
  onAdd
}: V3AddBasicPosSelectProps) {
  const usedPosCodes = new Set(forms.pos.map((pos) => pos.pos));
  const availableItems = (catalog?.items ?? []).filter(
    (item) => !usedPosCodes.has(item.code)
  );

  return (
    <Select
      aria-label="添加基本词性"
      className="word-add-basic-pos-select"
      disabled={isError || isPending}
      loading={isPending}
      onChange={(code) => {
        const item = availableItems.find(
          (candidate) => candidate.code === code
        );
        if (item) onAdd(item);
      }}
      options={availableItems.map((item) => ({
        value: item.code,
        label: item.name_zh
      }))}
      placeholder="添加基本词性"
      style={{ width: 190 }}
      suffixIcon={<PlusOutlined />}
      value={undefined}
    />
  );
}
