import ReactMarkdown from "react-markdown";

export function CenOpsMarkdownMessage({ content, className = "" }: { content: string; className?: string }) {
  return (
    <div className={`cenops-markdown text-[15px] leading-7 ${className}`}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className="mb-3 mt-1 text-xl font-semibold">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-5 text-lg font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-4 text-base font-semibold">{children}</h3>,
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 ml-5 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 ml-5 list-decimal space-y-1">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-primary/40 pl-4 text-muted-foreground">{children}</blockquote>,
          code: ({ children, className }) => className ? <code className="block overflow-x-auto rounded-lg bg-background/80 p-3 text-xs leading-5">{children}</code> : <code className="rounded bg-background/80 px-1.5 py-0.5 text-[0.9em]">{children}</code>,
          pre: ({ children }) => <pre className="mb-3 overflow-x-auto rounded-lg">{children}</pre>,
          a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2 hover:opacity-80">{children}</a>,
          hr: () => <hr className="my-4 border-border" />,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
