import { Card } from "@tsz/ui";

// 教师任务与班级尚未开放。
export function TaskManager() {
  return (
    <section>
      <h1 className="mb-4 text-xl font-bold">任务管理</h1>
      <Card>教师布置任务暂未开放。学生可在“我的学习任务”中创建个人任务。</Card>
    </section>
  );
}
