import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Each test renders into a fresh document; without this a later query can match
// a node left behind by an earlier one.
afterEach(cleanup)
