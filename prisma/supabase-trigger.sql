-- ============================================================
-- Supabase Database Triggers for User Synchronization
-- ============================================================
-- These triggers sync auth.users with public.users (Prisma User model)
-- Handles: INSERT, UPDATE, DELETE
--
-- IMPORTANT: Run this SQL in your Supabase SQL Editor after
-- running `npx prisma db push`
-- ============================================================

-- ============================================================
-- 1. HANDLE NEW USER (INSERT)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_account_id UUID;
  v_role TEXT;
BEGIN
  -- Extract role and accountId from user_metadata
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'TESTER');
  v_account_id := (NEW.raw_user_meta_data->>'accountId')::UUID;

  -- If no accountId provided, create a new account
  IF v_account_id IS NULL THEN
    INSERT INTO "Account" (id, name, "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid(),
      COALESCE(NEW.email, 'New Account'),
      NOW(),
      NOW()
    )
    RETURNING id INTO v_account_id;
  END IF;

  -- Insert user into public.users table
  INSERT INTO public.users (
    id,
    supabase_id,
    email,
    role,
    account_id,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    NEW.id,
    NEW.email,
    v_role::"Role",
    v_account_id,
    NOW(),
    NOW()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. HANDLE USER UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Extract role from user_metadata if changed
  v_role := NEW.raw_user_meta_data->>'role';

  -- Update user in public.users table
  UPDATE public.users
  SET 
    email = NEW.email,
    role = COALESCE(v_role::"Role", role),
    updated_at = NOW()
  WHERE supabase_id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. HANDLE USER DELETE
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_user_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_account_id UUID;
  v_user_count INTEGER;
BEGIN
  -- Get the user's account_id before deletion
  SELECT account_id INTO v_account_id
  FROM public.users
  WHERE supabase_id = OLD.id;

  -- Delete user from public.users table
  DELETE FROM public.users
  WHERE supabase_id = OLD.id;

  -- Check if account has any remaining users
  SELECT COUNT(*) INTO v_user_count
  FROM public.users
  WHERE account_id = v_account_id;

  -- If no users left in account, optionally delete the account
  -- Uncomment below if you want to auto-delete empty accounts
  -- IF v_user_count = 0 THEN
  --   DELETE FROM "Account" WHERE id = v_account_id;
  -- END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- DROP EXISTING TRIGGERS (if any)
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;

-- ============================================================
-- CREATE TRIGGERS
-- ============================================================

-- Trigger: After INSERT on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Trigger: After UPDATE on auth.users
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_update();

-- Trigger: Before DELETE on auth.users (use BEFORE to access OLD data)
CREATE TRIGGER on_auth_user_deleted
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_delete();

-- ============================================================
-- VERIFICATION: Check triggers are installed
-- ============================================================
-- Run this to verify:
-- SELECT trigger_name, event_manipulation, action_timing
-- FROM information_schema.triggers
-- WHERE event_object_table = 'users'
--   AND event_object_schema = 'auth';
