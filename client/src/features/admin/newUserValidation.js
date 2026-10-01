const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const MIN_PASSWORD_LENGTH = 8

// Mirrors the server rules so obvious mistakes are caught before the request; the server
// remains the authority.
export const validateNewUser = ({ name = '', email = '', password = '' } = {}) => {
  if (!name.trim()) {
    return 'Name is required'
  }

  if (!EMAIL_PATTERN.test(email.trim())) {
    return 'Enter a valid email address'
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`
  }

  return ''
}

export const getCreateUserErrorMessage = (error) =>
  error.response?.data?.details?.[0]?.message ||
  error.response?.data?.error ||
  error.message ||
  'Unable to create the account right now'
