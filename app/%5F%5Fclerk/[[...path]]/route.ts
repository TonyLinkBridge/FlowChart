import { createFrontendApiProxyHandlers } from '@clerk/nextjs/server';

/** Clerk 的前端接口代理，对外路径是 /__clerk/*。
 *
 *  为什么文件夹叫 %5F%5Fclerk：
 *  Next.js 把下划线开头的目录当成私有目录，直接排除在路由之外 ——
 *  取名 __clerk 的话这个路由压根不会生成（构建能过，但线上 404）。
 *  %5F 是下划线的转义，这样才能生成字面量的 /__clerk 路径。
 *
 *  为什么要代理：
 *  Clerk 生产环境通常要求给自己的域名配 CNAME，
 *  但 juflow.vercel.app 是 Vercel 的域名，DNS 改不了。
 *  代理模式绕开这一步 —— 浏览器请求 /__clerk/*，由这里转发给 Clerk。
 *
 *  这个路由不能加登录保护，否则 Clerk 自己的请求会被拦去登录页。 */
export const { GET, POST, PUT, DELETE, PATCH } = createFrontendApiProxyHandlers();
