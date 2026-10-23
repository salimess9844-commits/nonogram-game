CREATE TABLE "players" (
	"user_id" text PRIMARY KEY,
	"name" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solves" (
	"user_id" text,
	"puzzle_id" text,
	"ms" bigint NOT NULL,
	"pts" integer NOT NULL,
	"solved_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "solves_pkey" PRIMARY KEY("user_id","puzzle_id")
);
--> statement-breakpoint
ALTER TABLE "solves" ADD CONSTRAINT "solves_user_id_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "players"("user_id") ON DELETE CASCADE;