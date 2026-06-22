import { WordListDetail } from "@/features/wordlist";

export default async function WordListDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WordListDetail id={id} />;
}
