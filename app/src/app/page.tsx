import { Suspense } from "react";
import { connection } from "next/server";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Badge } from "@/components/ui/badge";
import { runAll, type Run } from "@/lib/wag-run";

async function Runs() {
  await connection(); // run against the live Authorization Server at request time
  let runs: Run[];
  try {
    runs = await runAll();
  } catch (e) {
    return (
      <p className="text-destructive text-sm">
        Could not reach the authorization server ({String((e as Error).message)}). Is it running? Try{" "}
        <code>docker compose up</code>.
      </p>
    );
  }
  return (
    <>
      {runs.map((run) => (
        <section key={run.title} className="space-y-4">
          <Message from="user">
            <MessageContent>
              <MessageResponse>{`**${run.title}.** ${run.blurb}`}</MessageResponse>
            </MessageContent>
          </Message>
          {run.steps.map((s) => (
            <div key={s.tool} className="space-y-2">
              <Message from="assistant">
                <MessageContent>
                  <MessageResponse>{s.note}</MessageResponse>
                </MessageContent>
              </Message>
              <Tool defaultOpen>
                <ToolHeader type="dynamic-tool" toolName={s.tool} state={s.state} />
                <ToolContent>
                  <ToolInput input={s.input} />
                  <ToolOutput output={s.output} errorText={s.errorText} />
                  {s.clause && (
                    <p className="text-muted-foreground text-xs">
                      Spec: <span className="text-foreground">{s.clause}</span>
                    </p>
                  )}
                </ToolContent>
              </Tool>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-12">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="font-semibold text-2xl tracking-tight">WAG Playground</h1>
          <Badge variant="outline">live</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          Workload Authorization Grant, rendered as an agent run. Each run signs a grant at the mock Workload Identity
          Provider and posts it to the live Authorization Server.
        </p>
      </header>
      <Suspense fallback={<p className="text-muted-foreground text-sm">Running scenarios…</p>}>
        <Runs />
      </Suspense>
    </main>
  );
}
