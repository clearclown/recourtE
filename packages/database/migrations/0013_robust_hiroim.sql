CREATE TABLE `ai_review_scores` (
	`review_id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`reviewed_by_model` text NOT NULL,
	`generated_by_model` text NOT NULL,
	`quality_score` integer NOT NULL,
	`accuracy_score` integer NOT NULL,
	`completeness_score` integer NOT NULL,
	`clarity_score` integer NOT NULL,
	`feedback_json` text NOT NULL,
	`reviewed_at` text NOT NULL
);
