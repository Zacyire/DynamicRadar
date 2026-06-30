import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { getDemoVolume } from '../lib/api';
import { buildVolumeGeometry, detectionScenePosition } from '../lib/volume3d';

/** The stacked-sweep point cloud. */
function PointCloud({ volume, vertExag }) {
  const { geometry, count } = useMemo(() => {
    const { positions, colors } = buildVolumeGeometry(volume, { vertExag });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { geometry: g, count: positions.length / 3 };
  }, [volume, vertExag]);

  // Dispose old geometry when it changes.
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (!count) return null;

  return (
    <points geometry={geometry}>
      <pointsMaterial vertexColors size={0.7} sizeAttenuation transparent opacity={0.85} />
    </points>
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
  const topKm = useMemo(() => (volume ? buildVolumeGeometry(volume, { vertExag }).topKm : 0), [volume, vertExag]);

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
