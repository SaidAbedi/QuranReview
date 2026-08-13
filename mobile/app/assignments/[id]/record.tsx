import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  useAudioPlayer,
  useAudioRecorder,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
} from 'expo-audio';
import { ApiError } from '@/api/client';
import { createAttempt, createSubmission, getStudentSubmissions } from '@/api/submissions';

let UploadModule: {
  uploadAsync: typeof import('expo-file-system/legacy').uploadAsync;
  FileSystemUploadType: typeof import('expo-file-system/legacy').FileSystemUploadType;
} | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  UploadModule = require('expo-file-system/legacy');
} catch { /* not available */ }

type RecordState = 'idle' | 'countdown' | 'recording' | 'stopped' | 'uploading';

const COUNTDOWN_FROM = 3;
const BG = '#0D1B2A';
const RING_COLOR = '#DC2626';

// ── Pulse ring component ──────────────────────────────────────────────────────

function PulseRing({ delay, active }: { delay: number; active: boolean }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) { anim.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => { loop.stop(); anim.setValue(0); };
  }, [active, anim, delay]);

  const scale   = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] });
  const opacity = anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.5, 0.3, 0] });

  return (
    <Animated.View
      style={[styles.ring, { transform: [{ scale }], opacity }]}
      pointerEvents="none"
    />
  );
}

// ── Waveform bars ─────────────────────────────────────────────────────────────

function WaveformBars({ active }: { active: boolean }) {
  const bars = useRef(
    Array.from({ length: 7 }, () => new Animated.Value(0.2)),
  ).current;

  useEffect(() => {
    if (!active) {
      bars.forEach((b) => b.setValue(0.2));
      return;
    }
    const anims = bars.map((bar, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 80),
          Animated.timing(bar, {
            toValue: 0.2 + Math.random() * 0.8,
            duration: 300 + Math.random() * 300,
            useNativeDriver: true,
          }),
          Animated.timing(bar, {
            toValue: 0.2,
            duration: 300 + Math.random() * 300,
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [active, bars]);

  return (
    <View style={styles.waveform}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[styles.waveBar, { transform: [{ scaleY: bar }] }]}
        />
      ))}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function RecordScreen() {
  const { id: assignmentId, submissionId } = useLocalSearchParams<{
    id: string;
    submissionId?: string;
  }>();
  const router = useRouter();

  const recorder    = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState]           = useState<RecordState>('idle');
  const [countdown, setCountdown]   = useState(COUNTDOWN_FROM);
  const [durationMs, setDurationMs] = useState(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const player      = useAudioPlayer(recordedUri);

  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRecRef     = useRef(false);

  // Countdown scale animation
  const countScale = useRef(new Animated.Value(0.4)).current;
  const countOpacity = useRef(new Animated.Value(0)).current;

  const animateCountdown = useCallback(() => {
    countScale.setValue(0.4);
    countOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(countScale, { toValue: 1, useNativeDriver: true, bounciness: 8 }),
      Animated.timing(countOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
  }, [countScale, countOpacity]);

  const startRecording = useCallback(async () => {
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      isRecRef.current = true;
      setState('recording');
      setDurationMs(0);
      timerRef.current = setInterval(() => setDurationMs((p) => p + 1000), 1000);
    } catch (e) {
      Alert.alert('Recording Error', e instanceof Error ? e.message : 'Could not start recording');
      setState('idle');
    }
  }, [recorder]);

  const beginCountdown = useCallback(async () => {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      Alert.alert('Microphone Access Required', 'Please allow microphone access in Settings.');
      return;
    }
    setState('countdown');
    setCountdown(COUNTDOWN_FROM);
    animateCountdown();

    let remaining = COUNTDOWN_FROM;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownRef.current!);
        countdownRef.current = null;
        startRecording();
      } else {
        setCountdown(remaining);
        animateCountdown();
      }
    }, 1000);
  }, [animateCountdown, startRecording]);

  const cancelCountdown = useCallback(() => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setState('idle');
  }, []);

  const stopRecording = useCallback(async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try {
      await recorder.stop();
      isRecRef.current = false;
      setRecordedUri(recorder.uri);
      setState('stopped');
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not stop recording');
    }
  }, [recorder]);

  const handleSubmit = useCallback(async () => {
    if (!recordedUri || !UploadModule) return;
    setState('uploading');
    try {
      let uploadUrl: string;
      if (submissionId) {
        const r = await createAttempt(submissionId);
        uploadUrl = r.uploadUrl;
      } else {
        try {
          const r = await createSubmission(assignmentId);
          uploadUrl = r.uploadUrl;
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            const subs = await getStudentSubmissions();
            const ex = subs.find((s) => s.assignmentId === assignmentId);
            if (!ex) throw new Error('Could not find existing submission');
            const r = await createAttempt(ex.id);
            uploadUrl = r.uploadUrl;
          } else { throw err; }
        }
      }

      const up = await UploadModule.uploadAsync(uploadUrl, recordedUri, {
        httpMethod: 'PUT',
        uploadType: UploadModule.FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': 'audio/m4a' },
      });

      if (up.status < 200 || up.status >= 300)
        throw new Error(`Upload failed: ${up.status}`);

      Alert.alert(
        'Submitted',
        'Your recitation has been submitted. Your teacher will review it soon.',
        [{ text: 'Done', onPress: () => router.back() }],
      );
    } catch (e) {
      setState('stopped');
      Alert.alert('Upload Error', e instanceof Error ? e.message : 'Could not upload recording');
    }
  }, [recordedUri, submissionId, assignmentId, router]);

  const handleDiscard = useCallback(() => {
    if (player.playing) player.pause();
    setRecordedUri(null);
    setState('idle');
    setDurationMs(0);
  }, [player]);

  // Auto-start countdown on mount
  useEffect(() => {
    beginCountdown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (isRecRef.current) recorder.stop().catch(() => {});
    };
  }, [recorder]);

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  };

  const isRecording = state === 'recording';

  return (
    <>
      <StatusBar barStyle="light-content" />
      <Stack.Screen
        options={{
          title: 'Recitation Room',
          headerStyle: { backgroundColor: BG },
          headerTintColor: '#fff',
          headerShadowVisible: false,
        }}
      />

      <View style={styles.container}>

        {/* ── Countdown ── */}
        {state === 'countdown' && (
          <View style={styles.center}>
            <Text style={styles.countdownLabel}>Starting in</Text>
            <Animated.Text
              style={[styles.countdownNumber, { transform: [{ scale: countScale }], opacity: countOpacity }]}
            >
              {countdown}
            </Animated.Text>
            <Text style={styles.countdownSub}>Place your device nearby and begin reciting</Text>
            <TouchableOpacity style={styles.cancelBtn} onPress={cancelCountdown} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Recording ── */}
        {isRecording && (
          <View style={styles.center}>
            <View style={styles.micWrap}>
              <PulseRing delay={0}    active={isRecording} />
              <PulseRing delay={600}  active={isRecording} />
              <PulseRing delay={1200} active={isRecording} />
              <View style={styles.micCircle}>
                <Text style={styles.micIcon}>🎙</Text>
              </View>
            </View>

            <Text style={styles.timer}>{formatDuration(durationMs)}</Text>
            <Text style={styles.recordingLabel}>Recording…</Text>

            <WaveformBars active={isRecording} />

            <TouchableOpacity style={styles.stopBtn} onPress={stopRecording} activeOpacity={0.8}>
              <View style={styles.stopSquare} />
            </TouchableOpacity>
            <Text style={styles.stopHint}>Tap to stop</Text>
          </View>
        )}

        {/* ── Stopped / review ── */}
        {state === 'stopped' && (
          <View style={styles.center}>
            <Text style={styles.doneIcon}>✓</Text>
            <Text style={styles.doneTitle}>Recitation recorded</Text>
            <Text style={styles.doneTimer}>{formatDuration(durationMs)}</Text>

            <View style={styles.reviewActions}>
              <TouchableOpacity
                style={styles.reviewBtn}
                onPress={() => player.playing ? player.pause() : player.play()}
                activeOpacity={0.8}
              >
                <Text style={styles.reviewBtnIcon}>{player.playing ? '⏸' : '▶'}</Text>
                <Text style={styles.reviewBtnText}>{player.playing ? 'Pause' : 'Play back'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.75}>
                <Text style={styles.submitBtnIcon}>✓</Text>
                <Text style={styles.submitBtnText}>Submit to Teacher</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.redoBtn} onPress={handleDiscard} activeOpacity={0.8}>
                <Text style={styles.redoBtnText}>Re-record</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Uploading ── */}
        {state === 'uploading' && (
          <View style={styles.center}>
            <Text style={styles.uploadingIcon}>⬆</Text>
            <Text style={styles.uploadingText}>Submitting…</Text>
          </View>
        )}

        {/* ── Idle fallback (shouldn't show — auto-countdown on mount) ── */}
        {state === 'idle' && (
          <View style={styles.center}>
            <TouchableOpacity style={styles.startBtn} onPress={beginCountdown} activeOpacity={0.8}>
              <Text style={styles.startBtnText}>Begin Recitation</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  center:    { alignItems: 'center', gap: 20, paddingHorizontal: 32, width: '100%' },

  // ── Countdown ──
  countdownLabel: { fontSize: 16, color: 'rgba(255,255,255,0.5)', fontWeight: '500' },
  countdownNumber: {
    fontSize: 120,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 130,
  },
  countdownSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: -8,
  },
  cancelBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  cancelBtnText: { color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: '600' },

  // ── Mic / pulse ──
  micWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  ring: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: RING_COLOR,
  },
  micCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: RING_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micIcon: { fontSize: 40 },

  // ── Timer + waveform ──
  timer: {
    fontSize: 56,
    fontWeight: '700',
    color: '#fff',
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
  },
  recordingLabel: { fontSize: 14, color: 'rgba(255,255,255,0.45)', fontWeight: '500', marginTop: -12 },

  waveform: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, marginVertical: 8 },
  waveBar:  { width: 4, height: 28, borderRadius: 2, backgroundColor: RING_COLOR, opacity: 0.8 },

  // ── Stop button ──
  stopBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    marginTop: 8,
  },
  stopSquare: { width: 22, height: 22, borderRadius: 4, backgroundColor: '#fff' },
  stopHint:   { fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: -12 },

  // ── Done / review ──
  doneIcon:  { fontSize: 48, color: '#34D399' },
  doneTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  doneTimer: { fontSize: 18, color: 'rgba(255,255,255,0.5)', fontVariant: ['tabular-nums'] },

  reviewActions: { width: '100%', gap: 12, marginTop: 8 },

  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  reviewBtnIcon: { fontSize: 16, color: '#fff' },
  reviewBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: RING_COLOR,
    shadowColor: RING_COLOR,
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 8,
  },
  submitBtnIcon: { fontSize: 18, color: '#fff', fontWeight: '700' },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  redoBtn: { alignItems: 'center', paddingVertical: 8 },
  redoBtnText: { fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: '500' },

  // ── Uploading ──
  uploadingIcon: { fontSize: 40, color: '#fff' },
  uploadingText: { fontSize: 18, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },

  // ── Idle fallback ──
  startBtn: {
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 14,
    backgroundColor: '#1B4F72',
  },
  startBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },
});
