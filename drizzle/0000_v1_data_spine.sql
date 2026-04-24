CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"cited_document_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reasoning_trace" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"page_num" integer NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"content_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
	"embedding" vector(1024),
	"bbox" jsonb,
	"content_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"page_num" integer NOT NULL,
	"text_content" text,
	"raster_r2_key" text,
	"page_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"r2_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_sha256" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"mime_type" text,
	"page_count" integer,
	"doc_type" text,
	"identity" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submittal_status" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drawing_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"page_num" integer NOT NULL,
	"annotation_type" text,
	"equipment_tag" text,
	"tag_normalized" text,
	"label" text,
	"bbox" jsonb NOT NULL,
	"content_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"tag" text,
	"tag_normalized" text,
	"name" text,
	"category" text NOT NULL,
	"csi_sections" text[] DEFAULT '{}'::text[] NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fed_from" uuid,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tag_aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_csi_map" (
	"category" text PRIMARY KEY NOT NULL,
	"csi_sections" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"kind" text NOT NULL,
	"rule_id" text,
	"severity" text NOT NULL,
	"verdict" text NOT NULL,
	"confidence" numeric NOT NULL,
	"time_to_impact_days" integer,
	"category" text NOT NULL,
	"equipment_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reasoning_trace" jsonb,
	"models_disagree" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hash_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"content_sha256" text NOT NULL,
	"payload" jsonb NOT NULL,
	"token_cost" integer,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"purpose" text NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"image_count" integer DEFAULT 0,
	"cost_usd" numeric,
	"latency_ms" integer,
	"error" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"available_fault_current_ka" numeric,
	"day_of_total" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spec_paragraphs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"csi_section" text,
	"csi_part" text,
	"csi_article" text,
	"csi_paragraph" text,
	"requirement_type" text,
	"referenced_standards" text[] DEFAULT '{}'::text[] NOT NULL,
	"content" text NOT NULL,
	"content_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
	"embedding" vector(1024),
	"page_num" integer,
	"bbox" jsonb,
	"content_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submittal_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"equipment_tag" text,
	"tag_normalized" text,
	"vendor" text,
	"model_num" text,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"page_num" integer,
	"bbox" jsonb,
	"content_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_org_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_annotations" ADD CONSTRAINT "drawing_annotations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_annotations" ADD CONSTRAINT "drawing_annotations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spec_paragraphs" ADD CONSTRAINT "spec_paragraphs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spec_paragraphs" ADD CONSTRAINT "spec_paragraphs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submittal_fields" ADD CONSTRAINT "submittal_fields_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submittal_fields" ADD CONSTRAINT "submittal_fields_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_session_idx" ON "chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "chat_sessions_project_idx" ON "chat_sessions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "document_chunks_workspace_idx" ON "document_chunks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "document_chunks_document_idx" ON "document_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_chunks_doc_page_chunk_idx" ON "document_chunks" USING btree ("document_id","page_num","chunk_index");--> statement-breakpoint
CREATE INDEX "document_chunks_content_tsv_idx" ON "document_chunks" USING gin ("content_tsv");--> statement-breakpoint
CREATE INDEX "document_chunks_embedding_idx" ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "document_pages_doc_page_idx" ON "document_pages" USING btree ("document_id","page_num");--> statement-breakpoint
CREATE INDEX "document_pages_page_sha_idx" ON "document_pages" USING btree ("page_sha256");--> statement-breakpoint
CREATE INDEX "documents_project_idx" ON "documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "documents_workspace_idx" ON "documents" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "documents_content_sha_idx" ON "documents" USING btree ("content_sha256");--> statement-breakpoint
CREATE INDEX "drawing_annotations_workspace_idx" ON "drawing_annotations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "drawing_annotations_document_idx" ON "drawing_annotations" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "drawing_annotations_tag_normalized_idx" ON "drawing_annotations" USING btree ("tag_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_project_tag_normalized_idx" ON "equipment" USING btree ("project_id","tag_normalized");--> statement-breakpoint
CREATE INDEX "equipment_project_category_idx" ON "equipment" USING btree ("project_id","category");--> statement-breakpoint
CREATE INDEX "equipment_fed_from_idx" ON "equipment" USING btree ("fed_from");--> statement-breakpoint
CREATE INDEX "findings_workspace_idx" ON "findings" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "findings_project_severity_status_idx" ON "findings" USING btree ("project_id","severity","status");--> statement-breakpoint
CREATE INDEX "findings_kind_idx" ON "findings" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "hash_cache_content_sha_idx" ON "hash_cache" USING btree ("content_sha256");--> statement-breakpoint
CREATE INDEX "hash_cache_purpose_idx" ON "hash_cache" USING btree ("purpose");--> statement-breakpoint
CREATE INDEX "llm_calls_project_created_idx" ON "llm_calls" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "llm_calls_workspace_idx" ON "llm_calls" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "projects_workspace_idx" ON "projects" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "spec_paragraphs_workspace_idx" ON "spec_paragraphs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "spec_paragraphs_document_idx" ON "spec_paragraphs" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "spec_paragraphs_csi_section_idx" ON "spec_paragraphs" USING btree ("csi_section");--> statement-breakpoint
CREATE INDEX "spec_paragraphs_requirement_type_idx" ON "spec_paragraphs" USING btree ("requirement_type");--> statement-breakpoint
CREATE INDEX "spec_paragraphs_content_sha_idx" ON "spec_paragraphs" USING btree ("content_sha256");--> statement-breakpoint
CREATE INDEX "spec_paragraphs_content_tsv_idx" ON "spec_paragraphs" USING gin ("content_tsv");--> statement-breakpoint
CREATE INDEX "spec_paragraphs_embedding_idx" ON "spec_paragraphs" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "submittal_fields_workspace_idx" ON "submittal_fields" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "submittal_fields_document_idx" ON "submittal_fields" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "submittal_fields_tag_normalized_idx" ON "submittal_fields" USING btree ("tag_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_clerk_org_id_idx" ON "workspaces" USING btree ("clerk_org_id");