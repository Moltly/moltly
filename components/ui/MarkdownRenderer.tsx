import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
    children: string;
    className?: string;
}

export default function MarkdownRenderer({ children, className }: MarkdownRendererProps) {
    return (
        <div className={cn("prose prose-sm dark:prose-invert max-w-none break-words", className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    // Override specific elements to match our design system better if needed
                    a: ({ node, ...props }) => (
                        <a {...props} className="text-[rgb(var(--primary))] hover:underline" target="_blank" rel="noopener noreferrer" />
                    ),
                    ul: ({ node, ...props }) => (
                        <ul {...props} className="list-disc pl-4 my-1 space-y-0.5" />
                    ),
                    ol: ({ node, ...props }) => (
                        <ol {...props} className="list-decimal pl-4 my-1 space-y-0.5" />
                    ),
                    li: ({ node, ...props }) => (
                        <li {...props} className="pl-1" />
                    ),
                    p: ({ node, ...props }) => (
                        <p {...props} className="my-1 leading-relaxed" />
                    ),
                    h1: ({ node, ...props }) => <h1 {...props} className="text-xl font-bold mt-4 mb-2 first:mt-0" />,
                    h2: ({ node, ...props }) => <h2 {...props} className="text-lg font-bold mt-3 mb-2" />,
                    h3: ({ node, ...props }) => <h3 {...props} className="text-base font-semibold mt-2 mb-1" />,
                    blockquote: ({ node, ...props }) => (
                        <blockquote {...props} className="border-l-4 border-[rgb(var(--border))] pl-3 italic text-[rgb(var(--text-soft))]" />
                    ),
                    code: ({ node, className, children, ...props }: any) => {
                        const match = /language-(\w+)/.exec(className || '');
                        const isInline = !match && !String(children).includes('\n');
                        return isInline ? (
                            <code {...props} className="bg-[rgb(var(--bg-muted))] px-1 py-0.5 rounded text-xs font-mono">
                                {children}
                            </code>
                        ) : (
                            <code {...props} className="block bg-[rgb(var(--bg-muted))] p-2 rounded text-xs font-mono overflow-x-auto">
                                {children}
                            </code>
                        );
                    }
                }}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
}
