'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';

export default function AcceptInvitation() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('Проверяваме поканата…');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const client = createClient();
    if (!client) { setMessage('Supabase не е конфигуриран.'); return; }
    let active = true;
    const subscription = client.auth.onAuthStateChange((_event, session) => {
      if (active && session) { setReady(true); setMessage(''); }
    });
    async function check() {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const tokenHash = url.searchParams.get('token_hash');
      if (code) {
        const { error } = await client!.auth.exchangeCodeForSession(code);
        if (error && active) setMessage('Линкът за покана е невалиден или е изтекъл.');
      } else if (tokenHash) {
        const { error } = await client!.auth.verifyOtp({ token_hash: tokenHash, type: 'invite' });
        if (error && active) setMessage('Линкът за покана е невалиден или е изтекъл.');
      }
      const { data } = await client!.auth.getUser();
      if (active && data.user) { setReady(true); setMessage(''); }
      else if (active) setMessage('Не е открита активна покана. Отвори оригиналния линк от имейла.');
    }
    void check();
    return () => { active = false; subscription.data.subscription.unsubscribe(); };
  }, []);

  async function setPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');
    if (password.length < 14 || password !== confirm) {
      setMessage('Паролата трябва да има поне 14 символа и двете полета да съвпадат.'); return;
    }
    const client = createClient();
    if (!client) return;
    setBusy(true);
    const { error } = await client.auth.updateUser({ password });
    setBusy(false);
    if (error) { setMessage('Неуспешно задаване на парола. Опитай отново или поискай нова покана.'); return; }
    router.replace('/app');
    router.refresh();
  }

  return <main className="auth-screen"><section className="auth-card"><div className="brand big"><span className="brand-icon">+</span><span>СТМ <b>2.0</b></span></div>
    <p className="eyebrow">ПОКАНА ЗА ДОСТЪП</p><h1>Активирай акаунта си</h1>
    <p className="muted">Задай своя парола. Не изпращай паролата на администратор и не я въвеждай извън този адрес.</p>
    {ready && <form onSubmit={setPassword}>
      <label>Нова парола — поне 14 символа<input type="password" name="password" minLength={14} maxLength={200} autoComplete="new-password" required /></label>
      <label>Повтори паролата<input type="password" name="confirm" minLength={14} maxLength={200} autoComplete="new-password" required /></label>
      <button disabled={busy} className="btn primary full">{busy ? 'Записване…' : 'Активирай акаунта →'}</button>
    </form>}
    {message && <div className="notice warn" role="status">{message}</div>}
    <a className="back" href="/login">← Към входа</a>
  </section><aside className="auth-side"><div className="decorative-cross">+</div><h2>Защитен достъп до СТМ 2.0</h2><p>Покани само от администратор, проверка на правата в базата и отделен медицински достъп.</p></aside></main>;
}
