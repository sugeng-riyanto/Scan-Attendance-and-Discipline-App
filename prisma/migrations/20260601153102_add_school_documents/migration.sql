-- DropIndex
DROP INDEX "DutySchedule_userId_date_shift_key";

-- CreateTable
CREATE TABLE "SchoolDocument" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "period" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolDocument_type_idx" ON "SchoolDocument"("type");

-- CreateIndex
CREATE INDEX "SchoolDocument_isPublished_idx" ON "SchoolDocument"("isPublished");
