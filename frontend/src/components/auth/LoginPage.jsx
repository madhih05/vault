import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../../services/api'

function LoginPage() {
  const navigate = useNavigate()
  const [formState, setFormState] = useState({ username: '', password: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const canSubmit = useMemo(() => {
    return formState.username.trim() && formState.password.trim() && !isSubmitting
  }, [formState, isSubmitting])

  const handleInputChange = (event) => {
    const { name, value } = event.target
    setFormState((previous) => ({ ...previous, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    setErrorMessage('')

    try {
      await login({
        username: formState.username.trim(),
        password: formState.password,
      })
      navigate('/vault', { replace: true })
    } catch (error) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Login failed. Verify your credentials and try again.'
      setErrorMessage(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-stone-100 via-amber-50 to-sky-100 px-4 py-8 sm:px-6">
      <div className="mx-auto flex min-h-[90vh] w-full max-w-6xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-3xl border border-stone-200 bg-white/85 shadow-2xl backdrop-blur-sm lg:grid-cols-[1.05fr_0.95fr]">
          <div className="hidden bg-slate-900 p-10 text-slate-100 lg:flex lg:flex-col lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">Secure Node</p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight text-white">
                Vault Access Portal
              </h1>
              <p className="mt-4 max-w-sm text-sm text-slate-300">
                Encrypted media and document controls are available after authentication.
                Session credentials are scoped to the current tab.
              </p>
            </div>
            <p className="text-xs text-slate-400">Session token is stored in sessionStorage and auto-sent as x-auth-token.</p>
          </div>

          <div className="p-6 sm:p-10">
            <h2 className="font-serif text-3xl text-slate-900">Sign in</h2>
            <p className="mt-2 text-sm text-slate-600">Authenticate to open your private vault dashboard.</p>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="username">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  value={formState.username}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={formState.password}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                  required
                />
              </div>

              {errorMessage ? (
                <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
              ) : null}

              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Authenticating...' : 'Enter Vault'}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}

export default LoginPage
