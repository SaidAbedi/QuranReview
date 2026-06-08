import { useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Path, Circle } from 'react-native-svg';
import type { AnnotationPoint, AnnotationRow } from '@/types/api';

export type AnnotationSaveStatus = 'saving' | 'saved' | 'failed';

export interface LocalAnnotation {
  localId: string;
  points: AnnotationPoint[];
  status: AnnotationSaveStatus;
  savedRow?: AnnotationRow;
  strokeColor?: string;
}

export const TOOL_COLORS: Record<string, string> = {
  freehand: '#0E7490',
  circle:   '#7C3AED',
  underline: '#D97706',
  highlight: '#059669',
};

const MISTAKE_DOT_COLORS: Record<string, string> = {
  tajweed: '#7C3AED',
  harakat: '#D97706',
  wrong_word: '#DC2626',
  wrong_ayah: '#DC2626',
  makhraj: '#0369A1',
  madd: '#059669',
  ghunnah: '#059669',
  waqf: '#6B7280',
  pronunciation: '#D97706',
  memorization: '#DC2626',
  other: '#6B7280',
};

interface Props {
  width: number;
  height: number;
  savedAnnotations: AnnotationRow[];
  localAnnotations: LocalAnnotation[];
  mode: 'navigate' | 'annotate';
  strokeColor?: string;
  onStrokeComplete?: (points: AnnotationPoint[]) => void;
  onAnnotationTap?: (annotation: AnnotationRow) => void;
  readOnly?: boolean;
}

function pointsToPath(points: AnnotationPoint[], w: number, h: number): string {
  if (points.length < 2) return '';
  const [first, ...rest] = points;
  const move = `M ${first.x * w} ${first.y * h}`;
  const lines = rest.map((p) => `L ${p.x * w} ${p.y * h}`).join(' ');
  return `${move} ${lines}`;
}

// With transform: [scale, translateX, translateY] and RN scaling around center:
//   screenX = (cx - W/2) * s + W/2 + tx
// Inverse → normalized:
//   normalizedX = [(screenX - tx - W/2) / s + W/2] / W
function toNormalized(
  sx: number, sy: number,
  s: number, tx: number, ty: number,
  w: number, h: number,
): AnnotationPoint {
  const cx = (sx - tx - w / 2) / s + w / 2;
  const cy = (sy - ty - h / 2) / s + h / 2;
  return {
    x: Math.min(1, Math.max(0, cx / w)),
    y: Math.min(1, Math.max(0, cy / h)),
  };
}

function clampOffset(val: number, s: number, dim: number): number {
  const max = (dim / 2) * (s - 1);
  return Math.min(max, Math.max(-max, val));
}

export default function AnnotationCanvas({
  width,
  height,
  savedAnnotations,
  localAnnotations,
  mode,
  strokeColor = TOOL_COLORS.freehand,
  onStrokeComplete,
  onAnnotationTap,
  readOnly = false,
}: Props) {
  // Zoom / pan — plain Animated.Values (no Reanimated plugin needed)
  const scaleAnim  = useRef(new Animated.Value(1)).current;
  const txAnim     = useRef(new Animated.Value(0)).current;
  const tyAnim     = useRef(new Animated.Value(0)).current;

  // JS-side mirrors of the animated values so gesture math is cheap
  const sRef  = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);

  // Saved at gesture start for delta computation
  const baseS  = useRef(1);
  const baseTx = useRef(0);
  const baseTy = useRef(0);

  const [livePoints, setLivePoints] = useState<AnnotationPoint[]>([]);
  const strokeRef = useRef<AnnotationPoint[]>([]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function setTransform(s: number, tx: number, ty: number) {
    sRef.current = s;
    txRef.current = tx;
    tyRef.current = ty;
    scaleAnim.setValue(s);
    txAnim.setValue(tx);
    tyAnim.setValue(ty);
  }

  // ── Navigate gestures ──────────────────────────────────────────────────────

  const pinchGesture = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => {
      baseS.current  = sRef.current;
      baseTx.current = txRef.current;
      baseTy.current = tyRef.current;
    })
    .onUpdate((e) => {
      const newS = Math.min(4, Math.max(1, baseS.current * e.scale));
      // Keep focal point stationary during scale
      const rawTx = e.focalX - (e.focalX - width / 2 - baseTx.current) * (newS / baseS.current) - width / 2;
      const rawTy = e.focalY - (e.focalY - height / 2 - baseTy.current) * (newS / baseS.current) - height / 2;
      setTransform(newS, clampOffset(rawTx, newS, width), clampOffset(rawTy, newS, height));
    })
    .onEnd(() => {
      baseS.current  = sRef.current;
      baseTx.current = txRef.current;
      baseTy.current = tyRef.current;
    });

  const panNavGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .runOnJS(true)
    .onStart(() => {
      baseTx.current = txRef.current;
      baseTy.current = tyRef.current;
    })
    .onUpdate((e) => {
      const s = sRef.current;
      setTransform(
        s,
        clampOffset(baseTx.current + e.translationX, s, width),
        clampOffset(baseTy.current + e.translationY, s, height),
      );
    })
    .onEnd(() => {
      baseTx.current = txRef.current;
      baseTy.current = tyRef.current;
    });

  const tapGesture = Gesture.Tap()
    .maxDeltaX(8)
    .maxDeltaY(8)
    .runOnJS(true)
    .onEnd((e) => {
      if (!onAnnotationTap) return;
      const s  = sRef.current;
      const tx = txRef.current;
      const ty = tyRef.current;
      const cx = (e.x - tx - width / 2) / s + width / 2;
      const cy = (e.y - ty - height / 2) / s + height / 2;
      for (const ann of savedAnnotations) {
        if (!ann.points?.length) continue;
        const ax = ann.points[0].x * width;
        const ay = ann.points[0].y * height;
        if (Math.hypot(ax - cx, ay - cy) < 20) {
          onAnnotationTap(ann);
          return;
        }
      }
    });

  const navGesture = Gesture.Simultaneous(
    pinchGesture,
    Gesture.Exclusive(tapGesture, panNavGesture),
  );

  // ── Draw gesture ───────────────────────────────────────────────────────────

  const drawGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .minDistance(0)
    .runOnJS(true)
    .onBegin((e) => {
      const pt = toNormalized(e.x, e.y, sRef.current, txRef.current, tyRef.current, width, height);
      strokeRef.current = [pt];
      setLivePoints([pt]);
    })
    .onUpdate((e) => {
      const pt = toNormalized(e.x, e.y, sRef.current, txRef.current, tyRef.current, width, height);
      const pts = [...strokeRef.current, pt];
      strokeRef.current = pts;
      setLivePoints(pts);
    })
    .onEnd(() => {
      const pts = strokeRef.current;
      strokeRef.current = [];
      setLivePoints([]);
      if (pts.length >= 2) onStrokeComplete?.(pts);
    })
    .onFinalize(() => {
      strokeRef.current = [];
      setLivePoints([]);
    });

  // Pinch zoom still works in annotate mode (2-finger vs 1-finger draw)
  const annotateGesture = Gesture.Simultaneous(pinchGesture, drawGesture);

  const activeGesture = readOnly
    ? navGesture
    : mode === 'navigate'
    ? navGesture
    : annotateGesture;

  return (
    <GestureDetector gesture={activeGesture}>
      <View style={[styles.container, { width, height }]}>
        <Animated.View
          style={[
            styles.content,
            { width, height },
            { transform: [{ scale: scaleAnim }, { translateX: txAnim }, { translateY: tyAnim }] },
          ]}
        >
          <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
            {/* Saved annotations from backend */}
            {savedAnnotations.map((ann) =>
              ann.points && ann.points.length >= 2 ? (
                <Path
                  key={ann.id}
                  d={pointsToPath(ann.points, width, height)}
                  stroke="#0E7490"
                  strokeWidth={3}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null,
            )}

            {/* Tap targets in navigate mode */}
            {!readOnly && mode === 'navigate' &&
              savedAnnotations.map((ann) => {
                if (!ann.points?.length) return null;
                const pt = ann.points[0];
                const color = ann.mistakeType
                  ? (MISTAKE_DOT_COLORS[ann.mistakeType] ?? '#0E7490')
                  : '#0E7490';
                return (
                  <Circle
                    key={`dot-${ann.id}`}
                    cx={pt.x * width}
                    cy={pt.y * height}
                    r={9}
                    fill={color}
                    fillOpacity={0.85}
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                );
              })}

            {/* Local optimistic annotations */}
            {localAnnotations.map((local) =>
              local.points.length >= 2 ? (
                <Path
                  key={local.localId}
                  d={pointsToPath(local.points, width, height)}
                  stroke={
                    local.status === 'failed'
                      ? '#DC2626'
                      : local.status === 'saving'
                      ? '#9CA3AF'
                      : (local.strokeColor ?? '#0E7490')
                  }
                  strokeWidth={3}
                  strokeOpacity={local.status === 'saving' ? 0.5 : 1}
                  strokeDasharray={local.status === 'saving' ? '6 4' : undefined}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null,
            )}

            {/* Live stroke being drawn */}
            {livePoints.length >= 2 && (
              <Path
                d={pointsToPath(livePoints, width, height)}
                stroke={strokeColor}
                strokeWidth={3}
                strokeOpacity={0.8}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </Svg>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'hidden',
  },
  content: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
