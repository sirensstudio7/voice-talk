"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  ChevronDownIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@voicetalk/ui";
import { Calendar } from "@voicetalk/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@voicetalk/ui";
import { cn } from "@/lib/cn";
import { parseDateInputValue, toDateInputValue } from "@/lib/dates";

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Select date",
  className,
  maxDate,
}: {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  className?: string;
  maxDate?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = value ? parseDateInputValue(value) : undefined;
  const max = maxDate ? parseDateInputValue(maxDate) : undefined;
  const startMonth = max
    ? new Date(max.getFullYear() - 5, max.getMonth(), 1)
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          className={cn("h-9 w-auto justify-between gap-2 px-3 font-normal", className)}
        >
          {selected ? format(selected, "MMM d, yyyy") : placeholder}
          <ChevronDownIcon className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-72 overflow-hidden p-0" align="end">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          captionLayout="dropdown"
          disabled={max ? { after: max } : undefined}
          startMonth={startMonth}
          endMonth={max}
          onSelect={(date) => {
            onChange(date ? toDateInputValue(date) : null);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
