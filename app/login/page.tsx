'use client';

import { FormEvent, useMemo, useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'quiet' | 'warn'>('quiet');
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    setMessageTone('warn');
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

      setMessageTone('quiet');
      setMessage('Signed in. Opening your dayâ€¦');
      window.location.assign('/');
    } catch (error) {
      setMessage(`Unable to contact authentication: ${error instanceof Error ? error.message : 'Unknown error.'}`);
    } finally {
      setLoading(false);
    }
  }

  async function forgotPassword() {
    setMessage('');
    setMessageTone('warn');
    if (!email.trim()) {
      setMessage('Enter your email above, then try again.');
      return;
    }
    setResetting(true);
    try {
      const redirectTo = `${window.location.origin}/login`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) {
        setMessage(`Could not send reset email: ${error.message}`);
        return;
      }
      setMessageTone('quiet');
      setMessage('If that email is registered, a reset link is on its way.');
    } catch (error) {
      setMessage(`Unable to start password reset: ${error instanceof Error ? error.message : 'Unknown error.'}`);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="loginWrap" style={{position:'fixed', inset:0, zIndex:100}}>
      <div className="loginCard">
        <div className="loginBrandBlock">
          <Image className="loginLogo" src="/brand/rescue-tyres-logo.png" alt="Rescue Tyres Mobile Services" width={168} height={164} priority />
          <span className="eyebrow loginBrand">RESCUE TYRES</span>
        </div>
        <h1>A smoother<br/>day starts here.</h1>
        <p className="loginLead">Your jobs. Your team. Everything in hand.</p>
        <form onSubmit={submit} className="loginForm">
          <label className="loginField">
            <span className="loginLabel">Email</span>
            <input className="input" autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
          </label>
          <label className="loginField">
            <span className="loginLabel">Password</span>
            <input className="input" autoComplete="current-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="" required />
          </label>
          <button className="btn primary loginSubmit" type="submit" disabled={loading}>{loading ? 'Signing inâ€¦' : 'Sign in'}</button>
          <button className="loginForgot" type="button" onClick={() => void forgotPassword()} disabled={resetting || loading}>
            {resetting ? 'Sending resetâ€¦' : 'Forgot password?'}
          </button>
          {message ? <div className={messageTone === 'warn' ? 'error' : 'loginQuietMsg'} role="status">{message}</div> : null}
        </form>
      </div>
    </div>
  );
}
