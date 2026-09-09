ALTER TABLE "trend_items" ADD CONSTRAINT "trend_items_id_rights_scope_uq" UNIQUE("id","rights_scope");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "billing_contact_user_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_billing_contact_user_id_users_id_fk" FOREIGN KEY ("billing_contact_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopsies" ADD CONSTRAINT "autopsies_trend_item_rights_scope_fk" FOREIGN KEY ("trend_item_id","rights_scope") REFERENCES "public"."trend_items"("id","rights_scope") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopsy_cache_claims" ADD CONSTRAINT "autopsy_cache_claims_trend_item_rights_scope_fk" FOREIGN KEY ("trend_item_id","rights_scope") REFERENCES "public"."trend_items"("id","rights_scope") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_transcripts" ADD CONSTRAINT "trend_transcripts_trend_item_rights_scope_fk" FOREIGN KEY ("trend_item_id","rights_scope") REFERENCES "public"."trend_items"("id","rights_scope") ON DELETE cascade ON UPDATE no action;
