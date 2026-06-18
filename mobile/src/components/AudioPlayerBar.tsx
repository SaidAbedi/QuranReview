import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { getRecordingUrl } from '@/api/teacher';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  submissionId: string;
  attemptId: string;
  // compact=true renders inline play/pause + time suitable for a toolbar
  compact?: boolean;
}

export default function AudioPlayerBar({ submissionId, attemptId, compact = false }: Props) {
  const theme = useTheme();
  const T = theme.colors;

  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(true);

  useEffect(() => {
    setLoadingUrl(true);
    setUrlError(null);
    getRecordingUrl(submissionId, attemptId)
      .then((r) => setSignedUrl(r.url))
      .catch((e) => setUrlError(e instanceof Error ? e.message : 'Could not load recording'))
      .finally(() => setLoadingUrl(false));
  }, [submissionId, attemptId]);

  const player = useAudioPlayer(signedUrl ?? undefined);
  const status = useAudioPlayerStatus(player);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loadingUrl) {
    if (compact) return <ActivityIndicator color={T.textInverse} size="small" />;
    return (
      <View style={[styles.bar, { backgroundColor: T.surface, borderColor: T.border }]}>
        <ActivityIndicator color={T.brandPrimary} />
        <Text style={[styles.label, { color: T.textMuted }]}>Loading recording…</Text>
      </View>
    );
  }

  if (urlError) {
    // No recording in storage yet (e.g. seeded/test attempt) — hide the bar silently
    if (urlError.toLowerCase().includes('not found') || urlError.toLowerCase().includes('object not found')) {
      return null;
    }
    return (
      <View style={[styles.bar, { backgroundColor: T.surface, borderColor: T.border }]}>
        <Text style={[styles.error, { color: T.error }]}>{urlError}</Text>
      </View>
    );
  }

  const isPlaying = status.playing;
  const currentTime = status.currentTime ?? 0;
  const duration = status.duration ?? 0;

  const handlePlayPause = async () => {
    if (!isPlaying) {
      // Configure audio session for speaker playback before each play.
      // On a real iOS device this ensures audio routes to the speaker, not the earpiece.
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'duckOthers',
      });
      // If at or near the end, seek back to start so replay works.
      // expo-audio leaves currentTime at the end position after finishing;
      // calling play() from there does nothing on a physical device.
      if (duration > 0 && currentTime >= duration - 0.5) {
        await player.seekTo(0);
      }
      player.play();
    } else {
      player.pause();
    }
  };

  if (compact) {
    return (
      <TouchableOpacity
        style={[styles.compactBtn, { backgroundColor: T.backgroundAlt }]}
        onPress={handlePlayPause}
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
      >
        <Text style={[styles.compactIcon, { color: T.brandPrimary }]}>{isPlaying ? '⏸' : '▶'}</Text>
        <Text style={[styles.compactTime, { color: T.textSecondary }]}>{formatTime(currentTime)}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.bar, { backgroundColor: T.surface, borderColor: T.border }]}>
      <TouchableOpacity
        style={[styles.playBtn, { backgroundColor: T.brandPrimary }]}
        onPress={handlePlayPause}
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
      >
        <Text style={[styles.playIcon, { color: T.brandOnPrimary }]}>{isPlaying ? '⏸' : '▶'}</Text>
      </TouchableOpacity>
      <View style={styles.timeRow}>
        <Text style={[styles.time, { color: T.textSecondary }]}>{formatTime(currentTime)}</Text>
        {duration > 0 && <Text style={[styles.timeSep, { color: T.textMuted }]}> / </Text>}
        {duration > 0 && <Text style={[styles.time, { color: T.textSecondary }]}>{formatTime(duration)}</Text>}
      </View>
      <Text style={[styles.label, { color: T.textMuted }]}>Student Recording</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    borderWidth: 1,
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { fontSize: 16 },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  time: { fontSize: 13, fontVariant: ['tabular-nums'] },
  timeSep: { fontSize: 13 },
  label: { fontSize: 12, flex: 1, textAlign: 'right' },
  error: { fontSize: 13, flex: 1 },
  compactBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8,
  },
  compactIcon: { fontSize: 16 },
  compactTime: { fontSize: 13, fontVariant: ['tabular-nums'] },
});
