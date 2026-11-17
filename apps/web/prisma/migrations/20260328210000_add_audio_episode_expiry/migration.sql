ALTER TABLE "Episode" ADD COLUMN "expiresAt" DATETIME;
ALTER TABLE "DigestEpisode" ADD COLUMN "expiresAt" DATETIME;
ALTER TABLE "SummaryEpisode" ADD COLUMN "expiresAt" DATETIME;

CREATE INDEX "Episode_expiresAt_idx" ON "Episode"("expiresAt");
CREATE INDEX "DigestEpisode_expiresAt_idx" ON "DigestEpisode"("expiresAt");
CREATE INDEX "SummaryEpisode_expiresAt_idx" ON "SummaryEpisode"("expiresAt");
