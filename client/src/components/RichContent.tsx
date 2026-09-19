import { Fragment } from "react";
import katex from "katex";

// Single reusable renderer for question text, option values, and explanations.
// It supports embedded LaTeX with two delimiters:
//   - inline math:  $...$
//   - display math: $$...$$
//
// SECURITY: only KaTeX-produced HTML is ever injected via
// dangerouslySetInnerHTML. Non-math text is rendered as plain React children,
// so raw (untrusted) user input is never treated as HTML. `throwOnError: false`
// makes KaTeX emit an error node instead of throwing on malformed LaTeX.

interface MathSegment {
  type: "text" | "math";
  content: string;
  display: boolean;
}

// Split a string into alternating plain-text and math segments. Display math
// ($$...$$) is matched before inline math ($...$). A lone/unmatched `$` (and any
// trailing text after it) is treated as literal text rather than opening math.
export function parseRichSegments(text: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let i = 0;
  let plain = "";

  const flushPlain = () => {
    if (plain) {
      segments.push({ type: "text", content: plain, display: false });
      plain = "";
    }
  };

  while (i < text.length) {
    const ch = text[i];
    if (ch === "$") {
      const isDisplay = text[i + 1] === "$";
      const delim = isDisplay ? "$$" : "$";
      const start = i + delim.length;
      const end = text.indexOf(delim, start);
      if (end !== -1) {
        const inner = text.slice(start, end);
        flushPlain();
        segments.push({ type: "math", content: inner, display: isDisplay });
        i = end + delim.length;
        continue;
      }
      // No closing delimiter: treat the `$` as a literal character.
      plain += ch;
      i += 1;
      continue;
    }
    plain += ch;
    i += 1;
  }

  flushPlain();
  return segments;
}

interface RichContentProps {
  text: string | null | undefined;
  className?: string;
}

export function RichContent({ text, className }: RichContentProps) {
  const source = text ?? "";
  const segments = parseRichSegments(source);

  return (
    <span className={className}>
      {segments.map((seg, idx) => {
        if (seg.type === "text") {
          return <Fragment key={idx}>{seg.content}</Fragment>;
        }
        // Only KaTeX output is injected as HTML.
        const html = katex.renderToString(seg.content, {
          displayMode: seg.display,
          throwOnError: false,
        });
        return (
          <span
            key={idx}
            // eslint-disable-next-line react/no-danger -- KaTeX-produced HTML only
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </span>
  );
}

export default RichContent;

export type { RichContentProps };
