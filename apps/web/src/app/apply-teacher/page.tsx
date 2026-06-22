import { ApplyTeacherForm } from "@/features/auth";

// 申请成为老师:填写资料 → 提交审核 →(被拒)查看拒绝原因。
export default function ApplyTeacherPage() {
  return (
    <main className="mx-auto max-w-lg py-12">
      <h1 className="mb-6 text-2xl font-bold">申请成为老师</h1>
      <ApplyTeacherForm />
    </main>
  );
}
