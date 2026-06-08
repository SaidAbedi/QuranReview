import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, clamp } from 'react-native-reanimated';
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

// Stroke colors per tool
export const TOOL_COLORS: Record<string, string> = {
  freehand: '#0E7490',
  circle: '#7C3AED',
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

// Transform: scale around center then translate
// Screen ← content:  screenX = (cx - W/2) * s + W/2 + tx
// Content ← screen:  cx = (screenX - tx - W/2) / s + W/2
function toNormalized(
  screenX: number,
  screenY: number,
  s: number,
  txVal: number,
  tyVal: number,
  w: number,
  h: number,
): AnnotationPoint {
  const cx = (screenX - txVal - w / 2) / s + w / 2;
  const cy = (screenY - tyVal - h / 2) / s + h / 2;
  return {
    x: Math.min(1, Math.max(0, cx / w)),
    y: Math.min(1, Math.max(0, cy / h)),
  };
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
  // Zoom / pan shared values
  const scale = useSharedValue(1);
  const txAnim = useSharedValue(0);
  const tyAnim = useSharedValue(0);
  // Saved at gesture start so we can compute deltas
  const baseScale = useSharedValue(1);
  const baseTx = useSharedValue(0);
  const baseTy = useSharedValue(0);

  const [livePoints, setLivePoints] = useState<AnnotationPoint[]>([]);
  const strokeRef = useRef<AnnotationPoint[]>([]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: txAnim.value },
      { translateY: tyAnim.value },
    ],
  }));

  // Clamp pan so content doesn't leave the container
  function clampOffset(val: number, s: number, dim: number) {
    'worklet';
    const maxOff = (dim / 2) * (s - 1);
    return clamp(val, -maxOff, maxOff);
  }

  // ── Navigate gestures ──────────────────────────────────────────────────────

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      'worklet';
      baseScale.value = scale.value;
      baseTx.value = txAnim.value;
      baseTy.value = tyAnim.value;
    })
    .onUpdate((e) => {
      'worklet';
      const newScale = clamp(baseScale.value * e.scale, 1, 4);
      scale.value = newScale;
      // Keep focal point stationary
      const rawTx = e.focalX - (e.focalX - width / 2 - baseTx.value) * (newScale / baseScale.value) - width / 2;
      const rawTy = e.focalY - (e.focalY - height / 2 - baseTy.value) * (newScale / baseScale.value) - height / 2;
      txAnim.value = clampOffset(rawTx, newScale, width);
      tyAnim.value = clampOffset(rawTy, newScale, height);
    })
    .onEnd(() => {
      'worklet';
      baseScale.value = scale.value;
      baseTx.value = txAnim.value;
      baseTy.value = tyAnim.value;
    });

  const panNavGesture = Gesture.Pan()
    .minPointers(2)
    .onStart(() => {
      'worklet';
      baseTx.value = txAnim.value;
      baseTy.value = tyAnim.value;
    })
    .onUpdate((e) => {
      'worklet';
      txAnim.value = clampOffset(baseTx.value + e.translationX, scale.value, width);
      tyAnim.value = clampOffset(baseTy.value + e.translationY, scale.value, height);
    })
    .onEnd(() => {
      'worklet';
      baseTx.value = txAnim.value;
      baseTy.value = tyAnim.value;
    });

  const singlePanNavGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .onStart(() => {
      'worklet';
      baseTx.value = txAnim.value;
      baseTy.value = tyAnim.value;
    })
    .onUpdate((e) => {
      'worklet';
      txAnim.value = clampOffset(baseTx.value + e.translationX, scale.value, width);
      tyAnim.value = clampOffset(baseTy.value + e.translationY, scale.value, height);
    })
    .onEnd(() => {
      'worklet';
      baseTx.value = txAnim.value;
      baseTy.value = tyAnim.value;
    });

  const tapGesture = Gesture.Tap()
    .maxDeltaX(8)
    .maxDeltaY(8)
    .runOnJS(true)
    .onEnd((e) => {
      if (!onAnnotationTap) return;
      const s = scale.value;
      const tx = txAnim.value;
      const ty = tyAnim.value;
      const cx = (e.x - tx - width / 2) / s + width / 2;
      const cy = (e.y - ty - height / 2) / s + height / 2;
      // Find annotation whose first point is within 20px in content space
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
    panNavGesture,
    Gesture.Exclusive(tapGesture, singlePanNavGesture),
  );

  // ── Draw gesture ───────────────────────────────────────────────────────────

  const drawGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .minDistance(0)
    .runOnJS(true)
    .onBegin((e) => {
      const pt = toNormalized(e.x, e.y, scale.value, txAnim.value, tyAnim.value, width, height);
      strokeRef.current = [pt];
      setLivePoints([pt]);
    })
    .onUpdate((e) => {
      const pt = toNormalized(e.x, e.y, scale.value, txAnim.value, tyAnim.value, width, height);
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
      // Ensure cleanup if gesture is cancelled
      strokeRef.current = [];
      setLivePoints([]);
    });

  // Allow pinch zoom even in annotate mode
  const annotateGesture = Gesture.Simultaneous(pinchGesture, drawGesture);

  const activeGesture = readOnly
    ? navGesture
    : mode === 'navigate'
    ? navGesture
    : annotateGesture;

  return (
    <GestureDetector gesture={activeGesture}>
      <View style={[styles.container, { width, height }]}>
        <Animated.View style={[styles.content, { width, height }, animatedStyle]}>
          <Svg
            width={width}
            height={height}
            style={StyleSheet.absoluteFill}
          >
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

            {/* Tap targets — colored dot at first point of each saved annotation */}
            {!readOnly && mode === 'navigate' && savedAnnotations.map((ann) => {
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
