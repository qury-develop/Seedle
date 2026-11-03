CREATE TABLE `auth_account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_provider_idx` ON `auth_account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `auth_account` (`user_id`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "comment_length" CHECK(length("comments"."body") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE INDEX `comments_post_idx` ON `comments` (`post_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`status` text DEFAULT '募集中' NOT NULL,
	`problem` text NOT NULL,
	`desired` text NOT NULL,
	`target_user` text,
	`current_workaround` text,
	`is_anonymous` integer DEFAULT false NOT NULL,
	`published_url` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "post_status" CHECK("posts"."status" IN ('募集中','開発中','公開済み')),
	CONSTRAINT "post_category" CHECK("posts"."category" IN ('暮らし','仕事','学び','お店','健康','地域')),
	CONSTRAINT "post_title_length" CHECK(length("posts"."title") BETWEEN 1 AND 120)
);
--> statement-breakpoint
CREATE INDEX `posts_created_idx` ON `posts` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `posts_author_idx` ON `posts` (`author_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `posts_category_idx` ON `posts` (`category`,`created_at`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`nickname` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "nickname_length" CHECK(length("profiles"."nickname") BETWEEN 1 AND 30)
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_expiry_idx` ON `rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `reactions` (
	`post_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`post_id`, `profile_id`, `kind`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reaction_kind" CHECK("reactions"."kind" IN ('want','build','watch'))
);
--> statement-breakpoint
CREATE INDEX `reactions_profile_idx` ON `reactions` (`profile_id`,`kind`,`post_id`);--> statement-breakpoint
CREATE TABLE `auth_session` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_session_token_unique` ON `auth_session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `auth_session` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_user_email_unique` ON `auth_user` (`email`);--> statement-breakpoint
CREATE TABLE `auth_verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `auth_verification` (`identifier`);