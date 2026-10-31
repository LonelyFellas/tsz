import { LearningTaskCreator } from "@/features/task/components/LearningTasks";
export default async function Page({
  searchParams
}: {
  searchParams: Promise<{
    wordlist?: string | string[];
    source?: string | string[];
  }>;
}) {
  const params = await searchParams;
  return (
    <LearningTaskCreator
      wordlistId={
        typeof params.wordlist === "string" ? params.wordlist : undefined
      }
      owned={params.source === "owned"}
    />
  );
}
