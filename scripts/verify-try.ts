/**
 * End-to-end check of the Try-out endpoint against the RUNNING server:
 * auth -> /api/agent/try -> prompt assembly -> model -> tool calls -> cost.
 *
 *   bun scripts/verify-try.ts
 */
import { prisma } from "../lib/db";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const EMAIL = "huzefaraja53@gmail.com";
const PASSWORD = "Agent2026Demo";

const agent = await prisma.agent.findFirstOrThrow({ select: { id: true, name: true } });
console.log(`agent: ${agent.name} (${agent.id})\n`);

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  redirect: "manual",
});
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
console.log(`login -> ${login.status}, cookie ${cookie ? "set" : "MISSING"}\n`);

const cases = [
  { label: "product question", text: "Hi, do you supply bright chrome for car trim parts?" },
  { label: "price -> must escalate", text: "What's your best price for 200 litres? I need it confirmed today." },
  { label: "gives contact details", text: "Sure, I'm Ravi Menon, email ravi.menon@example.com" },
];

for (const c of cases) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/api/agent/try`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ agentId: agent.id, message: c.text }),
  });
  const ms = Math.round(performance.now() - t0);

  if (!res.ok) {
    console.log(`[${c.label}] HTTP ${res.status} — ${(await res.text()).slice(0, 300)}\n`);
    continue;
  }

  const j = (await res.json()) as Record<string, unknown>;
  const bubbles = (j.bubbles ?? j.messages ?? []) as string[];
  const tools = (j.toolCalls ?? []) as Array<{ name?: string; function?: { name: string } }>;

  console.log(`[${c.label}]  HTTP ${res.status}  ${ms}ms`);
  for (const b of bubbles) console.log(`   > ${b}`);
  const names = tools.map((t) => t.name ?? t.function?.name).filter(Boolean);
  console.log(`   tools: ${names.length ? names.join(", ") : "(none)"}`);
  if (j.costUsd !== undefined) console.log(`   cost:  $${Number(j.costUsd).toFixed(6)}`);
  console.log();
}

await prisma.$disconnect();
