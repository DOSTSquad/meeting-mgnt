import { useMemo, useState } from 'react'

import { register } from '../../services/authService.js'

export const RegisterView = ({ onRegister, onShowLogin }) => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const trimmedName = useMemo(() => name.trim(), [name])
  const trimmedEmail = useMemo(() => email.trim(), [email])

  const handleRegister = async (event) => {
    event.preventDefault()

    if (!trimmedName || !trimmedEmail || !password) {
      setErrorMessage('Please enter name, email, and password')
      return
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long')
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMessage('')

      const { token, user } = await register({
        name: trimmedName,
        email: trimmedEmail,
        password,
      })

      if (!token || !user) {
        throw new Error('Invalid registration response from server')
      }

      onRegister({ token, user })
    } catch (error) {
      setErrorMessage(
        error.response?.data?.error ||
          error.response?.data?.message ||
          error.message ||
          'Unable to create account right now'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 sm:px-6 sm:py-8">
      <section className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-300/40 lg:grid-cols-2">
        <div className="relative hidden bg-slate-900 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Welcome</p>
            <h2 className="mt-4 max-w-sm text-3xl font-semibold leading-tight text-white">
              Create your account and start managing meetings
            </h2>
          </div>
          <div className="rounded-2xl border border-slate-700/70 bg-slate-800/60 p-6">
            <p className="text-base font-medium text-slate-200">DOST Meeting Platform</p>
            <p className="mt-2 text-sm text-slate-400">
              meeting organise, summarise and follow-up meetings
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center p-5 sm:p-8 lg:p-12">
          <div className="w-full max-w-md">
            <header className="mb-8 text-center lg:text-left">
              <div className="mb-5 flex items-center justify-center gap-4 lg:justify-start">
                <img src="/logo.png" alt="DOST logo" className="h-16 w-auto sm:h-20" />
                <p className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-600 sm:text-base">
                  Meeting Management System
                </p>
              </div>
              <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Register</h1>
              <p className="mt-2 text-sm text-slate-500">Create an account to continue</p>
            </header>

            <form className="space-y-4" onSubmit={handleRegister}>
              <div>
                <label htmlFor="name" className="text-sm font-medium text-slate-700">
                  Full name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Your full name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-2 block h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label htmlFor="email" className="text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 block h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label htmlFor="password" className="text-sm font-medium text-slate-700">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 block h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {errorMessage ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {errorMessage}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-3 h-11 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-400"
              >
                {isSubmitting ? 'Creating account...' : 'Create account'}
              </button>

              <p className="text-center text-sm text-slate-600">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={onShowLogin}
                  className="font-semibold text-blue-700 transition hover:text-blue-800"
                >
                  Sign In
                </button>
              </p>
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}
