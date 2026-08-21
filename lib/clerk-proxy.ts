/** Clerk 的 Frontend API 代理只用于正式环境。
 * 本地开发必须使用 Clerk development instance（pk_test_ / sk_test_），
 * 它会直接连接 Clerk，不支持生产代理。 */
export const clerkProxyUrl = process.env.NODE_ENV === 'production' ? '/__clerk' : undefined;
