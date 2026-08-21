import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

/** 编辑器的门卫。以前靠中间件按路径拦，Clerk v7 弃用了那套 ——
 *  改成资源自己把门：没登录就送去登录页。 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  return children;
}
