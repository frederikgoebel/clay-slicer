import {
  Color,
  DataTexture,
  LinearFilter,
  MeshMatcapMaterial,
  RedFormat,
  RepeatWrapping,
  ClampToEdgeWrapping,
  UnsignedByteType,
  type Texture,
} from 'three';
import type { Mask } from '../../core/types';

export interface ModelUniforms {
  uMask: { value: Texture };
  uMaskOn: { value: number };
  uHeight: { value: number };
  uTint: { value: Color };
}

/** Mask data as a texture. It shares the Uint8Array, so brush strokes only need needsUpdate. */
export function createMaskTexture(mask: Mask): DataTexture {
  const tex = new DataTexture(mask.data, mask.width, mask.height, RedFormat, UnsignedByteType);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

/** A 1x1 fully painted mask, shown while a texture applies everywhere. */
export function createFullMaskTexture(): DataTexture {
  return createMaskTexture({ width: 1, height: 1, data: new Uint8Array([255]) });
}

/**
 * Matcap material (clear form shading, no scene lights needed) that can also tint the surface
 * with a painted mask. The mask is sampled in model space as (angle around Z, height / uHeight),
 * the same unwrapping the slicer uses, so what you paint is what gets textured.
 */
export function createModelMaterial(matcap: Texture, initialMask: Texture) {
  const uniforms: ModelUniforms = {
    uMask: { value: initialMask },
    uMaskOn: { value: 0 },
    uHeight: { value: 100 },
    uTint: { value: new Color('#5aa9ff') },
  };
  const material = new MeshMatcapMaterial({ matcap, vertexColors: true, toneMapped: false });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vModelPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvModelPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vModelPos;
uniform sampler2D uMask;
uniform float uMaskOn;
uniform float uHeight;
uniform vec3 uTint;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (uMaskOn > 0.5) {
  float u = atan(vModelPos.y, vModelPos.x) / 6.28318530718 + 0.5;
  float v = clamp(vModelPos.z / uHeight, 0.0, 1.0);
  float m = texture2D(uMask, vec2(u, v)).r;
  diffuseColor.rgb = mix(diffuseColor.rgb * 0.5, uTint, m * 0.85);
}`,
      );
  };
  return { material, uniforms };
}
