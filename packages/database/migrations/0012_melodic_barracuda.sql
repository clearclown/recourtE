CREATE TABLE `case_commentaries` (
	`commentary_id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`author` text,
	`source_name` text NOT NULL,
	`source_url` text NOT NULL,
	`title` text,
	`excerpt` text,
	`published_at` text,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_commentaries_source_url_unique` ON `case_commentaries` (`source_url`);--> statement-breakpoint
CREATE INDEX `case_commentaries_case_id_index` ON `case_commentaries` (`case_id`);--> statement-breakpoint
CREATE TABLE `case_news` (
	`news_id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`source` text NOT NULL,
	`published_at` text,
	`snippet` text,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_news_url_unique` ON `case_news` (`url`);--> statement-breakpoint
CREATE INDEX `case_news_case_id_index` ON `case_news` (`case_id`);--> statement-breakpoint
CREATE TABLE `opinion_comparisons` (
	`case_id` text PRIMARY KEY NOT NULL,
	`comparison_json` text NOT NULL,
	`comparison_markdown` text NOT NULL,
	`ai_model` text,
	`created_at` text NOT NULL
);
