import { ReviewWorkspace } from "@/features/review/ReviewWorkspace";
export default async function Page({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReviewWorkspace sessionId={id} />;
}
