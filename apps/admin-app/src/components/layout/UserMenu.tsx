"use client";

import { useRouter } from "next/navigation";
import {
  ArrowRightOnRectangleIcon,
  BanknotesIcon,
  BuildingOffice2Icon,
  ChevronDownIcon,
  Cog6ToothIcon,
  ReceiptPercentIcon,
} from "@heroicons/react/24/outline";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@voicetalk/ui";

function userInitials(user: { name?: string; email: string }) {
  if (user.name?.trim()) {
    return user.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }
  return user.email[0]?.toUpperCase() ?? "?";
}

export function UserMenu({
  user,
  onLogout,
}: {
  user: { name?: string; email: string };
  onLogout: () => void;
}) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hidden items-center gap-2.5 rounded-md px-1 py-1 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:flex"
        >
          <div className="flex min-w-0 flex-col items-end gap-0.5">
            <p className="max-w-[12rem] truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <div
            className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-orange-400 to-orange-500"
            aria-hidden="true"
          >
            <span className="text-xs font-semibold text-white">{userInitials(user)}</span>
          </div>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/workspaces")}>
          <BuildingOffice2Icon />
          Workspace
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/billing")}>
          <ReceiptPercentIcon />
          Billing
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/transactions")}>
          <BanknotesIcon />
          Transactions
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/settings")}>
          <Cog6ToothIcon />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onLogout();
            router.push("/login");
          }}
        >
          <ArrowRightOnRectangleIcon />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
