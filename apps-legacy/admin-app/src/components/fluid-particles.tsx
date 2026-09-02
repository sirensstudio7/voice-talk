"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";

type FluidParticlesProps = {
  className?: string;
  particleDensity?: number;
  particleSize?: number;
  particleColor?: string;
  activeColor?: string;
  maxBlastRadius?: number;
  hoverDelay?: number;
  interactionDistance?: number;
};

export function FluidParticles({
  className,
  particleDensity = 100,
  particleSize = 1,
  particleColor = "#555555",
  activeColor = "#ffffff",
  maxBlastRadius = 300,
  hoverDelay = 100,
  interactionDistance = 100,
}: FluidParticlesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const particlesRef = useRef<
    Array<{
      x: number;
      y: number;
      size: number;
      baseX: number;
      baseY: number;
      density: number;
      color: string;
      vx: number;
      vy: number;
      friction: number;
    }>
  >([]);
  const mouseRef = useRef({ x: 0, y: 0, prevX: 0, prevY: 0 });
  const blastRef = useRef({
    active: false,
    x: 0,
    y: 0,
    radius: 0,
    maxRadius: maxBlastRadius,
  });
  const animationRef = useRef(0);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    contextRef.current = canvas.getContext("2d", { alpha: true });
    if (contextRef.current) {
      contextRef.current.globalCompositeOperation = "lighter";
    }

    const easeOutQuad = (t: number) => t * (2 - t);

    const toLocal = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
        inside:
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom,
      };
    };

    const initParticles = () => {
      particlesRef.current = [];
      const { width, height } = sizeRef.current;
      const particleCount = Math.floor((width * height) / particleDensity);

      for (let i = 0; i < particleCount; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const density = Math.random() * 3 + 1;
        particlesRef.current.push({
          x,
          y,
          baseX: x,
          baseY: y,
          size: Math.random() * particleSize + 0.5,
          density,
          color: particleColor,
          vx: 0,
          vy: 0,
          friction: 0.9 - 0.01 * density,
        });
      }
    };

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      sizeRef.current = { width, height };

      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      if (contextRef.current) {
        contextRef.current.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        contextRef.current.globalCompositeOperation = "lighter";
      }

      initParticles();
    };

    const triggerBlast = (clientX: number, clientY: number) => {
      const local = toLocal(clientX, clientY);
      if (!local.inside) return;

      blastRef.current = {
        active: true,
        x: local.x,
        y: local.y,
        radius: 0,
        maxRadius: maxBlastRadius,
      };

      const startTime = performance.now();
      const duration = 300;

      const expandBlast = (timestamp: number) => {
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        blastRef.current.radius = easeOutQuad(progress) * blastRef.current.maxRadius;

        if (progress < 1) {
          requestAnimationFrame(expandBlast);
        } else {
          setTimeout(() => {
            blastRef.current.active = false;
          }, 100);
        }
      };

      requestAnimationFrame(expandBlast);

      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    };

    const animate = () => {
      const ctx = contextRef.current;
      if (!ctx) return;

      const { width, height } = sizeRef.current;
      ctx.clearRect(0, 0, width, height);

      for (const particle of particlesRef.current) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vx *= particle.friction;
        particle.vy *= particle.friction;

        const dx = mouseRef.current.x - particle.x;
        const dy = mouseRef.current.y - particle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0 && distance < interactionDistance) {
          const forceDirectionX = dx / distance;
          const forceDirectionY = dy / distance;
          const force = (interactionDistance - distance) / interactionDistance;

          particle.x -= forceDirectionX * force * particle.density * 0.6;
          particle.y -= forceDirectionY * force * particle.density * 0.6;
          particle.color = activeColor;
        } else {
          if (particle.x !== particle.baseX) {
            particle.x -= (particle.x - particle.baseX) / 20;
          }
          if (particle.y !== particle.baseY) {
            particle.y -= (particle.y - particle.baseY) / 20;
          }
          particle.color = particleColor;
        }

        if (blastRef.current.active) {
          const blastDx = particle.x - blastRef.current.x;
          const blastDy = particle.y - blastRef.current.y;
          const blastDistance = Math.sqrt(blastDx * blastDx + blastDy * blastDy);

          if (blastDistance < blastRef.current.radius) {
            const blastForceX = blastDx / (blastDistance || 1);
            const blastForceY = blastDy / (blastDistance || 1);
            const blastForce =
              (blastRef.current.radius - blastDistance) / blastRef.current.radius;

            particle.vx += blastForceX * blastForce * 15;
            particle.vy += blastForceY * blastForce * 15;

            const intensity = Math.min(255, Math.floor(255 - blastDistance));
            particle.color = `rgba(${intensity}, 100, 255, 0.8)`;
          }
        }

        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    let lastMoveTime = 0;
    const moveThrottle = 10;

    const onMouseMove = (event: MouseEvent) => {
      const now = performance.now();
      if (now - lastMoveTime < moveThrottle) return;
      lastMoveTime = now;

      const local = toLocal(event.clientX, event.clientY);
      const prevX = mouseRef.current.x;
      const prevY = mouseRef.current.y;
      mouseRef.current = { x: local.x, y: local.y, prevX, prevY };

      if (!local.inside) {
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
        }
        return;
      }

      const dx = mouseRef.current.x - mouseRef.current.prevX;
      const dy = mouseRef.current.y - mouseRef.current.prevY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 5) {
        if (hoverTimerRef.current === null) {
          hoverTimerRef.current = setTimeout(() => {
            triggerBlast(event.clientX, event.clientY);
          }, hoverDelay);
        }
      } else if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;

      const local = toLocal(touch.clientX, touch.clientY);
      mouseRef.current = {
        x: local.x,
        y: local.y,
        prevX: mouseRef.current.x,
        prevY: mouseRef.current.y,
      };
    };

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;

      hoverTimerRef.current = setTimeout(() => {
        triggerBlast(touch.clientX, touch.clientY);
      }, hoverDelay);
    };

    const onTouchEnd = () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    };

    const onClick = (event: MouseEvent) => {
      triggerBlast(event.clientX, event.clientY);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    handleResize();
    animate();

    // Window listeners (like your original) so overlays can't block mouse tracking
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("click", onClick);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("click", onClick);
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      cancelAnimationFrame(animationRef.current);
    };
  }, [
    activeColor,
    hoverDelay,
    interactionDistance,
    maxBlastRadius,
    particleColor,
    particleDensity,
    particleSize,
  ]);

  return (
    <div ref={containerRef} className={cn("absolute inset-0 overflow-hidden", className)}>
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
