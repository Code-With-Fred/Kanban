import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Eye, EyeOff, FolderGit2, Link2, ShieldCheck, Trash2, Unlink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { ProjectSelect } from "@/components/common/project-select";
import { useProjects, useSettings, useTrackedEvents } from "@/hooks/data";
import { timeAgo } from "@/lib/dates";
import { clearTrackedData, linkRepo, updateSettings } from "@/lib/repo";
import { firstError } from "@/lib/schemas";
import { repoFromUrl, unlinkedRepos } from "@/lib/tracking/drafts";
import { syncGitHub, testConnection } from "@/lib/tracking/github";
import { SyncButton } from "./DetectedWork";

export function TrackingSettings() {
  const settings = useSettings();
  const projects = useProjects() ?? [];
  const events = useTrackedEvents() ?? [];
  const [username, setUsername] = useState(settings.githubUsername);
  const [token, setToken] = useState(settings.githubToken);
  const [emails, setEmails] = useState(settings.githubEmails.join(", "));
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState<string | null>(null);
  const [clear, setClear] = useState(false);

  useEffect(() => {
    setUsername(settings.githubUsername);
    setToken(settings.githubToken);
    setEmails(settings.githubEmails.join(", "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.githubUsername, settings.githubToken, settings.githubEmails.join(",")]);

  const dirty = username !== settings.githubUsername || token !== settings.githubToken || emails !== settings.githubEmails.join(", ");

  const connect = async () => {
    setBusy(true);
    try {
      const list = emails.split(/[,\s]+/).map((e) => e.trim()).filter(Boolean);
      const r = await testConnection(username, token.trim());
      if (r.tokenOwner && r.tokenOwner.toLowerCase() !== r.user.login.toLowerCase())
        throw new Error(`That token belongs to @${r.tokenOwner}, not @${r.user.login}.`);
      await updateSettings({ githubUsername: r.user.login, githubToken: token.trim(), githubEmails: list });
      setVerified(`Connected as @${r.user.login}${r.tokenOwner ? " · private repos included" : " · public repos only"}`);
      const s = await syncGitHub();
      toast.success("GitHub connected", { description: `${s.newEvents} events found across ${s.reposScanned} repos` });
    } catch (e) {
      toast.error(firstError(e));
    } finally {
      setBusy(false);
    }
  };

  const linked = Object.entries(settings.repoLinks);
  const fromProjects = projects.filter((p) => repoFromUrl(p.repoUrl) && p.status !== "archived");
  const unlinked = unlinkedRepos(events, projects, settings.repoLinks);
  const sync = settings.lastSync;

  return (
    <Card id="tracking" className="scroll-mt-20">
      <CardHeader>
        <div>
          <CardTitle>
            <FolderGit2 className="size-4 text-brand" /> Automatic tracking
          </CardTitle>
          <CardDescription>
            Reads your GitHub commits and pull requests (read-only) and turns them into suggested work-log entries you accept with one click. Time is estimated from commit timing.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="GitHub username" htmlFor="gh-user">
            <Input id="gh-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Code-With-Fred" autoComplete="off" spellCheck={false} />
          </Field>
          <Field
            label="Access token (optional)"
            htmlFor="gh-token"
            hint={
              <>
                Needed for private repos. Create a{" "}
                <a className="underline" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer noopener">
                  fine-grained token
                </a>{" "}
                with read-only Contents + Metadata.
              </>
            }
          >
            <div className="relative">
              <Input
                id="gh-token"
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="github_pat_…"
                autoComplete="off"
                spellCheck={false}
                className="pr-9 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                aria-label={showToken ? "Hide token" : "Show token"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </Field>
          <Field label="Other commit emails (optional)" hint="Commits made with these emails count as yours, e.g. a work laptop's git config." className="sm:col-span-2" htmlFor="gh-emails">
            <Input id="gh-emails" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="me@work.com, me@old-laptop.local" />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="brand" size="sm" onClick={connect} loading={busy} disabled={!username.trim()}>
            {settings.githubUsername && !dirty ? "Reconnect & sync" : "Connect & sync"}
          </Button>
          {settings.githubUsername && <SyncButton />}
          {verified && (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" /> {verified}
            </span>
          )}
        </div>

        <p className="flex items-start gap-2 rounded-lg border bg-surface px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
          The token is stored only in this browser, is sent only to api.github.com, and is never included in backups. Use a read-only token so it can't change anything even if exposed.
        </p>

        {settings.githubUsername && (
          <>
            <div className="divide-y rounded-lg border">
              <div className="flex items-center justify-between gap-4 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Sync automatically</p>
                  <p className="text-xs text-muted-foreground">When the hub opens and every 30 minutes while it's open.</p>
                </div>
                <Switch checked={settings.autoTrackEnabled} onCheckedChange={(v) => updateSettings({ autoTrackEnabled: v })} aria-label="Sync automatically" />
              </div>
              <div className="flex items-center justify-between gap-4 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">New session after a gap of</p>
                  <p className="text-xs text-muted-foreground">Commits closer together count as one continuous session.</p>
                </div>
                <Select
                  size="sm"
                  className="w-28"
                  value={String(settings.sessionGapMinutes)}
                  onValueChange={(v) => updateSettings({ sessionGapMinutes: Number(v) })}
                  options={[45, 60, 90, 120, 180, 240].map((n) => ({ value: String(n), label: n < 60 ? `${n}m` : `${n / 60}h` }))}
                  aria-label="Session gap"
                />
              </div>
              <div className="flex items-center justify-between gap-4 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Time before first commit</p>
                  <p className="text-xs text-muted-foreground">Credited per session for setup, reading and thinking.</p>
                </div>
                <Select
                  size="sm"
                  className="w-28"
                  value={String(settings.sessionLeadMinutes)}
                  onValueChange={(v) => updateSettings({ sessionLeadMinutes: Number(v) })}
                  options={[0, 15, 30, 45, 60].map((n) => ({ value: String(n), label: `${n}m` }))}
                  aria-label="Lead time"
                />
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Repositories → projects</p>
              <div className="space-y-1.5">
                {fromProjects.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-sm">
                    <FolderGit2 className="size-3.5 text-muted-foreground" />
                    <span className="font-mono text-xs">{repoFromUrl(p.repoUrl)}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="truncate">{p.name}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">from project's repo URL</span>
                  </div>
                ))}
                {linked.map(([repo, pid]) => (
                  <div key={repo} className="flex items-center gap-2 text-sm">
                    <Link2 className="size-3.5 text-muted-foreground" />
                    <span className="font-mono text-xs">{repo}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="truncate">{projects.find((p) => p.id === pid)?.name ?? "Deleted project"}</span>
                    <Button size="icon-xs" variant="ghost" className="ml-auto" aria-label={`Unlink ${repo}`} onClick={() => linkRepo(repo, null)}>
                      <Unlink />
                    </Button>
                  </div>
                ))}
                {unlinked.map((u) => (
                  <div key={u.repo} className="flex flex-wrap items-center gap-2 text-sm">
                    <FolderGit2 className="size-3.5 text-amber-500" />
                    <span className="font-mono text-xs">{u.repo}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {u.events} event{u.events === 1 ? "" : "s"} · {timeAgo(u.last)}
                    </span>
                    <ProjectSelect
                      size="sm"
                      className="ml-auto w-48"
                      projects={projects}
                      value={null}
                      noneLabel="Link to project…"
                      onChange={async (id) => {
                        if (!id) return;
                        await linkRepo(u.repo, id);
                        toast.success(`${u.repo} linked`);
                      }}
                    />
                  </div>
                ))}
                {!fromProjects.length && !linked.length && !unlinked.length && (
                  <p className="text-xs text-muted-foreground">Add a GitHub repo URL to a project, or sync to discover the repos you've pushed to.</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
              <span>{events.length} events stored</span>
              {sync && (
                <span className={sync.ok ? "" : "text-rose-600 dark:text-rose-400"}>
                  {sync.ok ? `Last sync ${timeAgo(sync.at)} · ${sync.reposScanned} repos` : `Last sync failed: ${sync.error}`}
                  {sync.rateRemaining !== null && ` · API quota left: ${sync.rateRemaining}`}
                </span>
              )}
              <Button
                size="xs"
                variant="ghost"
                className="ml-auto"
                onClick={async () => {
                  await updateSettings({ githubUsername: "", githubToken: "", githubEmails: [] });
                  setVerified(null);
                  toast.success("GitHub disconnected");
                }}
              >
                <X /> Disconnect
              </Button>
              <Button size="xs" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setClear(true)}>
                <Trash2 /> Clear tracked data
              </Button>
            </div>
          </>
        )}
      </CardContent>
      <ConfirmDialog
        open={clear}
        onOpenChange={setClear}
        title="Clear tracked GitHub data?"
        description="Removes stored commits/PRs and your accept/dismiss decisions. Work logs you already accepted are kept. The next sync re-downloads the last 14 days."
        confirmLabel="Clear"
        onConfirm={async () => {
          await clearTrackedData();
          toast.success("Tracked data cleared");
        }}
      />
    </Card>
  );
}
