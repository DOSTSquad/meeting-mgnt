import { randomBytes } from 'node:crypto'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DEFAULT_ADMIN_NAME = 'Administrator'
const MIN_PASSWORD_LENGTH = 8

// 15 random bytes encode to 20 base64url characters.
const GENERATED_PASSWORD_BYTES = 15

export const EXIT_OK = 0
export const EXIT_FAILED = 1
export const EXIT_NO_ADMIN = 2

export const USAGE = `Usage: npm run create-admin --workspace=server -- [--email <address>] [--name <name>] [--promote]

  --email     Address of the administrator to create. Without it the command only checks that an
              administrator exists (exit 0) or reports that none does (exit 2).
  --name      Display name for a new account (default: ${DEFAULT_ADMIN_NAME}).
  --promote   Allow an existing staff account with that email to become an administrator.

The password is read from the ADMIN_PASSWORD environment variable, never from an argument. If it
is unset a random password is generated and printed once, as an "admin-password:" line.
The last line of output is "admin-account: created|exists|promoted".
Exit codes: 0 done, 1 refused or failed, 2 no administrator exists and no --email was given.`

export const parseArgs = (argv) => {
  const options = { email: null, name: DEFAULT_ADMIN_NAME, promote: false, help: false }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const equals = arg.indexOf('=')
    const flag = equals === -1 ? arg : arg.slice(0, equals)
    const readValue = () => {
      if (equals !== -1) {
        return arg.slice(equals + 1)
      }

      index += 1
      const value = argv[index]

      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${flag} needs a value`)
      }

      return value
    }

    if (flag === '--email') {
      options.email = readValue()
    } else if (flag === '--name') {
      options.name = readValue()
    } else if (flag === '--promote') {
      options.promote = true
    } else if (flag === '--help' || flag === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

export const resolveAdminPassword = (
  env = process.env,
  generate = () => randomBytes(GENERATED_PASSWORD_BYTES).toString('base64url')
) => {
  if (env.ADMIN_PASSWORD) {
    return { password: env.ADMIN_PASSWORD, generated: false }
  }

  return { password: generate(), generated: true }
}

export const isPasswordAcceptable = (password) => password.length >= MIN_PASSWORD_LENGTH

export const decideAdminAction = ({ email, existingUser, anyAdminExists, promote }) => {
  if (!email) {
    return { action: anyAdminExists ? 'exists' : 'need-email' }
  }

  if (!existingUser) {
    return { action: 'create' }
  }

  if (existingUser.role === 'admin') {
    return { action: 'exists' }
  }

  return { action: promote ? 'promote' : 'refuse' }
}

// The generated password is only worth printing when this run created the account with it; on
// every other outcome it was either never used or belongs to an account that already had one.
export const buildResultLines = ({ status, email, password, generated }) => {
  const lines = []

  if (status === 'created') {
    lines.push(`Created administrator account ${email}.`)
  } else if (status === 'promoted') {
    lines.push(`Promoted ${email} to administrator; its password is unchanged.`)
  } else if (email) {
    lines.push(`Administrator account ${email} already exists; nothing changed.`)
  } else {
    lines.push('An administrator account already exists; nothing changed.')
  }

  if (status === 'created' && generated) {
    lines.push(`admin-password: ${password}`)
  }

  lines.push(`admin-account: ${status}`)

  return lines
}

const failure = (exitCode, ...err) => ({ exitCode, out: [], err })

export const runCreateAdmin = async ({ argv, env, deps }) => {
  let options

  try {
    options = parseArgs(argv)
  } catch (error) {
    return failure(EXIT_FAILED, error.message, USAGE)
  }

  if (options.help) {
    return { exitCode: EXIT_OK, out: [USAGE], err: [] }
  }

  const email = options.email?.trim().toLowerCase() || null

  if (email && !EMAIL_PATTERN.test(email)) {
    return failure(EXIT_FAILED, '--email must be a valid email address')
  }

  try {
    const existingUser = email ? await deps.findUserByEmail(email) : null
    const anyAdminExists = email ? false : await deps.existsAdmin()
    const { action } = decideAdminAction({
      email,
      existingUser,
      anyAdminExists,
      promote: options.promote,
    })

    if (action === 'need-email') {
      return failure(
        EXIT_NO_ADMIN,
        'No administrator exists. Provide --email <address> to create one.'
      )
    }

    if (action === 'refuse') {
      return failure(
        EXIT_FAILED,
        `${email} already exists as a ${existingUser.role} account. Re-run with --promote to make it an administrator, or use another email.`
      )
    }

    if (action === 'exists') {
      return { exitCode: EXIT_OK, out: buildResultLines({ status: 'exists', email }), err: [] }
    }

    if (action === 'promote') {
      await deps.promoteToAdmin(existingUser.id)

      return { exitCode: EXIT_OK, out: buildResultLines({ status: 'promoted', email }), err: [] }
    }

    const { password, generated } = resolveAdminPassword(env, deps.generatePassword)

    if (!isPasswordAcceptable(password)) {
      return failure(
        EXIT_FAILED,
        `ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters long.`
      )
    }

    await deps.createAdmin({ name: options.name, email, password })

    return {
      exitCode: EXIT_OK,
      out: buildResultLines({ status: 'created', email, password, generated }),
      err: [],
    }
  } catch (error) {
    return failure(EXIT_FAILED, `create-admin failed: ${error.message}`)
  }
}
