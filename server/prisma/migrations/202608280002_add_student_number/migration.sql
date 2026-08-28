ALTER TABLE "User" ADD COLUMN "studentNumber" TEXT;

UPDATE "User"
SET "studentNumber" = substring("nickname" FROM '^BITer([0-9]{8,12})$')
WHERE "nickname" ~ '^BITer[0-9]{8,12}$';

CREATE UNIQUE INDEX "User_studentNumber_key" ON "User"("studentNumber");
