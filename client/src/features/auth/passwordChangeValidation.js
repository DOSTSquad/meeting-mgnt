export const MIN_PASSWORD_LENGTH = 8

// Mirrors the server rules so obvious mistakes are caught before the request; the server
// remains the authority.
export const validatePasswordChange = ({
  currentPassword = '',
  newPassword = '',
  confirmPassword = '',
} = {}) => {
  if (!currentPassword) {
    return 'Enter your current password'
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return `New password must be at least ${MIN_PASSWORD_LENGTH} characters long`
  }

  if (newPassword === currentPassword) {
    return 'New password must be different from the current password'
  }

  if (newPassword !== confirmPassword) {
    return 'The new password and its confirmation do not match'
  }

  return ''
}

export const getChangePasswordErrorMessage = (error) =>
  error.response?.data?.details?.[0]?.message ||
  error.response?.data?.error ||
  error.message ||
  'Unable to change your password right now'
