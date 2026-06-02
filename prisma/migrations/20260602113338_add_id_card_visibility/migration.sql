-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "idCardVisibleToParent" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "idCardVisibleToStudent" BOOLEAN NOT NULL DEFAULT true;
