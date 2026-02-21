'use client'

import { useMemo, useEffect, useState, useRef } from 'react'
import type {} from '@react-three/fiber'

const vertexShader = `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const fragmentShader = `
  uniform float time;
  uniform vec2 resolution;
  uniform vec3 dotColor;
  uniform vec3 bgColor;
  uniform sampler2D mouseTrail;
  uniform float rotation;
  uniform float gridSize;
  uniform float dotOpacity;

  vec2 rotate(vec2 uv, float angle) {
      float s = sin(angle);
      float c = cos(angle);
      mat2 rotationMatrix = mat2(c, -s, s, c);
      return rotationMatrix * (uv - 0.5) + 0.5;
  }

  vec2 coverUv(vec2 uv) {
    float r = max(resolution.x, resolution.y);
    if (r < 0.001) return uv;
    vec2 s = resolution.xy / r;
    vec2 newUv = (uv - 0.5) * s + 0.5;
    return clamp(newUv, 0.0, 1.0);
  }

  float sdfCircle(vec2 p, float r) {
      return length(p - 0.5) - r;
  }

  void main() {
    vec2 screenUv = gl_FragCoord.xy / resolution;
    vec2 uv = coverUv(screenUv);

    vec2 rotatedUv = rotate(uv, rotation);

    vec2 gridUv = fract(rotatedUv * gridSize);
    vec2 gridUvCenterInScreenCoords = rotate((floor(rotatedUv * gridSize) + 0.5) / gridSize, -rotation);

    float screenMask = smoothstep(0.0, 1.0, 1.0 - uv.y);
    vec2 centerDisplace = vec2(0.7, 1.1);
    float circleMaskCenter = length(uv - centerDisplace);
    float circleMaskFromCenter = smoothstep(0.5, 1.0, circleMaskCenter);
    
    float combinedMask = screenMask * circleMaskFromCenter;
    float circleAnimatedMask = sin(time * 2.0 + circleMaskCenter * 10.0);

    float mouseInfluence = texture2D(mouseTrail, gridUvCenterInScreenCoords).r;
    
    float scaleInfluence = max(mouseInfluence * 0.5, circleAnimatedMask * 0.3);

    float dotSize = min(pow(circleMaskCenter, 2.0) * 0.2, 0.18);

    float sdfDot = sdfCircle(gridUv, dotSize * (1.0 + scaleInfluence * 0.5));

    float smoothDot = smoothstep(0.05, 0.0, sdfDot);

    float opacityInfluence = max(mouseInfluence * 50.0, circleAnimatedMask * 0.5);

    vec3 composition = mix(bgColor, dotColor, smoothDot * combinedMask * dotOpacity * (1.0 + opacityInfluence));

    gl_FragColor = vec4(composition, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function Scene() {
  const { useThree, useFrame } = require('@react-three/fiber')
  const { useTrailTexture } = require('@react-three/drei')
  const THREE = require('three')

  const size = useThree((s: any) => s.size)
  const viewport = useThree((s: any) => s.viewport)

  const rotation = 0
  const gridSize = 160

  const [trail, onMove] = useTrailTexture({
    size: 512,
    radius: 0.1,
    maxAge: 400,
    interpolate: 1,
    ease: function easeInOutCirc(x: number) {
      return x < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * x, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * x + 2, 2)) + 1) / 2
    }
  })

  const dotMaterial = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        resolution: { value: new THREE.Vector2(1, 1) },
        dotColor: { value: new THREE.Color('#3a3a3a') },
        bgColor: { value: new THREE.Color('#09090b') },
        mouseTrail: { value: null },
        rotation: { value: rotation },
        gridSize: { value: gridSize },
        dotOpacity: { value: 0.045 },
      },
      vertexShader,
      fragmentShader,
    })
    return mat
  }, [])

  useFrame((state: any) => {
    const w = size.width * viewport.dpr
    const h = size.height * viewport.dpr
    dotMaterial.uniforms.time.value = state.clock.elapsedTime
    dotMaterial.uniforms.resolution.value.set(w, h)
    dotMaterial.uniforms.mouseTrail.value = trail
  })

  const handlePointerMove = (e: any) => {
    onMove(e)
  }

  const scale = Math.max(viewport.width, viewport.height) / 2

  return (
    <mesh scale={[scale, scale, 1]} onPointerMove={handlePointerMove}>
      <planeGeometry args={[2, 2]} />
      <primitive object={dotMaterial} attach="material" />
    </mesh>
  )
}

export const DotScreenShader = () => {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div
        className="absolute inset-0 h-full w-full"
        style={{
          background: 'radial-gradient(circle at 50% 50%, rgba(60,60,60,0.5) 0.5px, transparent 0.5px)',
          backgroundSize: '18px 18px',
          backgroundColor: '#09090b',
        }}
      />
    )
  }

  const THREE = require('three')
  const { Canvas } = require('@react-three/fiber')

  return (
    <div className="absolute inset-0 h-full w-full min-h-screen">
      {/* CSS fallback so dots are always visible if WebGL fails or is slow */}
      <div
        className="absolute inset-0 h-full w-full"
        style={{
          background: 'radial-gradient(circle at center, rgba(50,50,50,0.6) 0.5px, transparent 0.5px)',
          backgroundSize: '18px 18px',
          backgroundColor: '#09090b',
        }}
      />
      <Canvas
        className="absolute inset-0 h-full w-full"
        style={{ display: 'block', width: '100%', height: '100%' }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          outputColorSpace: THREE.SRGBColorSpace,
          toneMapping: THREE.NoToneMapping,
        }}
      >
        <Scene />
      </Canvas>
    </div>
  )
}
