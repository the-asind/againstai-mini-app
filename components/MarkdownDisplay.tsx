import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownDisplayProps {
  content: string;
  className?: string;
}

export const MarkdownDisplay: React.FC<MarkdownDisplayProps> = ({ content, className = '' }) => {
  return (
    <div className={`markdown-body w-full overflow-hidden ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headers
          h1: ({node, ...props}) => <h1 className="text-2xl font-bold text-tg-text mt-6 mb-4 border-b border-tg-hint/20 pb-2" {...props} />,
          h2: ({node, ...props}) => <h2 className="text-xl font-bold text-tg-text mt-5 mb-3" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-lg font-bold text-tg-text mt-4 mb-2 uppercase tracking-wide opacity-90" {...props} />,
          h4: ({node, ...props}) => <h4 className="text-base font-bold text-tg-text mt-3 mb-2" {...props} />,

          // Text & Paragraphs
          p: ({node, ...props}) => <p className="text-base text-tg-text leading-relaxed mb-4 last:mb-0" {...props} />,
          strong: ({node, ...props}) => <strong className="font-bold text-tg-text" {...props} />,
          em: ({node, ...props}) => <em className="italic text-tg-text opacity-90" {...props} />,
          del: ({node, ...props}) => <del className="line-through text-tg-hint" {...props} />,

          // Lists
          ul: ({node, ...props}) => <ul className="list-disc list-outside ml-5 mb-4 space-y-1 text-tg-text marker:text-tg-hint" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-5 mb-4 space-y-1 text-tg-text marker:text-tg-hint" {...props} />,
          li: ({node, ...props}) => <li className="pl-1" {...props} />,

          // Blockquotes
          blockquote: ({node, ...props}) => (
            <blockquote className="border-l-4 border-tg-hint pl-4 py-1 my-4 bg-tg-secondaryBg/30 italic text-tg-text opacity-80 rounded-r-lg" {...props} />
          ),

          // Code
          code: ({node, ...props}) => {
            // Check if it's inline code or block code
            const isInline = !props.className?.includes('language-');
             return (
              <code
                className={`font-mono text-sm bg-tg-secondaryBg px-1.5 py-0.5 rounded text-tg-link border border-tg-hint/20 ${isInline ? 'inline-block align-middle' : 'block p-3 overflow-x-auto my-3'}`}
                {...props}
              />
            );
          },
          pre: ({node, ...props}) => <pre className="overflow-x-auto my-4 rounded-lg" {...props} />,

          // Links
          a: ({node, ...props}) => <a className="text-tg-link underline hover:opacity-80 transition-opacity font-medium" target="_blank" rel="noopener noreferrer" {...props} />,

          // Horizontal Rule
          hr: ({node, ...props}) => <hr className="my-6 border-t border-tg-hint/30" {...props} />,

          // Tables
          table: ({node, ...props}) => (
            <div className="overflow-x-auto my-6 rounded-lg border border-tg-hint/20">
              <table className="min-w-full divide-y divide-tg-hint/20 text-sm text-left" {...props} />
            </div>
          ),
          thead: ({node, ...props}) => <thead className="bg-tg-secondaryBg text-tg-hint uppercase font-bold tracking-wider" {...props} />,
          tbody: ({node, ...props}) => <tbody className="divide-y divide-tg-hint/10 bg-transparent" {...props} />,
          tr: ({node, ...props}) => <tr className="transition-colors hover:bg-tg-hint/5" {...props} />,
          th: ({node, ...props}) => <th className="px-4 py-3 font-medium text-xs text-tg-hint uppercase tracking-wider whitespace-nowrap" {...props} />,
          td: ({node, ...props}) => <td className="px-4 py-3 text-tg-text whitespace-nowrap" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
