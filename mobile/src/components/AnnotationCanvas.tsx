import { useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
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
  freehand:  '#0E7490',
  circle:    '#7C3AED',
  underline: '#D97706',
  highlight: '#059669',
};

const MISTAKE_DOT_COLORS: Record<string, string> = {
  tajweed:       '#7C3AED',
  harakat:       '#D97706',
  wrong_word:    '#DC2626',
  wrong_ayah:    '#DC2626',
  makhraj:       '#0369A1',
  madd:          '#059669',
  ghunnah:       '#059669',
  waqf:          '#6B7280',
  pronunciation: '#D97706',
  memorization:  '#DC2626',
  other:         '#6B7280',
};

interface Props {
  width: number;
  height: number;
  savedAnnotations: AnnotationRow[];
  localAnnotations: LocalAnnotation[];
  // drawEnabled=true  → drawing + tap-to-edit (scroll disabled by parent)
  // drawEnabled=false → tap-to-edit only / word-tap mode / readOnly
  drawEnabled: boolean;
  strokeColor?: string;
  onStrokeComplete?: (points: AnnotationPoint[]) => void;
  onAnnotationTap?: (annotation: AnnotationRow) => void;
  // When provided, taps fire this with normalized coords (word-tap mode)
  onWordTap?: (normX: number, normY: number) => void;
  // readOnly=true → tap-to-view only (student feedback)
  readOnly?: boolean;
  imageUrl?: string;
}

function pointsToPath(points: AnnotationPoint[], w: number, h: number): string {
  if (points.length < 2) return '';
  const [first, ...rest] = points;
  const move = `M ${first.x * w} ${first.y * h}`;
  const lines = rest.map((p) => `L ${p.x * w} ${p.y * h}`).join(' ');
  return `${move} ${lines}`;
}

function toNormalized(x: number, y: number, w: number, h: number): AnnotationPoint {
  return {
    x: Math.min(1, Math.max(0, x / w)),
    y: Math.min(1, Math.max(0, y / h)),
  };
}

export default function AnnotationCanvas({
  width,
  height,
  savedAnnotations,
  localAnnotations,
  drawEnabled,
  strokeColor = '#DC2626',
  onStrokeComplete,
  onAnnotationTap,
  onWordTap,
  readOnly = false,
  imageUrl,
}: Props) {
  const [livePoints, setLivePoints] = useState<AnnotationPoint[]>([]);
  const strokeRef = useRef<AnnotationPoint[]>([]);

  function findNearestAnnotation(cx: number, cy: number): AnnotationRow | null {
    let nearest: AnnotationRow | null = null;
    let nearestDist = 28;
    for (const ann of savedAnnotations) {
      if (!ann.points?.length) continue;
      const ax = ann.points[0].x * width;
      const ay = ann.points[0].y * height;
      const d = Math.hypot(ax - cx, ay - cy);
      if (d < nearestDist) { nearestDist = d; nearest = ann; }
    }
    return nearest;
  }

  // Inner tap — runs inside the draw View; e.x/e.y are already in content space
  const tapGestureInner = Gesture.Tap()
    .maxDeltaX(8)
    .maxDeltaY(8)
    .runOnJS(true)
    .onEnd((e) => {
      if (!onAnnotationTap) return;
      const ann = findNearestAnnotation(e.x, e.y);
      if (ann) onAnnotationTap(ann);
    });

  // Outer tap — used in readOnly / word-tap mode; no zoom so e.x/e.y are direct
  const tapGestureOuter = Gesture.Tap()
    .maxDeltaX(8)
    .maxDeltaY(8)
    .runOnJS(true)
    .onEnd((e) => {
      if (onWordTap) {
        onWordTap(e.x / width, e.y / height);
        return;
      }
      if (!onAnnotationTap) return;
      const ann = findNearestAnnotation(e.x, e.y);
      if (ann) onAnnotationTap(ann);
    });

  const drawGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .minDistance(0)
    .runOnJS(true)
    .onBegin((e) => {
      const pt = toNormalized(e.x, e.y, width, height);
      strokeRef.current = [pt];
      setLivePoints([pt]);
    })
    .onUpdate((e) => {
      const pt = toNormalized(e.x, e.y, width, height);
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

  const innerAnnotateGesture = Gesture.Exclusive(tapGestureInner, drawGesture);

  // Annotate mode: outer gesture is disabled (inner handles tap + draw)
  // ReadOnly / word-tap mode: outer tap handles interaction
  const outerGesture = (readOnly || !drawEnabled)
    ? tapGestureOuter
    : Gesture.Tap().enabled(false);

  // Ellipse size — approximates one Arabic word at Madani Mushaf proportions
  const wordRx = width * 0.08;
  const wordRy = height * 0.022;

  const svgContent = (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>

      {/* ── Saved annotations ── */}
      {savedAnnotations.map((ann) => {
        if (!ann.points?.length) return null;

        if (ann.annotationType === 'word_marker') {
          const pt = ann.points[0];
          const cx = pt.x * width;
          const cy = pt.y * height;
          const color = ann.mistakeType
            ? (MISTAKE_DOT_COLORS[ann.mistakeType] ?? '#7C3AED')
            : ((ann.style?.strokeColor as string | undefined) ?? '#7C3AED');
          return (
            <Ellipse
              key={ann.id}
              cx={cx}
              cy={cy}
              rx={wordRx}
              ry={wordRy}
              stroke={color}
              strokeWidth={2.5}
              fill={color}
              fillOpacity={0.15}
            />
          );
        }

        if (ann.points.length >= 2) {
          return (
            <Path
              key={ann.id}
              d={pointsToPath(ann.points, width, height)}
              stroke={(ann.style?.strokeColor as string | undefined) ?? '#DC2626'}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }
        return null;
      })}

      {/* ── Tap target dots — freehand only (word markers use the ellipse) ── */}
      {savedAnnotations.map((ann) => {
        if (!ann.points?.length) return null;
        if (ann.annotationType === 'word_marker') return null;
        const pt = ann.points[0];
        const color = ann.mistakeType
          ? (MISTAKE_DOT_COLORS[ann.mistakeType] ?? '#DC2626')
          : '#DC2626';
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

      {/* ── Local optimistic annotations ── */}
      {localAnnotations.map((local) => {
        if (local.points.length === 1) {
          // Optimistic word marker ellipse
          const pt = local.points[0];
          const color = local.strokeColor ?? '#7C3AED';
          return (
            <Ellipse
              key={local.localId}
              cx={pt.x * width}
              cy={pt.y * height}
              rx={wordRx}
              ry={wordRy}
              stroke={color}
              strokeWidth={2.5}
              strokeOpacity={local.status === 'saving' ? 0.5 : 1}
              strokeDasharray={local.status === 'saving' ? '6 4' : undefined}
              fill={color}
              fillOpacity={local.status === 'saving' ? 0.06 : 0.15}
            />
          );
        }
        if (local.points.length >= 2) {
          return (
            <Path
              key={local.localId}
              d={pointsToPath(local.points, width, height)}
              stroke={
                local.status === 'failed'
                  ? '#DC2626'
                  : local.status === 'saving'
                  ? '#9CA3AF'
                  : (local.strokeColor ?? '#DC2626')
              }
              strokeWidth={3}
              strokeOpacity={local.status === 'saving' ? 0.5 : 1}
              strokeDasharray={local.status === 'saving' ? '6 4' : undefined}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }
        return null;
      })}

      {/* ── Live stroke ── */}
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
  );

  const innerContent = drawEnabled && !readOnly ? (
    <GestureDetector gesture={innerAnnotateGesture}>
      <View style={{ width, height }}>
        {imageUrl && (
          <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        )}
        {svgContent}
      </View>
    </GestureDetector>
  ) : (
    <>
      {imageUrl && (
        <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      )}
      {svgContent}
    </>
  );

  return (
    <GestureDetector gesture={outerGesture}>
      <View style={[styles.container, { width, height }]}>
        <View
          style={[
            styles.content,
            { width, height, backgroundColor: imageUrl ? '#F8F4E8' : undefined },
          ]}
        >
          {innerContent}
        </View>
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
