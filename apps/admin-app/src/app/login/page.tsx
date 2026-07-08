import { Suspense } from "react";

import { LoginPageClient } from "./login-page-client";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
        </div>
      }
    >
      <LoginPageClient />
    </Suspense>
  );
}
