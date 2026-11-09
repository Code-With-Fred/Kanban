import { useMemo } from "react";
import { Select } from "@/components/ui/select";
import { CATEGORIES } from "@/lib/constants";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Project picker that hides archived projects (unless currently selected). */
export function ProjectSelect({
  projects,
  value,
  onChange,
  noneLabel = "No project",
  allowNone = true,
  className,
  size,
  id,
}: {
  projects: Project[];
  value: string | null;
  onChange: (id: string | null) => void;
  noneLabel?: string;
  allowNone?: boolean;
  className?: string;
  size?: "sm" | "default";
  id?: string;
}) {
  const options = useMemo(() => {
    const visible = projects
      .filter((p) => p.status !== "archived" || p.id === value)
      .sort((a, b) => Number(b.status === "in_progress") - Number(a.status === "in_progress") || a.name.localeCompare(b.name));
    const opts = visible.map((p) => ({
      value: p.id,
      label: p.name,
      icon: <span className={cn("size-1.5 shrink-0 rounded-full", CATEGORIES.find((c) => c.value === p.category)?.dot)} />,
    }));
    return allowNone ? [{ value: "", label: noneLabel }, ...opts] : opts;
  }, [projects, value, allowNone, noneLabel]);
  return (
    <Select
      id={id}
      size={size}
      className={className}
      value={value ?? ""}
      onValueChange={(v) => onChange(v || null)}
      options={options}
      placeholder={allowNone ? noneLabel : "Choose a project"}
      aria-label="Project"
    />
  );
}
