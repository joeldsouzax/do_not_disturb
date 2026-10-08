"use client";

import { useEffect, useRef, useState } from "react";
import { callActive, callStartable, systemVoices } from "../lib/call";
import { useSession } from "../lib/session";
import { CallControls } from "./CallControls";
import { CommandError } from "./CommandError";
import { SnapClip } from "./SnapClip";
import { Stage } from "./Stage";
import { StatusBadge } from "./StatusBadge";
import { Transcript } from "./Transcript";
import { VoiceOptions } from "./VoiceOptions";

const SAMPLE = "/miniatures/wizard.jpg";
const CLASSES = ["Wizard", "Ranger", "Fighter", "Rogue", "Cleric", "Bard"];
const INITIAL_STORY = "A wandering wizard who collects forgotten stories. His blue staff holds the last spark of a fallen star. Dry wit, a kind heart, and absolutely no sense of direction.";

function Sigil({ small = false }: { small?: boolean }) {
  return (
    <svg width={small ? 24 : 36} height={small ? 24 : 36} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M20 2 36 11v18L20 38 4 29V11L20 2Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="m20 2 8 18-8 18-8-18L20 2ZM4 11l24 9L4 29m32-18-24 9 24 9" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function MiniatureWorkshop({ configured }: { configured: boolean }) {
  const { status, phase, snapshot, photo, photoReady, busy, setup, patchSetup, voices, choosePhoto, startCall } = useSession();
  const [name, setName] = useState("Aldren Ashwick");
  const [heroClass, setHeroClass] = useState("Wizard");
  const [story, setStory] = useState(INITIAL_STORY);
  const [source, setSource] = useState<{ url: string; file: File | null }>({ url: SAMPLE, file: null });
  const [preparedFor, setPreparedFor] = useState<{ source: string; name: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const media = useRef<MediaStream | null>(null);
  const active = callActive(phase);
  const working = loading || busy !== null || phase === "preparing_avatar";
  const locked = working || active;
  const sourcePrepared = preparedFor?.source === source.url && preparedFor?.name === name.trim();
  const prepared = sourcePrepared && callStartable(phase) && photoReady;
  const live = phase === "live" && snapshot?.video_receiving === true;

  // Creation stays local until the player explicitly prepares an avatar.
  useEffect(() => {
    patchSetup({
      persona: `You are ${name.trim() || "a wandering hero"}, a ${heroClass.toLowerCase()} in a tabletop fantasy adventure, brought to life from the player's painted miniature. ${story.trim()} Stay in character. Preserve your identity and equipment. Talk warmly to your player in one or two short sentences and leave room for a reply. Invite them to invent your next adventure together. Do not claim dice were rolled or game actions were executed.`,
      greeting: `At last, a voice to go with the paint! I am ${name.trim() || "your new companion"}. Tell me, where does our adventure begin?`.slice(0, 200),
      callMode: "audio",
    });
  }, [name, heroClass, story, patchSetup]);

  useEffect(() => () => {
    if (source.file) URL.revokeObjectURL(source.url);
  }, [source]);

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    setCameraReady(false);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera capture is unavailable here. Upload a photo instead.");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        media.current = stream;
        if (video.current) video.current.srcObject = stream;
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Couldn't open the camera. Upload a photo instead.");
          setCameraOpen(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      media.current?.getTracks().forEach((track) => track.stop());
      media.current = null;
    };
  }, [cameraOpen]);

  function selectFile(file: File) {
    if (!file.type.startsWith("image/")) { setError("Choose an image file, such as a JPG, PNG, or WebP."); return; }
    if (file.size > 20 * 1024 * 1024) { setError("Choose an image smaller than 20 MB."); return; }
    setSource({ file, url: URL.createObjectURL(file) });
    setError(null);
    setShowConfig(false);
  }

  function capture() {
    const camera = video.current;
    if (!camera?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = camera.videoWidth;
    canvas.height = camera.videoHeight;
    canvas.getContext("2d")?.drawImage(camera, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) { setError("Couldn't capture that frame. Please try again."); return; }
      selectFile(new File([blob], "my-miniature.jpg", { type: "image/jpeg" }));
      setCameraOpen(false);
    }, "image/jpeg", 0.94);
  }

  async function awaken() {
    setError(null);
    if (!configured) { setShowConfig(true); return; }
    if (prepared) { await startCall(); return; }
    setLoading(true);
    try {
      let file = source.file;
      if (!file) {
        const response = await fetch(SAMPLE);
        if (!response.ok) throw new Error("The sample couldn't be loaded. Try uploading a photo.");
        const blob = await response.blob();
        file = new File([blob], "wizard.jpg", { type: blob.type });
      }
      setPreparedFor({ source: source.url, name: name.trim() });
      choosePhoto(file, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't prepare your hero.");
    } finally { setLoading(false); }
  }

  const progress = active ? 3 : prepared || working ? 2 : 1;

  return (
    <div className="dnd-studio">
      <header className="studio-header">
        <a className="studio-logo" href="/" aria-label="Do Not Disturb home"><Sigil /><span>do not<br /><strong>disturb.</strong></span></a>
        <span className="header-caption">THE TABLE IS SET. THE STORY IS YOURS.</span>
        <span className="studio-badge"><span /> CHARACTER STUDIO</span>
      </header>
      <main className="workshop">
        <div className="intro-row">
          <div>
            <p className="eyebrow">YOUR NEXT ADVENTURE STARTS HERE</p>
            <h1>Small figure.<br /><em>Big personality.</em></h1>
            <p className="intro-copy">You painted their armor. You imagined their story.<br />Now, meet the hero behind your miniature.</p>
          </div>
          <div className="step-list" aria-label="Creation progress">
            {["Bring a miniature", "Give them a story", "Bring them to life"].map((label, i) => (
              <div className={progress >= i + 1 ? "step current" : "step"} key={label}><span>{String(i + 1).padStart(2, "0")}</span>{label}</div>
            ))}
          </div>
        </div>
        <div className="workshop-grid">
          <section className="creation-panel" aria-label="Create your character">
            <fieldset disabled={locked}>
              <div className="section-heading"><span className="section-number">01</span><h2>The miniature</h2><span className="tiny-label">THE SPARK</span></div>
              <div className="source-card">
                <img src={source.url} alt="Selected miniature reference" />
                <div>
                  <strong>{source.file ? "Your miniature" : "Meet our sample wizard"}</strong>
                  <p>{source.file ? source.file.name : "No miniature handy? Start with this one."}</p>
                  {source.file ? <button className="text-button" onClick={() => { setSource({ url: SAMPLE, file: null }); setError(null); }}>Use sample instead ↗</button> : <a className="text-button" href="https://em4miniatures.com/en-us/products/elfsera-the-wise-wizard" target="_blank" rel="noreferrer">Miniature by em4 ↗</a>}
                </div>
              </div>
              <div className="source-actions">
                <button onClick={() => input.current?.click()}><span aria-hidden="true">↑</span> Upload a photo</button>
                <button onClick={() => { setError(null); setCameraOpen(true); }}><span aria-hidden="true">◎</span> Use camera</button>
              </div>
              <input ref={input} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) selectFile(file); }} />
              <p className="field-hint">One miniature. Face visible. A little light works wonders.</p>
              <div className="section-divider" />
              <div className="section-heading"><span className="section-number">02</span><h2>The character</h2><span className="tiny-label">THE SOUL</span></div>
              <label className="forge-label" htmlFor="hero-name">What do they call you?</label>
              <input id="hero-name" className="forge-input" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="Your hero's name" />
              <span className="forge-label">Choose your calling</span>
              <div className="class-grid" role="group" aria-label="Character class">
                {CLASSES.map((value) => <button key={value} aria-pressed={heroClass === value} className={heroClass === value ? "class-option selected" : "class-option"} onClick={() => setHeroClass(value)}>{value}</button>)}
              </div>
              <label className="forge-label" htmlFor="hero-story">Every hero has a story <span>Make it yours.</span></label>
              <textarea id="hero-story" className="forge-input" rows={4} maxLength={2000} value={story} onChange={(event) => setStory(event.target.value)} placeholder="Who are they? What do they seek? What are they hiding?" />
              {systemVoices(voices).length > 0 && <><label className="forge-label" htmlFor="hero-voice">Their voice</label><select id="hero-voice" className="forge-input" value={setup.voice} onChange={(event) => patchSetup({ voice: event.target.value })}><VoiceOptions voices={voices} /></select></>}
            </fieldset>
            {!active && <button className="awaken-button" onClick={() => void awaken()} disabled={working || !name.trim() || cameraOpen}>
              <Sigil small />
              {working ? (busy === "connecting" ? "Connecting to the realm…" : "Preparing your hero…") : prepared ? `Meet ${name.split(" ")[0] || "your hero"} — start live` : "Bring my miniature to life"}
              <span aria-hidden="true">↗</span>
            </button>}
            {!active && <p className="button-note">{prepared ? "Your hero is ready. Start live to hear their introduction." : "Prepare your character, then start a live conversation."}</p>}
            {showConfig && <div className="config-note" role="status"><strong>The studio is ready. Add your Reactor key to go live.</strong><p>Set <code>REACTOR_API_KEY</code> in the project’s <code>.env</code>, then restart the server.</p></div>}
            {error && <p className="forge-error" role="alert">{error}</p>}
            <div className="live-controls"><CallControls /></div>
          </section>

          <section className="reveal-panel" aria-label="Your hero preview">
            <div className="preview-topline"><span><i className={live ? "live-dot on" : "live-dot"} />{live ? "YOUR HERO, ALIVE" : "YOUR HERO, IN THE MAKING"}</span><span className="preview-index">FIG. 001</span></div>
            {photo && sourcePrepared && status !== "disconnected" ? <div className="live-stage"><Stage /></div> : (
              <div className="miniature-display">
                <div className="orbit orbit-one" /><div className="orbit orbit-two" />
                <span className="compass n">N</span><span className="compass e">E</span><span className="compass w">W</span>
                <img src={source.url} alt={`${name || "Your hero"}, miniature reference`} className="hero-miniature" />
                <span className="reference-tag">MINIATURE REFERENCE</span>
              </div>
            )}
            <div className="hero-caption">
              <span className="hero-class">{heroClass.toUpperCase()} · CHAPTER ONE</span><h2>{name || "An unnamed legend"}</h2>
              <p>{live ? "Your story has a voice. Say hello." : "Every great adventure begins with someone small."}</p>
              <div className="caption-flourish"><span />✧<span /></div>
            </div>
            <div className="connection-area"><StatusBadge /><CommandError /></div>
            <div className="live-controls"><Transcript /><SnapClip /></div>
            {!active && <div className="preview-footnote"><span>✦</span><p>Your miniature’s image and story become a live character.<br /><span>Start with a photo. See who answers.</span></p></div>}
          </section>
        </div>
        <footer className="workshop-footer"><span>MADE OF PAINT, PLASTIC & POSSIBILITY.</span><span>Powered by <a href="https://www.reactor.inc" target="_blank" rel="noreferrer">Reactor ↗</a></span></footer>
      </main>
      {cameraOpen && <CameraDialog videoRef={video} ready={cameraReady} onReady={() => setCameraReady(true)} capture={capture} close={() => setCameraOpen(false)} />}
    </div>
  );
}

function CameraDialog({ videoRef, ready, onReady, capture, close }: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  ready: boolean;
  onReady: () => void;
  capture: () => void;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} className="camera-dialog" onCancel={(event) => { event.preventDefault(); close(); }}>
      <div className="section-heading"><h2>Show us your miniature</h2><button className="camera-close" aria-label="Close camera" onClick={close}>×</button></div>
      <p>Keep one miniature in frame, with the face in focus.</p>
      <video ref={videoRef} autoPlay playsInline muted onLoadedData={onReady} />
      <button className="awaken-button" disabled={!ready} onClick={capture}>Capture miniature</button>
      <button className="text-button" onClick={close}>Cancel</button>
    </dialog>
  );
}
