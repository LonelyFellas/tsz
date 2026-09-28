"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode
} from "react";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import {
  readWorkspaceIdentity,
  resolveWorkspaceIdentity,
  writeWorkspaceIdentity,
  type WorkspaceIdentity
} from "./identity";

interface TeacherIdentity {
  identity: WorkspaceIdentity;
  verified: boolean;
  ready: boolean;
  error: boolean;
  select: (identity: WorkspaceIdentity) => Promise<void>;
}
const Context = createContext<TeacherIdentity>({
  identity: "student",
  verified: false,
  ready: false,
  error: false,
  select: async () => {}
});

function subscribePreference(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("workspace-identity-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("workspace-identity-change", callback);
  };
}

export function TeacherIdentityProvider({ children }: { children: ReactNode }) {
  const userId = useUserStore((s) => s.user?.id);
  const hydrated = useUserStore((s) => s.hydrated);
  const pathname = usePathname();
  const router = useRouter();
  const client = useQueryClient();
  const currentUser = useRef(userId);
  const previousUser = useRef<string | undefined>(undefined);
  const preference = useSyncExternalStore<WorkspaceIdentity>(
    subscribePreference,
    useCallback(
      () => (userId ? readWorkspaceIdentity(userId) : "student"),
      [userId]
    ),
    () => "student"
  );
  const query = useQuery({
    queryKey: ["teacher-certification", userId],
    queryFn: ({ signal }) => api.teacherCertification.mine({ signal }),
    enabled: hydrated && !!userId,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: "always"
  });
  const ready = !!userId && query.isSuccess;
  const verified = ready && query.data?.teacher_verified === true;
  const identity = resolveWorkspaceIdentity(preference, verified);

  useEffect(() => {
    const previous = previousUser.current;
    previousUser.current = userId;
    if (previous && previous !== userId) {
      client.removeQueries({ queryKey: ["teacher-certification", previous] });
      client.removeQueries({ queryKey: ["notifications", previous] });
    }
    currentUser.current = userId;
  }, [userId, client]);

  useEffect(() => {
    if (!userId) return;
    function sync(event: StorageEvent) {
      if (event.key !== `tsz:workspace:${userId}` && event.key !== null) return;
      const next = readWorkspaceIdentity(userId!);
      if (next === "student" && pathname.startsWith("/teacher/"))
        router.replace("/student/practice");
      if (next === "teacher" && verified && pathname.startsWith("/student/"))
        router.replace("/teacher/classes");
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [userId, pathname, router, verified]);

  useEffect(() => {
    if (!userId || !ready) return;
    if (!verified) {
      writeWorkspaceIdentity(userId, "student");
      if (pathname.startsWith("/teacher/")) router.replace("/student/practice");
      return;
    }
    const mode = pathname.startsWith("/teacher/")
      ? "teacher"
      : pathname.startsWith("/student/")
        ? "student"
        : null;
    if (mode) {
      writeWorkspaceIdentity(userId, mode);
    }
  }, [userId, ready, verified, pathname, router]);

  useEffect(() => {
    if (userId && pathname.startsWith("/teacher/"))
      void client.invalidateQueries({
        queryKey: ["teacher-certification", userId]
      });
  }, [pathname, userId, client]);

  async function select(next: WorkspaceIdentity) {
    if (!userId) return;
    if (next === "teacher") {
      const result = await query.refetch();
      if (currentUser.current !== userId) return;
      if (result.isError) throw new Error("暂时无法核验教师资格，请重试");
      if (!result.data?.teacher_verified)
        throw new Error("当前账号尚未通过教师认证");
    }
    if (!writeWorkspaceIdentity(userId, next))
      throw new Error("无法保存工作台偏好，请检查浏览器存储设置后重试");
    router.push(next === "teacher" ? "/teacher/classes" : "/student/practice");
  }

  return (
    <Context.Provider
      value={{ identity, verified, ready, error: query.isError, select }}
    >
      {children}
    </Context.Provider>
  );
}

export function useTeacherIdentity() {
  return useContext(Context);
}

export function TeacherAccessGuard({ children }: { children: ReactNode }) {
  const identity = useTeacherIdentity();
  const client = useQueryClient();
  const userId = useUserStore((s) => s.user?.id);
  if (identity.error)
    return (
      <div role="alert">
        <p>无法核验教师资格，请重试。</p>
        <button
          className="mt-3 text-primary"
          onClick={() =>
            void client.invalidateQueries({
              queryKey: ["teacher-certification", userId]
            })
          }
        >
          重新核验
        </button>
      </div>
    );
  if (!identity.ready || !identity.verified)
    return <p role="status">正在核验教师资格…</p>;
  return <>{children}</>;
}
