// 任务与班级 —— 老师创建任务,学生练习打卡。

export type TaskType = "daily" | "longterm";

/** 任务对象:个人 / 班级。 */
export type TaskTargetType = "user" | "class";

export interface Task {
  id: string;
  type: TaskType;
  creatorId: string;
  wordListIds: string[];
  targetType: TaskTargetType;
  targetIds: string[];
  /** 每日任务:每天题目数量与截止时间 */
  dailyQuestionCount?: number;
  deadline?: string;
  createdAt: string;
}

export interface ClassRoom {
  id: string;
  name: string;
  teacherId: string;
  studentIds: string[];
  /** 系统为班级生成的长期任务 */
  longTermTaskIds: string[];
  createdAt: string;
}

/** 学生练习记录 / 每日打卡。 */
export interface PracticeRecord {
  id: string;
  studentId: string;
  taskId: string;
  date: string; // YYYY-MM-DD
  /** 当日是否完成所有练习 */
  completed: boolean;
  /** 完成后获得的天生币 */
  coinsEarned: number;
}
