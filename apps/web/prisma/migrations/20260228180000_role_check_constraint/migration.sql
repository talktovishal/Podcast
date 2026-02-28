-- Add CHECK constraint to enforce role must be USER or ADMIN
ALTER TABLE "User" ADD CONSTRAINT "User_role_check" CHECK (role IN ('USER', 'ADMIN'));
