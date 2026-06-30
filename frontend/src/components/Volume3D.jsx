import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { getDemoVolume } from '../lib/api';
import { beamHeight, buildVolumeGeometry, detectionScenePosition } from '../lib/volume3d';

/** A soft radial sprite so points blend into a cohesive cloud (not dots). */
function makeSoftSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/** The stacked-sweep cloud + an additive glow layer for intense cores. */
function PointCloud({ volume, vertExag }) {
  const sprite = useMemo(makeSoftSprite, []);
  const built = useMemo(
    () => buildVolumeGeometry(volume, { vertExag, density: 3 }),
    [volume, vertExag]
  );

  const { cloud, glow } = useMemo(() => {
    const c = new THREE.BufferGeometry();
    c.setAttribute('position', new THREE.BufferAttribute(built.positions, 3));
    c.setAttribute('color', new THREE.BufferAttribute(built.colors, 3));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(built.glow.positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(built.glow.colors, 3));
    return { cloud: c, glow: g };
  }, [built]);

  useEffect(() => () => {
    cloud.dispose();
    glow.dispose();
  }, [cloud, glow]);

  if (!built.count) return null;

  return (
    <>
      <points geometry={cloud}>
        <pointsMaterial
          map={sprite}
          vertexColors
          size={1.5}
          sizeAttenuation
          transparent
          opacity={0.6}
          depthWrite={false}
          alphaTest={0.02}
        />
      </points>
      {built.glow.positions.length > 0 && (
        <points geometry={glow}>
          <pointsMaterial
            map={sprite}
            vertexColors
            size={4.5}
            sizeAttenuation
            transparent
            opacity={0.5}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      )}
    </>
  );
}

/** A translucent column marking each detected circulation. */
function CirculationMarkers({ signatures, vertExag, topKm }) {
  const height = Math.max(topKm, 8 * vertExag);
  return signatures.map((s, i) => {
    const { eastKm, northKm } = detectionScenePosition(s);
    const color = s.is_tds ? '#ff2d2d' : '#ffd400';
    return (
      <group key={i} position={[eastKm, height / 2, northKm]}>
        <mesh>
          <cylinderGeometry args={[1.2, 1.2, height, 16, 1, true]} />
          <meshBasicMaterial color={color} transparent opacity={0.18} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, height / 2, 0]}>
          <sphereGeometry args={[1.6, 16, 16]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
        </mesh>
      </group>
    );
  });
}

/** Radar site marker at the scene origin. */
function RadarMarker() {
  return (
    <mesh position={[0, 0, 0]}>
      <coneGeometry args={[1.5, 4, 16]} />
      <meshStandardMaterial color="#4cc9f0" emissive="#4cc9f0" emissiveIntensity={0.4} />
    </mesh>
  );
}

export default function Volume3D({ scenario, field, analytics, vertExag = 4 }) {
  const [volume, setVolume] = useState(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!scenario) return;
    let cancelled = false;
    setStatus('Loading volume…');
    setVolume(null);
    getDemoVolume(scenario, { field })
      .then((v) => {
        if (cancelled) return;
        setVolume(v);
        setStatus('');
      })
      .catch((e) => !cancelled && setStatus(`Volume: ${e.message}`));
    return () => {
      cancelled = true;
    };
  }, [scenario, field]);

  const signatures = analytics?.tornado_signatures || [];
  // Cheap top-of-storm estimate (no dense cloud build): tallest tilt × range.
  const topKm = useMemo(() => {
    if (!volume) return 0;
    const maxR = volume.sweeps[0]?.ranges_m?.slice(-1)[0] || 150000;
    const maxEl = volume.elevations_deg[volume.elevations_deg.length - 1] || 4;
    return (beamHeight(maxR, maxEl) / 1000) * vertExag;
  }, [volume, vertExag]);

  // Orbit target: the strongest circulation, else the radar.
  const target = useMemo(() => {
    if (!signatures.length) return [0, topKm / 2, 0];
    const s = signatures[0];
    const { eastKm, northKm } = detectionScenePosition(s);
    return [eastKm, topKm / 2, northKm];
  }, [signatures, topKm]);

  return (
    <div className="map-wrap">
      <Canvas camera={{ position: [90, 70, 90], fov: 50, far: 6000, near: 0.1 }}>
        <color attach="background" args={['#070b16']} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[100, 200, 100]} intensity={0.8} />
        <hemisphereLight args={['#9fb4ff', '#0a0f1f', 0.4]} />

        <Grid
          args={[400, 400]}
          cellSize={10}
          cellColor="#1b2238"
          sectionSize={50}
          sectionColor="#2b3a66"
          infiniteGrid
          fadeDistance={500}
          position={[0, 0, 0]}
        />
        <RadarMarker />
        {volume && <PointCloud volume={volume} vertExag={vertExag} />}
        <CirculationMarkers signatures={signatures} vertExag={vertExag} topKm={topKm} />

        <OrbitControls target={target} enableDamping makeDefault maxDistance={1500} />
      </Canvas>

      <div className="view3d-overlay">
        <div className="view3d-title">3D Volumetric View — {field}</div>
        {volume && (
          <div className="muted small">
            {volume.n_tilts} tilts · {volume.elevations_deg[0]}°–
            {volume.elevations_deg[volume.elevations_deg.length - 1]}° · vertical ×{vertExag}
          </div>
        )}
        {signatures.length > 0 && (
          <div className="small" style={{ color: '#ffd400' }}>
            {signatures.length} circulation marker(s) — orbit to inspect vertical structure
          </div>
        )}
      </div>
      {status && <div className="map-toast">{status}</div>}
    </div>
  );
}
