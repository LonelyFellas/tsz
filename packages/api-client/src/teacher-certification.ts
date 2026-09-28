import type {
  CertificationFile,
  CertificationFileKind,
  NotificationList,
  SubmitTeacherApplication,
  TeacherApplication,
  TeacherApplicationDetail,
  TeacherApplicationStatus,
  TeacherCertification,
  UserNotification
} from "@tsz/types";
import type { HttpClient } from "./http";

export function createTeacherCertificationEndpoints(http: HttpClient) {
  return {
    mine: (opts?: { signal?: AbortSignal }) =>
      http.get<TeacherCertification>("/me/teacher-certification", opts),
    submit: (input: SubmitTeacherApplication) =>
      http.post<TeacherApplication>(
        "/me/teacher-certification/applications",
        input
      ),
    detail: (id: string) =>
      http.get<TeacherApplicationDetail>(
        `/me/teacher-certification/applications/${encodeURIComponent(id)}`
      ),
    upload: (kind: CertificationFileKind, file: Blob) =>
      http.upload<CertificationFile>(
        `/me/teacher-certification/files?kind=${encodeURIComponent(kind)}`,
        file
      ),
    file: (id: string, opts?: { signal?: AbortSignal }) =>
      http.getBlob(
        `/me/teacher-certification/files/${encodeURIComponent(id)}`,
        opts
      ),
    removeFile: (id: string) =>
      http.del<void>(
        `/me/teacher-certification/files/${encodeURIComponent(id)}`
      ),
    notifications: (page = 1, pageSize = 20) =>
      http.get<NotificationList>(
        `/me/notifications?page=${page}&page_size=${pageSize}`
      ),
    readNotification: (id: string) =>
      http.patch<UserNotification>(
        `/me/notifications/${encodeURIComponent(id)}/read`
      )
  };
}

export function createAdminTeacherCertificationEndpoints(http: HttpClient) {
  return {
    list: (page = 1, pageSize = 20, status?: TeacherApplicationStatus) =>
      http.get<{ items: TeacherApplication[]; total: number }>(
        `/teacher-applications?page=${page}&page_size=${pageSize}${status ? `&status=${encodeURIComponent(status)}` : ""}`
      ),
    detail: (id: string) =>
      http.get<TeacherApplicationDetail>(
        `/teacher-applications/${encodeURIComponent(id)}`
      ),
    review: (id: string, decision: "approve" | "reject", reason?: string) =>
      http.post<TeacherApplication>(
        `/teacher-applications/${encodeURIComponent(id)}/review`,
        { decision, reason }
      ),
    revoke: (userId: string, reason: string) =>
      http.del<{ teacher_verified: boolean }>(
        `/users/${encodeURIComponent(userId)}/teacher-certification`,
        { reason }
      ),
    file: (id: string, opts?: { signal?: AbortSignal }) =>
      http.getBlob(
        `/teacher-certification/files/${encodeURIComponent(id)}`,
        opts
      )
  };
}
