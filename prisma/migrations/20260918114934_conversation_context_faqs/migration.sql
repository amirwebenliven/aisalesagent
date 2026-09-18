-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "contextFaqIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
