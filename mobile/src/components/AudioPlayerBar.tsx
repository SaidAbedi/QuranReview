import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { getRecordingUrl } from '@/api/teacher';

interface Props {
  submissionId: string;
  attemptId: string;
}

export default function AudioPlayerBar({ submissionId, attemptId }: Props) {
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
    return (
      <View style={styles.bar}>
        <ActivityIndicator color="#1B4F72" />
        <Text style={styles.label}>Loading recording…</Text>
      </View>
    );
  }

  if (urlError) {
    return (
      <View style={styles.bar}>
        <Text style={styles.error}>{urlError}</Text>
      </View>
    );
  }

  const isPlaying = status.playing;
  const currentTime = status.currentTime ?? 0;
  const duration = status.duration ?? 0;

  return (
    <View style={styles.bar}>
      <TouchableOpacity
        style={styles.playBtn}
        onPress={() => (isPlaying ? player.pause() : player.play())}
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
});
