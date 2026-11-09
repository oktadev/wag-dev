"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIcon, BotIcon, CheckCircle2Icon, KeyRoundIcon, LockIcon, PlayIcon, RotateCcwIcon, ServerIcon,
  ShieldCheckIcon, SlidersHorizontalIcon, XCircleIcon, ZapIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { cn } from "@/lib/utils";
import { DEFAULT_SIGN, SCENARIOS, type Scenario } from "@/lib/scenarios";
import type { Config, SignRequest, SignResult, TokenResult, TrafficEntry, Wire } from "@/lib/types";
import { ThemeToggle } from "./theme-toggle";
import { ChecksList, CopyButton, JwtView, Section } from "./ui-bits";

const GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const DEFAULT_RESOURCE = "https://tickets.saas.example";
// Shown in the generated snippets. Set NEXT_PUBLIC_AS_URL to the auth server's public address at build time.
const TOKEN_URL = `${(process.env.NEXT_PUBLIC_AS_URL ?? "http://localhost:4100").replace(/\/$/, "")}/token`;
type StepState = "locked" | "active" | "done" | "error";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, signal: AbortSignal.timeout(20_000) });
  let j: { error?: string } & Record<string, unknown>;
  try { j = await r.json(); } catch { throw new Error(`Unexpected response from ${path} (${r.status}).`); }
  if (!r.ok) throw new Error(j.error ?? `${path} failed (${r.status})`);
  return j as T;
}

function curlOf(assertion: string, resource: string, scope: string) {
  const f = [`grant_type=${GRANT}`, `assertion=${assertion}`, resource && `resource=${resource}`, scope && `scope=${scope}`].filter(Boolean);
  return `curl -X POST ${TOKEN_URL} \\\n${f.map((x, i) => `  --data-urlencode '${x}'${i < f.length - 1 ? " \\" : ""}`).join("\n")}`;
}
function pythonOf(assertion: string, resource: string) {
  return `import requests\n\nr = requests.post("${TOKEN_URL}", data={\n    "grant_type": "${GRANT}",\n    "assertion": "${assertion}",\n${resource ? `    "resource": "${resource}",\n` : ""}})\nprint(r.status_code, r.json())`;
}
function jsOf(assertion: string, resource: string) {
  return `const r = await fetch("${TOKEN_URL}", {\n  method: "POST",\n  body: new URLSearchParams({\n    grant_type: "${GRANT}",\n    assertion: "${assertion}",\n${resource ? `    resource: "${resource}",\n` : ""}  }),\n});\nconsole.log(r.status, await r.json());`;
}

// Code boxes wrap at every width: the content is mostly one very long assertion, which is unreadable when it scrolls sideways.
const CODE_BOX = "min-w-0 rounded-md border bg-muted/30 [&_pre]:whitespace-pre-wrap [&_pre]:break-all [&_code]:break-all";

function Wired({ wire, extra }: { wire?: Wire; extra?: Record<string, string> }) {
  if (!wire) return <p className="text-muted-foreground text-sm">Nothing sent yet.</p>;
  return (
    <div className="space-y-3">
      <Section title="Request" action={<CopyButton text={wire.request} />}><div className={CODE_BOX}><CodeBlock code={wire.request} language="http" /></div></Section>
      <Section title={`Response · ${wire.status} · ${wire.ms} ms`} action={<CopyButton text={wire.response} />}><div className={CODE_BOX}><CodeBlock code={wire.response} language="http" /></div></Section>
      {extra && Object.entries(extra).map(([k, v]) => <p key={k} className="text-muted-foreground text-xs">{k}: {v}</p>)}
    </div>
  );
}

function StepShell({ n, title, actor, icon, state, last, summary, children }: {
  n: number; title: string; actor: string; icon: React.ReactNode; state: StepState; last?: boolean; summary?: string; children: React.ReactNode;
}) {
  const ring = { locked: "border-muted text-muted-foreground", active: "border-primary text-primary", done: "border-emerald-500 bg-emerald-500 text-white", error: "border-destructive bg-destructive text-white" }[state];
  return (
    <div className="relative flex min-w-0 gap-3 sm:gap-4">
      <div className="flex flex-col items-center">
        <div className={cn("grid size-8 shrink-0 place-items-center sm:size-9 rounded-full border-2 font-semibold text-sm", ring, state === "active" && "animate-pulse")}>
          {state === "done" ? <CheckCircle2Icon className="size-5" /> : state === "error" ? <XCircleIcon className="size-5" /> : state === "locked" ? <LockIcon className="size-4" /> : n}
        </div>
        {!last && <div className={cn("my-1 w-0.5 flex-1", state === "done" ? "bg-emerald-500" : "bg-border")} />}
      </div>
      <Card className={cn("mb-6 min-w-0 flex-1 transition-all", state === "locked" && "opacity-60", state === "active" && "border-primary shadow-md ring-1 ring-primary/30", state === "error" && "border-destructive/60")}>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="font-mono text-base tracking-tight">{title}</CardTitle>
            <Badge variant="secondary" className="gap-1 font-mono">{icon}{actor}</Badge>
            {summary && <span className="text-muted-foreground text-xs">{summary}</span>}
          </div>
        </CardHeader>
        {state !== "locked" && <CardContent className="space-y-4">{children}</CardContent>}
      </Card>
    </div>
  );
}

export function Playground() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [offline, setOffline] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState("happy");
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) as Scenario;

  const [claimsText, setClaimsText] = useState(JSON.stringify(DEFAULT_SIGN.claims, null, 2));
  const [typ, setTyp] = useState("oauth-wag+jwt");
  const [expiresIn, setExpiresIn] = useState("5m");
  const [omit, setOmit] = useState<string[]>([]);
  const [tamper, setTamper] = useState<string[]>([]); // "badSignature" | "unregisteredKey"
  const [resource, setResource] = useState(DEFAULT_RESOURCE);
  const [scope, setScope] = useState("");

  const [signed, setSigned] = useState<SignResult | null>(null);
  const [tokenRes, setTokenRes] = useState<TokenResult | null>(null);
  const [busy, setBusy] = useState<"sign" | "token" | "all" | null>(null);
  const [log, setLog] = useState<TrafficEntry[]>([]);
  const [results, setResults] = useState<Record<string, "ok" | "unexpected">>({});
  const [replayHit, setReplayHit] = useState<TokenResult | null>(null);
  const gen = useRef(0);

  const claimsError = useMemo(() => { try { const v = JSON.parse(claimsText); return v && typeof v === "object" && !Array.isArray(v) ? null : "Claims must be a JSON object"; } catch (e) { return (e as Error).message; } }, [claimsText]);

  const refreshCfg = useCallback(async () => {
    try { setCfg(await api<Config>("/api/config")); setOffline(null); } catch (e) { setOffline((e as Error).message); }
  }, []);
  const refreshLog = useCallback(async () => { try { setLog(await api<TrafficEntry[]>("/api/traffic")); } catch { /* shown via offline */ } }, []);
  useEffect(() => {
    let live = true;
    api<Config>("/api/config").then((c) => { if (live) { setCfg(c); setOffline(null); } }).catch((e: Error) => { if (live) setOffline(e.message); });
    return () => { live = false; };
  }, []);

  const step1: StepState = busy === "sign" ? "active" : signed ? "done" : "active";
  const step2: StepState = !signed ? "locked" : busy === "token" ? "active" : tokenRes ? "done" : "active";
  const step3: StepState = !tokenRes ? "locked" : tokenRes.status === 200 ? "done" : "error";

  function applyScenario(s: Scenario) {
    const sign: SignRequest = { ...DEFAULT_SIGN, ...s.sign, claims: { ...DEFAULT_SIGN.claims, ...(s.sign.claims ?? {}) } };
    setScenarioId(s.id);
    setClaimsText(JSON.stringify(sign.claims, null, 2));
    setTyp(String((sign.header as Record<string, unknown>).typ ?? "oauth-wag+jwt"));
    setExpiresIn(sign.expiresIn);
    setOmit(sign.omit);
    setTamper([sign.badSignature && "badSignature", sign.unregisteredKey && "unregisteredKey"].filter(Boolean) as string[]);
    setResource(s.token && "resource" in s.token ? s.token.resource : DEFAULT_RESOURCE);
    setScope("");
    setSigned(null); setTokenRes(null); setReplayHit(null);
    gen.current++;
  }

  async function setModes(patch: Record<string, boolean>) {
    setCfg(await api<Config>("/api/config", { method: "POST", body: JSON.stringify(patch) }));
  }

  const buildSign = (): SignRequest => ({
    claims: JSON.parse(claimsText), header: typ === "oauth-wag+jwt" ? {} : { typ }, expiresIn, omit,
    badSignature: tamper.includes("badSignature"), unregisteredKey: tamper.includes("unregisteredKey"),
  });

  /** Only a transport failure means the server is unreachable. A 4xx is the user's input being wrong. */
  function fail(e: unknown) {
    const msg = (e as Error).message;
    if (/unreachable|timed out|Failed to fetch|NetworkError|aborted|timeout/i.test(msg)) setOffline(msg);
    toast.error(msg);
  }

  async function doSign() {
    if (claimsError) { toast.error(`Fix the claims JSON first: ${claimsError}`); return null; }
    const g = ++gen.current;
    setBusy("sign"); setTokenRes(null); setReplayHit(null);
    try {
      const r = await api<SignResult>("/api/sign", { method: "POST", body: JSON.stringify(buildSign()) });
      if (g !== gen.current) return null; // superseded by Start over or a newer action
      setSigned(r); setOffline(null);
      return r;
    } catch (e) { if (g === gen.current) fail(e); return null; }
    finally { if (g === gen.current) setBusy(null); }
  }

  async function doToken(assertion = signed?.assertion) {
    if (!assertion) return null;
    const g = ++gen.current;
    setBusy("token");
    try {
      const r = await api<TokenResult>("/api/token", { method: "POST", body: JSON.stringify({ grant_type: GRANT, assertion, resource: resource || undefined, scope: scope || undefined }) });
      if (g !== gen.current) return null;
      setTokenRes(r); setOffline(null); void refreshLog();
      if (r.status === 200) toast.success("Access token issued"); else toast.error(String(r.body.error_description ?? r.body.error));
      return r;
    } catch (e) { if (g === gen.current) fail(e); return null; }
    finally { if (g === gen.current) setBusy(null); }
  }

  /** Returns true if the scenario produced the outcome the spec predicts. Never throws. */
  async function runScenario(s: Scenario): Promise<boolean> {
    applyScenario(s);
    const g = gen.current;
    setBusy("all");
    let modesOn = false;
    try {
      if (s.modes) { await setModes(s.modes); modesOn = true; }
      const sign: SignRequest = { ...DEFAULT_SIGN, ...s.sign, claims: { ...DEFAULT_SIGN.claims, ...(s.sign.claims ?? {}) } };
      const sg = await api<SignResult>("/api/sign", { method: "POST", body: JSON.stringify(sign) });
      if (g !== gen.current) return false;
      setSigned(sg);
      const res = s.token && "resource" in s.token ? s.token.resource : DEFAULT_RESOURCE;
      const post = () => api<TokenResult>("/api/token", { method: "POST", body: JSON.stringify({ grant_type: GRANT, assertion: sg.assertion, resource: res || undefined }) });
      let r = await post();
      if (s.twice) { setReplayHit(r); r = await post(); }
      if (g !== gen.current) return false;
      setTokenRes(r);
      const ok = (s.expect === "accept") === (r.status === 200);
      setResults((p) => ({ ...p, [s.id]: ok ? "ok" : "unexpected" }));
      void refreshLog();
      return ok;
    } catch (e) {
      if (g === gen.current) { fail(e); setResults((p) => ({ ...p, [s.id]: "unexpected" })); }
      return false;
    } finally {
      // Always put modes back, even if the run failed, so one scenario never leaks its mode into the next.
      if (modesOn && s.modes) await setModes(Object.fromEntries(Object.keys(s.modes).map((k) => [k, false]))).catch(() => undefined);
      if (g === gen.current) setBusy(null);
    }
  }

  async function runAll() {
    const g = gen.current;
    let bad = 0;
    for (const s of SCENARIOS) {
      if (g !== gen.current && s !== SCENARIOS[0]) break; // user took over mid-run
      if (!(await runScenario(s))) bad++;
    }
    toast[bad ? "error" : "success"](bad ? `${bad} scenario${bad > 1 ? "s" : ""} did not behave as the spec predicts` : "All scenarios behaved as expected");
  }

  async function startOver() {
    gen.current++;
    await api("/api/traffic", { method: "DELETE" }).catch(() => undefined);
    applyScenario(SCENARIOS[0]); setResults({}); setLog([]); setBusy(null);
  }

  // Keyboard: Cmd/Ctrl+Enter runs the next available step.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !busy) { e.preventDefault(); if (!signed) void doSign(); else void doToken(); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  });

  const decodedAccess = tokenRes?.status === 200 ? String(tokenRes.body.access_token ?? "") : "";
  const nextHint = !signed ? "Sign the grant" : !tokenRes ? "Send the token request" : "Pick another scenario";

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-3 py-6 sm:px-4 sm:py-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h1 className="font-mono font-semibold text-2xl tracking-tight sm:text-3xl">Run a Workload Authorization Grant</h1>
          <p className="max-w-2xl text-muted-foreground text-sm">Sign a grant as the Workload Identity Provider, break it in any way you like, and watch a real authorization server check it rule by rule.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ThemeToggle />
          <Tooltip><TooltipTrigger render={<Badge variant={offline ? "destructive" : "secondary"} className="gap-1.5"><span className={cn("size-2 rounded-full", offline ? "bg-destructive" : "bg-emerald-500")} />{offline ? "AS offline" : "AS online"}</Badge>} /><TooltipContent>{offline ?? "The authorization server is reachable"}</TooltipContent></Tooltip>
          <Sheet>
            <SheetTrigger render={<Button variant="outline" size="sm" onClick={() => void refreshCfg()}><SlidersHorizontalIcon />Modes</Button>} />
            <SheetContent className="w-full max-w-full sm:w-[420px] sm:max-w-[420px]">
              <SheetHeader><SheetTitle>Behaviour modes</SheetTitle><SheetDescription>The draft leaves these open. They are assumptions, not spec, and apply to the live auth server.</SheetDescription></SheetHeader>
              <div className="space-y-5 px-4">
                {cfg?.info.map((m) => (
                  <div key={m.key} className="flex items-start justify-between gap-4">
                    <div className="space-y-1"><Label htmlFor={m.key}>{m.label}</Label><Badge variant="outline">{m.status}</Badge><p className="text-muted-foreground text-xs">{m.description}</p></div>
                    <Switch id={m.key} checked={!!cfg.modes[m.key]} onCheckedChange={(v) => void setModes({ [m.key]: v }).catch(fail)} />
                  </div>
                )) ?? <p className="text-muted-foreground text-sm">Auth server unreachable.</p>}
              </div>
            </SheetContent>
          </Sheet>
          <Sheet onOpenChange={(o) => o && void refreshLog()}>
            <SheetTrigger render={<Button variant="outline" size="sm"><ActivityIcon />Server log{log.length > 0 && <Badge variant="secondary">{log.length}</Badge>}</Button>} />
            <SheetContent className="w-full max-w-full sm:w-[640px] sm:max-w-[640px]">
              <SheetHeader><SheetTitle>What the auth server logged</SheetTitle><SheetDescription>Recorded inside the auth server process, independent of this app.</SheetDescription></SheetHeader>
              <ScrollArea className="h-[calc(100vh-8rem)] px-4">
                <div className="space-y-2 pb-6">
                  {[...log].reverse().map((e) => (
                    <div key={e.id} className={cn("space-y-1 rounded-md border border-l-4 p-3 text-xs", (e.status ?? 0) >= 400 ? "border-l-destructive" : "border-l-emerald-500")}>
                      <p className="font-mono">#{e.id} {e.method} {e.path} → <b>{e.status}</b> · {e.ms} ms</p>
                      {e.note && <p className="text-muted-foreground">{e.note}</p>}
                      {e.checks && <p className="text-muted-foreground">Stopped at: {e.checks.find((c) => c.status === "fail")?.label ?? "all rules passed"}</p>}
                      {e.responseBody && <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-2 font-mono">{e.responseBody}</pre>}
                    </div>
                  ))}
                  {log.length === 0 && <p className="text-muted-foreground text-sm">No requests yet.</p>}
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>
          <Button variant="ghost" size="sm" onClick={() => void startOver()}><RotateCcwIcon />Start over</Button>
        </div>
      </header>

      {offline && (
        <Alert variant="destructive"><AlertTitle>Cannot reach the authorization server</AlertTitle><AlertDescription>{offline}. Start it with <code>docker compose up</code> or <code>pnpm dev</code>.</AlertDescription></Alert>
      )}

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="space-y-1 pt-4 text-sm">
          <p className="font-mono"><b>The scenario.</b> You are the <b>Platform</b>. You host an Agent called <code>agent/7f3d9as3</code>. A ticket tracker&apos;s authorization server trusts your Workload Identity Provider, but has never heard of this Agent, and nobody registered it. Can the Agent get a token?</p>
          <p className="text-muted-foreground">Pick a scenario, or edit the grant yourself.<span className="hidden sm:inline"> <kbd className="rounded border px-1">⌘</kbd>+<kbd className="rounded border px-1">Enter</kbd> runs the next step.</span></p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-center justify-between">
            <h2 className="font-medium font-mono text-sm">scenarios</h2>
            <Button size="xs" onClick={() => void runAll()} disabled={!!busy || !!offline}><ZapIcon />Run all</Button>
          </div>
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:block lg:space-y-1.5 lg:overflow-visible lg:px-0 lg:pb-0">
            {SCENARIOS.map((s) => (
              <button key={s.id} type="button" onClick={() => applyScenario(s)} disabled={!!busy}
                className={cn("w-auto shrink-0 rounded-lg border p-2.5 text-left transition-colors hover:bg-accent disabled:opacity-60 lg:w-full lg:shrink lg:p-3", s.id === scenarioId && "border-primary bg-primary/5 ring-1 ring-primary/30")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium font-mono text-sm">{s.title}</span>
                  <span className="flex items-center gap-1.5">
                    {s.modes && <Badge variant="outline">mode</Badge>}
                    {results[s.id] === "ok" && <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-500" />}
                    {results[s.id] === "unexpected" && <XCircleIcon className="size-4 text-destructive" />}
                    <Badge variant={s.expect === "accept" ? "secondary" : "outline"}>{s.expect === "accept" ? "accepts" : "rejects"}</Badge>
                  </span>
                </div>
                {s.id === scenarioId && <p className="mt-1.5 hidden text-muted-foreground text-xs lg:block">{s.blurb}</p>}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground text-xs lg:hidden">{scenario.blurb}</p>
          <Button variant="secondary" size="sm" className="w-full" disabled={!!busy || !!offline} onClick={() => void runScenario(scenario)}><PlayIcon />Run &ldquo;{scenario.title}&rdquo; automatically</Button>
        </aside>

        <main className="min-w-0">
          <StepShell n={1} title="Sign the grant" actor="Workload Identity Provider" icon={<KeyRoundIcon className="size-3" />} state={step1} summary={signed ? "signed" : undefined}>
            <p className="text-muted-foreground text-sm">The Platform&apos;s Workload Identity Provider signs a JWT naming one Agent. Edit anything, or tamper with it to see how the server reacts.</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="claims">Claims (JSON)</Label>
                <Textarea id="claims" value={claimsText} onChange={(e) => setClaimsText(e.target.value)} className="min-h-40 font-mono text-xs" spellCheck={false} aria-invalid={!!claimsError} />
                <p className={cn("text-xs", claimsError ? "text-destructive" : "text-muted-foreground")}>{claimsError ?? "iss, aud, iat, exp and jti are filled in for you unless you set them."}</p>
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label htmlFor="typ">Header typ</Label><Input id="typ" value={typ} onChange={(e) => setTyp(e.target.value)} className="font-mono text-xs" /></div>
                <div className="space-y-1.5"><Label htmlFor="exp">Lifetime</Label><Input id="exp" value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)} className="font-mono text-xs" placeholder="5m, 30s, -1m" /><p className="text-muted-foreground text-xs">Negative means already expired.</p></div>
                <div className="space-y-1.5"><Label>Tamper</Label>
                  <ToggleGroup multiple value={tamper} onValueChange={setTamper} variant="outline" size="sm" className="flex-wrap justify-start">
                    <ToggleGroupItem value="badSignature">Flip signature bit</ToggleGroupItem>
                    <ToggleGroupItem value="unregisteredKey">Unregistered key</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="space-y-1.5"><Label>Drop a required claim</Label>
                  <ToggleGroup multiple value={omit} onValueChange={setOmit} variant="outline" size="sm" className="flex-wrap justify-start">
                    {["jti", "sub", "exp", "iat"].map((c) => <ToggleGroupItem key={c} value={c}>{c}</ToggleGroupItem>)}
                  </ToggleGroup>
                </div>
              </div>
            </div>
            <Button onClick={() => void doSign()} disabled={!!busy || !!claimsError} className="w-full">{busy === "sign" ? "Signing…" : signed ? "Sign again" : "Sign the grant"}<ShieldCheckIcon /></Button>
            {signed && (
              <Tabs defaultValue="token">
                <TabsList className="max-w-full justify-start overflow-x-auto"><TabsTrigger value="token">Token</TabsTrigger><TabsTrigger value="wire">Request / Response</TabsTrigger></TabsList>
                <TabsContent value="token" className="space-y-2 pt-2"><div className="flex justify-end"><CopyButton text={signed.assertion} label="Copy assertion" /></div><JwtView token={signed.assertion} /></TabsContent>
                <TabsContent value="wire" className="pt-2"><Wired wire={signed.wire} /></TabsContent>
              </Tabs>
            )}
          </StepShell>

          <StepShell n={2} title="Present it at the token endpoint" actor="Agent" icon={<BotIcon className="size-3" />} state={step2} summary={tokenRes ? `${tokenRes.wire.ms} ms` : undefined}>
            <p className="text-muted-foreground text-sm">The Agent posts the grant with <code>grant_type=jwt-bearer</code>. No client authentication, no <code>client_id</code>, no registration for this Agent.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="res">resource (RFC 8707)</Label><Input id="res" value={resource} onChange={(e) => setResource(e.target.value)} className="font-mono text-xs" placeholder="(omit)" /></div>
              <div className="space-y-1.5"><Label htmlFor="scope">scope (optional)</Label><Input id="scope" value={scope} onChange={(e) => setScope(e.target.value)} className="font-mono text-xs" placeholder="uses the assertion's scope" /></div>
            </div>
            <Button onClick={() => void doToken()} disabled={!!busy || !signed} className="w-full">{busy === "token" ? "Sending…" : tokenRes ? "Send again" : "Send token request"}<PlayIcon /></Button>
            {replayHit && <Alert><AlertTitle>First use</AlertTitle><AlertDescription>First presentation: HTTP {replayHit.status}. The result below is the second presentation of the same assertion.</AlertDescription></Alert>}
            {tokenRes && signed && (
              <Tabs defaultValue="wire">
                <TabsList className="max-w-full justify-start overflow-x-auto"><TabsTrigger value="wire">Request / Response</TabsTrigger><TabsTrigger value="curl">cURL</TabsTrigger><TabsTrigger value="js">JavaScript</TabsTrigger><TabsTrigger value="py">Python</TabsTrigger></TabsList>
                <TabsContent value="wire" className="pt-2"><Wired wire={tokenRes.wire} extra={tokenRes.note ? { "Auth server note": tokenRes.note } : undefined} /></TabsContent>
                <TabsContent value="curl" className="pt-2"><div className={CODE_BOX}><CodeBlock code={curlOf(signed.assertion, resource, scope)} language="bash" /></div></TabsContent>
                <TabsContent value="js" className="pt-2"><div className={CODE_BOX}><CodeBlock code={jsOf(signed.assertion, resource)} language="javascript" /></div></TabsContent>
                <TabsContent value="py" className="pt-2"><div className={CODE_BOX}><CodeBlock code={pythonOf(signed.assertion, resource)} language="python" /></div></TabsContent>
              </Tabs>
            )}
          </StepShell>

          <StepShell n={3} title="The authorization server decides" actor="Authorization Server" icon={<ServerIcon className="size-3" />} state={step3} last summary={tokenRes ? (tokenRes.status === 200 ? "access token issued" : `rejected ${tokenRes.status}`) : undefined}>
            {tokenRes && (
              <>
                {tokenRes.status === 200 ? (
                  <Alert><CheckCircle2Icon className="text-emerald-600 dark:text-emerald-500" /><AlertTitle>Accepted: the Agent was never registered here</AlertTitle><AlertDescription>The server trusts the Workload Identity Provider, not individual Agents. No refresh token was issued (the draft forbids it).</AlertDescription></Alert>
                ) : (
                  <Alert variant="destructive"><XCircleIcon /><AlertTitle>{String(tokenRes.body.error)}</AlertTitle><AlertDescription>{String(tokenRes.body.error_description ?? "")}</AlertDescription></Alert>
                )}
                <Section title="Spec rules, in the order the server checked them" hint="The first failure stops the request; later rules are not evaluated.">
                  <ChecksList checks={tokenRes.checks} />
                </Section>
                {decodedAccess && <Section title="Access token" action={<CopyButton text={decodedAccess} />}><JwtView token={decodedAccess} /></Section>}
                <Separator />
                <p className="text-muted-foreground text-xs">Next: {nextHint}. Spec for this scenario: {scenario.clause}.</p>
              </>
            )}
          </StepShell>
        </main>
      </div>
    </div>
  );
}
