BEGIN;

ALTER TABLE users
  ADD COLUMN role text;

UPDATE users
SET role = 'student'
WHERE role IS NULL;

ALTER TABLE users
  ALTER COLUMN role SET DEFAULT 'student';

ALTER TABLE users
  ALTER COLUMN role SET NOT NULL;

ALTER TABLE users
  ADD CONSTRAINT users_role_valid CHECK (role IN ('student', 'teacher', 'school_admin', 'district_admin'));

ALTER TABLE app_review_records
  ADD COLUMN reviewed_by_role text;

ALTER TABLE app_review_records
  ADD CONSTRAINT app_review_records_reviewer_role_valid CHECK (
    reviewed_by_role IS NULL OR reviewed_by_role IN ('student', 'teacher', 'school_admin', 'district_admin')
  );

COMMIT;
