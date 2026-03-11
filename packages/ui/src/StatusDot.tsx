import React from 'react';

export type StatusVariant = 'online' | 'offline' | 'running' | 'warning' | 'error' | 'idle';

const statusStyles: Record<StatusVariant, { dot: string; pulse: boolean }> = {
    online: { dot: 'bg-accent-green', pulse: false },
    running: { dot: 'bg-accent-blue', pulse: true },
    warning: { dot: 'bg-accent-yellow', pulse: false },
    error: { dot: 'bg-accent-red', pulse: true },
    offline: { dot: 'bg-text-muted', pulse: false },
    idle: { dot: 'bg-text-muted', pulse: false },
};

export function StatusDot({
    status,
    label,
    className = '',
}: {
    status: StatusVariant;
    label?: string;
    className?: string;
}) {
    const { dot, pulse } = statusStyles[status] || statusStyles.offline;
    return (
        <span className={['inline-flex items-center gap-1.5', className].join(' ')}>
            <span className={['relative flex h-2 w-2 rounded-full', dot].join(' ')}>
                {pulse && (
                    <span
                        className={['absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping', dot].join(' ')}
                    />
                )}
            </span>
            {label && <span className="text-xs text-text-secondary">{label}</span>}
        </span>
    );
}
