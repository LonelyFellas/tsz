// 班级类型仍为后续功能占位；真实学习任务见 learning-tasks.ts。
export interface ClassRoom {
  id: string;
  name: string;
  teacher_id: string;
  student_ids: string[];
  /** 系统为班级生成的长期任务 */
  long_term_task_ids: string[];
  created_at: string;
}
