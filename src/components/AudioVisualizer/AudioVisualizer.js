import React, { useRef, useEffect } from 'react';
import './AudioVisualizer.css';

const AudioVisualizer = ({ audioContext }) => {
  const canvasRef = useRef();
  const animationRef = useRef();

  useEffect(() => {
    if (audioContext && canvasRef.current) {
      startVisualization();
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [audioContext]);

  const startVisualization = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    const draw = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw frequency spectrum visualization
      ctx.fillStyle = '#4ade80';
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      
      // Mock visualization for now
      const barCount = 64;
      const barWidth = canvas.width / barCount;
      
      for (let i = 0; i < barCount; i++) {
        const height = Math.random() * canvas.height * 0.5;
        const x = i * barWidth;
        const y = canvas.height - height;
        
        ctx.fillRect(x, y, barWidth - 2, height);
      }
      
      animationRef.current = requestAnimationFrame(draw);
    };
    
    draw();
  };

  return (
    <div className="audio-visualizer">
      <h4>Audio Spectrum</h4>
      <canvas ref={canvasRef} className="visualizer-canvas"></canvas>
      <p className="frequency-info">Monitoring ultrasonic frequencies (20-23 kHz)</p>
    </div>
  );
};

export default AudioVisualizer;