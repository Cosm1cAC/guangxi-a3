/** 微信服务端请求。错误信息不包含带 AppSecret / access_token 的请求地址。 */
export async function wechatJson(url: string): Promise<Record<string, any>> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw Error(`微信接口 HTTP ${response.status}`);
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('微信接口响应无效');
    const result = data as Record<string, any>;
    if (result.errcode && String(result.errcode) !== '0') {
      const code = Number(result.errcode);
      throw Error(Number.isInteger(code) ? `微信接口错误 ${code}` : '微信接口响应无效');
    }
    return result;
  } catch (error) {
    // fetch 的异常可能携带请求 URL；只保留本模块生成的、无凭据的错误。
    const message = error instanceof Error && /^微信接口(?: HTTP \d+|错误 -?\d+)$/.test(error.message)
      ? error.message : '微信接口连接失败或响应无效';
    throw Object.assign(Error(message), { wechat: true });
  }
}

/** 没有合法 openid 时不能创建身份为空的游戏账号。 */
export function wechatIdentity(data: Record<string, any>, web = false) {
  if (typeof data.openid !== 'string' || !data.openid.trim() || data.openid.length > 256
    || (web && (typeof data.access_token !== 'string' || !data.access_token.trim()))) {
    throw Object.assign(Error('微信授权响应缺少身份凭证'), { wechat: true });
  }
  return {
    openid: data.openid,
    unionid: typeof data.unionid === 'string' && data.unionid.trim() && data.unionid.length <= 256 ? data.unionid : undefined,
  };
}
