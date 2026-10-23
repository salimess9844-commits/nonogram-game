import { pgTable, text, integer, bigint, timestamp, primaryKey } from "drizzle-orm/pg-core";

export const players = pgTable("players", {
  userId: text("user_id").primaryKey(),
  name: text().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const solves = pgTable("solves", {
  userId: text("user_id").notNull().references(() => players.userId, { onDelete: "cascade" }),
  puzzleId: text("puzzle_id").notNull(),
  ms: bigint({ mode: "number" }).notNull(),
  pts: integer().notNull(),
  solvedAt: timestamp("solved_at").defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.puzzleId] })]);
