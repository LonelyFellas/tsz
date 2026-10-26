import type { Metadata } from "next";
import { RouteGuard } from "@/features/auth/components/RouteGuard";
import { DictionaryDetail } from "@/features/dictionary/DictionaryDetail";
export const metadata: Metadata = {
  title: "词条详情",
  robots: { index: false, follow: false }
};
export default async function DictionaryEntryPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const back = `/dictionary?${new URLSearchParams({ q: typeof search.q === "string" ? search.q.slice(0, 100) : "", page: String(Math.max(1, Math.floor((typeof search.page === "string" ? Number(search.page) : 1) || 1))) })}`;
  return (
    <RouteGuard>
      <DictionaryDetail id={id} back={back} />
    </RouteGuard>
  );
}
