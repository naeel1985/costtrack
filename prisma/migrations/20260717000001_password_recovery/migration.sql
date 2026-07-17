-- Password reset without losing the encryption key.
--
-- The DEK is wrapped by a key derived from the user's password, so a reset --
-- which by definition happens without that password -- would leave the data
-- permanently unreadable. These columns hold the SAME DEK wrapped a second time
-- by a key derived from a one-time recovery code; a reset unwraps with the code
-- and re-wraps under the new password.
--
-- The recovery code itself is never stored, so this does NOT let anyone with the
-- database (admin included) read user data. Nullable because accounts created
-- before this mint theirs from the app while signed in.
ALTER TABLE "User" ADD COLUMN "dekRecoveryWrapped" TEXT;
ALTER TABLE "User" ADD COLUMN "dekRecoverySalt" TEXT;
