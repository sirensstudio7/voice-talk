"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BuildingOffice2Icon, CheckIcon, ChevronDownIcon, PlusIcon } from "@heroicons/react/24/outline";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SidebarMenuButton,
} from "@voicetalk/ui";
import { useAuth } from "@/lib/auth";
import { adminPath, stripBusinessSlug } from "@/lib/admin-path";
import { usePathname } from "next/navigation";

export function BusinessSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const { businesses, business, setBusinessId } = useAuth();
  const [canCreate, setCanCreate] = useState(true);
  const label = business?.name ?? "Select business";

  const pathSuffix = stripBusinessSlug(pathname, business?.slug || null);

  const handleBusinessSelect = (id: string) => {
    const next = businesses.find((item) => item.id === id);
    setBusinessId(id);
    if (!next?.slug) return;

    const currentSlug = business?.slug;
    if (currentSlug && (pathname === `/${currentSlug}` || pathname.startsWith(`/${currentSlug}/`))) {
      router.push(adminPath(next.slug, pathSuffix));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          tooltip={label}
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <BuildingOffice2Icon className="size-4" />
          </div>
          <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">{label}</span>
            <span className="truncate text-xs text-sidebar-foreground/70">
              {business?.tagline ?? "Lorescale Admin"}
            </span>
          </div>
          <ChevronDownIcon className="ml-auto size-4 shrink-0 text-sidebar-foreground/70" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">Businesses</DropdownMenuLabel>
        {businesses.map((item) => {
          const selected = item.id === business?.id;
          return (
            <DropdownMenuItem
              key={item.id}
              onSelect={() => handleBusinessSelect(item.id)}
              className="gap-2 p-2"
            >
              <div className="flex size-6 shrink-0 items-center justify-center rounded-md border">
                <BuildingOffice2Icon className="size-3.5 shrink-0" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.name}</p>
                {item.tagline ? (
                  <p className="truncate text-xs text-muted-foreground">{item.tagline}</p>
                ) : null}
              </div>
              {selected ? <CheckIcon className="ml-auto size-4 shrink-0" /> : null}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            if (canCreate) {
              router.push("/onboarding/workspace?new=1");
            } else {
              router.push("/billing");
            }
          }}
          className="gap-2 p-2"
        >
          <div className="flex size-6 shrink-0 items-center justify-center rounded-md border border-dashed">
            <PlusIcon className="size-3.5 shrink-0" />
          </div>
          <span className="font-medium">{canCreate ? "New workspace" : "Upgrade to add workspace"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
