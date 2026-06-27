import { HomeActions } from "@/features/auth";

// 入口:落地后根据登录状态展示登录或「进入学习 / 退出登录」。
export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-6 py-24 text-center">
      <h1 className="text-3xl font-bold">天生字</h1>
      <p className="text-gray-500">词汇学习平台 · 师生合一</p>
      <HomeActions />
    </main>
  );
}
