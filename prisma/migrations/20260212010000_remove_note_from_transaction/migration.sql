-- AlterTable: Remove note column from Transaction
ALTER TABLE "Transaction" DROP COLUMN IF EXISTS "note";
