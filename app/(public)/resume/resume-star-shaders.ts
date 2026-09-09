// GPU 负责模型形变与自然流动，指针位移使用跨帧保留的惯性状态。
export const starVertexShader = `
attribute vec3 aTarget;
attribute vec3 aScatter;
attribute vec3 aEntrance;
attribute float aSeed;
attribute vec2 aDisplacement;
uniform float uMorph;
uniform float uScatter;
uniform float uAspect;
uniform float uScale;
uniform float uTime;
uniform float uPixelRatio;
uniform float uFocus;
uniform vec2 uCenter;
uniform vec2 uRotation;
uniform float uRoll;
uniform float uTurn;
uniform float uGlow;
uniform float uPerspective;
uniform float uIntro;
varying vec3 vColor;
varying float vLight;
varying float vMask;
void main() {
  vec3 p = mix(position, aTarget, smoothstep(0., 1., uMorph));
  float cy = cos(uRotation.x), sy = sin(uRotation.x);
  float cx = cos(uRotation.y), sx = sin(uRotation.y);
  p.xz = mat2(cy, -sy, sy, cy) * p.xz;
  p.yz = mat2(cx, -sx, sx, cx) * p.yz;
  p.yz = mat2(cos(uTurn), -sin(uTurn), sin(uTurn), cos(uTurn)) * p.yz;
  p.xy = mat2(cos(uRoll), sin(uRoll), -sin(uRoll), cos(uRoll)) * p.xy;
  p *= uScale;
  p.xy /= 1. - p.z * uPerspective;
  p.xy += uCenter;
  vec3 field = mix(aScatter, aEntrance, uIntro);
  field.x *= uAspect;
  field.y += sin(uTime * .12 + aSeed * 40.) * .018;
  float ambient = step(.985, aSeed);
  p = mix(p, field, max(max(uScatter, uIntro), ambient));
  p.xy += aDisplacement;
  gl_Position = vec4(p.x / uAspect, p.y, 0., 1.);
  float bright = step(.965, fract(aSeed * 113.7));
  gl_PointSize = (3.2 + aSeed * 3.2 + bright * 8. * uGlow) * uPixelRatio * (1. + p.z * .17);
  vColor = color;
  vLight = (.62 + .38 * sin(uTime * (.4 + aSeed) + aSeed * 97.)) * (1. + bright * .4 * uGlow);
  float edge = smoothstep(.40, .80, abs(p.x / uAspect));
  vMask = mix(.12 + edge * .24, 1., uFocus);
  vMask = mix(vMask, .8, uIntro);
  vMask *= mix(1., .6, ambient);
}
`;

export const starFragmentShader = `
uniform sampler2D uSprite;
varying vec3 vColor;
varying float vLight;
varying float vMask;
void main() {
  float light = texture2D(uSprite, gl_PointCoord).a;
  if (light < .003) discard;
  gl_FragColor = vec4(vColor, light * vLight * vMask);
  #include <colorspace_fragment>
}
`;
