CREATE TABLE "candles" (
	"exchange" varchar(32) NOT NULL,
	"symbol" varchar(32) NOT NULL,
	"timeframe" varchar(8) NOT NULL,
	"open_time" bigint NOT NULL,
	"close_time" bigint NOT NULL,
	"open" numeric(24, 8) NOT NULL,
	"high" numeric(24, 8) NOT NULL,
	"low" numeric(24, 8) NOT NULL,
	"close" numeric(24, 8) NOT NULL,
	"volume" numeric(32, 8) NOT NULL,
	"trade_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candles_exchange_symbol_timeframe_open_time_pk" PRIMARY KEY("exchange","symbol","timeframe","open_time"),
	CONSTRAINT "candles_close_after_open_check" CHECK ("candles"."close_time" > "candles"."open_time"),
	CONSTRAINT "candles_high_gte_low_check" CHECK ("candles"."high" >= "candles"."low"),
	CONSTRAINT "candles_timeframe_check" CHECK ("candles"."timeframe" in ('15m', '1h', '4h', '1d'))
);
--> statement-breakpoint
CREATE TABLE "sentiment_daily" (
	"date" date PRIMARY KEY NOT NULL,
	"fear_greed" smallint NOT NULL,
	"classification" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sentiment_daily_fear_greed_range_check" CHECK ("sentiment_daily"."fear_greed" between 0 and 100)
);
