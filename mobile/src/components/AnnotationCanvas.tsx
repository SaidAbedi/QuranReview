import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { AnnotationPoint, AnnotationRow } from '@/types/api';

export interface PendingStroke {
  points: AnnotationPoint[];
}

interface Props {
  width: number;
  height: number;
  savedAnnotations: AnnotationRow[];
  onStrokeComplete: (points: AnnotationPoint[]) => void;
  onUndoLast: () => void;
}

function pointsToPath(points: AnnotationPoint[], w: number, h: number): string {
  if (points.length < 2) return '';
  const [first, ...rest] = points;
  const move = `M ${first.x * w} ${first.y * h}`;
  const lines = rest.map((p) => `L ${p.x * w} ${p.y * h}`).join(' ');
  return `${move} ${lines}`;
}

export default function AnnotationCanvas({
  width,
  height,
  savedAnnotations,
  onStrokeComplete,
}: Props) {
  const [pendingStrokes, setPendingStrokes] = useState<PendingStroke[]>([]);
  const currentStroke = useRef<AnnotationPoint[]>([]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        currentStroke.current = [
          { x: locationX / width, y: locationY / height },
        ];
      },

      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const pt: AnnotationPoint = {
          x: Math.min(1, Math.max(0, locationX / width)),
          y: Math.min(1, Math.max(0, locationY / height)),
        };
        currentStroke.current = [...currentStroke.current, pt];
        // Mirror current stroke into pendingStrokes for live preview.
        setPendingStrokes((prev) => {
          const next = [...prev];
          next[next.length > 0 ? next.length - 1 : 0] = { points: currentStroke.current };
          if (prev.length === 0) return [{ points: currentStroke.current }];
          return next;
        });
      },

      onPanResponderRelease: () => {
        const pts = currentStroke.current;
        if (pts.length >= 2) {
          onStrokeComplete(pts);
          setPendingStrokes((prev) => {
            // Replace in-progress last stroke with final version.
            const next = [...prev];
            next[next.length - 1] = { points: pts };
            return next;
          });
        }
        currentStroke.current = [];
      },
    }),
  ).current;

  return (
    <View style={[styles.canvas, { width, height }]} {...panResponder.panHandlers}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {/* Saved annotations — solid teal */}
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
        {/* Pending strokes — red, semi-transparent */}
        {pendingStrokes.map((stroke, i) =>
          stroke.points.length >= 2 ? (
            <Path
              key={`pending-${i}`}
              d={pointsToPath(stroke.points, width, height)}
              stroke="#DC2626"
              strokeWidth={3}
              strokeOpacity={0.7}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null,
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
