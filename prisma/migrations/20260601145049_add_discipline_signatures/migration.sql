-- AlterTable
ALTER TABLE "GoodDeed" ADD COLUMN     "scanMethod" TEXT DEFAULT 'MANUAL',
ADD COLUMN     "studentSignature" TEXT,
ADD COLUMN     "teacherSignature" TEXT;

-- AlterTable
ALTER TABLE "Violation" ADD COLUMN     "scanMethod" TEXT DEFAULT 'MANUAL',
ADD COLUMN     "studentSignature" TEXT,
ADD COLUMN     "teacherSignature" TEXT;
