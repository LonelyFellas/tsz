import type { AdminColumn } from "@/components/AdminTable";
import { FullNameEnCell } from "./FullNameEnCell";
import type { PartFieldValues } from "./PartOfSpeechSharedFields";
export const detailColumns: AdminColumn<PartFieldValues>[] = [
  { id: "sort", label: "序号", width: 64, render: (row) => row.sort_order },
  {
    id: "name_zh",
    label: "正式中文",
    width: 130,
    render: (row) => row.name_zh
  },
  {
    id: "short_name_zh",
    label: "简洁显示",
    width: 120,
    render: (row) => row.short_name_zh
  },
  {
    id: "name_en",
    label: "正式英文",
    width: 160,
    render: (row) => row.name_en
  },
  {
    id: "abbreviation",
    label: "英文缩写",
    width: 100,
    render: (row) => row.abbreviation
  },
  {
    id: "full_name_en",
    label: "英文全称",
    width: 170,
    render: (row) => <FullNameEnCell value={row.full_name_en} />
  }
];
