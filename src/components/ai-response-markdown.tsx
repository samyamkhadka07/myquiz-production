"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/** Markdown is parsed to React elements; raw HTML is deliberately never enabled. */
export function AiResponseMarkdown({ text }: { text: string }) {
  return <div className="ai-response-markdown"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} skipHtml>{text}</ReactMarkdown></div>;
}
