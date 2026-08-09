import { useEffect, useRef, useState } from 'react';

import { DK68_DEFAULT_NODES, InteractiveEnvironmentProps } from './types';

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

    // Map brain activity to brain paddle position
    useEffect(() => {
        if (!state.current.active) return;
        
        const motorActivityRaw = regionActivity[motorNodeIndex] ?? 0.5;

        // Initialize adaptive bounds if missing
        if ((state.current as any).minActivity === undefined) {
            (state.current as any).minActivity = 1.0;
            (state.current as any).maxActivity = 0.0;
            (state.current as any).motorActivitySmooth = motorActivityRaw; // Initialize smooth value
        }

        let s = state.current as any;
        s.motorActivitySmooth = (s.motorActivitySmooth * 0.8) + (motorActivityRaw * 0.2);
        const motorActivity = s.motorActivitySmooth;

        // Update adaptive min/max bounds
        s.minActivity = Math.min(s.minActivity, motorActivity);
        s.maxActivity = Math.max(s.maxActivity, motorActivity);

        // Only decay bounds if they are wide enough, prevents collapsing around steady-state noise which causes extreme shaking
        const currentRange = s.maxActivity - s.minActivity;
        if (currentRange > 0.05) {
            s.minActivity += (motorActivity - s.minActivity) * 0.0002;
            s.maxActivity -= (s.maxActivity - motorActivity) * 0.0002;
        }

        const range = Math.max(s.maxActivity - s.minActivity, 0.02); // minimum structural range
        const normalized = Math.max(0, Math.min(1, (motorActivity - s.minActivity) / range));

        // Map normalized activity directly to the screen height. 
        // Ball Y is 0 (Top) to 100 (Bottom). High stimulus -> high activity -> ball at bottom (Y=~90).
        const targetY = 10 + (normalized * 80);
        const clampedY = Math.max(10, Math.min(90, targetY));

        // Smooth trailing
        state.current.paddleBrain.y += (clampedY - state.current.paddleBrain.y) * 0.15;
    }, [regionActivity, motorNodeIndex]);

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
