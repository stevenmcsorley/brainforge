export interface BadgeProps {
    children: React.ReactNode;
    variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted';
    className?: string;
}

import React from 'react';

const variantClasses: Record<string, string> = {
    default: 'bg-text-muted/10 text-text-secondary',
    success: 'bg-accent-green/15 text-accent-green',
    warning: 'bg-accent-yellow/15 text-accent-yellow',
    danger: 'bg-accent-red/15 text-accent-red',
    info: 'bg-accent-blue/15 text-accent-blue',
    muted: 'bg-bg-secondary text-text-muted border border-border',
};

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
    return (
        <span
            className={[
                'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                variantClasses[variant],
                className,
            ].join(' ')}
        >
            {children}
        </span>
    );
}
