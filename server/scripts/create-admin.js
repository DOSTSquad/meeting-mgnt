// Must stay first: ESM hoists imports above ordinary statements, so .env has to
// be loaded by an import, not a call below them. See server/load-env.js.
import '../load-env.js'

import { closePool } from '../db/postgres.js'
import { existsAdmin, findUserByEmail, updateUser } from '../repositories/user-repository.js'
import { createAccount } from '../services/auth-service.js'

import { runCreateAdmin } from './create-admin-logic.js'

// Creates the first administrator on a host where self-registration is closed and nobody can log
// in yet. Safe to re-run; see USAGE in create-admin-logic.js.
const deps = {
  findUserByEmail,
  existsAdmin,
  promoteToAdmin: (id) => updateUser(id, { role: 'admin' }),
  createAdmin: ({ name, email, password }) =>
    createAccount({ name, email, password, role: 'admin' }),
}

try {
  const { exitCode, out, err } = await runCreateAdmin({
    argv: process.argv.slice(2),
    env: process.env,
    deps,
  })

  out.forEach((line) => console.log(line))
  err.forEach((line) => console.error(line))
  process.exitCode = exitCode
} finally {
  await closePool()
}
