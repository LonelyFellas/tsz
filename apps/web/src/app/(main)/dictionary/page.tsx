import type { Metadata } from "next";
import { RouteGuard } from "@/features/auth/components/RouteGuard";
import { Dictionary } from "@/features/dictionary/Dictionary";
export const metadata: Metadata = {
  title: "词典",
  robots: { index: false, follow: false }
};
export default async function DictionaryPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query =
    typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const page = Math.min(
    100000,
    Math.max(
      1,
      Math.floor(
        (typeof params.page === "string" ? Number(params.page) : 1) || 1
      )
    )
  );
  return (
    <RouteGuard>
      <Dictionary key={`${query}:${page}`} query={query} page={page} />
    </RouteGuard>
  );
}
