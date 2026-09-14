import React from "react";

export function CenOpsMarkdownMessage({ content }: { content: string }) {
  return <div className="whitespace-pre-wrap text-[15px] leading-7">{content}</div>;
}
