export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-text-secondary mt-1">
          Platform configuration and preferences
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-medium">Connection</h2>
        </div>
        <div className="card-body space-y-3">
          <div>
            <label className="label">API URL</label>
            <input
              className="input w-full mt-1"
              value={import.meta.env.VITE_API_URL || 'http://localhost:3001'}
              readOnly
            />
          </div>
          <div>
            <label className="label">WebSocket URL</label>
            <input
              className="input w-full mt-1"
              value={import.meta.env.VITE_WS_URL || 'ws://localhost:3001'}
              readOnly
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-medium">About</h2>
        </div>
        <div className="card-body text-sm text-text-secondary space-y-1">
          <p>BrainForge v0.1.0</p>
          <p>Research-grade neural simulation platform</p>
          <p className="text-text-muted text-xs mt-2">
            This software does not simulate consciousness. It provides tools
            for computational neuroscience research at multiple scales.
          </p>
        </div>
      </div>
    </div>
  );
}
