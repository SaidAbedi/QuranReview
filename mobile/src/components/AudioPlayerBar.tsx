import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { getRecordingUrl } from '@/api/teacher';

interface Props {
  submissionId: string;
  attemptId: string;
  // compact=true renders inline play/pause + time suitable for a toolbar
  compact?: boolean;
}

export default function AudioPlayerBar({ submissionId, attemptId, compact = false }: Props) {
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
    if (compact) return <ActivityIndicator color="#fff" size="small" />;
    return (
      <View style={styles.bar}>
        <ActivityIndicator color="#1B4F72" />
        <Text style={styles.label}>Loading recording…</Text>
      </View>
    );
  }

  if (urlError) {
    // No recording in storage yet (e.g. seeded/test attempt) — hide the bar silently
    if (urlError.toLowerCase().includes('not found') || urlError.toLowerCase().includes('object not found')) {
      return null;
    }
    return (
      <View style={styles.bar}>
        <Text style={styles.error}>{urlError}</Text>
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
      player.play();
    } else {
      player.pause();
    }
  };

  if (compact) {
    return (
      <TouchableOpacity style={styles.compactBtn} onPress={handlePlayPause} accessibilityLabel={isPlaying ? 'Pause' : 'Play'}>
        <Text style={styles.compactIcon}>{isPlaying ? '⏸' : '▶'}</Text>
        <Text style={styles.compactTime}>{formatTime(currentTime)}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.bar}>
      <TouchableOpacity
        style={styles.playBtn}
        onPress={handlePlayPause}
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
      >
        <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
      </TouchableOpacity>
      <View style={styles.timeRow}>
        <Text style={styles.time}>{formatTime(currentTime)}</Text>
        {duration > 0 && <Text style={styles.timeSep}> / </Text>}
        {duration > 0 && <Text style={styles.time}>{formatTime(duration)}</Text>}
      </View>
      <Text style={styles.label}>Student Recording</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1B4F72',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { fontSize: 16, color: '#fff' },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  time: { fontSize: 13, color: '#374151', fontVariant: ['tabular-nums'] },
  timeSep: { fontSize: 13, color: '#9CA3AF' },
  label: { fontSize: 12, color: '#9CA3AF', flex: 1, textAlign: 'right' },
  error: { fontSize: 13, color: '#DC2626', flex: 1 },
  compactBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: '#F3F4F6', borderRadius: 8,
  },
  compactIcon: { fontSize: 16, color: '#1B4F72' },
  compactTime: { fontSize: 13, color: '#374151', fontVariant: ['tabular-nums'] },
});
