import { describe, it, expect } from "vitest";
import { parseRichSegments } from "@/components/RichContent";

describe("parseRichSegments", () => {
  it("returns a single text segment for plain text with no math", () => {
    expect(parseRichSegments("hello world")).toEqual([
      { type: "text", content: "hello world", display: false },
    ]);
  });

  it("splits inline $x$ into text/math/text segments", () => {
    expect(parseRichSegments("a $x$ b")).toEqual([
      { type: "text", content: "a ", display: false },
      { type: "math", content: "x", display: false },
      { type: "text", content: " b", display: false },
    ]);
  });

  it("parses display $$x$$ as a single display math segment", () => {
    expect(parseRichSegments("$$x$$")).toEqual([
      { type: "math", content: "x", display: true },
    ]);
  });

  it("matches $$ before $ (one display segment, not two inline)", () => {
    expect(parseRichSegments("$$a$$")).toEqual([
      { type: "math", content: "a", display: true },
    ]);
  });

  it("treats a lone/unmatched $ as literal text", () => {
    expect(parseRichSegments("cost is $5 today")).toEqual([
      { type: "text", content: "cost is $5 today", display: false },
    ]);
  });

  it("handles empty display math $$$$ as an empty display math segment", () => {
    expect(parseRichSegments("$$$$")).toEqual([
      { type: "math", content: "", display: true },
    ]);
  });

  it("handles adjacent inline and display math", () => {
    expect(parseRichSegments("$a$$$b$$")).toEqual([
      { type: "math", content: "a", display: false },
      { type: "math", content: "b", display: true },
    ]);
  });
});
