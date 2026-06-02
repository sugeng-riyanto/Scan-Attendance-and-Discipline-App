-- Clean existing data first so NOT NULL columns can be added
DELETE FROM "DutySchedule";

-- DropForeignKey
ALTER TABLE "DutySchedule" DROP CONSTRAINT "DutySchedule_classId_fkey";

-- DropForeignKey
ALTER TABLE "DutySchedule" DROP CONSTRAINT "DutySchedule_userId_fkey";

-- AlterTable
ALTER TABLE "DutySchedule" DROP COLUMN "classId",
DROP COLUMN "date",
DROP COLUMN "notes",
DROP COLUMN "shift",
DROP COLUMN "userId",
ADD COLUMN     "dayOfWeek" INTEGER NOT NULL,
ADD COLUMN     "endTime" TEXT NOT NULL,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "location" TEXT NOT NULL,
ADD COLUMN     "startTime" TEXT NOT NULL,
ADD COLUMN     "tasks" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "teacherId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "DutySubstitute" (
    "id" TEXT NOT NULL,
    "dutyScheduleId" TEXT NOT NULL,
    "substituteTeacherId" TEXT NOT NULL,
    "originalTeacherId" TEXT NOT NULL,
    "substituteDate" DATE NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DutySubstitute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DutySubstitute_substituteDate_idx" ON "DutySubstitute"("substituteDate");

-- CreateIndex
CREATE UNIQUE INDEX "DutySubstitute_dutyScheduleId_substituteDate_key" ON "DutySubstitute"("dutyScheduleId", "substituteDate");

-- CreateIndex
CREATE INDEX "DutySchedule_dayOfWeek_isActive_idx" ON "DutySchedule"("dayOfWeek", "isActive");

-- CreateIndex
CREATE INDEX "DutySchedule_teacherId_idx" ON "DutySchedule"("teacherId");

-- AddForeignKey
ALTER TABLE "DutySchedule" ADD CONSTRAINT "DutySchedule_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutySubstitute" ADD CONSTRAINT "DutySubstitute_dutyScheduleId_fkey" FOREIGN KEY ("dutyScheduleId") REFERENCES "DutySchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutySubstitute" ADD CONSTRAINT "DutySubstitute_substituteTeacherId_fkey" FOREIGN KEY ("substituteTeacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutySubstitute" ADD CONSTRAINT "DutySubstitute_originalTeacherId_fkey" FOREIGN KEY ("originalTeacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
