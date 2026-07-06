import { DashboardAuthGate } from "@/components/dashboard-auth-gate";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardAuthGate>{children}</DashboardAuthGate>;
}
