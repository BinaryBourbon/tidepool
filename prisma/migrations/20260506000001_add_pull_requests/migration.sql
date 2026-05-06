-- CreateTable
CREATE TABLE "pull_requests" (
    "id" TEXT NOT NULL,
    "work_item_id" TEXT NOT NULL,
    "github_pr_number" INTEGER NOT NULL,
    "github_repo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'open',
    "head_branch" TEXT NOT NULL,
    "base_branch" TEXT NOT NULL,
    "author_handle" TEXT,
    "additions" INTEGER,
    "deletions" INTEGER,
    "opened_at" TIMESTAMP(3) NOT NULL,
    "merged_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pull_requests_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
