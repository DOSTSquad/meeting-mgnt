UPDATE users
SET role = 'staff'
WHERE role NOT IN ('staff', 'admin');

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('staff', 'admin'));
