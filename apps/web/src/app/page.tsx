import Link from "next/link";

// 入口:落地后引导到登录或主区。真实项目里可在此根据 session 重定向。
export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-6 py-24 text-center">
      <h1 className="text-3xl font-bold">天生字</h1>
      <p className="text-gray-500">词汇学习平台 · 师生合一</p>
      <div className="flex gap-4">
        <Link href="/login" className="text-blue-600 underline">
          登录
        </Link>
        <Link href="/wordlists" className="text-blue-600 underline">
          浏览词表
        </Link>
      </div>
    </main>
  );
}
