import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  useAudioPlayer,
  useAudioRecorder,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
} from "expo-audio";
import { ApiError } from "@/api/client";
import {
  createAttempt,
  createSubmission,
  getStudentSubmissions,
} from "@/api/submissions";
import { Button } from "@/components/ui/Button";

let UploadModule: {
  uploadAsync: typeof import("expo-file-system/legacy").uploadAsync;
  FileSystemUploadType: typeof import("expo-file-system/legacy").FileSystemUploadType;
} | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  UploadModule = require("expo-file-system/legacy");
} catch {
  // Not available in this runtime.
}

type RecordState = "idle" | "recording" | "stopped" | "uploading" | "done";

export default function RecordScreen() {
  const { id: assignmentId, submissionId } = useLocalSearchParams<{
    id: string;
    submissionId?: string;
  }>();
  const router = useRouter();

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<RecordState>("idle");
  const [durationMs, setDurationMs] = useState(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const player = useAudioPlayer(recordedUri);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      // Use ref to avoid touching the SharedObject after the hook releases it.
      if (isRecordingRef.current) {
        recorder.stop().catch(() => {});
      }
    };
  }, [recorder]);

  const handleStartRecording = async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert(
          "Microphone Access Required",
          "Please allow microphone access in Settings to record.",
        );
        return;
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      isRecordingRef.current = true;
      setState("recording");
      setDurationMs(0);

      timerRef.current = setInterval(() => {
        setDurationMs((prev) => prev + 1000);
      }, 1000);
    } catch (e: unknown) {
      Alert.alert(
        "Recording Error",
        e instanceof Error ? e.message : "Could not start recording",
      );
    }
  };

  const handleStopRecording = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      await recorder.stop();
      isRecordingRef.current = false;
      setRecordedUri(recorder.uri);
      setState("stopped");
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'duckOthers',
      });
    } catch (e: unknown) {
      Alert.alert(
        "Recording Error",
        e instanceof Error ? e.message : "Could not stop recording",
      );
    }
  };

  const handleSubmit = async () => {
    if (!recordedUri || !UploadModule) return;
    setState("uploading");
    try {
      let uploadUrl: string;
      if (submissionId) {
        const result = await createAttempt(submissionId);
        uploadUrl = result.uploadUrl;
      } else {
        try {
          const result = await createSubmission(assignmentId);
          uploadUrl = result.uploadUrl;
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            const subs = await getStudentSubmissions();
            const existing = subs.find((s) => s.assignmentId === assignmentId);
            if (!existing)
              throw new Error("Could not find existing submission");
            const result = await createAttempt(existing.id);
            uploadUrl = result.uploadUrl;
          } else {
            throw err;
          }
        }
      }

      const uploadResult = await UploadModule.uploadAsync(
        uploadUrl,
        recordedUri,
        {
          httpMethod: "PUT",
          uploadType: UploadModule.FileSystemUploadType.BINARY_CONTENT,
          headers: { "Content-Type": "audio/m4a" },
        },
      );

      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(`Upload failed with status ${uploadResult.status}`);
      }

      setState("done");
      Alert.alert(
        "Submitted",
        "Your recitation has been submitted. Your teacher will review it soon.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (e: unknown) {
      setState("stopped");
      Alert.alert(
        "Upload Error",
        e instanceof Error ? e.message : "Could not upload recording",
      );
    }
  };

  const handleDiscard = () => {
    if (player.playing) player.pause();
    setRecordedUri(null);
    setState("idle");
    setDurationMs(0);
  };

  const formatDuration = (ms: number) => {
    const secs = Math.floor(ms / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const isUploading = state === "uploading";

  return (
    <>
      <Stack.Screen options={{ title: "Record Recitation" }} />
      <View style={styles.container}>
        <View style={styles.card}>
          <View
            style={[
              styles.indicator,
              state === "recording" && styles.indicatorActive,
            ]}
          />
          <Text style={styles.stateLabel}>
            {state === "idle" && "Ready to record"}
            {state === "recording" && "Recording…"}
            {state === "stopped" && "Recording complete"}
            {state === "uploading" && "Uploading…"}
            {state === "done" && "Submitted"}
          </Text>

          {(state === "recording" || state === "stopped") && (
            <Text style={styles.duration}>{formatDuration(durationMs)}</Text>
          )}
        </View>

        <View style={styles.actions}>
          {state === "idle" && (
            <Button title="Start Recording" onPress={handleStartRecording} />
          )}
          {state === "recording" && (
            <Button
              title="Stop Recording"
              variant="danger"
              onPress={handleStopRecording}
            />
          )}
          {state === "stopped" && (
            <>
              <Button
                title={player.playing ? "Stop Playback" : "Play Recording"}
                variant="secondary"
                onPress={() => (player.playing ? player.pause() : player.play())}
                disabled={isUploading}
              />
              <Button
                title="Submit Recording"
                onPress={handleSubmit}
                disabled={isUploading}
                style={styles.secondaryBtn}
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
          {state === "uploading" && (
            <Button title="Uploading…" loading disabled />
          )}
        </View>

        <Text style={styles.hint}>
          {state === "idle"
            ? "Tap Start Recording when you are ready to recite."
            : state === "recording"
              ? "Tap Stop Recording when you finish."
              : state === "stopped"
                ? "Review and tap Submit, or discard to re-record."
                : ""}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
    padding: 24,
    justifyContent: "center",
    gap: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 12,
  },
  indicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#E5E7EB",
  },
  indicatorActive: { backgroundColor: "#DC2626" },
  stateLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
  },
  duration: {
    fontSize: 40,
    fontWeight: "700",
    color: "#1B4F72",
    fontVariant: ["tabular-nums"],
  },
  actions: { gap: 12 },
  secondaryBtn: { marginTop: 0 },
  hint: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 18,
  },
});
