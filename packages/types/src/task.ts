// 任务与班级 —— 老师创建任务,学生练习打卡。

export type TaskType = "daily" | "longterm";

/** 任务对象:个人 / 班级。 */
export type TaskTargetType = "user" | "class";

export interface Task {
  id: string;
  type: TaskType;
  creator_id: string;
  word_list_ids: string[];
  target_type: TaskTargetType;
  target_ids: string[];
  /** 每日任务:每天题目数量与截止时间 */
  daily_question_count?: number;
  deadline?: string;
  created_at: string;
}

export interface ClassRoom {
  id: string;
  name: string;
  teacher_id: string;
  student_ids: string[];
  /** 系统为班级生成的长期任务 */
  long_term_task_ids: string[];
  created_at: string;
}

/** 学生练习记录 / 每日打卡。 */
export interface PracticeRecord {
  id: string;
  student_id: string;
  task_id: string;
  date: string; // YYYY-MM-DD
  /** 当日是否完成所有练习 */
  completed: boolean;
  /** 完成后获得的天生币 */
  coins_earned: number;
}
