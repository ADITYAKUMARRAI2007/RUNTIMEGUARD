import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, Text } from '@react-three/drei'
import * as THREE from 'three'

function PipelineNode({ position, color, label, delay }: { position: [number, number, number]; color: string; label: string; delay: number }) {
  const meshRef = useRef<THREE.Mesh>(null!)

  useFrame((state) => {
    if (meshRef.current) {
      const t = state.clock.elapsedTime + delay
      meshRef.current.scale.setScalar(1 + Math.sin(t * 2) * 0.1)
    }
  })

  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.3}>
      <group position={position}>
        <mesh ref={meshRef}>
          <octahedronGeometry args={[0.3, 0]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} metalness={0.6} roughness={0.3} />
        </mesh>
        {/* Glow ring */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.5, 0.02, 8, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.3} />
        </mesh>
      </group>
    </Float>
  )
}

function DataFlow() {
  const particlesRef = useRef<THREE.Points>(null!)
  const count = 50

  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const vel = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = -4 + Math.random() * 8
      pos[i * 3 + 1] = (Math.random() - 0.5) * 2
      pos[i * 3 + 2] = (Math.random() - 0.5) * 2
      vel[i] = 0.5 + Math.random() * 1.5
    }
    return { positions: pos, velocities: vel }
  }, [])

  useFrame(() => {
    if (particlesRef.current) {
      const posArray = particlesRef.current.geometry.attributes.position.array as Float32Array
      for (let i = 0; i < count; i++) {
        posArray[i * 3] += velocities[i] * 0.02
        if (posArray[i * 3] > 4) posArray[i * 3] = -4
      }
      particlesRef.current.geometry.attributes.position.needsUpdate = true
    }
  })

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.05} color="#f59e0b" transparent opacity={0.8} sizeAttenuation />
    </points>
  )
}

export default function PipelineVisualization() {
  const nodes = [
    { position: [-3, 0, 0] as [number, number, number], color: '#f85149', label: 'Detect', delay: 0 },
    { position: [-1.5, 0, 0] as [number, number, number], color: '#f59e0b', label: 'Bundle', delay: 0.5 },
    { position: [0, 0, 0] as [number, number, number], color: '#a78bfa', label: 'Patch', delay: 1 },
    { position: [1.5, 0, 0] as [number, number, number], color: '#0ea5e9', label: 'Verify', delay: 1.5 },
    { position: [3, 0, 0] as [number, number, number], color: '#00ff88', label: 'PR', delay: 2 },
  ]

  return (
    <div className="w-full h-[300px] relative">
      <Canvas camera={{ position: [0, 0, 6], fov: 50 }} gl={{ alpha: true }}>
        <ambientLight intensity={0.4} />
        <pointLight position={[0, 3, 3]} intensity={0.6} color="#ffffff" />
        {nodes.map((node, i) => (
          <PipelineNode key={i} {...node} />
        ))}
        <DataFlow />
        {/* Connection lines between nodes */}
        {nodes.slice(0, -1).map((node, i) => (
          <line key={`line-${i}`}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array([...node.position, ...nodes[i + 1].position]), 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#21262d" transparent opacity={0.5} />
          </line>
        ))}
      </Canvas>
    </div>
  )
}
