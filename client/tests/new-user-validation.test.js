import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  getCreateUserErrorMessage,
  validateNewUser,
} from '../src/features/admin/newUserValidation.js'

const valid = { name: 'Sam Rivera', email: 'sam@example.com', password: 'long-enough-1' }

test('accepts a complete new user', () => {
  assert.equal(validateNewUser(valid), '')
})

test('requires a name', () => {
  assert.equal(validateNewUser({ ...valid, name: '   ' }), 'Name is required')
})

test('requires a valid email address', () => {
  assert.equal(validateNewUser({ ...valid, email: 'sam@' }), 'Enter a valid email address')
  assert.equal(validateNewUser({ ...valid, email: '' }), 'Enter a valid email address')
})

test('requires a password of at least 8 characters', () => {
  assert.equal(
    validateNewUser({ ...valid, password: '1234567' }),
    'Password must be at least 8 characters long'
  )
  assert.equal(validateNewUser({ ...valid, password: '12345678' }), '')
})

test('prefers the first validation detail from the server', () => {
  const error = {
    response: { data: { error: 'Validation failed', details: [{ message: 'Email is required' }] } },
  }

  assert.equal(getCreateUserErrorMessage(error), 'Email is required')
})

test('falls back to the server error, then the error message', () => {
  assert.equal(
    getCreateUserErrorMessage({
      response: { data: { error: 'A user with this email already exists' } },
    }),
    'A user with this email already exists'
  )
  assert.equal(getCreateUserErrorMessage(new Error('Network Error')), 'Network Error')
})
