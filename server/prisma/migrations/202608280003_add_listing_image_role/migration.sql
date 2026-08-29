CREATE TYPE "ListingImageRole" AS ENUM ('COVER', 'ISBN', 'GALLERY');

ALTER TABLE "ListingImage"
ADD COLUMN "role" "ListingImageRole" NOT NULL DEFAULT 'GALLERY';
