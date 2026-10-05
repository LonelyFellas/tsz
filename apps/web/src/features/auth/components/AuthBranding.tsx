// 认证页共用的桌面品牌区；移动端让表单独占屏幕。
export function AuthBranding() {
  return (
    <aside className="hidden min-h-screen flex-col justify-between bg-primary px-10 py-12 text-white lg:flex lg:w-[40%] xl:px-16 xl:py-16 dark:bg-primary-muted">
      <div className="flex items-center gap-3">
        <span
          className="flex size-10 items-center justify-center rounded-xl bg-white text-lg font-semibold text-primary"
          aria-hidden="true"
        >
          天
        </span>
        <span className="text-lg font-semibold tracking-wide">天生会背</span>
      </div>
      <div>
        <h2 className="text-4xl font-semibold leading-[1.4] tracking-tight xl:text-[42px]">
          把学过的，
          <br />
          真正记住。
        </h2>
        <p className="mt-5 text-sm leading-7 text-white/80">
          科学记忆，让每一步学习都更扎实。
        </p>
      </div>
      <p className="text-sm text-white/65">天生会背 · 智能英语单词学习平台</p>
    </aside>
  );
}
