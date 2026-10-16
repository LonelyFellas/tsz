import { redirect } from "next/navigation";
export const metadata = {
  title: "我的词表",
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const { folder } = await searchParams;
  redirect(
    `/account/wordlists?space=owned&mode=new${folder ? `&folder=${encodeURIComponent(folder)}` : ""}`
  );
}
