-- Distinguish fixable listing problems from policy violations.
ALTER TYPE "ListingStatus" ADD VALUE 'CHANGES_REQUESTED';
ALTER TABLE "Listing" ADD COLUMN "moderationReason" TEXT;
