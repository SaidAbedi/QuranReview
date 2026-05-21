import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { createAttempt, createSubmission } from '@/api/submissions';
import { Button } from '@/components/ui/Button';

// expo-av is a native module — unavailable in Expo Go.
// Lazy-require so the module always exports a default component, even when
// the native runtime is missing. A dev build is required for actual recording.
let AudioModule: typeof import('expo-av') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AudioModule = require('expo-av');
} catch {
  // Expo Go or native module not linked — recording unavailable.
}

let UploadModule: {
  uploadAsync: typeof import('expo-file-system/legacy').uploadAsync;
  FileSystemUploadType: typeof import('expo-file-system/legacy').FileSystemUploadType;
} | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  UploadModule = require('expo-file-system/legacy');
} catch {
  // Not available in this runtime.
}

type RecordState = 'idle' | 'recording' | 'stopped' | 'uploading' | 'done';

export default function RecordScreen() {
  const { id: assignmentId, submissionId } = useLocalSearchParams<{
    id: string;
    submissionId?: string;
  }>();
  const router = useRouter();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recordingRef = useRef<any>(null);
  const [state, setState] = useState<RecordState>('idle');
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  // Native module unavailable — show a clear explanation instead of crashing.
  if (!AudioModule) {
    return (
      <>
        <Stack.Screen options={{ title: 'Record Recitation' }} />
        <View style={styles.unavailableContainer}>
          <Text style={styles.unavailableTitle}>Development Build Required</Text>
          <Text style={styles.unavailableBody}>
            Audio recording uses a native module that is not included in Expo Go.
            {'\n\n'}
            To enable recording, install the app via a development build:
            {'\n\n'}
            {'  '}1. Install EAS CLI: npm install -g eas-cli{'\n'}
            {'  '}2. eas build --profile development --platform ios{'\n'}
            {'  '}3. Install the build on your device{'\n'}
            {'  '}4. Run: npx expo start --dev-client
          </Text>
          <Button title="Go Back" variant="secondary" onPress={() => router.back()} />
        </View>
      </>
    );
  }

  const Audio = AudioModule.Audio;

  const handleStartRecording = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert(
          'Microphone Access Required',
          'Please allow microphone access in Settings to record.',
        );
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setState('recording');
      setDurationMs(0);

      timerRef.current = setInterval(() => {
        setDurationMs((prev) => prev + 1000);
      }, 1000);
    } catch (e: unknown) {
      Alert.alert(
        'Recording Error',
        e instanceof Error ? e.message : 'Could not start recording',
      );
    }
  };

  const handleStopRecording = async () => {
    if (!recordingRef.current) return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setLocalUri(uri ?? null);
      setState('stopped');

      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch (e: unknown) {
      Alert.alert(
        'Recording Error',
        e instanceof Error ? e.message : 'Could not stop recording',
      );
    }
  };

  const handleSubmit = async () => {
    if (!localUri || !UploadModule) return;
    setState('uploading');
    try {
      let uploadUrl: string;
      if (submissionId) {
        const result = await createAttempt(submissionId);
        uploadUrl = result.uploadUrl;
      } else {
        const result = await createSubmission(assignmentId);
        uploadUrl = result.uploadUrl;
      }

      const uploadResult = await UploadModule.uploadAsync(uploadUrl, localUri, {
        httpMethod: 'PUT',
        uploadType: UploadModule.FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': 'audio/m4a' },
      });

      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(`Upload failed with status ${uploadResult.status}`);
      }

      setState('done');
      Alert.alert(
        'Submitted',
        'Your recitation has been submitted. Your teacher will review it soon.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: unknown) {
      setState('stopped');
      Alert.alert(
        'Upload Error',
        e instanceof Error ? e.message : 'Could not upload recording',
      );
    }
  };

  const handleDiscard = () => {
    setLocalUri(null);
    setState('idle');
    setDurationMs(0);
  };

  const formatDuration = (ms: number) => {
    const secs = Math.floor(ms / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isUploading = state === 'uploading';

  return (
    <>
      <Stack.Screen options={{ title: 'Record Recitation' }} />
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={[styles.indicator, state === 'recording' && styles.indicatorActive]} />
          <Text style={styles.stateLabel}>
            {state === 'idle' && 'Ready to record'}
            {state === 'recording' && 'Recording…'}
            {state === 'stopped' && 'Recording complete'}
            {state === 'uploading' && 'Uploading…'}
            {state === 'done' && 'Submitted'}
          </Text>

          {(state === 'recording' || state === 'stopped') && (
            <Text style={styles.duration}>{formatDuration(durationMs)}</Text>
          )}
        </View>

        <View style={styles.actions}>
          {state === 'idle' && (
            <Button title="Start Recording" onPress={handleStartRecording} />
          )}
          {state === 'recording' && (
            <Button title="Stop Recording" variant="danger" onPress={handleStopRecording} />
          )}
          {state === 'stopped' && (
            <>
              <Button
                title="Submit Recording"
                onPress={handleSubmit}
                disabled={isUploading}
              />
              <Button
                title="Discard and Re-record"
                variant="secondary"
                onPress={handleDiscard}
                style={styles.secondaryBtn}
                disabled={isUploading}
              />
            </>
          )}
          {state === 'uploading' && <Button title="Uploading…" loading disabled />}
        </View>

        <Text style={styles.hint}>
          {state === 'idle'
            ? 'Tap Start Recording when you are ready to recite.'
            : state === 'recording'
              ? 'Tap Stop Recording when you finish.'
              : state === 'stopped'
                ? 'Review and tap Submit, or discard to re-record.'
                : ''}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    padding: 24,
    justifyContent: 'center',
    gap: 24,
  },
  unavailableContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    padding: 24,
    justifyContent: 'center',
    gap: 16,
  },
  unavailableTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1B4F72',
    textAlign: 'center',
  },
  unavailableBody: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  indicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },
  indicatorActive: { backgroundColor: '#DC2626' },
  stateLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  duration: {
    fontSize: 40,
    fontWeight: '700',
    color: '#1B4F72',
    fontVariant: ['tabular-nums'],
  },
  actions: { gap: 12 },
  secondaryBtn: { marginTop: 0 },
  hint: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
  },
});
