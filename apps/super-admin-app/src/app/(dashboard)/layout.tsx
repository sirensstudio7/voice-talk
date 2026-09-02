import { Suspense } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { AdminLayout } from "@/components/layout/AdminLayout";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <AdminLayout>{children}</AdminLayout>
      </Suspense>
    </AuthGate>
  );
}
