import type { ReactNode } from "react";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/cn";

export function StatCard({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <Card className={cn("@container/card h-full gap-0 py-4", className)}>
      <CardHeader className="gap-2">
        <CardDescription className="capitalize">{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  titleAction,
  titleAccessory,
  align = "start",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  titleAction?: ReactNode;
  /** Renders immediately to the right of the title (e.g. an info icon). */
  titleAccessory?: ReactNode;
  align?: "start" | "center";
}) {
  const centered = align === "center";

  const titleBlock = (
    <div className="space-y-1">
      <div
        className={cn(
          "flex items-end gap-1.5",
          centered ? "justify-center" : "justify-start",
        )}
      >
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {titleAccessory}
      </div>
      {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );

  if (titleAction) {
    return (
      <div className="flex flex-col gap-4">
        <div
          className={cn(
            "flex flex-wrap items-end gap-4",
            centered ? "justify-center text-center" : "justify-between",
          )}
        >
          {titleBlock}
          <div className="flex shrink-0 items-center gap-2">{titleAction}</div>
        </div>
        {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-4",
        centered ? "flex-col items-center justify-center text-center" : "justify-between",
      )}
    >
      {titleBlock}
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function StatCardGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
