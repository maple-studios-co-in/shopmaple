-- The owner's four access levels (14 Nov 2026): View, Edit, Publish, and Enquiries on its own.
-- Two new values on the staff role; no existing row changes. They are not used in this migration,
-- because PostgreSQL does not allow a new enum value to be used in the transaction that adds it.
ALTER TYPE "ShopAdminRole" ADD VALUE IF NOT EXISTS 'viewer';
ALTER TYPE "ShopAdminRole" ADD VALUE IF NOT EXISTS 'none';
