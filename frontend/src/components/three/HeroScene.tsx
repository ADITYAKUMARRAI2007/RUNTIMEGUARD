import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, MeshDistortMaterial } from '@react-three/drei'
import * as THREE from 'three'

function ParticleField() {
  const points = useRef<THREE.Points>(null!)
  const count = 800

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20
    }
    return pos
  }, [])

  useFrame((state) => {
    if (points.current) {
      points.current.rotation.y = state.clock.elapsedTime * 0.02
      points.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.01) * 0.1
    }
  })

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial size={0.02} color="#00ff88" transparent opacity={0.6} sizeAttenuation />
    </points>
  )
}

function GlowingSphere() {
  const meshRef = useRef<THREE.Mesh>(null!)

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.1
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.15
    }
  })

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
      <mesh ref={meshRef} scale={1.8}>
        <icosahedronGeometry args={[1, 4]} />
        <MeshDistortMaterial
          color="#00ff88"
          emissive="#00ff88"
          emissiveIntensity={0.15}
          roughness={0.4}
          metalness={0.8}
          wireframe
          distort={0.3}
          speed={2}
        />
      </mesh>
    </Float>
  )
}

function ConnectionLines() {
  const linesRef = useRef<THREE.Group>(null!)
  const lineCount = 12

  const lines = useMemo(() => {
    return Array.from({ length: lineCount }, () => {
      const start = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 4
      )
      const end = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 4
      )
      return [start, end]
    })
  }, [])

  useFrame((state) => {
    if (linesRef.current) {
      linesRef.current.rotation.y = state.clock.elapsedTime * 0.03
    }
  })

  return (
    <group ref={linesRef}>
      {lines.map(([start, end], i) => (
        <line key={i}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([start.x, start.y, start.z, end.x, end.y, end.z]), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#0ea5e9" transparent opacity={0.2} />
        </line>
      ))}
    </group>
  )
}

export default function HeroScene() {
  return (
    <div className="absolute inset-0 z-0">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 60 }}
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true }}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[5, 5, 5]} intensity={0.5} color="#00ff88" />
        <pointLight position={[-5, -5, 3]} intensity={0.3} color="#0ea5e9" />
        <ParticleField />
        <GlowingSphere />
        <ConnectionLines />
      </Canvas>
    </div>
  )
}
