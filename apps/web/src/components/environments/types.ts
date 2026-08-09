export interface InteractiveEnvironmentProps {
  runId: string;
  regionActivity: number[];
  onEmitCommand: (cmd: any) => void;
  onReward: (value: number) => void;
  sensoryNodes: number[];
  motorNodes: number[];
  modelName?: string;
}

/**
 * Fallback atlas indices for the DK68 sample model, used when an experiment's
 * environment config does not name its own nodes.
 *
 * DK68 regions are ordered alphabetically, so these indices are model-specific
 * and meaningless for any other parcellation — an experiment on a different
 * model must set sensoryNodes/motorNodes explicitly.
 *
 * Earlier defaults of 1 and 30 were labelled "visual cortex" and "motor cortex"
 * but actually landed on lh_caudalanteriorcingulate (limbic) and lh_frontalpole
 * (prefrontal) — neither is sensory or motor.
 *
 * These are genuinely visual and motor regions, so the labels in the UI are now
 * accurate. They do NOT transmit better than the old pair: measured end-to-end
 * gain from a sensory stimulus to motor activity is ~3e-4 for every candidate
 * pairing in DK68, because mean-field normalisation (w/N * coupling ≈ 0.005)
 * leaves the network far below the sigmoid threshold. Region choice is not the
 * limiting factor for the closed-loop environments — network gain is.
 */
export const DK68_DEFAULT_NODES = {
  /** lh_lingual — visual cortex (lingual gyrus). */
  sensory: 11,
  /** lh_precentral — primary motor cortex (M1). */
  motor: 22,
} as const;
