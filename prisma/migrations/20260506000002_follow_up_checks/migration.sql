-- CreateTable
CREATE TABLE "follow_up_checks" (
    "id" TEXT NOT NULL,
    "work_item_id" TEXT NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posthog_after_value" DOUBLE PRECISION,
    "posthog_delta" DOUBLE PRECISION,
    "metric_passed" BOOLEAN,
    "honeycomb_error_rate_ok" BOOLEAN,
    "honeycomb_latency_ok" BOOLEAN,
    "anomaly_detected" BOOLEAN NOT NULL DEFAULT false,
    "raw_posthog_response" JSONB,
    "raw_honeycomb_response" JSONB,

    CONSTRAINT "follow_up_checks_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "follow_up_checks" ADD CONSTRAINT "follow_up_checks_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
