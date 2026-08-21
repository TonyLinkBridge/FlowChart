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
          <div className={`${s.kicker} ${s.rise} ${s.d1}`}>团队流程管理与协作工具</div>
          <h1 className={`${s.head} ${s.rise} ${s.d2}`}>
            把流程画清楚，<br />
            <span>也真正执行起来。</span>
          </h1>
          <p className={`${s.deck} ${s.rise} ${s.d3}`}>
            在同一张流程里安排负责人、处理时间和操作说明。
            团队一起查看、共同编辑、跟进进度，<b>每次修改都有记录</b>。
          </p>
          <div className={`${s.ctaRow} ${s.rise} ${s.d4}`}>
            <Link href={enter} className={s.ctaBig}>{userId ? '进入工作台' : '创建流程'}</Link>
            <span className={s.ctaNote}>团队共编 · 自动保存 · 历史版本可恢复</span>
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
          <span className={s.bandTitle}>一套流程，四个工作视角</span>
          <span className={s.bandNote}>内容只维护一次，流程图、泳道、排期和执行清单同步更新</span>
        </div>
      </section>
      <div className={s.tiles}>
        <div className={s.tile}>
          <div className={s.tileGlyph}><span className={s.gFlow}><i /><span className={s.gDia} /><i /></span></div>
          <div className={s.tileName}>流程图</div>
          <div className={s.tileText}>看清每个步骤、判断条件和分支。</div>
        </div>
        <div className={s.tile}>
          <div className={s.tileGlyph}><span className={s.gLanes}><i /><i /><i /></span></div>
          <div className={s.tileName}>泳道</div>
          <div className={s.tileText}>看清谁负责，以及工作交给谁。</div>
        </div>
        <div className={s.tile}>
          <div className={s.tileGlyph}><span className={s.gGantt}><i /><i /><i /></span></div>
          <div className={s.tileName}>排期</div>
          <div className={s.tileText}>看清需要多久、目前做到哪里、卡在哪一步。</div>
        </div>
        <div className={s.tile}>
          <div className={s.tileGlyph}><span className={s.gChecks}><i /><i /><i /></span></div>
          <div className={s.tileName}>执行清单</div>
          <div className={s.tileText}>按照流程逐项完成，整体进度自动更新。</div>
        </div>
      </div>

      <div className={s.rows}>
        <div className={s.row}>
          <div className={s.idx}>01</div>
          <div className={s.rowHead}>操作细节放在流程里面</div>
          <div className={s.rowText}>每个节点都可以加入负责人、说明、子步骤和相关链接，不用再到聊天记录里寻找。</div>
        </div>
        <div className={s.row}>
          <div className={s.idx}>02</div>
          <div className={s.rowHead}>粘贴文字就能生成流程</div>
          <div className={s.rowText}>把现有步骤或 Mermaid 贴进来，系统自动识别层级、判断条件和是／否分支。</div>
        </div>
        <div className={s.row}>
          <div className={s.idx}>03</div>
          <div className={s.rowHead}>团队一起维护，修改都有记录</div>
          <div className={s.rowText}>Team 成员可以查看和编辑同一张流程。系统记录修改人、修改时间和历史版本，需要时可以恢复。</div>
        </div>
      </div>

      <div className={s.bottom}>
        <div className={s.bottomBand}>
          <div className={s.bottomLine}>把下一个流程，变成<span>团队真正能执行的工作</span>。</div>
          <Link href={enter} className={s.ctaBig}>{userId ? '进入工作台' : '创建第一张流程'}</Link>
        </div>
      </div>

      <footer className={s.foot}>
        <span>Runflow</span><span>·</span><span>流程梳理 · 团队协作 · 版本留痕</span>
      </footer>
    </div>
  );
}
