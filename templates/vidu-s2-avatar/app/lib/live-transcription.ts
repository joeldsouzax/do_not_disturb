export interface LiveTranscription {
  begin: () => void;
  finish: () => Promise<string>;
  stop: () => void;
}

// The independent recording remains the fallback when a Live session fails.
// Only finalized text can drive the story. Interim text is display-only.
export async function liveTranscription(
  context: AudioContext,
  source: AudioNode,
  signal: AbortSignal,
  preview: (text: string) => void,
  status: (text: string) => void,
  mode: "live" | "example" = "live"
): Promise<LiveTranscription> {
  let alive = true;
  let ready = false;
  let socket: WebSocket | null = null;
  let active = false;
  let attempts = 0;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  const prefix: ArrayBuffer[] = [];
  const waiting: {
    resolve: (text: string) => void;
    text: string;
    timer: ReturnType<typeof setTimeout>;
  }[] = [];
  let activeText = "";
  let tap: AudioWorkletNode | null = null;
  let sink: GainNode | null = null;

  function send(value: unknown) {
    if (ready && socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(value));
  }
  function pcm(buffer: ArrayBuffer) {
    const encoded = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    send({
      realtimeInput: {
        audio: { data: encoded, mimeType: "audio/pcm;rate=16000" },
      },
    });
  }
  async function connect() {
    const response = await fetch("/api/adventure/live-token", {
      method: "POST",
      headers: { "X-Adventure-Mode": mode },
      cache: "no-store",
      signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Live speech unavailable.");
    if (!alive) return;
    const connection = new WebSocket(
      `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(data.token)}`
    );
    socket = connection;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        connection.close();
        reject(new Error("Live speech connection timed out."));
      }, 10_000);
      connection.onopen = () =>
        connection.send(JSON.stringify({ setup: data.setup }));
      connection.onmessage = async (event) => {
        if (!alive || socket !== connection) return;
        const message = JSON.parse(
          typeof event.data === "string" ? event.data : await event.data.text()
        );
        if (message.setupComplete) {
          ready = true;
          attempts = 0;
          clearTimeout(timeout);
          status("Live speech connected");
          resolve();
        }
        const content = message.serverContent;
        if (content?.interimInputTranscription?.text)
          preview(content.interimInputTranscription.text);
        if (content?.inputTranscription?.text) {
          const text = content.inputTranscription.text as string;
          const pending = waiting[0];
          if (pending) {
            clearTimeout(pending.timer);
            waiting.shift();
            pending.resolve((pending.text + text).trim());
          } else if (active) activeText += text;
        }
      };
      connection.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Live speech connection failed."));
      };
      connection.onclose = () => {
        clearTimeout(timeout);
        ready = false;
        active = false;
        activeText = "";
        for (const pending of waiting.splice(0)) {
          clearTimeout(pending.timer);
          pending.resolve("");
        }
        reject(new Error("Live speech disconnected."));
        if (!alive) return;
        status("Recorded speech fallback; reconnecting live speech");
        if (++attempts <= 3)
          reconnect = setTimeout(
            () =>
              void connect().catch(() => status("Recorded speech fallback")),
            2000
          );
      };
    });
  }
  function stop() {
    if (!alive) return;
    alive = false;
    ready = false;
    active = false;
    clearTimeout(reconnect);
    for (const pending of waiting.splice(0)) {
      clearTimeout(pending.timer);
      pending.resolve("");
    }
    socket?.close();
    if (tap) {
      tap.port.onmessage = null;
      source.disconnect(tap);
      tap.disconnect();
    }
    sink?.disconnect();
    signal.removeEventListener("abort", stop);
  }
  signal.addEventListener("abort", stop, { once: true });
  try {
    await connect();
    if (!alive || signal.aborted) throw new Error("The table ended.");
    await context.audioWorklet.addModule("/audio/pcm-tap.js");
    tap = new AudioWorkletNode(context, "pcm-tap");
    sink = context.createGain();
    sink.gain.value = 0;
    source.connect(tap);
    tap.connect(sink);
    sink.connect(context.destination);
    tap.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (active) pcm(event.data);
      prefix.push(event.data);
      if (prefix.length > 3) prefix.shift();
    };
    return {
      begin: () => {
        if (active || !ready) return;
        active = true;
        activeText = "";
        send({ realtimeInput: { activityStart: {} } });
        for (const buffer of prefix) pcm(buffer);
      },
      finish: () => {
        if (!active || !ready) return Promise.resolve("");
        active = false;
        const text = activeText;
        activeText = "";
        return new Promise<string>((resolve) => {
          const entry = {
            resolve,
            text,
            timer: setTimeout(() => {
              const index = waiting.indexOf(entry);
              if (index >= 0) waiting.splice(index, 1);
              // A timed-out final must not be attributed to the following turn.
              resolve("");
              socket?.close();
            }, 4000),
          };
          waiting.push(entry);
          send({ realtimeInput: { activityEnd: {} } });
        });
      },
      stop,
    };
  } catch (error) {
    stop();
    throw error;
  }
}
