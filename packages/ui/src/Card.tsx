import React from 'react';

export interface CardProps {
    title?: string;
    description?: string;
    children: React.ReactNode;
    className?: string;
    actions?: React.ReactNode;
}

export function Card({ title, description, children, className = '', actions }: CardProps) {
    return (
        <div className={['rounded-lg border border-border bg-bg-secondary', className].join(' ')}>
            {(title || actions) && (
                <div className="flex items-start justify-between px-4 py-3 border-b border-border">
                    <div>
                        {title && <h3 className="text-sm font-medium text-text-primary">{title}</h3>}
                        {description && (
                            <p className="text-xs text-text-secondary mt-0.5">{description}</p>
                        )}
                    </div>
                    {actions && <div className="flex items-center gap-2">{actions}</div>}
                </div>
            )}
            <div className="p-4">{children}</div>
        </div>
    );
}

export interface StatCardProps {
    label: string;
    value: React.ReactNode;
    icon?: React.ReactNode;
    trend?: 'up' | 'down' | 'neutral';
    className?: string;
}

export function StatCard({ label, value, icon, className = '' }: StatCardProps) {
    return (
        <div className={['rounded-lg border border-border bg-bg-secondary p-4', className].join(' ')}>
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-secondary uppercase tracking-wider">{label}</span>
                {icon && <span className="text-text-muted">{icon}</span>}
            </div>
            <div className="text-2xl font-semibold text-text-primary">{value}</div>
        </div>
    );
}
