import { useEffect, useRef, useState } from 'react';
import { DK68_DEFAULT_NODES, InteractiveEnvironmentProps } from './types';

// Constants for the Braitenberg Vehicle physics simulation
const MAX_SPEED = 200; // pixels per second
const SENSOR_MAX_DIST = 400;

export default function BraitenbergVehicle({
  regionActivity,
  onEmitCommand,
  sensoryNodes,
  motorNodes,
  onReward
}: InteractiveEnvironmentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);

  // Vehicle state
  const state = useRef({
    x: 400,
    y: 300,
    rotation: 0,
    leftSensorActive: 0,
    rightSensorActive: 0,
    leftMotorSmooth: 0,
    rightMotorSmooth: 0,
    targetX: 400,
    targetY: 100,
    lastTime: performance.now()
  });

  const resetTarget = () => {
    state.current.targetX = 100 + Math.random() * 600;
    state.current.targetY = 100 + Math.random() * 400;
  };

  useEffect(() => {
    if (!isPlaying) return;

    let animationFrameId: number;

    const render = (time: number) => {
      const s = state.current;
      const dt = (time - s.lastTime) / 1000;
      s.lastTime = time;

      if (dt > 0.1) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // 1. Calculate sensory input based on distance to light source
      const leftSensorX = s.x + Math.cos(s.rotation - Math.PI/4) * 15;
      const leftSensorY = s.y + Math.sin(s.rotation - Math.PI/4) * 15;
      const leftDist = Math.hypot(leftSensorX - s.targetX, leftSensorY - s.targetY);
      
      const rightSensorX = s.x + Math.cos(s.rotation + Math.PI/4) * 15;
      const rightSensorY = s.y + Math.sin(s.rotation + Math.PI/4) * 15;
      const rightDist = Math.hypot(rightSensorX - s.targetX, rightSensorY - s.targetY);

      // Inverse square law roughly
      const leftIntensity = Math.min(Math.max(1.0 - (leftDist / SENSOR_MAX_DIST), 0), 1) * 3.0;
      const rightIntensity = Math.min(Math.max(1.0 - (rightDist / SENSOR_MAX_DIST), 0), 1) * 3.0;

      s.leftSensorActive = leftIntensity;
      s.rightSensorActive = rightIntensity;

      // 2. Transmit sensory input to the brain
      if (sensoryNodes.length >= 2) {
        onEmitCommand({ command: 'stimulus_batch', nodes: [
          { node: sensoryNodes[0], value: leftIntensity },
          { node: sensoryNodes[1], value: rightIntensity },
        ]});
      }

      // 3. Receive motor output from the brain
      const rawLeft = regionActivity[motorNodes[0] ?? DK68_DEFAULT_NODES.motor] || 0;
      const rawRight = regionActivity[motorNodes[1] ?? DK68_DEFAULT_NODES.motor + 1] || 0;

      // Normalize against current min/max brain activity
      const minA = Math.min(...regionActivity) || 0;
      const maxA = Math.max(...regionActivity) || 1;
      const valLeft = Math.max(0, (rawLeft - minA) / (maxA - minA + 0.0001));
      const valRight = Math.max(0, (rawRight - minA) / (maxA - minA + 0.0001));

      s.leftMotorSmooth = s.leftMotorSmooth * 0.8 + valLeft * 0.2;
      s.rightMotorSmooth = s.rightMotorSmooth * 0.8 + valRight * 0.2;

      // 4. Differential Steering Physics
      const leftSpeed = s.leftMotorSmooth * MAX_SPEED;
      const rightSpeed = s.rightMotorSmooth * MAX_SPEED;
      
      const v = (leftSpeed + rightSpeed) / 2;
      const w = (rightSpeed - leftSpeed) / 30; // 30 is axle width

      s.x += v * Math.cos(s.rotation) * dt;
      s.y += v * Math.sin(s.rotation) * dt;
      s.rotation += w * dt;

      // Screen wrap
      if (s.x < 0) s.x = 800;
      if (s.x > 800) s.x = 0;
      if (s.y < 0) s.y = 600;
      if (s.y > 600) s.y = 0;

      // Check collision/reward
      const distToTarget = Math.hypot(s.x - s.targetX, s.y - s.targetY);
      
      if (distToTarget < 30) {
        // Hit the light! Massive dopamine hit
        setScore(prev => prev + 1);
        onReward?.(10.0);
        resetTarget();
      } else {
        // Continuous small reward for being close
        const proximityReward = Math.pow(Math.max(0, 1 - (distToTarget / 400)), 2) * 0.1;
        onReward?.(proximityReward);
      }

      // 5. Draw
      drawVehicle();

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, regionActivity, motorNodes, sensoryNodes, score]);

  useEffect(() => {
    // Initial draw before play
    drawVehicle();
  }, []);

  const drawVehicle = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const s = state.current;

    // Clear bg
    ctx.fillStyle = '#04060e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Light Source (Target)
    ctx.beginPath();
    ctx.arc(s.targetX, s.targetY, 15, 0, Math.PI * 2);
    ctx.shadowBlur = 40;
    ctx.shadowColor = '#eab308'; // yellow
    ctx.fillStyle = '#fef08a';
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw Vehicle
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rotation);

    // Body
    ctx.beginPath();
    ctx.roundRect(-20, -15, 40, 30, 8);
    ctx.fillStyle = '#312e81';
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // Wheels
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(-15, -20, 30, 6); // Left wheel
    ctx.fillRect(-15, 14, 30, 6); // Right wheel
    
    // Wheel activity indicators based on motor command
    ctx.fillStyle = `rgba(0, 255, 255, ${s.leftMotorSmooth})`;
    ctx.fillRect(-10, -19, 20, 4);
    ctx.fillStyle = `rgba(0, 255, 255, ${s.rightMotorSmooth})`;
    ctx.fillRect(-10, 15, 20, 4);

    // Sensors
    ctx.beginPath();
    ctx.arc(15, -15, 6, 0, Math.PI * 2); // Left sensor
    ctx.fillStyle = `rgba(234, 179, 8, ${0.2 + s.leftSensorActive / 3.0})`;
    ctx.fill();
    ctx.strokeStyle = '#eab308';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(15, 15, 6, 0, Math.PI * 2); // Right sensor
    ctx.fillStyle = `rgba(234, 179, 8, ${0.2 + s.rightSensorActive / 3.0})`;
    ctx.fill();
    ctx.strokeStyle = '#eab308';
    ctx.stroke();

    // Direction indicator
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(25, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.stroke();

    ctx.restore();
  };

  return (
    <div className="flex flex-col h-full bg-[#04060e] border border-border/50 rounded-b-xl border-t-0 p-4 relative font-mono text-sm group">
      <div className="flex justify-between items-center mb-4 relative z-10">
        <h2 className="text-xl font-bold flex items-center gap-2">
           Braitenberg Vehicle
          <span className="text-xs font-normal text-text-muted px-2 py-0.5 rounded-full bg-bg-secondary border border-border/50">
            Cybernetics
          </span>
        </h2>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-text-muted text-xs">Light Sources Found</div>
            <div className="text-lg font-bold text-accent-cyan">{score}</div>
          </div>
        </div>
      </div>
      
      <div className="relative flex-1 bg-black/40 rounded border border-border/50 overflow-hidden flex flex-col justify-center border-b-4 border-b-accent-indigo">
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          className="w-full h-full object-contain"
        />

        {!isPlaying && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center backdrop-blur-[2px]">
            <div className="text-text-primary font-bold text-xl mb-4 text-center">
              Fear & Love<br/>
              <span className="text-sm font-normal text-text-muted mt-2 max-w-sm block">
                The cybernetic agent has two light sensors mapped to two sensory cortex nodes, and two wheels mapped to two motor cortex nodes. Dopamine triggers upon capturing the light. Depending on the connectome wiring, it will display distinct primitive emotions.
              </span>
            </div>
            <button
              onClick={() => {
                state.current.lastTime = performance.now();
                setIsPlaying(true);
              }}
              className="px-6 py-2 bg-accent-cyan/20 border border-accent-cyan hover:bg-accent-cyan/30 text-accent-cyan rounded-md font-bold transition-all"
            >
              Initialize Agent
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
