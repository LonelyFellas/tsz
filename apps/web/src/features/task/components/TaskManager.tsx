import { Card } from "@tsz/ui";

// 任务管理:创建每日/长期任务 → 选词表 → 选对象(个人/班级)→ 设题量与截止 → 完成创建。
export function TaskManager() {
  return (
    <section>
      <h1 className="mb-4 text-xl font-bold">任务管理</h1>
      <Card>每日任务 / 长期任务 的创建向导在此实现。</Card>
    </section>
  );
}
