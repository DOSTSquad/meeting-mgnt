import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  getChangePasswordErrorMessage,
  validatePasswordChange,
} from '../src/features/auth/passwordChangeValidation.js'

const valid = {
  currentPassword: 'current-pass-1',
  newPassword: 'brand-new-pass-2',
  confirmPassword: 'brand-new-pass-2',
}

test('accepts a complete password change', () => {
  assert.equal(validatePasswordChange(valid), '')
})

test('requires the current password', () => {
  assert.equal(
    validatePasswordChange({ ...valid, currentPassword: '' }),
    'Enter your current password'
  )
})

test('requires a new password of at least 8 characters', () => {
  assert.equal(
    validatePasswordChange({ ...valid, newPassword: '1234567', confirmPassword: '1234567' }),
    'New password must be at least 8 characters long'
  )
})

test('rejects a new password equal to the current one', () => {
  assert.equal(
    validatePasswordChange({
      ...valid,
      newPassword: valid.currentPassword,
      confirmPassword: valid.currentPassword,
    }),
    'New password must be different from the current password'
  )
})

test('rejects a confirmation that does not match', () => {
  assert.equal(
    validatePasswordChange({ ...valid, confirmPassword: 'something-else-3' }),
    'The new password and its confirmation do not match'
  )
})

test('reports the first validation detail, then the server error, then the message', () => {
  assert.equal(
    getChangePasswordErrorMessage({
      response: {
        data: {
          error: 'Validation failed',
          details: [{ message: 'Current password is required' }],
        },
      },
    }),
    'Current password is required'
  )
  assert.equal(
    getChangePasswordErrorMessage({
      response: { data: { error: 'Current password is incorrect' } },
    }),
    'Current password is incorrect'
  )
  assert.equal(getChangePasswordErrorMessage(new Error('Network Error')), 'Network Error')
})
