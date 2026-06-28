// 首页页脚——Apple 风细排版:浅灰底,小字号,顶部细分隔线。
export function HomeFooter() {
  return (
    <footer className="bg-gray-50">
      <div className="mx-auto w-full max-w-5xl px-6">
        <div className="flex flex-col gap-3 border-t border-gray-200 py-8 text-sm text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <p>天生会背 · 词汇学习平台</p>
          <p>© {new Date().getFullYear()} 保留所有权利</p>
        </div>
      </div>
    </footer>
  );
}
