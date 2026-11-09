import "server-only";

const AS_URL = process.env.AS_URL ?? "http://localhost:4100";
const GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";

export type Step = {
  tool: string;
  state: "output-available" | "output-error";
  note: string;
  input: unknown;
  output?: unknown;
  errorText?: string;
  clause?: string;
};
export type Run = { title: string; blurb: string; steps: Step[] };

type Signed = { header: unknown; claims: unknown; assertion: string };

async function sign(body: object): Promise<Signed> {
  const r = await fetch(`${AS_URL}/idp/sign`, { method: "POST", body: JSON.stringify(body), cache: "no-store" });
  if (!r.ok) throw new Error(`mock WIdP /idp/sign failed: ${r.status}`);
  return r.json();
}

async function token(params: Record<string, string>) {
  const r = await fetch(`${AS_URL}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    cache: "no-store",
  });
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
}

const short = (s: string) => `${s.slice(0, 28)}…`;

async function scenario(
  title: string,
  blurb: string,
  sign_: object,
  expect: "accept" | "reject",
  clause: string,
  rejectNote: string,
): Promise<Run> {
  const signed = await sign(sign_);
  const params = { grant_type: GRANT, assertion: signed.assertion, resource: "https://tickets.saas.example" };
  const res = await token(params);
  const ok = res.status === 200;
  const shown = { ...params, assertion: short(signed.assertion) };
  const steps: Step[] = [
    {
      tool: "widp.sign_wag",
      state: "output-available",
      note: "The Workload Identity Provider signs a grant naming one Agent.",
      input: { header: signed.header, claims: signed.claims },
      output: { assertion: short(signed.assertion) },
      clause: "Workload Authorization Grant: JWT Syntax",
    },
    ok
      ? {
          tool: "agent.post_token",
          state: "output-available",
          note: `The Agent presents the grant to the live Authorization Server (${AS_URL}). No client authentication, no client_id.`,
          input: shown,
          output: { status: res.status, ...res.body, access_token: short(String(res.body.access_token)) },
          clause,
        }
      : {
          tool: "agent.post_token",
          state: "output-error",
          note: rejectNote,
          input: shown,
          errorText: JSON.stringify({ status: res.status, ...res.body }, null, 2),
          clause,
        },
  ];
  const matched = (expect === "accept") === ok;
  return { title: `${matched ? "✓" : "✗ UNEXPECTED"} ${title}`, blurb, steps };
}

export async function runAll(): Promise<Run[]> {
  return Promise.all([
    scenario("Unseen Agent is accepted", "First assertion from a new Agent under a registered Workload Identity Provider.", {}, "accept",
      "No refresh token is issued (MUST NOT); client_id carries no meaning", ""),
    scenario("Wrong typ is rejected", "A JWT the issuer signed for another purpose cannot be replayed as a WAG.", { header: { typ: "JWT" } }, "reject",
      "AS MUST reject an assertion whose typ is not oauth-wag+jwt", "Platform must act: the assertion is invalid, so the Authorization Server answers invalid_grant."),
    scenario("Untrusted issuer is rejected", "No Workload Identity Provider registration matches.", { claims: { iss: "https://evil.example" } }, "reject",
      "AS MUST reject an assertion that matches no registration", "AS admin must act: this Workload Identity Provider is not registered."),
    scenario("Wrong audience is rejected", "The assertion names a different Authorization Server.", { claims: { aud: "https://other.example" } }, "reject",
      "aud MUST be the AS issuer identifier", "Platform must act: the assertion is addressed to another Authorization Server."),
    scenario("Expired assertion is rejected", "Assertions are short-lived.", { expiresIn: "-1m" }, "reject",
      "exp is REQUIRED; assertions SHOULD be short-lived", "Platform must act: the assertion has expired."),
  ]);
}
