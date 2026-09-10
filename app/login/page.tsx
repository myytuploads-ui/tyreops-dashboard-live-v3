'use client';

import { FormEvent, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(`Sign-in failed: ${error.message}`);
        return;
      }
      if (!data.session || !data.user) {
        setMessage('Sign-in did not create a browser session.');
        return;
      }

      const { data: verified, error: verificationError } = await supabase.auth.getUser();
      if (verificationError || !verified.user) {
        setMessage(`Sign-in succeeded, but session verification failed: ${verificationError?.message || 'No verified user returned.'}`);
        return;
      }

      setMessage('Sign-in succeeded. Verifying dashboard access…');
      window.location.assign('/');
    } catch (error) {
      setMessage(`Unable to contact authentication: ${error instanceof Error ? error.message : 'Unknown error.'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="loginWrap" style={{position:'fixed', inset:0, zIndex:100}}>
      <div className="loginCard">
        <span className="eyebrow">RESCUE TYRES</span>
        <h1>A smoother<br/>day starts here.</h1>
        <p>Your jobs. Your team. Everything in hand.</p>
        <form onSubmit={submit}>
          <input className="input" aria-label="Email" autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required />
          <input className="input" aria-label="Password" autoComplete="current-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required />
          <button className="btn primary" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
          {message && <div className="error">{message}</div>}
        </form>
      </div>
    </div>
  );
}
