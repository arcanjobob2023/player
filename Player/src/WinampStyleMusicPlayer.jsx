import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  FolderOpen,
  ListMusic,
  Upload,
  Palette,
} from "lucide-react";

const SUPPORTED_EXTENSIONS = [".mp3", ".wav", ".ogg", ".m4a", ".flac"];
const EQ_BANDS = [60, 170, 310, 600, 1000, 3000, 6000, 12000];

function isSupportedAudio(name = "") {
  const lower = name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function extractTitle(name = "") {
  return name.replace(/\.[^/.]+$/, "");
}

function clampDb(value) {
  return Math.max(-12, Math.min(12, Number(value)));
}

export default function WinampStyleMusicPlayer() {
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const filtersRef = useRef([]);
  const initializedAudioGraphRef = useRef(false);

  const [tracks, setTracks] = useState([]);
  const [sources, setSources] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const [directoryInputKey, setDirectoryInputKey] = useState(0);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [bgInputKey, setBgInputKey] = useState(0);

  const [showPlaylist, setShowPlaylist] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [eqValues, setEqValues] = useState(EQ_BANDS.map(() => 0));
  const [backgroundImage, setBackgroundImage] = useState(null);
  const [useImageBackground, setUseImageBackground] = useState(false);

  const [theme, setTheme] = useState({
    buttonTop: "#f5f5f5",
    buttonBottom: "#bfc4ca",
    buttonBorder: "#4b5563",
    accent: "#60a5fa",
    displayText: "#b7ff7a",
    eqTop: "#60a5fa",
    eqBottom: "#2563eb",
    panelTop: "#2d5594",
    panelBottom: "#16396e",
    eqPanelTop: "#9da8b6",
    eqPanelBottom: "#737f90",
  });

  const currentTrack = tracks[currentIndex] ?? null;

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (initializedAudioGraphRef.current) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    try {
      const context = new AudioContextClass();
      const source = context.createMediaElementSource(audio);

      const filters = EQ_BANDS.map((freq, index) => {
        const filter = context.createBiquadFilter();
        filter.type =
          index === 0
            ? "lowshelf"
            : index === EQ_BANDS.length - 1
              ? "highshelf"
              : "peaking";
        filter.frequency.value = freq;
        filter.Q.value = 1;
        filter.gain.value = 0;
        return filter;
      });

      source.connect(filters[0]);
      for (let i = 0; i < filters.length - 1; i += 1) {
        filters[i].connect(filters[i + 1]);
      }
      filters[filters.length - 1].connect(context.destination);

      audioContextRef.current = context;
      mediaSourceRef.current = source;
      filtersRef.current = filters;
      initializedAudioGraphRef.current = true;
    } catch (error) {
      console.error("Erro ao inicializar equalizador:", error);
    }

    return () => {
      try {
        mediaSourceRef.current?.disconnect();
        filtersRef.current.forEach((filter) => filter.disconnect());
        audioContextRef.current?.close();
      } catch {
        // noop
      }
    };
  }, []);

  useEffect(() => {
    filtersRef.current.forEach((filter, index) => {
      filter.gain.value = clampDb(eqValues[index]);
    });
  }, [eqValues]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => setDuration(audio.duration || 0);
    const onTimeUpdate = () => setProgress(audio.currentTime || 0);
    const onEnded = () => {
      if (!tracks.length) return;
      setCurrentIndex((prev) => (prev + 1) % tracks.length);
      setProgress(0);
      setIsPlaying(true);
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, [tracks.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    audio.src = currentTrack.url;
    audio.load();
    setProgress(0);
  }, [currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    const tryPlay = async () => {
      if (!isPlaying) {
        audio.pause();
        return;
      }

      try {
        if (audioContextRef.current?.state === "suspended") {
          await audioContextRef.current.resume();
        }
        await audio.play();
      } catch (error) {
        console.error("Erro ao tocar faixa:", error);
        setIsPlaying(false);
      }
    };

    const onCanPlay = () => {
      tryPlay();
    };

    if (audio.readyState >= 3) {
      tryPlay();
    } else {
      audio.addEventListener("canplay", onCanPlay, { once: true });
    }

    return () => {
      audio.removeEventListener("canplay", onCanPlay);
    };
  }, [currentTrack, isPlaying]);

  useEffect(() => {
    return () => {
      tracks.forEach((track) => URL.revokeObjectURL(track.url));
    };
  }, [tracks]);

  useEffect(() => {
    return () => {
      if (backgroundImage) {
        URL.revokeObjectURL(backgroundImage);
      }
    };
  }, [backgroundImage]);

  const statusText = useMemo(() => {
    if (!tracks.length) return "STOP";
    return isPlaying ? "PLAY" : "PAUSE";
  }, [tracks.length, isPlaying]);

  function deduplicateTracks(nextFiles) {
    const existing = new Set(tracks.map((track) => `${track.name}-${track.size}`));
    const prepared = [];

    for (const file of nextFiles) {
      const key = `${file.name}-${file.size}`;
      if (!existing.has(key) && isSupportedAudio(file.name)) {
        existing.add(key);
        prepared.push({
          id: crypto.randomUUID(),
          name: file.name,
          title: extractTitle(file.name),
          size: file.size,
          url: URL.createObjectURL(file),
          source: file.webkitRelativePath
            ? file.webkitRelativePath.split("/")[0]
            : "Arquivos selecionados",
        });
      }
    }

    return prepared;
  }

  function addFiles(fileList, sourceLabel) {
    const incoming = Array.from(fileList || []).filter((file) =>
      isSupportedAudio(file.name),
    );

    const prepared = deduplicateTracks(incoming).map((track) => ({
      ...track,
      source: sourceLabel || track.source,
    }));

    if (!prepared.length) return;

    setTracks((prev) => [...prev, ...prepared]);

    if (sourceLabel) {
      setSources((prev) => (prev.includes(sourceLabel) ? prev : [...prev, sourceLabel]));
    }
  }

  function handleAddFiles(event) {
    addFiles(event.target.files, "Arquivos selecionados");
    setFileInputKey((prev) => prev + 1);
  }

  function handleAddDirectory(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const folderName =
      files[0].webkitRelativePath?.split("/")[0] || `Pasta ${sources.length + 1}`;

    addFiles(files, folderName);
    setDirectoryInputKey((prev) => prev + 1);
  }

  async function togglePlay() {
    if (!tracks.length) return;

    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume();
      }

      if (!currentTrack) {
        setCurrentIndex(0);
        setIsPlaying(true);
        return;
      }

      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        setIsPlaying(true);
      }
    } catch (error) {
      console.error("Erro ao dar play:", error);
      setIsPlaying(false);
    }
  }

  function handlePrev() {
    if (!tracks.length) return;
    setCurrentIndex((prev) => (prev - 1 + tracks.length) % tracks.length);
    setProgress(0);
    setIsPlaying(true);
  }

  function handleNext() {
    if (!tracks.length) return;
    setCurrentIndex((prev) => (prev + 1) % tracks.length);
    setProgress(0);
    setIsPlaying(true);
  }

  function handleSeek(event) {
    const value = Number(event.target.value);
    setProgress(value);
    if (audioRef.current) {
      audioRef.current.currentTime = value;
    }
  }

  async function handleSelectTrack(index) {
    setCurrentIndex(index);
    setProgress(0);
    setIsPlaying(true);

    try {
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume();
      }
    } catch (error) {
      console.error("Erro ao preparar áudio:", error);
    }
  }

  function removeTrack(trackId) {
    setTracks((prev) => {
      const indexToRemove = prev.findIndex((track) => track.id === trackId);
      const target = prev[indexToRemove];

      if (target?.url) URL.revokeObjectURL(target.url);

      const next = prev.filter((track) => track.id !== trackId);

      if (!next.length) {
        setCurrentIndex(0);
        setIsPlaying(false);
        setProgress(0);
        setDuration(0);
      } else if (indexToRemove < currentIndex || currentIndex >= next.length) {
        setCurrentIndex((curr) => Math.max(0, curr - 1));
      }

      return next;
    });
  }

  function clearAll() {
    tracks.forEach((track) => URL.revokeObjectURL(track.url));
    setTracks([]);
    setSources([]);
    setCurrentIndex(0);
    setIsPlaying(false);
    setProgress(0);
    setDuration(0);
  }

  function resetEq() {
    setEqValues(EQ_BANDS.map(() => 0));
  }

  function handleBackgroundImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (backgroundImage) {
      URL.revokeObjectURL(backgroundImage);
    }

    const imageUrl = URL.createObjectURL(file);
    setBackgroundImage(imageUrl);
    setUseImageBackground(true);
    setBgInputKey((prev) => prev + 1);
  }

  function removeBackgroundImage() {
    if (backgroundImage) {
      URL.revokeObjectURL(backgroundImage);
    }
    setBackgroundImage(null);
    setUseImageBackground(false);
    setBgInputKey((prev) => prev + 1);
  }

  const buttonStyle = {
    width: "28px",
    height: "24px",
    borderRadius: "4px",
    border: `1px solid ${theme.buttonBorder}`,
    background: `linear-gradient(180deg, ${theme.buttonTop} 0%, ${theme.buttonBottom} 100%)`,
    color: "#111827",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
    cursor: "pointer",
  };

  const upperPanelBackground =
    useImageBackground && backgroundImage
      ? `linear-gradient(rgba(15, 23, 42, 0.28), rgba(15, 23, 42, 0.28)), url(${backgroundImage}) center/cover no-repeat`
      : `linear-gradient(180deg, ${theme.panelTop} 0%, ${theme.panelBottom} 100%)`;

  const eqPanelBackground =
    useImageBackground && backgroundImage
      ? `linear-gradient(rgba(148, 163, 184, 0.42), rgba(100, 116, 139, 0.42)), url(${backgroundImage}) center/cover no-repeat`
      : `linear-gradient(180deg, ${theme.eqPanelTop} 0%, ${theme.eqPanelBottom} 100%)`;

  return (
    <div style={{ minHeight: "100vh", background: "#020617", padding: "24px", color: "#fff" }}>
      <audio ref={audioRef} preload="metadata" />

      <div
        style={{
          width: "430px",
          margin: "0 auto",
          padding: "10px",
          borderRadius: "8px",
          background: "linear-gradient(180deg, #cad1db 0%, #8d9aad 38%, #6f7a8d 100%)",
          border: "1px solid #4a5568",
          boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{
            border: "1px solid #4f5f73",
            background: upperPanelBackground,
            padding: "8px",
            borderRadius: "4px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              color: "#dbeafe",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "1px",
            }}
          >
            <span>HACK PLAYER</span>
          </div>

          <div
            style={{
              marginTop: "8px",
              border: "1px solid #0f172a",
              background: "linear-gradient(180deg, #020617 0%, #000814 100%)",
              borderRadius: "2px",
              padding: "10px",
              fontFamily: "monospace",
              color: theme.displayText,
              minHeight: "82px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
              <span>{statusText}</span>
              <span>{tracks.length ? String(currentIndex + 1).padStart(2, "0") : "00"}</span>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "6px",
                fontSize: "30px",
                letterSpacing: "2px",
              }}
            >
              <span>{formatTime(progress)}</span>
              <span>{formatTime(duration)}</span>
            </div>

            <div
              style={{
                marginTop: "6px",
                fontSize: "11px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {currentTrack ? currentTrack.title : "Nenhum arquivo carregado"}
            </div>

            <div
              style={{
                marginTop: "2px",
                fontSize: "10px",
                color: "#7dd3fc",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {currentTrack ? currentTrack.source : "Selecione arquivos ou pastas"}
            </div>
          </div>

          {showPlaylist && (
            <div
              style={{
                marginTop: "8px",
                border: "1px solid #38485d",
                background: "linear-gradient(180deg, #15253d 0%, #0f1a2e 100%)",
                borderRadius: "3px",
                padding: "6px",
                maxHeight: "180px",
                overflow: "auto",
              }}
            >
              <div
                style={{
                  color: "#e2e8f0",
                  fontSize: "10px",
                  marginBottom: "6px",
                  fontWeight: 700,
                }}
              >
                PLAYLIST
              </div>

              {tracks.length ? (
                tracks.map((track, index) => {
                  const active = index === currentIndex;

                  return (
                    <div
                      key={track.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "28px 1fr 52px",
                        gap: "6px",
                        padding: "4px 6px",
                        marginBottom: "4px",
                        borderRadius: "2px",
                        background: active ? "rgba(34,197,94,0.15)" : "rgba(2,6,23,0.45)",
                        border: active ? "1px solid #22c55e" : "1px solid #243244",
                        color: active ? "#bbf7d0" : "#dbeafe",
                        fontSize: "11px",
                        alignItems: "center",
                      }}
                    >
                      <button
                        onClick={() => handleSelectTrack(index)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "inherit",
                          cursor: "pointer",
                        }}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </button>

                      <button
                        onClick={() => handleSelectTrack(index)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "inherit",
                          cursor: "pointer",
                          textAlign: "left",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {track.title}
                      </button>

                      <button
                        onClick={() => removeTrack(track.id)}
                        style={{
                          border: "1px solid #64748b",
                          background: "linear-gradient(180deg, #e5e7eb 0%, #b6bdc7 100%)",
                          color: "#111827",
                          borderRadius: "2px",
                          fontSize: "10px",
                          cursor: "pointer",
                          padding: "2px 4px",
                        }}
                      >
                        Del
                      </button>
                    </div>
                  );
                })
              ) : (
                <div style={{ color: "#94a3b8", fontSize: "11px", padding: "10px 4px" }}>
                  Nenhuma música na playlist.
                </div>
              )}
            </div>
          )}

          <div
            style={{
              marginTop: "8px",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: "8px",
              alignItems: "start",
            }}
          >
            <div>
              <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
                <button onClick={handlePrev} style={buttonStyle}>
                  <SkipBack size={14} />
                </button>

                <button
                  onClick={togglePlay}
                  style={{ ...buttonStyle, width: "34px", height: "26px" }}
                >
                  {isPlaying ? <Pause size={15} /> : <Play size={15} style={{ marginLeft: "1px" }} />}
                </button>

                <button onClick={handleNext} style={buttonStyle}>
                  <SkipForward size={14} />
                </button>

                <label style={buttonStyle} title="Adicionar arquivos">
                  <Upload size={14} />
                  <input
                    key={fileInputKey}
                    type="file"
                    accept={SUPPORTED_EXTENSIONS.join(",")}
                    multiple
                    onChange={handleAddFiles}
                    hidden
                  />
                </label>

                <label style={buttonStyle} title="Adicionar pasta">
                  <FolderOpen size={14} />
                  <input
                    key={directoryInputKey}
                    type="file"
                    multiple
                    onChange={handleAddDirectory}
                    hidden
                    {...{ webkitdirectory: "true", directory: "" }}
                  />
                </label>

                <button
                  onClick={() => setShowPlaylist((prev) => !prev)}
                  style={{ ...buttonStyle, width: "40px" }}
                  title="Mostrar playlist"
                >
                  <ListMusic size={14} />
                </button>

                <button
                  onClick={() => setShowTheme((prev) => !prev)}
                  style={{ ...buttonStyle, width: "40px" }}
                  title="Mostrar tema"
                >
                  <Palette size={14} />
                </button>
              </div>

              <div style={{ marginTop: "8px" }}>
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  value={Math.min(progress, duration || 0)}
                  onChange={handleSeek}
                  style={{ width: "100%", accentColor: theme.accent }}
                />
              </div>
            </div>

            <div
              style={{
                border: "1px solid #4c5c70",
                background: "linear-gradient(180deg, #9ea8b5 0%, #7f8b9b 100%)",
                padding: "6px",
                borderRadius: "3px",
                minWidth: "54px",
              }}
            >
              <div
                style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  color: "#0f172a",
                  marginBottom: "4px",
                }}
              >
                VOL
              </div>

              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                style={{
                  width: "52px",
                  transform: "rotate(-90deg)",
                  marginTop: "24px",
                  marginBottom: "24px",
                  accentColor: theme.accent,
                }}
              />
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: "8px",
            border: "1px solid #59677a",
            borderRadius: "4px",
            background: eqPanelBackground,
            padding: "8px 10px 10px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "6px",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                fontWeight: 700,
                color: "#0f172a",
                letterSpacing: "1px",
              }}
            >
              GRAPHIC EQUALIZER
            </div>

            <button
              onClick={resetEq}
              style={{
                border: "1px solid #5b6572",
                background: "linear-gradient(180deg, #eceff3 0%, #c3c8cf 100%)",
                borderRadius: "3px",
                fontSize: "10px",
                padding: "2px 6px",
                cursor: "pointer",
                color: "#111827",
              }}
            >
              Reset
            </button>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: "6px", alignItems: "end" }}>
            {EQ_BANDS.map((band, index) => (
              <div
                key={band}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                  width: "100%",
                }}
              >
                <div style={{ fontSize: "9px", color: "#0f172a", fontWeight: 700 }}>
                  {eqValues[index] > 0 ? `+${eqValues[index]}` : eqValues[index]}
                </div>

                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={eqValues[index]}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setEqValues((prev) =>
                      prev.map((item, idx) => (idx === index ? value : item)),
                    );
                  }}
                  style={{
                    writingMode: "vertical-lr",
                    direction: "rtl",
                    height: "90px",
                    width: "18px",
                    accentColor: theme.eqBottom,
                  }}
                />

                <div style={{ fontSize: "9px", color: "#0f172a", fontWeight: 700 }}>
                  {band >= 1000 ? `${band / 1000}k` : band}
                </div>
              </div>
            ))}
          </div>
        </div>

        {showTheme && (
          <div
            style={{
              marginTop: "8px",
              border: "1px solid #59677a",
              borderRadius: "4px",
              background: "linear-gradient(180deg, #9da8b6 0%, #737f90 100%)",
              padding: "8px 10px 10px",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                fontWeight: 700,
                color: "#0f172a",
                letterSpacing: "1px",
                marginBottom: "8px",
              }}
            >
              THEME
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
              <label style={{ fontSize: "10px", color: "#0f172a", fontWeight: 700, gridColumn: "1 / -1" }}>
                Imagem de fundo
                <input
                  key={bgInputKey}
                  type="file"
                  accept="image/*"
                  onChange={handleBackgroundImage}
                  style={{ width: "100%", marginTop: "4px" }}
                />
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "10px",
                  color: "#0f172a",
                  fontWeight: 700,
                  gridColumn: "1 / -1",
                }}
              >
                <input
                  type="checkbox"
                  checked={useImageBackground}
                  onChange={(e) => setUseImageBackground(e.target.checked && !!backgroundImage)}
                  disabled={!backgroundImage}
                />
                Usar imagem nos painéis
              </label>

              <label style={{ fontSize: "10px", color: "#0f172a", fontWeight: 700 }}>
                Botão topo
                <input
                  type="color"
                  value={theme.buttonTop}
                  onChange={(e) => setTheme((prev) => ({ ...prev, buttonTop: e.target.value }))}
                  style={{ width: "100%", height: "24px", marginTop: "4px" }}
                />
              </label>

              <label style={{ fontSize: "10px", color: "#0f172a", fontWeight: 700 }}>
                Botão base
                <input
                  type="color"
                  value={theme.buttonBottom}
                  onChange={(e) =>
                    setTheme((prev) => ({ ...prev, buttonBottom: e.target.value }))
                  }
                  style={{ width: "100%", height: "24px", marginTop: "4px" }}
                />
              </label>

              <label style={{ fontSize: "10px", color: "#0f172a", fontWeight: 700 }}>
                Borda botão
                <input
                  type="color"
                  value={theme.buttonBorder}
                  onChange={(e) =>
                    setTheme((prev) => ({ ...prev, buttonBorder: e.target.value }))
                  }
                  style={{ width: "100%", height: "24px", marginTop: "4px" }}
                />
              </label>

              <label style={{ fontSize: "10px", color: "#0f172a", fontWeight: 700 }}>
                Progresso / volume
                <input
                  type="color"
                  value={theme.accent}
                  onChange={(e) => setTheme((prev) => ({ ...prev, accent: e.target.value }))}
                  style={{ width: "100%", height: "24px", marginTop: "4px" }}
                />
              </label>

              <label style={{ fontSize: "10px", color: "#0f172a", fontWeight: 700 }}>
                Fundo painel topo
                <input
                  type="color"
                  value={theme.panelTop}
                  onChange={(e) => setTheme((prev) => ({ ...prev, panelTop: e.target.value }))}
                  style={{ width: "100%", height: "24px", marginTop: "4px" }}
                />
              </label>

              <label style={{ fontSize: "10px", color: "#0f172a", fontWeight: 700 }}>
                Fundo painel base
                <input
                  type="color"
                  value={theme.panelBottom}
                  onChange={(e) =>
                    setTheme((prev) => ({ ...prev, panelBottom: e.target.value }))
                  }
                  style={{ width: "100%", height: "24px", marginTop: "4px" }}
                />
              </label>

              <label style={{ fontSize: "10px", color: "#0f172a", fontWeight: 700 }}>
                Texto do visor
                <input
                  type="color"
                  value={theme.displayText}
                  onChange={(e) =>
                    setTheme((prev) => ({ ...prev, displayText: e.target.value }))
                  }
                  style={{ width: "100%", height: "24px", marginTop: "4px" }}
                />
              </label>

              <label style={{ fontSize: "10px", color: "#0f172a", fontWeight: 700 }}>
                Equalizador topo
                <input
                  type="color"
                  value={theme.eqTop}
                  onChange={(e) => setTheme((prev) => ({ ...prev, eqTop: e.target.value }))}
                  style={{ width: "100%", height: "24px", marginTop: "4px" }}
                />
              </label>

              <label style={{ fontSize: "10px", color: "#0f172a", fontWeight: 700 }}>
                Equalizador base
                <input
                  type="color"
                  value={theme.eqBottom}
                  onChange={(e) => setTheme((prev) => ({ ...prev, eqBottom: e.target.value }))}
                  style={{ width: "100%", height: "24px", marginTop: "4px" }}
                />
              </label>

              <label style={{ fontSize: "10px", color: "#0f172a", fontWeight: 700 }}>
                Fundo EQ topo
                <input
                  type="color"
                  value={theme.eqPanelTop}
                  onChange={(e) =>
                    setTheme((prev) => ({ ...prev, eqPanelTop: e.target.value }))
                  }
                  style={{ width: "100%", height: "24px", marginTop: "4px" }}
                />
              </label>

              <label style={{ fontSize: "10px", color: "#0f172a", fontWeight: 700 }}>
                Fundo EQ base
                <input
                  type="color"
                  value={theme.eqPanelBottom}
                  onChange={(e) =>
                    setTheme((prev) => ({ ...prev, eqPanelBottom: e.target.value }))
                  }
                  style={{ width: "100%", height: "24px", marginTop: "4px" }}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <button
                onClick={() => setUseImageBackground((prev) => (!prev ? !!backgroundImage : false))}
                disabled={!backgroundImage}
                style={{
                  border: "1px solid #5b6572",
                  background: "linear-gradient(180deg, #eceff3 0%, #c3c8cf 100%)",
                  borderRadius: "3px",
                  fontSize: "10px",
                  padding: "4px 8px",
                  cursor: backgroundImage ? "pointer" : "not-allowed",
                  color: "#111827",
                  opacity: backgroundImage ? 1 : 0.6,
                }}
              >
                {useImageBackground ? "Usando imagem" : "Usar imagem"}
              </button>

              <button
                onClick={removeBackgroundImage}
                disabled={!backgroundImage}
                style={{
                  border: "1px solid #5b6572",
                  background: "linear-gradient(180deg, #eceff3 0%, #c3c8cf 100%)",
                  borderRadius: "3px",
                  fontSize: "10px",
                  padding: "4px 8px",
                  cursor: backgroundImage ? "pointer" : "not-allowed",
                  color: "#111827",
                  opacity: backgroundImage ? 1 : 0.6,
                }}
              >
                Remover imagem
              </button>

              <button
                onClick={clearAll}
                style={{
                  border: "1px solid #5b6572",
                  background: "linear-gradient(180deg, #eceff3 0%, #c3c8cf 100%)",
                  borderRadius: "3px",
                  fontSize: "10px",
                  padding: "4px 8px",
                  cursor: "pointer",
                  color: "#111827",
                }}
              >
                Limpar músicas
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: "8px", fontSize: "10px", color: "#dbeafe", opacity: 0.9 }}>
          Fontes: {sources.length ? sources.join(", ") : "nenhuma"} • Formatos: MP3, WAV,
          OGG, M4A e FLAC.
        </div>
      </div>
    </div>
  );
}