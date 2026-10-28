/** 自动填充会打开下拉、改写 Vue 表单并点击分段确认，这段时间内的结构变化来自插件自己。 */
export const AUTOFILL_FORM_NOTICE_SETTLE_MS = 2000;

/** 扫描和填写期间按住表单变化提示，避免把插件自己的 DOM 改动当成页面更新。 */
export function createFormNoticeGate(
  schedule: (callback: () => void, milliseconds: number) => unknown,
  cancel: (id: unknown) => void
) {
  let held = false;
  let generation = 0;
  let timer: unknown;

  const clearTimer = () => {
    if (timer === undefined) return;
    cancel(timer);
    timer = undefined;
  };

  return {
    isHeld: () => held,
    engage() {
      generation += 1;
      held = true;
      clearTimer();
    },
    releaseAfter(milliseconds: number) {
      generation += 1;
      const current = generation;
      held = true;
      clearTimer();
      timer = schedule(() => {
        if (current !== generation) return;
        timer = undefined;
        held = false;
      }, milliseconds);
    }
  };
}
