import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import s from './home/Home.module.css';

/** 首页。公开 —— 没登录的人第一眼要看到「这是什么」，
 *  所以右边放一个会动的产品演示（纯 CSS，零依赖），光说不给看没有说服力。 */
export default async function Home() {
  const { userId } = await auth();
  const enter = userId ? '/dashboard' : '/sign-in';

  return (
    <div className={s.page}>
      <header className={s.top}>
        <span className={s.brand}>Runflow · 跑流程</span>
        <span className={s.topRight}>
          {userId ? (
            <>
              <Link href="/dashboard" className={s.cta}>进入工作台</Link>
              <UserButton />
            </>
          ) : (
            <Link href="/sign-in" className={s.cta}>登录</Link>
          )}
        </span>
      </header>

      <section className={s.hero}>
        <div>
          <div className={`${s.kicker} ${s.rise} ${s.d1}`}>内部流程工具 · 一份数据 · 四种读法</div>
          <h1 className={`${s.head} ${s.rise} ${s.d2}`}>
            别人的流程图，画出来给人看。<br />
            <span>这一张，可以跑一遍。</span>
          </h1>
          <p className={`${s.deck} ${s.rise} ${s.d3}`}>
            给每一步填上<b>谁负责、要几天、做完没</b>，图就不再只是图：
            操作细节收在附注里，逐条勾完，节点自己变成「已完成」，
            顶上的进度跟着走。
          </p>
          <div className={`${s.ctaRow} ${s.rise} ${s.d4}`}>
            <Link href={enter} className={s.ctaBig}>{userId ? '进入工作台' : '开始使用'}</Link>
            <span className={s.ctaNote}>登录即用 · 各人数据各归各人</span>
          </div>
        </div>

        {/* 会动的演示：节点逐个长出来，进度条走，附注飘出来 */}
        <div className={`${s.mock} ${s.rise} ${s.d3}`} aria-hidden>
          <div className={s.mockHead}>
            <span className={s.mockDot} />
            <span className={s.mockTitle}>新员工入职流程</span>
            <span className={s.mockMeta}>2/4 · 已保存</span>
          </div>
          <div className={s.mockBar}><div className={s.mockFill} /></div>
          <div className={s.mockCanvas}>
            <div className={`${s.mNode} ${s.mStart}`}>录用通知发出<span className={s.mTag}>START</span></div>
            <i className={`${s.mEdge} ${s.mE1}`} />
            <div className={`${s.mNode} ${s.mDone}`}>
              <span className={`${s.mBox} ${s.mBoxDone}`}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#F4F2ED" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
              </span>
              <span className={s.mTitle}>收集材料</span>
              <span className={s.mMeta}>HR | 1D</span>
            </div>
            <i className={`${s.mEdge} ${s.mE2}`} />
            <div className={`${s.mNode} ${s.mNow}`}>
              <span className={`${s.mBox} ${s.mBoxNow}`}><i /></span>
              第三方核验<sup className={s.mFn}>02</sup>
              <span className={s.mNowTag}>NOW</span>
            </div>
            <i className={`${s.mEdge} ${s.mE3}`} />
            <div className={`${s.mNode} ${s.mTodo}`}>
              <span className={`${s.mBox} ${s.mBoxTodo}`} />
              出具报告
              <span className={s.mMeta}>HR | 1D</span>
            </div>
            <div className={s.mNote}>
              <div className={s.mNoteHead}><span className={s.mNoteIdx}>02</span><span className={s.mNoteTitle}>第三方核验</span></div>
              <div className={s.mNoteBody}>回执超 3 个工作日未到，直接在群里 @ 对接人。</div>
              <div className={s.mNoteFoot}>5 步 · <b>3/5</b> · 有说明</div>
            </div>
          </div>
        </div>
      </section>

      <section className={s.bandHead}>
        <div className={s.bandRule}>
          <span className={s.bandTitle}>一份数据，四种读法</span>
          <span className={s.bandNote}>在任何一个里打勾，另外三个跟着变 —— 本来就只有一份数据</span>
        </div>
      </section>
      <div className={s.tiles}>
        <div className={s.tile}>
          <div className={s.tileGlyph}><span className={s.gFlow}><i /><span className={s.gDia} /><i /></span></div>
          <div className={s.tileName}>流程图</div>
          <div className={s.tileText}>谁接谁、分支往哪走。判断菱形、是/否两条路。</div>
        </div>
        <div className={s.tile}>
          <div className={s.tileGlyph}><span className={s.gLanes}><i /><i /><i /></span></div>
          <div className={s.tileName}>泳道</div>
          <div className={s.tileText}>按负责人分道，跨部门交接几次一眼看清。</div>
        </div>
        <div className={s.tile}>
          <div className={s.tileGlyph}><span className={s.gGantt}><i /><i /><i /></span></div>
          <div className={s.tileName}>时间条</div>
          <div className={s.tileText}>沿流程算排期，今天在第几天、卡在哪一步。</div>
        </div>
        <div className={s.tile}>
          <div className={s.tileGlyph}><span className={s.gChecks}><i /><i /><i /></span></div>
          <div className={s.tileName}>清单</div>
          <div className={s.tileText}>逐条打勾，连附注里的子步骤一起铺出来。</div>
        </div>
      </div>

      <div className={s.rows}>
        <div className={s.row}>
          <div className={s.idx}>01</div>
          <div className={s.rowHead}>附注跟着图一起走</div>
          <div className={s.rowText}>鼠标移到节点上就看到操作细节，点一下直接改。导出 PNG 时图下面自动接一张附注表 —— 发出去的是完整的。</div>
        </div>
        <div className={s.row}>
          <div className={s.idx}>02</div>
          <div className={s.rowHead}>粘进来就成图</div>
          <div className={s.rowText}>有条理的步骤文字，或一段 Mermaid，贴上去直接画出来。缩进变子步骤，问号变判断，是/否变分支。</div>
        </div>
        <div className={s.row}>
          <div className={s.idx}>03</div>
          <div className={s.rowHead}>各人数据各归各人</div>
          <div className={s.rowText}>登录即用。你的流程图存在你自己的账号下，服务端逐条校验身份 —— 别人登进来看到的是他们自己的。</div>
        </div>
      </div>

      <div className={s.bottom}>
        <div className={s.bottomBand}>
          <div className={s.bottomLine}>下一个要梳理的流程，<span>直接画成能跑的</span>。</div>
          <Link href={enter} className={s.ctaBig}>{userId ? '进入工作台' : '开始使用'}</Link>
        </div>
      </div>

      <footer className={s.foot}>
        <span>Runflow</span><span>·</span><span>Next.js · Clerk · Supabase</span><span>·</span><span>内部工具</span>
      </footer>
    </div>
  );
}
