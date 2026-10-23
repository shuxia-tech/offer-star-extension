/** 官网仅有这两个明确约定的授权存储，不扫描其他 key。 */
export function isOfferStarAuthStorageKey(key: string | null) {
  return key === "SECRET_TOKEN" || key === "userStore" || key === null;
}

export function tokenFromStorageEvent(event: StorageEvent) {
  if (event.key === "SECRET_TOKEN") return event.newValue?.trim() || null;
  if (event.key !== "userStore" || !event.newValue) return null;
  try {
    const token = JSON.parse(event.newValue)?.state?.token;
    return typeof token === "string" ? token.trim() || null : null;
  } catch {
    return null;
  }
}

/** 微信回调把凭证放在官网地址栏，优先于尚未写完的本地存储。 */
export function tokenFromLoginCallback(search: string) {
  const token = new URLSearchParams(search).get("token")?.trim();
  return token || null;
}

/** 登录回调地址上的凭证优先；否则读取当前官网持久化状态。 */
export function readOfferStarPageToken(search: string, storage: Pick<Storage, "getItem"> = localStorage) {
  return tokenFromLoginCallback(search) ?? readOfferStarToken(storage);
}

/** 当前官网使用 userStore.state.token；存在该字段时以它为准，避免退出后复用旧授权。 */
export function readOfferStarToken(storage: Pick<Storage, "getItem"> = localStorage) {
  try {
    const state = JSON.parse(storage.getItem("userStore") ?? "null")?.state;
    if (state && Object.prototype.hasOwnProperty.call(state, "token")) {
      return typeof state.token === "string" ? state.token.trim() || null : null;
    }
  } catch {
    // 损坏的持久化数据只尝试旧版官方授权字段，不输出原文。
  }
  const token = storage.getItem("SECRET_TOKEN")?.trim();
  return token || null;
}

/** executeScript 会序列化函数，因此此入口不依赖模块闭包。 */
export function readOfferStarTokenInPage() {
  if (location.origin !== "https://offer.gfjianli.com") throw new Error("目标页面已变化");
  try {
    const state = JSON.parse(localStorage.getItem("userStore") ?? "null")?.state;
    if (state && Object.prototype.hasOwnProperty.call(state, "token")) {
      return typeof state.token === "string" ? state.token.trim() || null : null;
    }
  } catch {
    // 兼容旧版官方授权字段。
  }
  return localStorage.getItem("SECRET_TOKEN")?.trim() || null;
}
