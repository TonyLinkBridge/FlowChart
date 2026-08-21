import { SignIn } from '@clerk/nextjs';
import s from './SignIn.module.css';

/** 登录页。左边说清楚这是什么，右边是 Clerk 的登录控件（外观改成瑞士版）。
 *  用哪几种登录方式 —— Google / 微软 / 邮箱密码 —— 在 Clerk 后台配，这里不用管。 */
export default function SignInPage() {
  return (
    <div className={s.page}>
      <div className={s.pitch}>
        <div className={s.brand}>Runflow · 跑流程</div>

        <h1 className={s.head}>
          别人的流程图，画出来给人看。<br />
          <span>这一张，可以跑一遍。</span>
        </h1>

        <div className={s.rule} />
        <div className={s.rows}>
          <div className={s.row}>
            <span className={s.idx}>01</span>
            <span className={s.rowText}>
              <b>一份数据，四种读法</b> —— 流程图、泳道、时间条、清单。
              在任何一个里打勾，另外三个跟着变。
            </span>
          </div>
          <div className={s.row}>
            <span className={s.idx}>02</span>
            <span className={s.rowText}>
              <b>图能打勾，带进度</b> —— 每一步的操作细节收在附注里，
              逐条勾完，节点自己变成「已完成」。
            </span>
          </div>
          <div className={s.row}>
            <span className={s.idx}>03</span>
            <span className={s.rowText}>
              <b>粘进来就成图</b> —— 有条理的文字，或者一段 Mermaid，
              贴上去直接画出来。
            </span>
          </div>
        </div>

        <div className={s.foot}>
          你画的流程图存在你自己的账号下<br />
          别人登录进来看到的是他们自己的，互相看不到
        </div>
      </div>

      <div className={s.panel}>
        <div className={s.panelLabel}>登录后继续</div>
        <SignIn
          appearance={{
            /* variables 的字段名各版本改过，这里只用几个稳定的；
               具体样式走 elements 的原生 CSS —— 不受改名影响。 */
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
              header: { display: 'none' },        // 标题左边已经说过了，别重复
              footer: { background: 'transparent' },
              formButtonPrimary: {
                background: '#101010', color: '#F4F2ED', fontSize: '12px', fontWeight: 500,
                letterSpacing: '0.3px', textTransform: 'none', height: '40px',
              },
              formFieldInput: {
                border: '1px solid #C7C2B6', height: '40px', fontSize: '13px', color: '#101010',
              },
              formFieldLabel: { fontSize: '11.5px', color: '#6B6862' },
              socialButtonsBlockButton: {
                border: '1px solid #101010', height: '40px', fontSize: '12.5px', color: '#101010',
              },
              dividerLine: { background: '#D6D2C8' },
              dividerText: { fontSize: '10px', letterSpacing: '1px', color: '#9C988F' },
              footerActionText: { fontSize: '11.5px', color: '#9C988F' },
              footerActionLink: { fontSize: '11.5px', color: '#9A6B12' },
            },
          }}
        />
      </div>
    </div>
  );
}
