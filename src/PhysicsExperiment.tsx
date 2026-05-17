import React, { useRef, useEffect, useState, useCallback } from 'react';

/**
 * Interfaces per als objectes de física
 */
interface Ball { x: number; y: number; vx: number; vy: number; radius: number; }
interface BlueParticle extends Ball { id: number; }
interface Square { id: number; x: number; y: number; width: number; height: number; color: string; animatedScale: number; }
interface LetterDot { id: string; x: number; y: number; baseX: number; baseY: number; color: string; type: 'circle' | 'accent'; falling: boolean; vy: number; visible: boolean; }

const PhysicsExperiment: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isActive, setIsActive] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [expandedSquareId, setExpandedSquareId] = useState<number | null>(null);
  const [pendingBlueCount, setPendingBlueCount] = useState(0);
  
  const isHoveringBall = useRef(false);
  const isHoveringBlueControl = useRef(false);
  const isHoveringStop = useRef(false);
  const isHoveringDot = useRef(false);
  const isBlueControlVisible = useRef(true);
  const hoveringSquareId = useRef<number | null>(null);
  const mousePos = useRef({ x: -1000, y: -1000 });
  
  const animatedBallRadius = useRef(36);
  const animatedBlueRadius = useRef(24);
  const animatedStopRadius = useRef(0);

  const initialSquares = useRef<Square[]>([]);
  const initialBallPos = useRef({ x: 0, y: 0 });
  const squaresRef = useRef<Square[]>([]);
  const ballRef = useRef<Ball>({ x: 0, y: 0, vx: 18, vy: 14, radius: 36 });
  const blueControlRef = useRef({ x: 0, y: 0, radius: 24 });
  const blueParticlesRef = useRef<BlueParticle[]>([]);
  
  const letterDotsRef = useRef<LetterDot[]>([
    { id: 'i1', x: 0, y: 0, baseX: 0, baseY: 0, color: '#B03232', type: 'circle', falling: false, vy: 0, visible: true },
    { id: 'a', x: 0, y: 0, baseX: 0, baseY: 0, color: '#B09C32', type: 'accent', falling: false, vy: 0, visible: true },
    { id: 'i2', x: 0, y: 0, baseX: 0, baseY: 0, color: '#3252B0', type: 'circle', falling: false, vy: 0, visible: true },
  ]);

  const targetScroll = useRef(0);
  const actualScroll = useRef(0);
  const scrollProgressRef = useRef(0);
  const maxScrollRef = useRef(1500);

  const GRAVITY = 0.6;
  const BOUNCE = 0.82; 
  const PARTICLE_COUNT = 100;
  const SPAWN_INTERVAL = 6;
  const spawnTimer = useRef(0);

  const [activeSquareId, setActiveSquareId] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const pendingDragSquareId = useRef<number | null>(null);
  const mouseDownPos = useRef({ x: 0, y: 0 });

  const getSquaresConfig = (w: number, h: number): Square[] => [
    { id: 1, x: 0, y: 0, width: w * 0.31, height: h * 0.43, color: '#B03232', animatedScale: 1 },
    { id: 2, x: 0, y: h * 0.43, width: w * 0.66, height: h * 0.57, color: '#B09C32', animatedScale: 1 },
    { id: 3, x: w * 0.66, y: 0, width: w * 0.34, height: h * 0.74, color: '#3252B0', animatedScale: 1 }
  ];

  const getStartLines = (w: number, h: number) => ({
    1: { x: w * 0.05, y: h * 0.15, w: w * 0.70, h: 20 },
    2: { x: w * 0.30, y: h * 0.15 + 40, w: w * 0.45, h: 20 },
    3: { x: w * 0.55, y: h * 0.15 + 80, w: w * 0.40, h: 20 }
  });

  const resolveBallToBallCollision = (b1: BlueParticle, b2: BlueParticle) => {
    const dx = b1.x - b2.x; const dy = b1.y - b2.y;
    const dist = Math.sqrt(dx*dx + dy*dy); const minDist = b1.radius + b2.radius;
    if (dist < minDist && dist > 0) {
      const nx = dx / dist; const ny = dy / dist; const overlap = minDist - dist;
      b1.x += nx * overlap / 2; b1.y += ny * overlap / 2;
      b2.x -= nx * overlap / 2; b2.y -= ny * overlap / 2;
      const v1n = b1.vx * nx + b1.vy * ny; const v2n = b2.vx * nx + b2.vy * ny;
      if (v1n - v2n < 0) {
        const v1nAfter = v2n * BOUNCE; const v2nAfter = v1n * BOUNCE;
        b1.vx += (v1nAfter - v1n) * nx; b1.vy += (v1nAfter - v1n) * ny;
        b2.vx += (v2nAfter - v2n) * nx; b2.vy += (v2nAfter - v2n) * ny;
      }
    }
  };

  const resolveRedToBlueCollision = (red: Ball, blue: BlueParticle) => {
    const dx = blue.x - red.x; const dy = blue.y - red.y;
    const dist = Math.sqrt(dx*dx + dy*dy); const minDist = red.radius + blue.radius;
    if (dist < minDist && dist > 0) {
      const nx = dx / dist; const ny = dy / dist; const overlap = minDist - dist;
      blue.x += nx * overlap; blue.y += ny * overlap;
      blue.vx = red.vx + nx * 8; blue.vy = red.vy + ny * 8;
    }
  };

  const resolveCollision = (p: Ball, squares: Square[], width: number, height: number, isParticle = false) => {
    const factor = isParticle ? BOUNCE : 1.0;
    if (p.x - p.radius < 0) { p.x = p.radius; p.vx = Math.abs(p.vx) * factor; }
    else if (p.x + p.radius > width) { p.x = width - p.radius; p.vx = -Math.abs(p.vx) * factor; }
    if (p.y - p.radius < 0) { p.y = p.radius; p.vy = Math.abs(p.vy) * factor; }
    if (!isParticle && p.y + p.radius > height) { p.y = height - p.radius; p.vy = -Math.abs(p.vy); }

    squares.forEach(s => {
      if (expandedSquareId === s.id) return;
      const cx = s.x + s.width/2; const cy = s.y + s.height/2;
      const sw = s.width * s.animatedScale; const sh = s.height * s.animatedScale;
      const rx = cx - sw/2; const ry = cy - sh/2;

      const closestX = Math.max(rx, Math.min(p.x, rx + sw));
      const closestY = Math.max(ry, Math.min(p.y, ry + sh));
      const dx = p.x - closestX; const dy = p.y - closestY;
      const distSq = dx * dx + dy * dy;

      if (distSq < p.radius * p.radius) {
        const dist = Math.sqrt(distSq);
        if (dist > 0) {
          const nx = dx / dist; const ny = dy / dist;
          const dot = p.vx * nx + p.vy * ny;
          if (dot < 0) { p.vx = (p.vx - 2 * dot * nx) * factor; p.vy = (p.vy - 2 * dot * ny) * factor; }
          p.x = closestX + nx * p.radius; p.y = closestY + ny * p.radius;
        } else {
          const dl = p.x - rx; const dr = rx + sw - p.x; const dt = p.y - ry; const db = ry + sh - p.y;
          const min = Math.min(dl, dr, dt, db);
          if (min === dl) { p.x = rx - p.radius; p.vx = -Math.abs(p.vx) * factor; }
          else if (min === dr) { p.x = rx + sw + p.radius; p.vx = Math.abs(p.vx) * factor; }
          else if (min === dt) { p.y = ry - p.radius; p.vy = -Math.abs(p.vy) * factor; }
          else { p.y = ry + sh + p.radius; p.vy = Math.abs(p.vy) * factor; }
        }
      }
    });
  };

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current; if (!canvas) return;
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      maxScrollRef.current = window.innerHeight * 1.5;
      const config = getSquaresConfig(canvas.width, canvas.height);
      squaresRef.current = config;
      initialSquares.current = JSON.parse(JSON.stringify(config));
      ballRef.current.x = canvas.width * 0.92; ballRef.current.y = canvas.height * 0.86;
      initialBallPos.current = { x: ballRef.current.x, y: ballRef.current.y };
      blueControlRef.current = { x: canvas.width * 0.48, y: canvas.height * 0.2, radius: 24 };
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    const handleWheel = (e: WheelEvent) => {
      targetScroll.current += e.deltaY;
      if (targetScroll.current < 0) targetScroll.current = 0;
      if (targetScroll.current > maxScrollRef.current) targetScroll.current = maxScrollRef.current;
    };
    
    let lastTouchY = 0;
    const handleTouchStart = (e: TouchEvent) => { lastTouchY = e.touches[0].clientY; };
    const handleTouchMove = (e: TouchEvent) => {
      const dy = lastTouchY - e.touches[0].clientY;
      lastTouchY = e.touches[0].clientY;
      targetScroll.current += dy * 2.5;
      if (targetScroll.current < 0) targetScroll.current = 0;
      if (targetScroll.current > maxScrollRef.current) targetScroll.current = maxScrollRef.current;
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animationId: number;

    const render = () => {
      const { width, height } = canvas;
      const ball = ballRef.current; const squares = squaresRef.current; const particles = blueParticlesRef.current;
      const { x: mx, y: my } = mousePos.current;

      const easeInOutCubic = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      
      actualScroll.current += (targetScroll.current - actualScroll.current) * 0.08;
      let progressRaw = actualScroll.current / maxScrollRef.current;
      if (progressRaw < 0) progressRaw = 0;
      if (progressRaw > 1) progressRaw = 1;
      
      scrollProgressRef.current = progressRaw;
      const progress = easeInOutCubic(progressRaw);
      const physicsOpacity = Math.max(0, (progress - 0.8) * 5); // 0 at 0.8, 1 at 1.0

      if (progress < 0.999) {
        setIsActive(false);
        setExpandedSquareId(null);
        setIsResetting(false);
        
        const startLines = getStartLines(width, height);
        squares.forEach(s => {
          const start = startLines[s.id as keyof typeof startLines];
          const end = initialSquares.current.find(ts => ts.id === s.id)!;
          s.x = start.x + (end.x - start.x) * progress;
          s.y = start.y + (end.y - start.y) * progress;
          s.width = start.w + (end.width - start.w) * progress;
          s.height = start.h + (end.height - start.h) * progress;
          s.animatedScale = 1.0;
        });
        
        ball.x = initialBallPos.current.x;
        ball.y = initialBallPos.current.y;
      }

      if (pendingBlueCount > 0 && expandedSquareId === null && progress > 0.9) {
        spawnTimer.current++;
        if (spawnTimer.current >= SPAWN_INTERVAL) {
          spawnTimer.current = 0;
          const spawnX = width * 0.35 + Math.random() * (width * 0.26);
          particles.push({ id: Date.now() + Math.random(), x: spawnX, y: -60, vx: (Math.random() - 0.5) * 6, vy: 2, radius: 24 });
          setPendingBlueCount(prev => prev - 1);
        }
      }

      isHoveringBall.current = Math.sqrt((ball.x - mx)**2 + (ball.y - my)**2) < ball.radius;
      isHoveringBlueControl.current = Math.sqrt((blueControlRef.current.x - mx)**2 + (my - blueControlRef.current.y)**2) < blueControlRef.current.radius;
      const stopX = width - 100; const stopY = height - 100; const stopR = 30;
      isHoveringStop.current = Math.sqrt((mx - stopX)**2 + (my - stopY)**2) < stopR;

      let currentHoverId: number | null = null;
      if (expandedSquareId === null && progress > 0.99) {
        squares.forEach(s => {
          if (mx >= s.x && mx <= s.x + s.width && my >= s.y && my <= s.y + s.height) currentHoverId = s.id;
          const targetScale = (currentHoverId === s.id) ? 0.94 : 1.0;
          s.animatedScale += (targetScale - s.animatedScale) * 0.12;
        });
      }
      hoveringSquareId.current = currentHoverId;

      isHoveringDot.current = false;
      if (progressRaw < 0.1) {
        const fontSize = width * 0.11;
        letterDotsRef.current.forEach(dot => {
          if (!dot.visible || dot.falling) return;
          const dist = Math.sqrt((mx - dot.x)**2 + (my - dot.y)**2);
          if (dist < fontSize * 0.15) isHoveringDot.current = true;
        });
      }

      const SUBSTEPS = 3;
      for (let s = 0; s < SUBSTEPS; s++) {
        if (expandedSquareId !== null) {
          const targetSq = squares.find(sq => sq.id === expandedSquareId);
          if (targetSq) {
            targetSq.x += (0 - targetSq.x) * 0.1 / SUBSTEPS; targetSq.y += (0 - targetSq.y) * 0.1 / SUBSTEPS;
            targetSq.width += (width - targetSq.width) * 0.1 / SUBSTEPS; targetSq.height += (height - targetSq.height) * 0.1 / SUBSTEPS;
            targetSq.animatedScale += (1.0 - targetSq.animatedScale) * 0.1 / SUBSTEPS;
          }
        } else {
          if (isActive) {
            ball.x += ball.vx / SUBSTEPS; ball.y += ball.vy / SUBSTEPS;
            resolveCollision(ball, squares, width, height, false);
          } else if (isResetting && progress > 0.99) {
            let allDone = true;
            squares.forEach((sq) => {
              const t = initialSquares.current.find(ts => ts.id === sq.id);
              if (t) {
                const dx = t.x - sq.x; const dy = t.y - sq.y; const dw = t.width - sq.width; const dh = t.height - sq.height;
                sq.x += dx * 0.08; sq.y += dy * 0.08; sq.width += dw * 0.08; sq.height += dh * 0.08;
                sq.animatedScale += (1.0 - sq.animatedScale) * 0.08;
                if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || Math.abs(dw) > 0.5 || Math.abs(dh) > 0.5) allDone = false;
              }
            });
            const dxb = initialBallPos.current.x - ball.x; const dyb = initialBallPos.current.y - ball.y;
            ball.x += dxb * 0.08; ball.y += dyb * 0.08;
            if (Math.abs(dxb) > 0.5 || Math.abs(dyb) > 0.5) allDone = false;
            if (allDone) setIsResetting(false);
          }

          for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.vy += GRAVITY / SUBSTEPS; p.x += p.vx / SUBSTEPS; p.y += p.vy / SUBSTEPS;
            resolveCollision(p, squares, width, height, true);
            if (isActive || isResetting) resolveRedToBlueCollision(ball, p);
            for (let j = i + 1; j < particles.length; j++) resolveBallToBallCollision(p, particles[j]);
            if (p.y - p.radius > height) { particles.splice(i, 1); i--; }
          }
        }
      }

      animatedBallRadius.current += (((!isActive && !isResetting && isHoveringBall.current) ? ball.radius * 1.3 : ball.radius) - animatedBallRadius.current) * 0.15;
      animatedBlueRadius.current += ((isHoveringBlueControl.current ? blueControlRef.current.radius * 1.4 : blueControlRef.current.radius) - animatedBlueRadius.current) * 0.15;
      animatedStopRadius.current += (((isActive || expandedSquareId !== null) ? stopR : 0) - animatedStopRadius.current) * 0.12;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width, height);

      const textOpacity = Math.max(0, 1 - progressRaw * 2.5);
      const anyDotActive = letterDotsRef.current.some(d => d.visible && d.falling);
      
      if (textOpacity > 0 || anyDotActive) {
        const letters = ['h', 'ı', 'd', 'r', 'a', 'u', 'l', 'ı', 'c'];
        const fontSize = width * 0.12;
        ctx.save();
        ctx.font = `900 ${fontSize}px "Montserrat", "Helvetica Neue", "Arial Black", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const spacing = -fontSize * 0.03;
        const widths = letters.map(l => ctx.measureText(l).width);
        const totalWidth = widths.reduce((a, b) => a + b, 0) + spacing * (letters.length - 1);
        let currentX = width / 2 - totalWidth / 2;
        const textY = height * 0.65; 
        
        if (textOpacity > 0) {
          ctx.fillStyle = '#3252B0';
          ctx.globalAlpha = textOpacity;
          letters.forEach((l, i) => {
            const letterX = currentX + widths[i] / 2;
            ctx.fillText(l, letterX, textY);
            
            if (i === 1) {
              const dot = letterDotsRef.current.find(d => d.id === 'i1');
              if (dot && !dot.falling) { dot.baseX = letterX; dot.baseY = textY - fontSize * 0.35; }
            } else if (i === 4) {
              const dot = letterDotsRef.current.find(d => d.id === 'a');
              if (dot && !dot.falling) { dot.baseX = letterX; dot.baseY = textY - fontSize * 0.35; }
            } else if (i === 7) {
              const dot = letterDotsRef.current.find(d => d.id === 'i2');
              if (dot && !dot.falling) { dot.baseX = letterX; dot.baseY = textY - fontSize * 0.35; }
            }
            currentX += widths[i] + spacing;
          });
        }
        ctx.restore();
        
        letterDotsRef.current.forEach(dot => {
          if (!dot.visible) return;
          let opacity = dot.falling ? 1 : textOpacity;
          if (opacity <= 0) return;
          
          if (!dot.falling) {
            dot.x = dot.baseX;
            dot.y = dot.baseY;
          } else {
            dot.vy += GRAVITY * 0.5;
            dot.y += dot.vy;
            if (dot.y > height + 50) dot.visible = false;
          }
          
          ctx.save();
          ctx.globalAlpha = opacity;
          ctx.fillStyle = dot.color;
          if (dot.type === 'circle') {
            ctx.beginPath();
            ctx.arc(dot.x, dot.y, fontSize * 0.1, 0, Math.PI * 2);
            ctx.fill();
          } else if (dot.type === 'accent') {
            const s = fontSize * 0.15;
            ctx.translate(dot.x, dot.y);
            ctx.rotate(Math.PI / 4);
            ctx.fillRect(-s/2, -s/2, s, s);
          }
          ctx.restore();
        });
      }

      const sortedSquares = [...squares];
      if (expandedSquareId !== null) {
        const idx = sortedSquares.findIndex(s => s.id === expandedSquareId);
        if (idx > -1) sortedSquares.push(sortedSquares.splice(idx, 1)[0]);
      }

      sortedSquares.forEach(s => {
        ctx.save();
        const cx = s.x + s.width/2; const cy = s.y + s.height/2;
        ctx.translate(cx, cy); ctx.scale(s.animatedScale, s.animatedScale); ctx.translate(-cx, -cy);
        ctx.fillStyle = s.color; ctx.fillRect(s.x, s.y, s.width, s.height);
        if (isActive && expandedSquareId === null) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'; ctx.beginPath();
          ctx.moveTo(s.x+s.width, s.y+s.height); ctx.lineTo(s.x+s.width-30, s.y+s.height); ctx.lineTo(s.x+s.width, s.y+s.height-30);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      });

      if (physicsOpacity > 0) {
        ctx.save();
        ctx.globalAlpha = physicsOpacity;
        particles.forEach(p => {
          ctx.fillStyle = '#3252B0'; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
        });
        if (isBlueControlVisible.current) {
          ctx.fillStyle = '#3252B0'; ctx.beginPath(); ctx.arc(blueControlRef.current.x, blueControlRef.current.y, animatedBlueRadius.current, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#B03232'; ctx.beginPath(); ctx.arc(ball.x, ball.y, animatedBallRadius.current, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      if (animatedStopRadius.current > 0.5) {
        ctx.save(); ctx.globalAlpha = Math.min(1, animatedStopRadius.current / stopR);
        ctx.fillStyle = isHoveringStop.current ? '#333333' : '#B0B0B0';
        ctx.beginPath(); ctx.arc(stopX, stopY, animatedStopRadius.current, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 4;
        const cs = animatedStopRadius.current * 0.4;
        ctx.beginPath(); ctx.moveTo(stopX-cs, stopY-cs); ctx.lineTo(stopX+cs, stopY+cs);
        ctx.moveTo(stopX+cs, stopY-cs); ctx.lineTo(stopX-cs, stopY+cs); ctx.stroke();
        ctx.restore();
      }
      animationId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animationId);
  }, [isActive, isResetting, expandedSquareId, pendingBlueCount]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / canvas.clientWidth;
    const scaleY = canvas.height / canvas.clientHeight;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    mouseDownPos.current = { x: mx, y: my };

    if (scrollProgressRef.current < 0.1) {
      let clickedDot = false;
      const fontSize = canvas.width * 0.12;
      letterDotsRef.current.forEach(dot => {
        if (!dot.visible || dot.falling) return;
        const dist = Math.sqrt((mx - dot.x)**2 + (my - dot.y)**2);
        if (dist < fontSize * 0.2) {
          dot.falling = true;
          dot.vy = -1;
          clickedDot = true;
        }
      });
      if (clickedDot) return;
    }

    if (scrollProgressRef.current < 0.99) return;

    if (isActive || expandedSquareId !== null) {
      const stopX = canvas.width - 100; const stopY = canvas.height - 100;
      if (Math.sqrt((mx - stopX)**2 + (my - stopY)**2) < 55) {
        setIsActive(false); setExpandedSquareId(null); setIsResetting(true); return;
      }
    }
    if (expandedSquareId !== null) return;

    if (isBlueControlVisible.current && Math.sqrt((mx - blueControlRef.current.x)**2 + (my - blueControlRef.current.y)**2) < 45) {
      isBlueControlVisible.current = false;
      blueParticlesRef.current.push({ id: 999, x: blueControlRef.current.x, y: blueControlRef.current.y, vx: 0, vy: 1, radius: 24 });
      setPendingBlueCount(PARTICLE_COUNT); return;
    }

    const distBall = Math.sqrt((ballRef.current.x - mx)**2 + (ballRef.current.y - my)**2);
    if (distBall < ballRef.current.radius * 1.5 && !isResetting) { setIsActive(true); return; }
    if (isResetting) return;

    const squares = squaresRef.current;
    for (let i = squares.length - 1; i >= 0; i--) {
      const s = squares[i];
      if (isActive) {
        const dxH = mx - (s.x + s.width); const dyH = my - (s.y + s.height);
        if (Math.sqrt(dxH*dxH + dyH*dyH) < 45) {
          setActiveSquareId(s.id); setIsResizing(true);
          squares.push(squares.splice(i, 1)[0]); return;
        }
      }
      if (mx >= s.x && mx <= s.x + s.width && my >= s.y && my <= s.y + s.height) {
        setActiveSquareId(s.id);
        pendingDragSquareId.current = s.id;
        dragOffset.current = { x: mx - s.x, y: my - s.y };
        squares.push(squares.splice(i, 1)[0]);
        return;
      }
    }
  };

  const handleMouseMoveGlobal = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / canvas.clientWidth;
    const scaleY = canvas.height / canvas.clientHeight;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    mousePos.current = { x: mx, y: my };

    if (isActive && pendingDragSquareId.current !== null && !isDragging && !isResizing) {
      const dx = mx - mouseDownPos.current.x;
      const dy = my - mouseDownPos.current.y;
      if (Math.sqrt(dx*dx + dy*dy) > 8) {
        setIsDragging(true);
        pendingDragSquareId.current = null;
      }
    }

    if (!isActive || activeSquareId === null) return;
    const s = squaresRef.current.find(sq => sq.id === activeSquareId);
    if (!s) return;
    if (isDragging) { s.x = mx - dragOffset.current.x; s.y = my - dragOffset.current.y; }
    else if (isResizing) { s.width = Math.max(50, mx - s.x); s.height = Math.max(50, my - s.y); }
  }, [isActive, isDragging, isResizing, activeSquareId]);

  const handleMouseUp = useCallback(() => {
    const wasPendingClick = pendingDragSquareId.current !== null;
    pendingDragSquareId.current = null;

    if (activeSquareId !== null && !isResizing && !isDragging && wasPendingClick) {
      setIsActive(false);
      setExpandedSquareId(activeSquareId);
    }
    setIsDragging(false); setIsResizing(false); setActiveSquareId(null);
  }, [activeSquareId, isResizing, isDragging]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMoveGlobal);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMoveGlobal);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMoveGlobal, handleMouseUp]);

  return (
    <div className="fixed inset-0 w-full h-full bg-white flex items-center justify-center overflow-hidden">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        className={`w-full h-full block cursor-default touch-none
          ${(isBlueControlVisible.current && isHoveringBlueControl.current && scrollProgressRef.current > 0.9) || 
            (isHoveringBall.current && scrollProgressRef.current > 0.9) || 
            (hoveringSquareId.current !== null && scrollProgressRef.current > 0.9) || 
            ((isActive || expandedSquareId !== null) && isHoveringStop.current) ||
            isHoveringDot.current ? 'cursor-pointer' : ''} 
          ${isActive ? (isDragging ? 'cursor-grabbing' : isResizing ? 'cursor-nwse-resize' : '') : ''}`}
      />
    </div>
  );
};

export default PhysicsExperiment;
