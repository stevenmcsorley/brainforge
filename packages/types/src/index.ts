// Re-export all contract types for convenience
export type {
  Region,
  CreateRegion,
  Connection,
  ConnectivitySet,
  BrainModel,
  CreateBrainModel,
  UpdateBrainModel,
  SimulationBackend,
} from '@brainforge/contracts';

export type {
  Dataset,
  CreateDataset,
  DatasetFormat,
} from '@brainforge/contracts';

export type {
  Experiment,
  CreateExperiment,
  ExperimentStatus,
} from '@brainforge/contracts';

export type {
  ExperimentRun,
  RunStatus,
  RunCommand,
  RunSummary,
  RunArtifact,
  RunMetric,
} from '@brainforge/contracts';

export type {
  TelemetryEvent,
  TelemetryEventType,
  RunStartedEvent,
  RunProgressEvent,
  RunMetricEvent,
  RunCompletedEvent,
} from '@brainforge/contracts';

export type {
  Stimulus,
  StimulusType,
  SimConfig,
  ParameterSweep,
} from '@brainforge/contracts';

// App-specific types not in contracts

export interface AppState {
  currentModelId: string | null;
  currentExperimentId: string | null;
  activeRunId: string | null;
  sidebarOpen: boolean;
}

export interface TimeSeriesPoint {
  time: number;
  value: number;
}

export interface RegionTimeSeries {
  regionId: string;
  regionName: string;
  data: TimeSeriesPoint[];
}

export interface RunComparison {
  runIds: string[];
  metrics: Record<string, number[]>;
  timeSeries: Record<string, RegionTimeSeries[]>;
}
