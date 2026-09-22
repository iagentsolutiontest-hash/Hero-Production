import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { ApiError } from '../lib/api';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const { login } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="font-display text-2xl mb-1">Sign in</h1>
      <p className="text-sm text-ink/60 mb-6">Welcome back to Hero.</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-xs text-ink/60 mb-1 block">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ledger/40"
          />
        </div>
        <div>
          <label className="text-xs text-ink/60 mb-1 block">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ledger/40"
          />
        </div>
        {error && (
          <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-ledger text-white text-sm font-medium rounded-md px-4 py-2.5 hover:bg-ledger/90 transition-colors disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="text-sm text-ink/60 mt-5">
        New to Hero?{' '}
        <Link to="/register" className="text-ledger font-medium hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
