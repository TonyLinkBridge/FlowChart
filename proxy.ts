import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

/** 只有这些要登录。首页和登录页对所有人开放 —— 没登录的人得先看到这是什么。 */
const isProtected = createRouteMatcher(['/dashboard(.*)', '/api/(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect();
});

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js|jpe?g|png|gif|svg|ico|woff2?)).*)', '/(api|trpc)(.*)'],
};
