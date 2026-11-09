import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
  .nullable()
  .or(z.literal("").transform(() => null));

const url = z
  .string()
  .trim()
  .max(500)
  .refine((v) => !v || /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v) || /^https?:\/\/localhost/i.test(v), "Enter a valid URL");

export const projectInput = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
    description: z.string().trim().max(4000).default(""),
    category: z.enum(["client", "personal", "saas", "ai_automation", "content", "learning"]),
    status: z.enum(["planning", "in_progress", "on_hold", "completed", "archived"]),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    startDate: isoDate,
    deadline: isoDate,
    progress: z.coerce.number().int().min(0).max(100),
    progressMode: z.enum(["manual", "tasks"]),
    projectUrl: url.default(""),
    repoUrl: url.default(""),
    technologies: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
    notes: z.string().max(20000).default(""),
  })
  .refine((p) => !p.startDate || !p.deadline || p.deadline >= p.startDate, {
    message: "Deadline can't be before the start date",
    path: ["deadline"],
  });
export type ProjectInput = z.input<typeof projectInput>;

export const taskInput = z.object({
  title: z.string().trim().min(1, "Give the task a title").max(200),
  description: z.string().trim().max(4000).default(""),
  projectId: z.string().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  status: z.enum(["todo", "in_progress", "review", "done"]),
  dueDate: isoDate,
  scheduledDate: isoDate,
  estimatedMinutes: z.number().int().min(0).max(100_000).nullable(),
  actualMinutes: z.number().int().min(0).max(100_000).nullable(),
});
export type TaskInput = z.input<typeof taskInput>;

export const workLogInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  projectId: z.string().nullable(),
  workedOn: z.string().trim().min(2, "Describe what you worked on").max(4000),
  completed: z.string().trim().max(4000).default(""),
  challenges: z.string().trim().max(4000).default(""),
  minutes: z.number().int().min(0, "Time can't be negative").max(24 * 60, "That's more than 24 hours"),
  pending: z.string().trim().max(4000).default(""),
  nextSteps: z.string().trim().max(4000).default(""),
});
export type WorkLogInput = z.input<typeof workLogInput>;

export const milestoneInput = z.object({
  title: z.string().trim().min(1, "Milestone needs a title").max(200),
  dueDate: isoDate,
});

export const settingsInput = z.object({
  displayName: z.string().trim().min(1, "Display name is required").max(60),
  role: z.string().trim().max(60),
  timezone: z.string().min(1),
  theme: z.enum(["dark", "light", "system"]),
  reminderEnabled: z.boolean(),
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm"),
  browserNotifications: z.boolean(),
  notifyDeadlines: z.boolean(),
  notifyOverdue: z.boolean(),
  notifyStale: z.boolean(),
  notifyToday: z.boolean(),
  deadlineWindowDays: z.number().int().min(1).max(30),
  staleAfterDays: z.number().int().min(2).max(60),
  summaryStyle: z.enum(["concise", "detailed"]),
  summaryIncludeStats: z.boolean(),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  githubUsername: z
    .string()
    .trim()
    .regex(/^$|^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i, "That isn't a valid GitHub username"),
  githubToken: z
    .string()
    .trim()
    .max(255)
    .regex(/^$|^[\w-]+$/, "Token contains invalid characters"),
  githubEmails: z.array(z.string().trim().email("One of the commit emails is invalid")).max(10),
  autoTrackEnabled: z.boolean(),
  repoLinks: z.record(z.string(), z.string()),
  sessionGapMinutes: z.number().int().min(15).max(480),
  sessionLeadMinutes: z.number().int().min(0).max(120),
});

/** First human-readable message from a ZodError. */
export function firstError(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "Invalid input";
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

/** Map of field → message for inline form errors. */
export function fieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (err instanceof z.ZodError) {
    for (const i of err.issues) {
      const k = String(i.path[0] ?? "_");
      if (!out[k]) out[k] = i.message;
    }
  }
  return out;
}
