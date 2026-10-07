import { LearningTaskPage } from "@/features/task/components/LearningTasks";
export default async function Page({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LearningTaskPage id={id} />;
}
