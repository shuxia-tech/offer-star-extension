/** 为后台消息等不能直接取消的异步操作提供等待上限，并清理计时器。 */
export async function withRequestTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(message));
          onTimeout?.();
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
