import Link from 'next/link';
import { SignIn } from '@clerk/nextjs';
import s from './SignIn.module.css';

/** 登录页。介绍在首页说过了，这里只做一件事 ——
 *  左边一条会动的流程脊线撑气质，右边登录。 */
export default function SignInPage() {
  return (
    <div className={s.page}>
      <div className={s.pitch}>
        <div className={s.brandRow}>
          <span className={s.brand}>Runflow · 跑流程</span>
          <Link href="/" className={s.back}>← 返回首页</Link>
        </div>

        <div className={s.pitchMain}>
          <h1 className={s.head}>
            把流程画清楚，<span>也真正执行起来。</span>
          </h1>

          <div className={s.proofs} aria-label="Runflow 功能">
            <span>团队共编</span>
            <span>自动保存</span>
            <span>历史版本</span>
          </div>

          <div className={s.demo} aria-hidden>
            <div className={s.spine}>
              <div className={`${s.sNode} ${s.s1}`}>录用通知发出<span className={s.sTag}>START</span></div>
              <i className={`${s.sEdge} ${s.e1}`} />
              <div className={`${s.sNode} ${s.s2}`}><span className={`${s.sBox} ${s.sDone}`} /><em>收集材料</em></div>
              <i className={`${s.sEdge} ${s.e2}`} />
              <div className={`${s.sNode} ${s.s3}`}><span className={`${s.sBox} ${s.sCur}`} />第三方核验<span className={s.sNow}>NOW</span></div>
              <i className={`${s.sEdge} ${s.e3}`} />
              <div className={`${s.sNode} ${s.s4}`}><span className={`${s.sBox} ${s.sTodo}`} />出具报告</div>
            </div>

            <div className={s.signals}>
              <span className={s.signal}><b>3</b> 人在线</span>
              <span className={`${s.signal} ${s.signalGold}`}>V12 · 已保存</span>
              <span className={s.signal}>刚刚更新</span>
            </div>
          </div>
        </div>

        <div className={s.foot}>
          个人空间保持私密<br />
          Team 空间只与团队成员共享
        </div>
      </div>

      <div className={s.panel}>
        <div className={s.panelIntro}>
          <div className={s.panelLabel}>RUNFLOW ACCOUNT</div>
          <h2 className={s.panelTitle}>欢迎回来</h2>
          <p className={s.panelCopy}>登录后继续管理你的流程</p>
        </div>
        <SignIn
          appearance={{
            variables: {
              colorPrimary: '#101010',
              colorBackground: '#FFFFFF',
              fontFamily: 'var(--rf-font)',
              fontSize: '13px',
              borderRadius: '0',
            },
            elements: {
              rootBox: { width: '100%' },
              cardBox: { width: '100%', boxShadow: 'none', border: 'none' },
              card: { boxShadow: 'none', border: 'none', padding: 0, background: 'transparent' },
              header: { display: 'none' },
              footer: { background: 'transparent' },
              formButtonPrimary: {
                background: '#101010', color: '#F4F2ED', fontSize: '12px', fontWeight: 500,
                letterSpacing: '0.3px', textTransform: 'none', height: '40px',
              },
              formFieldInput: { border: '1px solid #C7C2B6', height: '40px', fontSize: '13px', color: '#101010' },
              formFieldLabel: { fontSize: '11.5px', color: '#6B6862' },
              socialButtonsBlockButton: { border: '1px solid #101010', height: '40px', fontSize: '12.5px', color: '#101010' },
              dividerLine: { background: '#D6D2C8' },
              dividerText: { fontSize: '10px', letterSpacing: '1px', color: '#9C988F' },
              footerActionText: { fontSize: '11.5px', color: '#9C988F' },
              footerActionLink: { fontSize: '11.5px', color: '#9A6B12' },
            },
          }}
        />
        <div className={s.panelNote}>无需安装 · 登录即用 · 数据自动保存</div>
      </div>
    </div>
  );
}
