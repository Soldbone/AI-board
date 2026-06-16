-- Allow signup without an email address.
-- PostgreSQL unique indexes allow multiple NULL values, so the existing unique
-- constraint/index on users.email can remain in place for legacy users.
DO $$
BEGIN
    IF to_regclass('public.users') IS NOT NULL THEN
        ALTER TABLE public.users
            ALTER COLUMN email DROP NOT NULL;
    END IF;
END
$$;
