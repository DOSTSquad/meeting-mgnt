import { randomBytes } from 'node:crypto'

// 12 random bytes encode to 16 base64url characters.
const GENERATED_PASSWORD_BYTES = 12

export const assertSeedAllowed = (env = process.env) => {
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to seed with NODE_ENV=production: the seed deletes meetings and non-seed users.'
    )
  }
}

export const resolveSeedPassword = (
  env = process.env,
  generate = () => randomBytes(GENERATED_PASSWORD_BYTES).toString('base64url')
) => {
  if (env.SEED_PASSWORD) {
    return { password: env.SEED_PASSWORD, generated: false }
  }

  return { password: generate(), generated: true }
}

export const shouldResetCredentials = (env = process.env) => env.SEED_RESET_PASSWORDS === 'true'

// Only accounts the run created (or reset) use the seed password; the others keep the credentials
// they already had, so listing them under the printed password would be wrong.
export const formatSeedCredentialSummary = ({ password, generated, appliedEmails, keptEmails }) => {
  const lines = []

  if (appliedEmails.length > 0) {
    lines.push(
      generated
        ? `Password for the accounts below (generated for this run, shown once): ${password}`
        : 'Password for the accounts below: the value of SEED_PASSWORD',
      ...appliedEmails.map((email) => `  - ${email}`)
    )
  }

  if (keptEmails.length > 0) {
    lines.push(
      'Existing accounts kept their password and role (set SEED_RESET_PASSWORDS=true to reset them):',
      ...keptEmails.map((email) => `  - ${email}`)
    )
  }

  return lines
}
