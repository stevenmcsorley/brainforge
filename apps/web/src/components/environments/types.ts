export interface InteractiveEnvironmentProps {
  runId: string;
  regionActivity: number[];
  onEmitCommand: (cmd: any) => void;
  onReward: (value: number) => void;
  sensoryNodes: number[];
  motorNodes: number[];
  modelName?: string;
}
