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
  const filtersRef = useRef([]);
  const initializedAudioGraphRef = useRef(false);
  const tracksRef = useRef([]);
  const backgroundImageRef = useRef(null);

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
    buttonBorder: "#dc2626",
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
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    backgroundImageRef.current = backgroundImage;
  }, [backgroundImage]);

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
      filtersRef.current = filters;
      initializedAudioGraphRef.current = true;
    } catch (error) {
      console.error("Erro ao inicializar equalizador:", error);
    }

    return () => {
      try {
        filtersRef.current.forEach((filter) => filter.disconnect());
        audioContextRef.current?.close();
      } catch {
        // noop
      }
    };
  }, []);

  useEffect(() => {
    filtersRef.current.forEach((filter, index) => {
      if (filter) {
        filter.gain.value = clampDb(eqValues[index]);
      }
    });
  }, [eqValues]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };

    const onTimeUpdate = () => {
      setProgress(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
    };

    const onEnded = () => {
      if (!tracksRef.current.length) return;

      setCurrentIndex((prev) => (prev + 1) % tracksRef.current.length);
      setProgress(0);
      setIsPlaying(true);
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentTrack) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      setProgress(0);
      setDuration(0);
      return;
    }

    audio.src = currentTrack.url;
    audio.load();
    setProgress(0);
    setDuration(0);

    if (isPlaying) {
      const playCurrentTrack = async () => {
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

      playCurrentTrack();
    }
  }, [currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    const syncPlaybackState = async () => {
      try {
        if (isPlaying) {
          if (audioContextRef.current?.state === "suspended") {
            await audioContextRef.current.resume();
          }
          await audio.play();
        } else {
          audio.pause();
        }
      } catch (error) {
        console.error("Erro ao sincronizar reprodução:", error);
        setIsPlaying(false);
      }
    };

    syncPlaybackState();
  }, [isPlaying, currentTrack]);

  useEffect(() => {
    return () => {
      tracksRef.current.forEach((track) => {
        if (track?.url) {
          URL.revokeObjectURL(track.url);
        }
      });

      if (backgroundImageRef.current) {
        URL.revokeObjectURL(backgroundImageRef.current);
      }
    };
  }, []);

  const statusText = useMemo(() => {
    if (!tracks.length) return "STOP";
    return isPlaying ? "PLAY" : "PAUSE";
  }, [tracks.length, isPlaying]);

  function deduplicateTracks(nextFiles, existingTracks) {
    const existing = new Set(existingTracks.map((track) => `${track.name}-${track.size}`));
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

    if (!incoming.length) return;

    setTracks((prev) => {
      const prepared = deduplicateTracks(incoming, prev).map((track) => ({
        ...track,
        source: sourceLabel || track.source,
      }));

      if (!prepared.length) return prev;

      if (prev.length === 0) {
        setCurrentIndex(0);
      }

      return [...prev, ...prepared];
    });

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

      if (!currentTrack && tracks.length > 0) {
        setCurrentIndex(0);
        setIsPlaying(true);
        return;
      }

      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        if (!audio.src && currentTrack?.url) {
          audio.src = currentTrack.url;
          audio.load();
        }

        await audio.play();
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

  function handleSelectTrack(index) {
    setCurrentIndex(index);
    setProgress(0);
    setIsPlaying(true);
  }

  function removeTrack(trackId) {
    setTracks((prev) => {
      const indexToRemove = prev.findIndex((track) => track.id === trackId);
      if (indexToRemove === -1) return prev;

      const trackToRemove = prev[indexToRemove];
      if (trackToRemove?.url) {
        URL.revokeObjectURL(trackToRemove.url);
      }

      const next = prev.filter((track) => track.id !== trackId);

      if (!next.length) {
        const audio = audioRef.current;
        if (audio) {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        }

        setCurrentIndex(0);
        setIsPlaying(false);
        setProgress(0);
        setDuration(0);
        return [];
      }

      if (indexToRemove === currentIndex) {
        const nextIndex = indexToRemove >= next.length ? next.length - 1 : indexToRemove;
        setCurrentIndex(nextIndex);
        setProgress(0);
        setIsPlaying(true);
      } else if (indexToRemove < currentIndex) {
        setCurrentIndex((curr) => Math.max(0, curr - 1));
      }

      return next;
    });
  }

  function clearAll() {
    tracksRef.current.forEach((track) => {
      if (track?.url) {
        URL.revokeObjectURL(track.url);
      }
    });

    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }

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

    if (backgroundImageRef.current) {
      URL.revokeObjectURL(backgroundImageRef.current);
    }

    const imageUrl = URL.createObjectURL(file);
    setBackgroundImage(imageUrl);
    setUseImageBackground(true);
    setBgInputKey((prev) => prev + 1);
  }

  function removeBackgroundImage() {
    if (backgroundImageRef.current) {
      URL.revokeObjectURL(backgroundImageRef.current);
    }

    setBackgroundImage(null);
    setUseImageBackground(false);
    setBgInputKey((prev) => prev + 1);
  }

  const isMobile = typeof window !== "undefined" ? window.innerWidth <= 768 : false;

  const buttonStyle = {
    width: isMobile ? "52px" : "34px",
    height: isMobile ? "46px" : "28px",
    borderRadius: "10px",
    border: `2px solid ${theme.buttonBorder}`,
    background: `linear-gradient(180deg, ${theme.buttonTop} 0%, ${theme.buttonBottom} 100%)`,
    color: "#111827",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85)",
    cursor: "pointer",
    padding: 0,
    flexShrink: 0,
  };

  const upperPanelBackground =
    useImageBackground && backgroundImage
      ? `linear-gradient(rgba(15, 23, 42, 0.32), rgba(15, 23, 42, 0.32)), url(${backgroundImage}) center/cover no-repeat`
      : `linear-gradient(180deg, ${theme.panelTop} 0%, ${theme.panelBottom} 100%)`;

  const eqPanelBackground =
    useImageBackground && backgroundImage
      ? `linear-gradient(rgba(148, 163, 184, 0.48), rgba(100, 116, 139, 0.48)), url(${backgroundImage}) center/cover no-repeat`
      : `linear-gradient(180deg, ${theme.eqPanelTop} 0%, ${theme.eqPanelBottom} 100%)`;

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: "#020617",
        padding: 0,
        margin: 0,
        color: "#fff",
      }}
    >
      <audio ref={audioRef} preload="metadata" />

      <div
        style={{
          width: "100%",
          maxWidth: "100%",
          minHeight: "100vh",
          margin: 0,
          padding: isMobile ? "8px" : "16px",
          borderRadius: 0,
          background: "linear-gradient(180deg, #cad1db 0%, #8d9aad 38%, #6f7a8d 100%)",
          border: "none",
          boxShadow: "none",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            border: "1px solid #4f5f73",
            background: upperPanelBackground,
            padding: isMobile ? "8px" : "10px",
            borderRadius: "8px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              color: "#dbeafe",
              fontSize: isMobile ? "11px" : "12px",
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
              borderRadius: "4px",
              padding: isMobile ? "10px" : "12px",
              fontFamily: "monospace",
              color: theme.displayText,
              minHeight: isMobile ? "110px" : "90px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: isMobile ? "12px" : "11px",
              }}
            >
              <span>{statusText}</span>
              <span>{tracks.length ? String(currentIndex + 1).padStart(2, "0") : "00"}</span>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "8px",
                fontSize: isMobile ? "clamp(34px, 10vw, 56px)" : "30px",
                letterSpacing: "2px",
                gap: "10px",
              }}
            >
              <span>{formatTime(progress)}</span>
              <span>{formatTime(duration)}</span>
            </div>

            <div
              style={{
                marginTop: "8px",
                fontSize: isMobile ? "11px" : "11px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {currentTrack ? currentTrack.title : "Nenhum arquivo carregado"}
            </div>

            <div
              style={{
                marginTop: "4px",
                fontSize: isMobile ? "10px" : "10px",
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
                borderRadius: "6px",
                padding: "6px",
                maxHeight: "220px",
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
                        gridTemplateColumns: "40px 1fr 54px",
                        gap: "6px",
                        padding: "6px",
                        marginBottom: "4px",
                        borderRadius: "4px",
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
                          minHeight: "32px",
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
                          minHeight: "32px",
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
                          borderRadius: "4px",
                          fontSize: "10px",
                          cursor: "pointer",
                          padding: "6px 4px",
                          minHeight: "32px",
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
              marginTop: "10px",
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr auto",
              gap: "12px",
              alignItems: "start",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                  flexWrap: "wrap",
                  justifyContent: isMobile ? "center" : "flex-start",
                }}
              >
                <button onClick={handlePrev} style={buttonStyle}>
                  <SkipBack size={isMobile ? 22 : 16} />
                </button>

                <button
                  onClick={togglePlay}
                  style={{
                    ...buttonStyle,
                    width: isMobile ? "58px" : "42px",
                    height: isMobile ? "50px" : "32px",
                  }}
                >
                  {isPlaying ? (
                    <Pause size={isMobile ? 24 : 16} />
                  ) : (
                    <Play size={isMobile ? 24 : 16} style={{ marginLeft: "2px" }} />
                  )}
                </button>

                <button onClick={handleNext} style={buttonStyle}>
                  <SkipForward size={isMobile ? 22 : 16} />
                </button>

                <label style={buttonStyle} title="Adicionar arquivos">
                  <Upload size={isMobile ? 22 : 16} />
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
                  <FolderOpen size={isMobile ? 22 : 16} />
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
                  style={{ ...buttonStyle, width: isMobile ? "58px" : "46px" }}
                  title="Mostrar playlist"
                >
                  <ListMusic size={isMobile ? 22 : 16} />
                </button>

                <button
                  onClick={() => setShowTheme((prev) => !prev)}
                  style={{ ...buttonStyle, width: isMobile ? "58px" : "46px" }}
                  title="Mostrar tema"
                >
                  <Palette size={isMobile ? 22 : 16} />
                </button>
              </div>

              <div style={{ marginTop: "12px" }}>
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.01}
                  value={Math.min(progress, duration || 0)}
                  onChange={handleSeek}
                  style={{
                    width: "100%",
                    accentColor: theme.accent,
                    height: isMobile ? "34px" : "20px",
                  }}
                />
              </div>
            </div>

            <div
              style={{
                border: "1px solid #4c5c70",
                background: "linear-gradient(180deg, #9ea8b5 0%, #7f8b9b 100%)",
                padding: "8px",
                borderRadius: "6px",
                width: isMobile ? "100%" : "74px",
                display: "flex",
                flexDirection: isMobile ? "column" : "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "#0f172a",
                  marginBottom: isMobile ? "8px" : "4px",
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
                style={
                  isMobile
                    ? {
                        width: "100%",
                        accentColor: theme.accent,
                        height: "32px",
                      }
                    : {
                        width: "52px",
                        transform: "rotate(-90deg)",
                        marginTop: "24px",
                        marginBottom: "24px",
                        accentColor: theme.accent,
                      }
                }
              />
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: "10px",
            border: "1px solid #59677a",
            borderRadius: "8px",
            background: eqPanelBackground,
            padding: isMobile ? "10px 8px 12px" : "8px 10px 10px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
              gap: "8px",
            }}
          >
            <div
              style={{
                fontSize: isMobile ? "11px" : "10px",
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
                borderRadius: "4px",
                fontSize: "10px",
                padding: "5px 8px",
                cursor: "pointer",
                color: "#111827",
              }}
            >
              Reset
            </button>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: isMobile ? "4px" : "6px",
              alignItems: "end",
              overflowX: "auto",
              paddingBottom: "4px",
            }}
          >
            {EQ_BANDS.map((band, index) => (
              <div
                key={band}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                  minWidth: isMobile ? "38px" : "32px",
                  flex: 1,
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
                    height: isMobile ? "120px" : "95px",
                    width: isMobile ? "24px" : "18px",
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
              marginTop: "10px",
              border: "1px solid #59677a",
              borderRadius: "8px",
              background: "linear-gradient(180deg, #9da8b6 0%, #737f90 100%)",
              padding: "10px",
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

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
                gap: "8px",
              }}
            >
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
                  style={{ width: "100%", height: "30px", marginTop: "4px" }}
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
                  style={{ width: "100%", height: "30px", marginTop: "4px" }}
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
                  style={{ width: "100%", height: "30px", marginTop: "4px" }}
                />
              </label>

              <label style={{ fontSize: "10px", color: "#0f172a", fontWeight: 700 }}>
                Progresso / volume
                <input
                  type="color"
                  value={theme.accent}
                  onChange={(e) => setTheme((prev) => ({ ...prev, accent: e.target.value }))}
                  style={{ width: "100%", height: "30px", marginTop: "4px" }}
                />
              </label>

              <label style={{ fontSize: "10px", color: "#0f172a", fontWeight: 700 }}>
                Fundo painel topo
                <input
                  type="color"
                  value={theme.panelTop}
                  onChange={(e) => setTheme((prev) => ({ ...prev, panelTop: e.target.value }))}
                  style={{ width: "100%", height: "30px", marginTop: "4px" }}
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
                  style={{ width: "100%", height: "30px", marginTop: "4px" }}
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
                  style={{ width: "100%", height: "30px", marginTop: "4px" }}
                />
              </label>

              <label style={{ fontSize: "10px", color: "#0f172a", fontWeight: 700 }}>
                Equalizador topo
                <input
                  type="color"
                  value={theme.eqTop}
                  onChange={(e) => setTheme((prev) => ({ ...prev, eqTop: e.target.value }))}
                  style={{ width: "100%", height: "30px", marginTop: "4px" }}
                />
              </label>

              <label style={{ fontSize: "10px", color: "#0f172a", fontWeight: 700 }}>
                Equalizador base
                <input
                  type="color"
                  value={theme.eqBottom}
                  onChange={(e) => setTheme((prev) => ({ ...prev, eqBottom: e.target.value }))}
                  style={{ width: "100%", height: "30px", marginTop: "4px" }}
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
                  style={{ width: "100%", height: "30px", marginTop: "4px" }}
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
                  style={{ width: "100%", height: "30px", marginTop: "4px" }}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
              <button
                onClick={() => setUseImageBackground((prev) => (!prev ? !!backgroundImage : false))}
                disabled={!backgroundImage}
                style={{
                  border: "1px solid #5b6572",
                  background: "linear-gradient(180deg, #eceff3 0%, #c3c8cf 100%)",
                  borderRadius: "4px",
                  fontSize: "10px",
                  padding: "6px 8px",
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
                  borderRadius: "4px",
                  fontSize: "10px",
                  padding: "6px 8px",
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
                  borderRadius: "4px",
                  fontSize: "10px",
                  padding: "6px 8px",
                  cursor: "pointer",
                  color: "#111827",
                }}
              >
                Limpar músicas
              </button>
            </div>
          </div>
        )}

        <div
          style={{
            marginTop: "10px",
            fontSize: isMobile ? "11px" : "10px",
            color: "#dbeafe",
            opacity: 0.95,
            paddingBottom: "8px",
          }}
        >
          Fontes: {sources.length ? sources.join(", ") : "nenhuma"} • Formatos: MP3, WAV, OGG,
          M4A e FLAC.
        </div>
      </div>
    </div>
  );
}