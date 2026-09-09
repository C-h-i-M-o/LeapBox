import { DataTexture, LinearFilter, RGBAFormat } from "three";

/** 柔光只计算一次；每帧用小纹理采样，避免重复逐像素指数运算。 */
export function createStarTexture(): DataTexture {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + .5) / size - .5;
      const v = (y + .5) / size - .5;
      const radius = Math.hypot(u, v);
      const light = radius > .5 ? 0 : Math.exp(-radius * radius * 95)
        + Math.exp(-radius * radius * 16) * .24
        + Math.exp(-Math.abs(u * v) * 1700) * Math.exp(-radius * 10) * .12;
      const offset = (y * size + x) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 255;
      pixels[offset + 3] = Math.round(Math.min(1, light) * 255);
    }
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.magFilter = texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
