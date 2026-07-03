import type { Metadata } from "next";
import { WordListDetail } from "@/features/wordlist";
import { MOCK_DICT_LIST } from "@/features/wordlist/data/mockDictWords";

// TODO(词表): 接后端后 generateMetadata 按 id 拉取词表名,mock 阶段仅有一份词表。
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: MOCK_DICT_LIST.name,
    description: `${MOCK_DICT_LIST.creator_name} 创建的词表,含多维释义与语法结构,支持英式/美式切换。`
  };
}

export default async function WordListDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WordListDetail id={id} />;
}
