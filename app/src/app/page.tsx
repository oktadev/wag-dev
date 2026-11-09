import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Badge } from "@/components/ui/badge";

type Step = {
  tool: string;
  state: "output-available" | "output-error";
  note: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorText?: string;
  clause?: string;
};

// Illustrative scripted runs; not yet produced by a real WIdP/AS.
const RUNS: { title: string; blurb: string; steps: Step[] }[] = [
  {
    title: "Unseen Agent is accepted",
    blurb: "First assertion from a new Agent under a registered Workload Identity Provider.",
    steps: [
      {
        tool: "widp.sign_wag",
        state: "output-available",
        note: "The Workload Identity Provider signs a grant naming one Agent.",
        input: {
          header: { typ: "oauth-wag+jwt", alg: "ES256", kid: "key-2026-10" },
          claims: {
            iss: "https://acme.agents.platform.example",
            sub: "agent/7f3d9as3",
            aud: "https://as.saas.example",
            scope: "tickets:read comments:write",
            nickname: "Database Migration helper",
          },
        },
        output: { assertion: "eyJ0eXAiOiJvYXV0aC13YWcrand0Ii…" },
        clause: "Workload Authorization Grant: JWT Syntax",
      },
      {
        tool: "agent.post_token",
        state: "output-available",
        note: "The Agent presents the grant. No client authentication; client_id carries no meaning.",
        input: {
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: "<WAG>",
          resource: "https://tickets.saas.example",
        },
        output: { access_token: "…", token_type: "Bearer", expires_in: 300, refresh_token: null },
        clause: "No refresh tokens (MUST NOT)",
      },
    ],
  },
  {
    title: "Wrong typ is rejected",
    blurb: "A JWT the issuer signed for another purpose cannot be replayed as a WAG.",
    steps: [
      {
        tool: "as.verify_wag",
        state: "output-error",
        note: "Platform must act: the assertion is invalid, so the Authorization Server answers invalid_grant.",
        input: { header: { typ: "JWT", alg: "ES256" }, iss: "https://acme.agents.platform.example" },
        errorText: JSON.stringify(
          { error: "invalid_grant", error_description: "typ must be oauth-wag+jwt. Platform: reissue the assertion." },
          null,
          2,
        ),
        clause: "AS MUST reject an assertion whose typ is not oauth-wag+jwt",
      },
    ],
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-12">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="font-semibold text-2xl tracking-tight">WAG Playground</h1>
          <Badge variant="outline">preview</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          Workload Authorization Grant, rendered as an agent run. These runs are scripted examples; a live mock
          Workload Identity Provider and Authorization Server come next.
        </p>
      </header>

      {RUNS.map((run) => (
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
    </main>
  );
}
