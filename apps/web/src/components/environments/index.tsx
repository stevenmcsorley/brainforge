import BrainPong from './BrainPong';
import CartPole from './CartPole';
import BraitenbergVehicle from './BraitenbergVehicle';
import { InteractiveEnvironmentProps } from './types';

// Map of environment names to React components
export const EnvironmentRegistry: Record<string, React.FC<InteractiveEnvironmentProps>> = {
  'pong': BrainPong,
  'cartpole': CartPole,
  'braitenberg': BraitenbergVehicle,
};

export type EnvironmentType = keyof typeof EnvironmentRegistry;
