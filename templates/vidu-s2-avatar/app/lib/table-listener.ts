// Both the microphone and sample WAV enter this same silence detector.
// Record before speech starts so the first syllable survives. Every segment
// gets its own container header; concatenated WebM chunks are not recordings.
export function listenForTurns(
  context: AudioContext,
  source: AudioNode,
  stream: MediaStream,
  onTurn: (audio: Blob, transcript?: Promise<string>) => void,
  onActivity: (speaking: boolean) => void,
  onError: (error: Error) => void,
  live?: { begin: () => void; finish: () => Promise<string> }
) {
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
    (value) => MediaRecorder.isTypeSupported(value)
  );
  let recorder: MediaRecorder;
  let alive = true;
  let voiced = false;
  let began = performance.now();
  let lastSpeech = began;
  let speechMs = 0;
  let noise = 0.003;
  function record() {
    voiced = false;
    speechMs = 0;
    began = performance.now();
    lastSpeech = began;
    const chunks: Blob[] = [];
    const capture = new MediaRecorder(
      stream,
      mime ? { mimeType: mime } : undefined
    );
    recorder = capture;
    capture.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    capture.onerror = () => {
      onError(new Error("Microphone capture failed. Restart the table."));
      stop();
    };
    capture.onstop = () => {
      if (!alive) return;
      const useful = voiced && speechMs >= 250;
      const transcript = voiced ? live?.finish() : undefined;
      const audio = new Blob(chunks, {
        type: capture.mimeType || "audio/webm",
      });
      record(); // Keep listening while the server interprets this turn.
      onActivity(false);
      if (useful && audio.size) onTurn(audio, transcript);
    };
    capture.start(100);
  }
  record();
  const timer = setInterval(() => {
    if (!alive || recorder.state !== "recording") return;
    analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(
      samples.reduce((sum, n) => sum + n * n, 0) / samples.length
    );
    const now = performance.now();
    const speaking = rms > Math.max(0.018, noise * 3);
    if (speaking) {
      if (!voiced) live?.begin();
      voiced = true;
      speechMs += 50;
      lastSpeech = now;
      onActivity(true);
    } else if (!voiced) noise = noise * 0.98 + rms * 0.02;
    if (
      (voiced && now - lastSpeech >= 1800) ||
      now - began >= (voiced ? 60_000 : 10_000)
    )
      recorder.stop();
  }, 50);
  function stop() {
    alive = false;
    clearInterval(timer);
    source.disconnect(analyser);
    if (recorder.state === "recording") {
      recorder.onstop = null;
      recorder.stop();
    }
  }
  return stop;
}
