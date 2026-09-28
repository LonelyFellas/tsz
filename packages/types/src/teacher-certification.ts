export type TeacherApplicationStatus =
  "pending" | "approved" | "rejected" | "revoked";
export type CertificationFileKind =
  "id_front" | "id_back" | "education" | "language";

export interface CertificationFile {
  id: string;
  kind: CertificationFileKind;
  content_type: string;
  size_bytes: number;
}

export interface TeacherApplication {
  id: string;
  user_id: string;
  real_name: string;
  contact: string;
  statement: string;
  status: TeacherApplicationStatus;
  submitted_at: string;
  reviewed_at: string | null;
  review_reason: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
}

export interface TeacherCertification {
  teacher_verified: boolean;
  application: TeacherApplication | null;
  files: CertificationFile[];
}

export interface TeacherApplicationDetail {
  application: TeacherApplication;
  files: CertificationFile[];
}

export interface SubmitTeacherApplication {
  real_name: string;
  contact: string;
  statement: string;
  id_front: string;
  id_back: string;
  education_files: string[];
  language_files: string[];
}

export interface UserNotification {
  id: string;
  application_id: string | null;
  kind: "teacher_approved" | "teacher_rejected" | "teacher_revoked";
  reason: string | null;
  created_at: string;
  read_at: string | null;
}

export interface NotificationList {
  items: UserNotification[];
  total: number;
  unread_count: number;
}
