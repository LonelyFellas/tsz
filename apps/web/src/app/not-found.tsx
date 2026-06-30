import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">404</h1>
      <p className="text-foreground-muted">页面不存在</p>
      <Link href="/" className="text-primary underline">
        返回首页
      </Link>
    </div>
  );
}
