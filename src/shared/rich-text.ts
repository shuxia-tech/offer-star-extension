/** 把简历富文本转成可阅读的纯文本，保留段落和列表，不保留标签。 */
export function richTextToPlain(value: string) {
  const source = value.replace(/\r/g, "");
  if (!/<[a-z/!]/i.test(source)) return decodeEntities(source).trim();
  const withBreaks = source
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const lines = decodeEntities(withBreaks).split("\n").map((line) => line.replace(/[ \t\f\v]+/g, " ").trim()).filter(Boolean);
  return lines.join("\n");
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'");
}
