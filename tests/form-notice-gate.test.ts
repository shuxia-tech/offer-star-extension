import { describe, expect, it } from "vitest";
import { createFormNoticeGate } from "../src/shared/form-notice-gate";

describe("自动填充期间的表单提示门闩", () => {
  it("按住期间不放开，到点后才放开", () => {
    let scheduled: (() => void) | undefined;
    const gate = createFormNoticeGate(
      (callback) => {
        scheduled = callback;
        return 1;
      },
      () => { scheduled = undefined; }
    );
    expect(gate.isHeld()).toBe(false);
    gate.engage();
    expect(gate.isHeld()).toBe(true);
    gate.releaseAfter(2000);
    expect(gate.isHeld()).toBe(true);
    scheduled?.();
    expect(gate.isHeld()).toBe(false);
  });

  it("再次按住时，旧的松开回调不能提前放开", () => {
    const scheduled: Array<() => void> = [];
    let cancelled = 0;
    const gate = createFormNoticeGate(
      (callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
      () => { cancelled += 1; }
    );
    gate.releaseAfter(2000);
    gate.engage();
    expect(cancelled).toBe(1);
    expect(gate.isHeld()).toBe(true);
    scheduled[0]?.();
    expect(gate.isHeld()).toBe(true);
  });
});
