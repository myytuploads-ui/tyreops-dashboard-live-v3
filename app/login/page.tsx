'use client';

import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setMessage(error.message);
    window.location.href = '/';
  }

  return (
    <div className="loginWrap" style={{position:'fixed', inset:0, zIndex:100}}>
      <div className="loginCard">
        <h1>TyreOps</h1>
        <p>Owner Control Centre</p>
        <form onSubmit={submit}>
          <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required />
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required />
          <button className="btn primary">Sign in</button>
          {message && <div className="error">{message}</div>}
        </form>
      </div>
    </div>
  );
}
