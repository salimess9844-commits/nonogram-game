import type { Config } from "@netlify/functions";
import { getUser } from "@netlify/identity";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { players, solves } from "../../db/schema.js";
import { PUZZLES, pointsFor } from "../../src/puzzles.js";

const BY_ID = new Map(PUZZLES.map((p) => [p.id, p]));
// A human can't fill a grid faster than this; anything quicker is rejected as bogus.
const MIN_MS_PER_CELL = 40;
const MAX_MS = 24 * 60 * 60 * 1000;

function displayName(user: { name?: string; userMetadata?: Record<string, unknown> }) {
  const raw = user.name || (user.userMetadata?.full_name as string | undefined) || "Player";
  return raw.trim().slice(0, 40) || "Player";
}

async function leaderboard() {
  const rows = await db
    .select({ id: players.userId, name: players.name, puzzleId: solves.puzzleId, ms: solves.ms, pts: solves.pts })
    .from(players)
    .innerJoin(solves, eq(solves.userId, players.userId));
  const byId = new Map<string, { id: string; name: string; points: number; count: number; solves: Record<string, { ms: number; pts: number }> }>();
  for (const r of rows) {
    if (!BY_ID.has(r.puzzleId)) continue;
    let p = byId.get(r.id);
    if (!p) byId.set(r.id, (p = { id: r.id, name: r.name, points: 0, count: 0, solves: {} }));
    p.solves[r.puzzleId] = { ms: r.ms, pts: r.pts };
    p.points += r.pts;
    p.count++;
  }
  return [...byId.values()];
}

export default async (req: Request) => {
  if (req.method === "GET") {
    return Response.json({ players: await leaderboard() }, { headers: { "cache-control": "no-store" } });
  }

  if (req.method === "POST") {
    const user = await getUser();
    if (!user) return Response.json({ error: "Sign in to save scores." }, { status: 401 });

    let body: { puzzleId?: unknown; ms?: unknown };
    try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
    const p = typeof body.puzzleId === "string" ? BY_ID.get(body.puzzleId) : undefined;
    const ms = typeof body.ms === "number" ? Math.round(body.ms) : NaN;
    if (!p) return Response.json({ error: "Unknown puzzle." }, { status: 400 });
    if (!Number.isFinite(ms) || ms < p.n * p.n * MIN_MS_PER_CELL || ms > MAX_MS) {
      return Response.json({ error: "Invalid time." }, { status: 400 });
    }
    const pts = pointsFor(p, ms);
    const name = displayName(user);

    await db.insert(players).values({ userId: user.id, name })
      .onConflictDoUpdate({ target: players.userId, set: { name, updatedAt: sql`now()` } });
    await db.insert(solves).values({ userId: user.id, puzzleId: p.id, ms, pts })
      .onConflictDoUpdate({
        target: [solves.userId, solves.puzzleId],
        set: { ms, pts, solvedAt: sql`now()` },
        setWhere: and(eq(solves.userId, user.id), eq(solves.puzzleId, p.id), gt(solves.ms, ms)),
      });

    return Response.json({ players: await leaderboard() });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/scores",
};
