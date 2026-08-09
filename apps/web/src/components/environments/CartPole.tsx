import { useEffect, useRef, useState } from 'react';
import { DK68_DEFAULT_NODES, InteractiveEnvironmentProps } from './types';

// Constants for the CartPole physics simulation
const GRAVITY = 9.8;
const MASS_CART = 1.0;
const MASS_POLE = 0.1;
const TOTAL_MASS = MASS_CART + MASS_POLE;
const LENGTH = 0.5; // Actually half the pole's length
const POLE_MASS_LENGTH = MASS_POLE * LENGTH;
const FORCE_MAG = 10.0;
const TAU = 0.02; // Seconds between state updates
const THETA_THRESHOLD_RADIANS = (12 * 2 * Math.PI) / 360;
const X_THRESHOLD = 2.4;

export default function CartPole({
  regionActivity,
  onEmitCommand,
  sensoryNodes,
  motorNodes,
  onReward
}: InteractiveEnvironmentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [crashed, setCrashed] = useState(false);

  // Physics State: [x, x_dot, theta, theta_dot]
  const state = useRef({
    x: 0,
    xDot: 0,
    theta: 0,
    thetaDot: 0,
    lastTime: 0,
    motorSmooth: 0,
  });

  const resetTarget = () => {
    state.current = {
      x: (Math.random() - 0.5) * 0.1,
      xDot: (Math.random() - 0.5) * 0.1,
      theta: (Math.random() - 0.5) * 0.1,
      thetaDot: (Math.random() - 0.5) * 0.1,
      lastTime: performance.now(),
      motorSmooth: 0
    };
    setScore(0);
    setCrashed(false);
    onReward?.(0); // Reset dopamine
  };

  useEffect(() => {
    if (!isPlaying) return;

    let animationFrameId: number;

    const render = (time: number) => {
      const s = state.current;
      const dt = (time - s.lastTime) / 1000;
      s.lastTime = time;

      // Ensure dt isn't massive if tab is backgrounded
      if (dt > 0.1) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // 1. Read Motor Command from Brain
      // Motor nodes[0] represents pushing force. Above 0.5 pushes right, below pushes left.
      const rawMotor = regionActivity[motorNodes[0] ?? DK68_DEFAULT_NODES.motor] || 0;
      
      // Smooth the motor response
      s.motorSmooth = s.motorSmooth * 0.8 + rawMotor * 0.2;
      
      // Bound it between 0 and 1, then map to roughly -1 to 1 force scalar
      let normalizedForce = Math.min(Math.max((s.motorSmooth - Math.min(...regionActivity)) / (Math.max(...regionActivity) - Math.min(...regionActivity) + 0.0001), 0), 1);
      if (isNaN(normalizedForce)) normalizedForce = 0.5;
      
      const force = (normalizedForce - 0.5) * 2 * FORCE_MAG;

      // 2. Physics Step (Euler integration)
      const costheta = Math.cos(s.theta);
      const sintheta = Math.sin(s.theta);

      const temp = (force + POLE_MASS_LENGTH * s.thetaDot * s.thetaDot * sintheta) / TOTAL_MASS;
      
      const thetaAcc = (GRAVITY * sintheta - costheta * temp) /
        (LENGTH * (4.0 / 3.0 - (MASS_POLE * costheta * costheta) / TOTAL_MASS));
        
      const xAcc = temp - (POLE_MASS_LENGTH * thetaAcc * costheta) / TOTAL_MASS;

      s.x += TAU * s.xDot;
      s.xDot += TAU * xAcc;
      s.theta += TAU * s.thetaDot;
      s.thetaDot += TAU * thetaAcc;

      // 3. Emit Sensory Inputs to Brain
      // We map the 4 state variables into the brain's sensory nodes
      if (sensoryNodes.length >= 4) {
        onEmitCommand({ command: 'stimulus_batch', nodes: [
          { node: sensoryNodes[0], value: (s.x / X_THRESHOLD) * 5.0 },
          { node: sensoryNodes[1], value: (s.xDot / 5.0) * 5.0 },
          { node: sensoryNodes[2], value: (s.theta / THETA_THRESHOLD_RADIANS) * 5.0 },
          { node: sensoryNodes[3], value: (s.thetaDot / 5.0) * 5.0 }
        ]});
      }

      // Check failure conditions
      const failed = 
        s.x < -X_THRESHOLD || 
        s.x > X_THRESHOLD || 
        s.theta < -THETA_THRESHOLD_RADIANS || 
        s.theta > THETA_THRESHOLD_RADIANS;

      if (failed) {
        setCrashed(true);
        setIsPlaying(false);
        onReward?.(-10.0); // Harsh punishment for dropping the pole
        if (score > highScore) setHighScore(score);
      } else {
        setScore(prev => prev + 1); // Survive another frame
        // Pulse positive dopamine periodically
        if (score % 30 === 0) onReward?.(3.0); 
      }

      // 4. Draw
      drawCartPole(s.x, s.theta);

      if (isPlaying) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, regionActivity, motorNodes, sensoryNodes, score, highScore]);

  const drawCartPole = (cartX: number, poleTheta: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const worldWidth = X_THRESHOLD * 2;
    const scale = canvas.width / worldWidth;
    
    // Convert world coordinates to canvas coordinates
    const cartWidth = 50;
    const cartHeight = 30;
    const cx = canvas.width / 2 + cartX * scale;
    const cy = canvas.height - 100;

    // Draw track
    ctx.beginPath();
    ctx.moveTo(0, cy + cartHeight/2);
    ctx.lineTo(canvas.width, cy + cartHeight/2);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw Cart
    ctx.fillStyle = '#6366f1'; // accent-indigo
    ctx.fillRect(cx - cartWidth/2, cy - cartHeight/2, cartWidth, cartHeight);

    // Draw Pole
    const poleLengthBase = 120;
    const px = cx + Math.sin(poleTheta) * poleLengthBase;
    const py = cy - Math.cos(poleTheta) * poleLengthBase;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(px, py);
    ctx.strokeStyle = '#a855f7'; // accent-purple
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Draw Pivot
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  };

  return (
    <div className="flex flex-col h-full bg-[#04060e] border border-border/50 rounded-b-xl border-t-0 p-4 relative font-mono text-sm group">
      <div className="flex justify-between items-center mb-4 relative z-10">
        <h2 className="text-xl font-bold flex items-center gap-2">
           CartPole
          <span className="text-xs font-normal text-text-muted px-2 py-0.5 rounded-full bg-bg-secondary border border-border/50">
            Reinforcement Learning
          </span>
        </h2>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-text-muted text-xs">Score</div>
            <div className="text-lg font-bold text-accent-cyan">{Math.floor(score/60)}s</div>
          </div>
          <div className="text-right border-l border-border/50 pl-4">
            <div className="text-text-muted text-xs">Best</div>
            <div className="text-lg font-bold text-accent-green">{Math.floor(highScore/60)}s</div>
          </div>
        </div>
      </div>
      
      <div className="relative flex-1 bg-black/40 rounded border border-border/50 overflow-hidden flex flex-col justify-center border-b-4 border-b-accent-indigo">
        <canvas
          ref={canvasRef}
          width={800}
          height={300}
          className="w-full h-full object-contain"
        />

        {!isPlaying && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center backdrop-blur-[2px]">
            {crashed ? (
              <div className="text-accent-red font-bold text-xl mb-4 text-center">
                Pole Dropped!<br/>
                <span className="text-sm font-normal text-text-primary">The structural weights were punished (-10 Dopamine).</span>
              </div>
            ) : (
              <div className="text-text-primary font-bold text-xl mb-4 text-center">
                Train the Brain<br/>
                <span className="text-sm font-normal text-text-muted mt-2 max-w-sm block">
                  The model will attempt to keep the pole balanced. It receives 4 state variables into its sensory cortex and outputs lateral thrust from its motor cortex.
                </span>
              </div>
            )}
            <button
              onClick={() => {
                resetTarget();
                setIsPlaying(true);
              }}
              className="px-6 py-2 bg-accent-cyan/20 border border-accent-cyan hover:bg-accent-cyan/30 text-accent-cyan rounded-md font-bold transition-all"
            >
              {crashed ? 'Retry' : 'Start Training'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
