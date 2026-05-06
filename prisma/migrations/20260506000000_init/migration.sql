-- CreateEnum
CREATE TYPE "WorkItemState" AS ENUM ('plan', 'executing', 'shipped', 'done');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('pending', 'running', 'complete', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "work_items" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "owner_handles" TEXT[],
    "feature_flag_name" TEXT,
    "acceptance_metric" TEXT,
    "state" "WorkItemState" NOT NULL DEFAULT 'plan',
    "baseline_metric_value" DOUBLE PRECISION,
    "posthog_rollout_pct" INTEGER,
    "shipped_at" TIMESTAMP(3),
    "github_repo" TEXT NOT NULL,
    "github_branch" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "work_item_id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'pending',
    "stream_log" JSONB NOT NULL DEFAULT '[]',
    "aod_conversation_id" TEXT,
    "github_pr_number" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_items_slug_key" ON "work_items"("slug");

-- CreateIndex
CREATE INDEX "agent_runs_aod_conversation_id_idx" ON "agent_runs"("aod_conversation_id");

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
