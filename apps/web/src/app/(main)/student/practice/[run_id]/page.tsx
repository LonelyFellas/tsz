import { LearningPractice } from "@/features/task/components/LearningTasks";
export default async function Page({
  params
}: {
  params: Promise<{ run_id: string }>;
}) {
  const { run_id } = await params;
  return <LearningPractice id={run_id} />;
}
