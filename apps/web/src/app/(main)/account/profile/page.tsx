import { EditProfileForm } from "@/features/auth/components/EditProfileForm";
import { RouteGuard } from "@/features/auth/components/RouteGuard";

// 编辑资料:需登录(不强制 onboarding——任何已登录用户都应可编辑资料)。
export default function EditProfilePage() {
  return (
    <RouteGuard>
      <EditProfileForm />
    </RouteGuard>
  );
}
