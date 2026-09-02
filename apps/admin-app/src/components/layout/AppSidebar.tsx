"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, type ComponentType } from "react";
import {
  BookOpenIcon,
  CalendarDaysIcon,
  CameraIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  PuzzlePieceIcon,
  MagnifyingGlassIcon,
  QrCodeIcon,
  QueueListIcon,
  ReceiptPercentIcon,
  PresentationChartBarIcon,
  SparklesIcon,
  Squares2X2Icon,
  SwatchIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@voicetalk/ui";
import { adminPath, matchAdminPath } from "@/lib/admin-path";
import { useAuth } from "@/lib/auth";
import { customerAppUrl } from "@/lib/customer-app";
import { BusinessSwitcher } from "./BusinessSwitcher";

type IconComponent = ComponentType<{ className?: string }>;

type NavItem = {
  href: string;
  label: string;
  icon: IconComponent;
  requiresMenu?: boolean;
  requiresOrdering?: boolean;
  requiresBooking?: boolean;
  salonLabel?: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Overview", icon: Squares2X2Icon },
      { href: "/analytics", label: "Analytics", icon: ChartBarIcon },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        href: "/menu",
        label: "Menu",
        icon: QueueListIcon,
        requiresMenu: true,
        salonLabel: "Treatments",
      },
      {
        href: "/appointments",
        label: "Appointments",
        icon: CalendarDaysIcon,
        requiresBooking: true,
      },
      { href: "/schedule", label: "Schedule", icon: ClockIcon, requiresBooking: true },
      { href: "/orders", label: "Orders", icon: ReceiptPercentIcon, requiresOrdering: true },
      { href: "/payment", label: "Payment QR", icon: QrCodeIcon, requiresOrdering: true },
    ],
  },
  {
    label: "AI Assistant",
    items: [
      { href: "/knowledge", label: "AI Knowledge", icon: BookOpenIcon },
      { href: "/presentations", label: "AI Presenter", icon: PresentationChartBarIcon },
      { href: "/ai-rules", label: "AI Rules", icon: SparklesIcon },
      { href: "/vision-settings", label: "Vision Settings", icon: CameraIcon },
    ],
  },
  {
    label: "Engagement",
    items: [
      { href: "/conversations", label: "Conversations", icon: ChatBubbleLeftRightIcon },
      { href: "/appearance", label: "Appearance", icon: SwatchIcon },
    ],
  },
  {
    label: "Add On",
    items: [{ href: "/add-ons", label: "Add On", icon: PuzzlePieceIcon }],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { business } = useAuth();
  
  const slug = business?.slug ?? "";
  const orderingEnabled = business?.capabilities?.ordering_enabled ?? true;
  const menuEnabled = business?.capabilities?.menu_enabled ?? orderingEnabled;
  const bookingEnabled = business?.capabilities?.booking_enabled ?? false;
  const salonMode = business?.capabilities?.salon_mode ?? false;

  const navGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items
          .filter((item) => {
            if (item.requiresOrdering && !orderingEnabled) return false;
            if (item.requiresBooking && !bookingEnabled) return false;
            if (item.requiresMenu && !menuEnabled) return false;
            return true;
          })
          .map((item) => ({
            ...item,
            href: slug ? adminPath(slug, item.href) : item.href,
            label:
              item.href === "/menu" && salonMode && item.salonLabel ? item.salonLabel : item.label,
            suffix: item.href,
          })),
      })).filter((group) => group.items.length > 0),
    [orderingEnabled, menuEnabled, bookingEnabled, salonMode, slug],
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <BusinessSwitcher />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(({ href, label, icon: Icon, suffix }) => (
                  <SidebarMenuItem key={suffix}>
                    <SidebarMenuButton
                      asChild
                      isActive={slug ? matchAdminPath(pathname, slug, suffix) : pathname === href}
                      tooltip={label}
                    >
                      <Link href={href}>
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup>
          <SidebarGroupLabel>Quick links</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {business ? (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Customer app">
                    <a
                      href={customerAppUrl(business.slug)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ArrowTopRightOnSquareIcon />
                      <span>Customer app</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Search">
                  <MagnifyingGlassIcon />
                  <span>Search</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
