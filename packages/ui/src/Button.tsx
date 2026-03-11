import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
}

const variantClasses: Record<string, string> = {
    primary: 'bg-accent-blue hover:bg-accent-blue/90 text-white',
    secondary: 'bg-bg-secondary hover:bg-bg-secondary/80 text-text-primary border border-border',
    ghost: 'hover:bg-bg-secondary text-text-secondary hover:text-text-primary',
    danger: 'bg-accent-red/10 hover:bg-accent-red/20 text-accent-red border border-accent-red/30',
};

const sizeClasses: Record<string, string> = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-2.5 text-base',
};

export function Button({
    variant = 'secondary',
    size = 'md',
    loading = false,
    disabled,
    children,
    className = '',
    ...props
}: ButtonProps) {
    return (
        <button
            {...props}
            disabled={disabled || loading}
            className={[
                'inline-flex items-center justify-center gap-2 rounded font-medium transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-accent-blue/50',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                variantClasses[variant],
                sizeClasses[size],
                className,
            ].join(' ')}
        >
            {loading && (
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
            )}
            {children}
        </button>
    );
}
