import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import s from './home/Home.module.css';

/** 首页。公开，不需要登录 —— 没登录的人得先看到这是什么。
 *  已登录的人这里会显示「进入」，直接去 /dashboard。 */
export default async function Home() {
  // Clerk 7 去掉了 <SignedIn>/<SignedOut> 这对组件，改成在服务端直接查身份
  const { userId } = await auth();

  return (
    <div className={s.page}>
      <header className={s.top}>
        <span className={s.brand}>Runflow · 跑流程</span>
        <span className={s.topRight}>
          {userId ? (
            <>
              <Link href="/dashboard" className={s.cta}>进入</Link>
              <UserButton />
            </>
          ) : (
            <Link href="/sign-in" className={s.cta}>登录</Link>
          )}
        </span>
      </header>

      <section className={s.hero}>
        <h1 className={s.head}>
          别人的流程图，画出来给人看。<br />
          <span>这一张，可以跑一遍。</span>
        </h1>
        <p className={s.deck}>
          画完不是终点。给每一步填上<b>谁负责、要几天、做完没</b>，
          同一份数据就能切成四种读法；操作细节收在附注里，
          逐条勾完，节点自己变成「已完成」。
        </p>
      </section>

      <section className={s.rows}>
        <div className={s.row}>
          <div className={s.idx}>01</div>
          <div className={s.rowHead}>一份数据，四种读法</div>
          <div className={s.rowText}>
            流程图看谁接谁，泳道看哪个部门管哪步，时间条看卡在哪，清单逐条打勾。
            在任何一个里改，另外三个跟着变 —— 不是同步，是本来就只有一份数据。
          </div>
        </div>
        <div className={s.row}>
          <div className={s.idx}>02</div>
          <div className={s.rowHead}>附注跟着图一起走</div>
          <div className={s.rowText}>
            鼠标移到节点上就看到操作细节。导出 PNG 时图下面自动接一张附注表 ——
            发出去的是完整的，不是一张光秃秃的图。
          </div>
        </div>
        <div className={s.row}>
          <div className={s.idx}>03</div>
          <div className={s.rowHead}>粘进来就成图</div>
          <div className={s.rowText}>
            从文档里复制一段有条理的步骤，或者一段 Mermaid，贴上去直接画出来。
            缩进变子步骤，问号变判断，是/否变分支。
          </div>
        </div>
      </section>

      <footer className={s.foot}>
        你画的流程图存在你自己的账号下，别人登录进来看到的是他们自己的<br />
        Next.js · Supabase · Clerk
      </footer>
    </div>
  );
}
