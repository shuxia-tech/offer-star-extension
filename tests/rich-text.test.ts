import { describe, expect, it } from "vitest";
import { richTextToPlain } from "../src/shared/rich-text";

describe("简历富文本", () => {
  it("把段落和列表转成纯文本", () => {
    expect(richTextToPlain("<p>负责产品：</p><ul><li>整理需求</li><li>输出原型</li></ul>")).toBe("负责产品：\n• 整理需求\n• 输出原型");
    expect(richTextToPlain("普通文本")).toBe("普通文本");
    expect(richTextToPlain("A &amp; B&nbsp;C")).toBe("A & B C");
  });
});
