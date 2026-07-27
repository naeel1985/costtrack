-- Sliding inactivity window (seconds) for bearer/mobile sessions.
-- Null = no idle timeout (web cookie sessions keep only the absolute expiry).
ALTER TABLE "Session" ADD COLUMN "idleTimeoutSec" INTEGER;
