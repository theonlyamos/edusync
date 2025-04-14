import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { SimulationParameters } from './types/simulation';

interface SimulationProps {
  data: SimulationParameters;
  onSubmit: (result: { completed: boolean }) => void;
}

interface SimulationRefs {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

const createSimulation = (type: SimulationParameters['type'], scene: THREE.Scene) => {
  switch (type) {
    case 'physics':
      return {
        mesh: new THREE.Mesh(
          new THREE.SphereGeometry(1),
          new THREE.MeshPhongMaterial({ color: 0x0000ff })
        ),
        update: (time: number) => {
          scene.children[0].position.y = Math.sin(time * 0.002) * 2;
        }
      };
    case 'chemistry':
      return {
        mesh: new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshPhongMaterial({ color: 0x00ff00 })
        ),
        update: (time: number) => {
          scene.children[0].rotation.x = time * 0.001;
          scene.children[0].rotation.y = time * 0.002;
        }
      };
    case 'biology':
      return {
        mesh: new THREE.Mesh(
          new THREE.TorusGeometry(1, 0.4, 16, 100),
          new THREE.MeshPhongMaterial({ color: 0xff0000 })
        ),
        update: (time: number) => {
          scene.children[0].scale.setScalar(1 + Math.sin(time * 0.001) * 0.2);
        }
      };
  }
};

export const Simulation: React.FC<SimulationProps> = ({ data, onSubmit }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const frameIdRef = useRef<number>(0);
  const simulationRefs = useRef<SimulationRefs | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    
    // Store refs for animation
    simulationRefs.current = { scene, camera };
    rendererRef.current = renderer;

    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);

    camera.position.z = 5;

    // Add lighting
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(0, 0, 2);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0x404040));

    // Create simulation based on type
    const simulation = createSimulation(data.type, scene);
    scene.add(simulation.mesh);

    let startTime = Date.now();

    const animate = () => {
      if (!running) return;
      const currentTime = Date.now() - startTime;
      simulation.update(currentTime);
      renderer.render(scene, camera);
      frameIdRef.current = requestAnimationFrame(animate);
    };

    const handleResize = () => {
      if (!mountRef.current) return;
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (frameIdRef.current) {
        cancelAnimationFrame(frameIdRef.current);
      }
      if (rendererRef.current && mountRef.current) {
        mountRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
      simulationRefs.current = null;
    };
  }, [data.type]);

  useEffect(() => {
    if (running && rendererRef.current && simulationRefs.current) {
      const { scene, camera } = simulationRefs.current;
      
      const animate = () => {
        frameIdRef.current = requestAnimationFrame(animate);
        // Update simulation
        const currentTime = Date.now();
        const simulation = createSimulation(data.type, scene);
        simulation.update(currentTime);
        
        // Render scene
        rendererRef.current?.render(scene, camera);
      };
      
      animate();
    }
    
    return () => {
      if (frameIdRef.current) {
        cancelAnimationFrame(frameIdRef.current);
      }
    };
  }, [running, data.type]);

  return (
    <div className="w-full h-[400px] border rounded">
      <div ref={mountRef} className="w-full h-full" />
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => setRunning(!running)}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          {running ? 'Stop' : 'Start'} Simulation
        </button>
        <button
          onClick={() => onSubmit({ completed: true })}
          className="px-4 py-2 bg-green-500 text-white rounded"
        >
          Complete
        </button>
      </div>
    </div>
  );
};