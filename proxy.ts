import { clerkMiddleware } from '@clerk/nextjs/server';

/** 这里只负责接住 Clerk 会话，让后面的 auth() 读得到身份。
 *  「谁能进哪」不在这儿拦 —— Clerk v7 起按路径拦截已弃用：路径匹配可能
 *  和 Next 实际路由对不上，留出空子。改成资源自己把门：
 *  /dashboard 在它的 layout 里验，/api/* 每个接口第一行验。 */
export default clerkMiddleware();

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js|jpe?g|png|gif|svg|ico|woff2?)).*)', '/(api|trpc)(.*)'],
};
