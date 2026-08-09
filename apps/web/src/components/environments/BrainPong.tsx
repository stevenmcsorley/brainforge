import { useEffect, useRef, useState } from 'react';

import { DK68_DEFAULT_NODES, InteractiveEnvironmentProps } from './types';

/** EMA rate for the motor readout's running mean and variance. */
const READOUT_ADAPT_RATE = 0.002;
/** Screen units per standard deviation of motor activity. */
const READOUT_Z_SCALE = 25;

// The original BrainPongProps interface is replaced by InteractiveEnvironmentProps
// interface BrainPongProps {
//     runId: string;
//     regionActivity: number[];
//     onEmitCommand: (cmd: any) => void;
//     modelName?: string;
//     sensoryNodeIndex?: number;
//     motorNodeIndex?: number;
//     onReward?: (reward: number) => void;
// }

export default function BrainPong({
    regionActivity,
    onEmitCommand,
    modelName,
    sensoryNodes,
    motorNodes,
    onReward,
}: InteractiveEnvironmentProps) {
    const sensoryNodeIndex = sensoryNodes[0] ?? DK68_DEFAULT_NODES.sensory;
    const motorNodeIndex = motorNodes[0] ?? DK68_DEFAULT_NODES.motor;

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [score, setScore] = useState({ user: 0, brain: 0 });
    const [isPlaying, setIsPlaying] = useState(false);

    // Game state refs (to avoid stale closures in requestAnimationFrame)
    const state = useRef({
        ball: { x: 50, y: 50, vx: 0.6, vy: 0.4, size: 3 },
        paddleUser: { y: 50, width: 2, height: 20 },
        paddleBrain: { y: 50, width: 2, height: 20 },
        lastEmitTime: 0,
        active: false,
        baselineActivity: -1,
        rewardFlash: 0,
    });

    // Autonomous AI Computer controlling the left paddle
    // Handled directly perfectly in the game loop below.

    // Map brain activity to brain paddle position.
    //
    // Readout uses a running z-score rather than adaptive min/max bounds. Motor
    // activity drifts slowly around a mean with a small standard deviation
    // (~0.008 on DK68), and min/max normalisation latches onto extremes and then
    // mostly amplifies noise — measured offline, a min/max paddle scored at
    // roughly the level of a stationary one. Tracking mean and variance with a
    // slow EMA and mapping z to screen position keeps the paddle centred and
    // responsive as the operating point drifts.
    useEffect(() => {
        if (!state.current.active) return;

        const nodes = motorNodes.length > 0 ? motorNodes : [motorNodeIndex];
        const vals = nodes
            .map((n) => regionActivity[n])
            .filter((v): v is number => typeof v === 'number');
        if (vals.length === 0) return;
        const raw = vals.reduce((a, b) => a + b, 0) / vals.length;

        const s = state.current as any;
        if (s.motorMean === undefined) {
            s.motorMean = raw;
            s.motorVar = 1e-4;
        }
        // Slow EMA so the readout adapts to drift without chasing single frames.
        s.motorMean += READOUT_ADAPT_RATE * (raw - s.motorMean);
        s.motorVar += READOUT_ADAPT_RATE * ((raw - s.motorMean) ** 2 - s.motorVar);

        const z = (raw - s.motorMean) / Math.max(Math.sqrt(s.motorVar), 1e-6);
        const targetY = 50 + z * READOUT_Z_SCALE;
        const clampedY = Math.max(10, Math.min(90, targetY));

        state.current.paddleBrain.y += (clampedY - state.current.paddleBrain.y) * 0.15;
    }, [regionActivity, motorNodeIndex, motorNodes]);

    // Game Loop
    useEffect(() => {
        if (!isPlaying) {
            state.current.active = false;
            return;
        }

        state.current.active = true;
        let animationFrameId: number;

        const render = (time: number) => {
            const s = state.current;
            const canvas = canvasRef.current;
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Update ball physics
            s.ball.x += s.ball.vx;
            s.ball.y += s.ball.vy;

            // Autonomous Computer Paddle tracking the ball (Left side)
            // It moves towards the ball's Y position smoothly, but with a slight delay
            // to make it beatable if the brain gets good.
            s.paddleUser.y += (s.ball.y - s.paddleUser.y) * 0.15;
            s.paddleUser.y = Math.max(10, Math.min(90, s.paddleUser.y));

            // Wall collisions (top and bottom)
            if (s.ball.y <= 0 || s.ball.y >= 100) {
                s.ball.vy *= -1;
            }

            // Paddle collisions
            const userRect = { x: 5, y: s.paddleUser.y, w: s.paddleUser.width, h: s.paddleUser.height };
            const brainRect = { x: 95, y: s.paddleBrain.y, w: s.paddleBrain.width, h: s.paddleBrain.height };

            // User paddle hit
            if (s.ball.vx < 0 && s.ball.x <= userRect.x + userRect.w && Math.abs(s.ball.y - userRect.y) <= userRect.h / 2) {
                s.ball.vx *= -1;
                s.ball.vy += (s.ball.y - userRect.y) * 0.1; // Add spin
            }

            // Brain paddle hit (+ Dopamine)
            if (s.ball.vx > 0 && s.ball.x >= brainRect.x - userRect.w && Math.abs(s.ball.y - brainRect.y) <= brainRect.h / 2) {
                s.ball.vx *= -1;
                s.ball.vy += (s.ball.y - brainRect.y) * 0.1;
                if (onReward) onReward(5.0); // Larger reward burst
                s.rewardFlash = +1;
            }

            // Scoring
            if (s.ball.x <= 0) {
                setScore(prev => ({ ...prev, brain: prev.brain + 1 }));
                s.ball.x = 50; s.ball.y = 50; s.ball.vx *= -1;
            }
            if (s.ball.x >= 100) {
                setScore(prev => ({ ...prev, user: prev.user + 1 }));
                s.ball.x = 50; s.ball.y = 50; s.ball.vx *= -1;
                if (onReward) onReward(-2.0); // Larger punishment burst on miss
                s.rewardFlash = -1;
            }

            // Render Phase
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw Reward Flash
            if (s.rewardFlash > 0) {
                ctx.fillStyle = `rgba(34, 197, 94, ${s.rewardFlash * 0.3})`; // Green flash
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                s.rewardFlash -= 0.05;
            } else if (s.rewardFlash < 0) {
                ctx.fillStyle = `rgba(239, 68, 68, ${Math.abs(s.rewardFlash) * 0.3})`; // Red flash
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                s.rewardFlash += 0.05;
            }
            if (Math.abs(s.rewardFlash) < 0.05) s.rewardFlash = 0;

            const toPxX = (v: number) => (v / 100) * canvas.width;
            const toPxY = (v: number) => (v / 100) * canvas.height;

            // Draw Center Line
            ctx.setLineDash([5, 10]);
            ctx.beginPath();
            ctx.moveTo(canvas.width / 2, 0);
            ctx.lineTo(canvas.width / 2, canvas.height);
            ctx.strokeStyle = '#334155';
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw Paddles
            ctx.fillStyle = '#06b6d4'; // User (Cyan)
            ctx.fillRect(toPxX(userRect.x - userRect.w / 2), toPxY(userRect.y - userRect.h / 2), toPxX(userRect.w), toPxY(userRect.h));

            ctx.fillStyle = '#8b5cf6'; // Brain (Purple)
            ctx.fillRect(toPxX(brainRect.x - brainRect.w / 2), toPxY(brainRect.y - brainRect.h / 2), toPxX(brainRect.w), toPxY(brainRect.h));

            // Draw Ball
            ctx.beginPath();
            ctx.arc(toPxX(s.ball.x), toPxY(s.ball.y), toPxX(s.ball.size), 0, Math.PI * 2);
            ctx.fillStyle = '#f8fafc';
            ctx.fill();

            // Emit Stimulus to Brain
            // Emits ~10 times per second to avoid flooding the websocket
            if (time - s.lastEmitTime > 100) { 
                s.lastEmitTime = time;
                let stimulusAmp = 0;
                
                if (s.ball.vx > 0) {
                    // Inject current proportional to the ball's Y position (so the brain "sees" where it is)
                    stimulusAmp = (s.ball.y / 100.0) * 2.0; // scale 0 to 2.0
                }

                onEmitCommand({
                    command: 'stimulus',
                    node: sensoryNodeIndex,
                    value: stimulusAmp,
                });
            }

            animationFrameId = requestAnimationFrame(render);
        };

        animationFrameId = requestAnimationFrame(render);

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [isPlaying, onEmitCommand, sensoryNodeIndex]);

    return (
        <div className="flex flex-col h-full bg-[#04060e] rounded-b-xl border border-border border-t-0 p-4 font-mono text-xs">
            {/* Score Header */}
            <div className="flex justify-between items-center mb-4 px-8 text-lg font-bold">
                <div className="text-accent-cyan flex flex-col items-center">
                    <span className="text-xs uppercase tracking-widest text-[#06b6d4]/60 mb-1">Computer</span>
                    {score.user}
                </div>

                {!isPlaying ? (
                    <button
                        onClick={() => setIsPlaying(true)}
                        className="px-4 py-2 bg-accent-purple/20 text-accent-purple rounded border border-accent-purple/40 hover:bg-accent-purple/30 transition-colors uppercase tracking-widest text-xs"
                    >
                        Start Match
                    </button>
                ) : (
                    <div className="text-text-muted/50 tracking-[0.5em]">VS</div>
                )}

                <div className="text-accent-purple flex flex-col items-center">
                    <span className="text-xs uppercase tracking-widest text-[#8b5cf6]/60 mb-1">{modelName || "Brain Simulation"}</span>
                    {score.brain}
                </div>
            </div>

            {/* Game Canvas */}
            <div className="flex-1 relative border border-border/50 rounded overflow-hidden">
                <canvas
                    ref={canvasRef}
                    width={800}
                    height={400}
                    className="w-full h-full object-contain bg-black"
                />
                {!isPlaying && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                        <div className="text-center">
                            <p className="text-text-primary mb-2 text-sm">Move mouse vertically to control paddle.</p>
                            <p className="text-text-muted max-w-sm">
                                The ball's vertical position is injected as electrical current into sensory node {sensoryNodeIndex}.
                                The right paddle is driven by the real-time activity of motor node {motorNodeIndex}.
                                With plasticity enabled the weights adapt, but the loop is not currently
                                tuned to converge — see the Brain-Pong notes in the README.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
