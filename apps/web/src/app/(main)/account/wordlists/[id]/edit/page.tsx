import { WordListCreator } from "@/features/wordlist";
import { RouteGuard } from "@/features/auth/components/RouteGuard";
export const metadata = {
  title: "我的词表",
  robots: { index: false, follow: false }
};
export default async function Page({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RouteGuard>
      <WordListCreator id={id} />
    </RouteGuard>
  );
}
