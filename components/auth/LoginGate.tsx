'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, supabaseReady } from '@/lib/supabase/client';
import s from './LoginGate.module.css';

/** 登录闸门。没登录就只给登录页，登录了才把编辑器放出来。
 *  用邮箱链接登录 —— 不用记密码，也不用去 Google 后台配一堆东西。 */
export function LoginGate({ children }: { children: (session: Session) => React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setReady(true); return; }
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s2) => setSession(s2));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabaseReady) {
    return (
      <div className={s.wrap}><div className={s.box}>
        <div className={s.brand}>Runflow</div>
        <div className={s.title}>还没接上数据库</div>
        <div className={s.sub}>
          <code>.env.local</code> 里的 <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> 还是空的。
          填好之后重启开发服务器。
        </div>
      </div></div>
    );
  }

  if (!ready) return <div className={s.wrap} />;
  if (session) return <>{children(session)}</>;

  const send = async () => {
    const sb = getSupabase();
    if (!sb || !email.trim()) return;
    setSending(true); setErr(null);
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setSending(false);
    if (error) setErr(error.message); else setSent(true);
  };

  return (
    <div className={s.wrap}><div className={s.box}>
      <div className={s.brand}>Runflow</div>
      <div className={s.title}>先登录</div>
      <div className={s.sub}>
        你画的流程图存在你自己的账号下。<br />
        别人登录进来看到的是他们自己的，互相看不到。
      </div>

      {sent ? (
        <>
          <div className={s.sent}>
            登录链接已经发到 <b>{email}</b>。<br />
            去邮箱点那个链接，就直接进来了 —— 不用设密码。
          </div>
          <button className={s.link} onClick={() => { setSent(false); setEmail(''); }}>换个邮箱</button>
        </>
      ) : (
        <>
          <form className={s.form} onSubmit={e => { e.preventDefault(); send(); }}>
            <input className={s.input} type="email" value={email} placeholder="你的公司邮箱"
                   onChange={e => setEmail(e.target.value)} autoFocus />
            <button className={s.submit} type="submit" disabled={sending || !email.includes('@')}>
              {sending ? '发送中…' : '发登录链接'}
            </button>
          </form>
          <div className={s.note}>
            {err ? <span className={s.err}>{err}</span> : '不用密码 · 邮件里点一下就进来了'}
          </div>
        </>
      )}
    </div></div>
  );
}
