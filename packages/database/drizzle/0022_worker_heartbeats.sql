CREATE TABLE "worker_heartbeats" (
	"instance_id" varchar(64) PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_beat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" varchar(32)
);
--> statement-breakpoint
CREATE INDEX "worker_heartbeats_last_beat_at_idx" ON "worker_heartbeats" USING btree ("last_beat_at" DESC NULLS LAST);