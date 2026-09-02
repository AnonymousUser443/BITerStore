CREATE TABLE "UserFeedback" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserFeedback_type_createdAt_idx" ON "UserFeedback"("type", "createdAt" DESC);
CREATE INDEX "UserFeedback_userId_createdAt_idx" ON "UserFeedback"("userId", "createdAt" DESC);

ALTER TABLE "UserFeedback"
ADD CONSTRAINT "UserFeedback_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
