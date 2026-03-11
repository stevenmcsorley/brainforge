import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { OverviewPage } from './pages/OverviewPage';
import { ModelsPage } from './pages/ModelsPage';
import { ModelDetailPage } from './pages/ModelDetailPage';
import { DatasetsPage } from './pages/DatasetsPage';
import { ExperimentsPage } from './pages/ExperimentsPage';
import { ExperimentDetailPage } from './pages/ExperimentDetailPage';
import { LiveMonitorPage } from './pages/LiveMonitorPage';
import { VisualExplorerPage } from './pages/VisualExplorerPage';
import { CompareRunsPage } from './pages/CompareRunsPage';
import ActivityMapPage from './pages/ActivityMapPage';
import { SettingsPage } from './pages/SettingsPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';

export function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/models" element={<ModelsPage />} />
        <Route path="/models/:id" element={<ModelDetailPage />} />
        <Route path="/datasets" element={<DatasetsPage />} />
        <Route path="/experiments" element={<ExperimentsPage />} />
        <Route path="/experiments/:id" element={<ExperimentDetailPage />} />
        <Route path="/monitor" element={<LiveMonitorPage />} />
        <Route path="/monitor/:runId" element={<LiveMonitorPage />} />
        <Route path="/explorer" element={<VisualExplorerPage />} />
        <Route path="/compare" element={<CompareRunsPage />} />
        <Route path="/activity-map/:runId" element={<ActivityMapPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/diagnostics" element={<DiagnosticsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}
