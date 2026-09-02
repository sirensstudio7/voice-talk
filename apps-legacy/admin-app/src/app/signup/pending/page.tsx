import Link from "next/link";
import { ClockIcon } from "@heroicons/react/24/outline";

export default function SignupPendingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-[440px] rounded-2xl border border-slate-200/80 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <ClockIcon className="size-7" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-slate-900">Awaiting approval</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Thanks for signing up. Your demo access request has been received and is waiting for
          admin approval. You&apos;ll be able to sign in once your account is approved.
        </p>
        <Link
          href="/login?fresh=1"
          className="mt-8 inline-flex w-full items-center justify-center rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
