import { redirect } from "next/navigation";
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
  if (typeof params.wordlist !== "string" || !params.wordlist)
    redirect("/wordlists");
  return (
    <LearningTaskCreator
      wordlistId={params.wordlist}
      owned={params.source === "owned"}
      directPractice
    />
  );
}
