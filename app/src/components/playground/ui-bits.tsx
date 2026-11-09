"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CheckIcon, CircleDashedIcon, CopyIcon, MinusCircleIcon, XCircleIcon, CheckCircle2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CLAIM_LABELS, TIME_CLAIMS, decodeJwt } from "@/lib/jwt";
import type { Check } from "@/lib/types";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        toast.success("Copied to clipboard");
        setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? <CheckIcon /> : <CopyIcon />}
      {label}
    </Button>
  );
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

function Countdown({ exp }: { exp: number }) {
  const now = useNow();
  const left = Math.round(exp - now / 1000);
  const text = left <= 0 ? `expired ${-left}s ago` : left < 90 ? `in ${left}s` : `in ${Math.floor(left / 60)}m ${left % 60}s`;
  return <Badge variant={left <= 0 ? "destructive" : "secondary"}>{text}</Badge>;
}

function Claims({ obj }: { obj: Record<string, unknown> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-3 gap-y-1 text-xs sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-y-1.5">
      {Object.entries(obj).map(([k, v]) => (
        <div key={k} className="grid grid-cols-1 sm:contents">
          <dt className="text-muted-foreground" title={k}>{CLAIM_LABELS[k] ?? k} <span className="font-mono opacity-60">{k}</span></dt>
          <dd className="break-all font-mono">
            {typeof v === "string" ? v : JSON.stringify(v)}
            {TIME_CLAIMS.has(k) && typeof v === "number" && (
              <span className="ml-2 text-muted-foreground">{new Date(v * 1000).toLocaleTimeString()}{k === "exp" && <span className="ml-2 inline-block"><Countdown exp={v} /></span>}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Colour-coded JWT (header . payload . signature) with decoded, labelled claims. */
export function JwtView({ token }: { token: string }) {
  const d = decodeJwt(token);
  if (!d) return <p className="font-mono text-xs break-all">{token}</p>;
  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs break-all leading-relaxed">
        <span className="text-sky-600 dark:text-sky-400">{d.h}</span>.<span className="text-violet-600 dark:text-violet-400">{d.p}</span>.<span className="text-amber-600 dark:text-amber-400">{d.s || "(empty)"}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5 rounded-md border p-3"><p className="font-medium text-sky-600 dark:text-sky-400 text-xs">Header</p><Claims obj={d.header} /></div>
        <div className="space-y-1.5 rounded-md border p-3"><p className="font-medium text-violet-600 dark:text-violet-400 text-xs">Payload</p><Claims obj={d.payload} /></div>
      </div>
    </div>
  );
}

const ICON = {
  pass: <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-500" />,
  fail: <XCircleIcon className="size-4 text-destructive" />,
  skipped: <CircleDashedIcon className="size-4 text-muted-foreground" />,
  off: <MinusCircleIcon className="size-4 text-muted-foreground" />,
};

/** The AS's rule-by-rule verdict: which spec rule passed, which one stopped the request. */
export function ChecksList({ checks }: { checks: Check[] }) {
  return (
    <ol className="space-y-1.5">
      {checks.map((c) => (
        <li key={c.id} className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-sm", c.status === "fail" && "border-destructive/50 bg-destructive/5", (c.status === "skipped" || c.status === "off") && "opacity-60")}>
          <span className="mt-0.5">{ICON[c.status]}</span>
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium font-mono text-[13px]">{c.label}{c.status === "off" && <Badge variant="outline" className="ml-2">mode off</Badge>}{c.status === "skipped" && <Badge variant="outline" className="ml-2">not reached</Badge>}</p>
            <p className="text-muted-foreground text-xs">Spec: {c.clause}</p>
            {c.status === "fail" && <p className="text-destructive text-xs">{c.detail} <Badge variant="outline" className="ml-1">{c.actor} must act</Badge></p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Section({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div><h4 className="font-medium font-mono text-muted-foreground text-xs uppercase tracking-wide">{title}</h4>{hint && <p className="text-muted-foreground text-xs">{hint}</p>}</div>
        {action}
      </div>
      {children}
    </div>
  );
}
