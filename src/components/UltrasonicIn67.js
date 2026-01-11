/* global BigInt */
import React, { useState, useEffect, useRef } from 'react';

const UltrasonicIn67 = () => {
    // --- STATE ---
    const [isPlayingGen, setIsPlayingGen] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [playbackUrl, setPlaybackUrl] = useState(null);
    const [fileName, setFileName] = useState("");
    const [enableUltrasonic, setEnableUltrasonic] = useState(true);
    const [enableAudible, setEnableAudible] = useState(true);
    const [detected, setDetected] = useState(false);
    const [status, setStatus] = useState("Ready");

    // --- REFS ---
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const oscAudibleRef = useRef(null);
    const oscUltrasonicRef = useRef(null);
    const recorderNodeRef = useRef(null);
    const audioChunksRef = useRef([]);
    const audioPlayerRef = useRef(null);
    const playerSourceNodeRef = useRef(null);
    const canvasRef = useRef(null);
    const animationRef = useRef(null);

    const ULTRASONIC_FREQ = 20000;
    const AUDIBLE_FREQ = 440;

    // --- AUDIO ENGINE ---
    const initAudioContext = async () => {
        if (!audioContextRef.current) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContextRef.current = new AudioContext();

            // Create Master Gain to control overall volume
            const masterGain = audioContextRef.current.createGain();
            masterGain.gain.value = 1.0;

            const analyser = audioContextRef.current.createAnalyser();
            analyser.fftSize = 2048;

            // Connect Master Graph: Source -> Analyser -> Destination (Speakers)
            // Note: We connect oscillators to this analyser later
            analyser.connect(audioContextRef.current.destination);

            analyserRef.current = analyser;
        }

        // FORCE WAKE UP
        if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }
    };

    // --- 1. GENERATOR ---
    const startGenerator = async () => {
        await initAudioContext();
        const ctx = audioContextRef.current;

        if (audioPlayerRef.current) {
            audioPlayerRef.current.pause();
        }

        if (enableAudible) {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(AUDIBLE_FREQ, ctx.currentTime);
            const gain = ctx.createGain();
            gain.gain.value = 0.1; // 10% Volume for audible
            osc.connect(gain);
            gain.connect(analyserRef.current); // Connect to Analyser -> Speakers
            osc.start();
            oscAudibleRef.current = osc;
        }

        if (enableUltrasonic) {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(ULTRASONIC_FREQ, ctx.currentTime);
            const gain = ctx.createGain();
            gain.gain.value = 0.5; // Stronger signal for ultrasonic
            osc.connect(gain);
            gain.connect(analyserRef.current);
            osc.start();
            oscUltrasonicRef.current = osc;
        }

        setIsPlayingGen(true);
        setStatus("GENERATING SIGNAL...");
        drawSpectrum();
    };

    const stopGenerator = () => {
        if (oscAudibleRef.current) { oscAudibleRef.current.stop(); oscAudibleRef.current.disconnect(); }
        if (oscUltrasonicRef.current) { oscUltrasonicRef.current.stop(); oscUltrasonicRef.current.disconnect(); }
        if (isRecording) stopRecording();
        setIsPlayingGen(false);
        setStatus("Generator Stopped.");
    };

    // --- 2. RECORDING (UI67) ---
    const startRecording = async () => {
        if (!isPlayingGen) return;
        await initAudioContext();

        const ctx = audioContextRef.current;
        audioChunksRef.current = [];

        const recorder = ctx.createScriptProcessor(4096, 2, 2);
        recorder.onaudioprocess = (e) => {
            const left = e.inputBuffer.getChannelData(0);
            const right = e.inputBuffer.getChannelData(1);
            const interleaved = new Float32Array(left.length + right.length);
            let idx = 0;
            for (let i = 0; i < left.length; i++) {
                interleaved[idx++] = left[i];
                interleaved[idx++] = right[i];
            }
            audioChunksRef.current.push(interleaved);
        };

        analyserRef.current.connect(recorder);
        recorder.connect(ctx.destination);
        recorderNodeRef.current = recorder;

        setIsRecording(true);
        setStatus("● RECORDING UI67...");
    };

    const stopRecording = () => {
        if (recorderNodeRef.current) {
            recorderNodeRef.current.disconnect();
            recorderNodeRef.current = null;
            setIsRecording(false);
            encodeUI67File();
        }
    };

    const encodeUI67File = () => {
        setStatus("Encoding UI67 Format...");
        const ctx = audioContextRef.current;
        const recordedBuffers = audioChunksRef.current;
        const bufferLength = recordedBuffers.reduce((acc, buf) => acc + buf.length, 0);
        const samples = new Float32Array(bufferLength);
        let offset = 0;
        for (const buf of recordedBuffers) {
            samples.set(buf, offset);
            offset += buf.length;
        }

        const pcmDataSize = samples.length * 2;
        const pcmBuffer = new ArrayBuffer(pcmDataSize);
        const pcmView = new DataView(pcmBuffer);
        for (let i = 0; i < samples.length; i++) {
            let s = Math.max(-1, Math.min(1, samples[i]));
            s = s < 0 ? s * 0x8000 : s * 0x7FFF;
            pcmView.setInt16(i * 2, s, true);
        }

        const headerSize = 40;
        const audoChunkHeaderSize = 12;
        const totalSize = headerSize + audoChunkHeaderSize + pcmDataSize + 12;

        const fileBuffer = new ArrayBuffer(totalSize);
        const view = new DataView(fileBuffer);
        const writeString = (v, off, str) => {
            for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i));
        };

        writeString(view, 0, 'UI67');
        view.setUint16(4, 1, true);
        view.setBigUint64(6, BigInt(totalSize), true);
        writeString(view, 14, 'NONE');
        writeString(view, 18, 'PCM ');
        view.setUint32(22, ctx.sampleRate, true);
        view.setUint8(26, 2);
        view.setUint8(27, 16);
        const durationMs = (samples.length / 2 / ctx.sampleRate) * 1000;
        view.setBigUint64(28, BigInt(Math.floor(durationMs)), true);
        view.setUint32(36, 0, true);

        let cursor = 40;
        writeString(view, cursor, 'AUDO');
        view.setBigUint64(cursor + 4, BigInt(pcmDataSize), true);
        cursor += 12;
        new Uint8Array(fileBuffer).set(new Uint8Array(pcmBuffer), cursor);
        cursor += pcmDataSize;
        writeString(view, cursor, 'END ');
        view.setBigUint64(cursor + 4, BigInt(0), true);

        const blob = new Blob([fileBuffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        setPlaybackUrl(url);
        setFileName("recording.ui67");
        setStatus("UI67 File Ready. Requires custom decoder.");
    };

    // --- 3. BRIDGE & DECODER ---
    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Force wake up context on user interaction
        await initAudioContext();

        if (file.name.endsWith('.ui67')) {
            setStatus("Decoding UI67 Container...");
            try {
                const arrayBuffer = await file.arrayBuffer();
                const wavUrl = parseUI67ToWav(arrayBuffer);
                setPlaybackUrl(wavUrl);
                setFileName(file.name);
                setStatus("UI67 Decoded -> Playing Raw Audio");
                if(isPlayingGen) stopGenerator();
            } catch (err) {
                console.error(err);
                setStatus("Error: Invalid UI67 File");
            }
        } else {
            const url = URL.createObjectURL(file);
            setPlaybackUrl(url);
            setFileName(file.name);
            setStatus("Standard File Loaded.");
            if(isPlayingGen) stopGenerator();
        }
    };

    const parseUI67ToWav = (buffer) => {
        const view = new DataView(buffer);
        const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
        if (magic !== 'UI67') throw new Error("Not a UI67 file");

        const sampleRate = view.getUint32(22, true);
        const channels = view.getUint8(26);
        const bitDepth = view.getUint8(27);

        let cursor = 40;
        let pcmData = null;

        while (cursor < view.byteLength) {
            const chunkId = String.fromCharCode(view.getUint8(cursor), view.getUint8(cursor+1), view.getUint8(cursor+2), view.getUint8(cursor+3));
            const chunkLen = Number(view.getBigUint64(cursor + 4, true));
            cursor += 12;
            if (chunkId === 'AUDO') {
                pcmData = new Uint8Array(buffer.slice(cursor, cursor + chunkLen));
                break;
            }
            cursor += chunkLen;
        }

        if (!pcmData) throw new Error("No Audio Chunk Found");

        const wavHeader = new ArrayBuffer(44);
        const wView = new DataView(wavHeader);
        const writeStr = (off, s) => { for(let i=0;i<s.length;i++) wView.setUint8(off+i, s.charCodeAt(i)); };

        writeStr(0, 'RIFF');
        wView.setUint32(4, 36 + pcmData.byteLength, true);
        writeStr(8, 'WAVE');
        writeStr(12, 'fmt ');
        wView.setUint32(16, 16, true);
        wView.setUint16(20, 1, true);
        wView.setUint16(22, channels, true);
        wView.setUint32(24, sampleRate, true);
        wView.setUint32(28, sampleRate * channels * (bitDepth/8), true);
        wView.setUint16(32, channels * (bitDepth/8), true);
        wView.setUint16(34, bitDepth, true);
        writeStr(36, 'data');
        wView.setUint32(40, pcmData.byteLength, true);

        const wavBlob = new Blob([wavHeader, pcmData], { type: 'audio/wav' });
        return URL.createObjectURL(wavBlob);
    };

    const handlePlayFile = async () => {
        await initAudioContext();
        const ctx = audioContextRef.current;
        const player = audioPlayerRef.current;
        if (!player) return;

        // Ensure we don't double-connect
        if (!playerSourceNodeRef.current) {
            try {
                const source = ctx.createMediaElementSource(player);
                playerSourceNodeRef.current = source;
                source.connect(analyserRef.current);
                // Important: Ensure analyser connects to speakers too!
                analyserRef.current.connect(ctx.destination);
            } catch (e) {
                // If already connected, just ensure destination is linked
                analyserRef.current.connect(ctx.destination);
            }
        }

        drawSpectrum();
        setStatus(`Analyzing: ${fileName}`);
    };

    // --- VISUALIZER ---
    const drawSpectrum = () => {
        const canvas = canvasRef.current;
        const analyser = analyserRef.current;
        if (!canvas || !analyser) return;

        const ctx = canvas.getContext('2d');
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const width = canvas.width;
        const height = canvas.height;

        const render = () => {
            analyser.getByteFrequencyData(dataArray);
            ctx.fillStyle = '#111';
            ctx.fillRect(0, 0, width, height);

            const barWidth = (width / bufferLength) * 2.5;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = dataArray[i];
                const frequency = i * (audioContextRef.current.sampleRate / 2) / bufferLength;

                // Color Code: RED = Audible, CYAN = Ultrasonic
                if (frequency > 19000) ctx.fillStyle = `rgb(0, ${barHeight + 100}, 255)`;
                else ctx.fillStyle = `rgb(${barHeight + 100}, 50, 50)`;

                ctx.fillRect(x, height - barHeight / 2, barWidth, barHeight / 2);
                x += barWidth + 1;
            }

            const nyquist = audioContextRef.current.sampleRate / 2;
            const indexStart = Math.floor((19500 / nyquist) * bufferLength);
            const indexEnd = Math.floor((20500 / nyquist) * bufferLength);
            let energy = 0;
            for (let i = indexStart; i <= indexEnd; i++) energy += dataArray[i];

            setDetected(energy > 30);
            animationRef.current = requestAnimationFrame(render);
        };
        render();
    };

    useEffect(() => {
        return () => {
            if(animationRef.current) cancelAnimationFrame(animationRef.current);
            stopGenerator();
        }
    }, []);

    return (
        <div style={{ fontFamily: 'sans-serif', padding: '20px', maxWidth: '640px', margin: '0 auto', background: '#222', color: '#fff', borderRadius: '12px' }}>
            <h2 style={{ borderBottom: '1px solid #444', paddingBottom: '10px' }}>Ultrasonic-in-67 <span style={{fontSize:'0.6em', color: '#00d8ff'}}>Final Suite</span></h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                <div style={{ padding: '15px', background: '#333', borderRadius: '8px' }}>
                    <h4 style={{marginTop:0, marginBottom:'10px'}}>1. Signal Gen</h4>
                    <div style={{fontSize: '0.85em', marginBottom: '10px', color: '#ccc'}}>
                        <label style={{ marginRight:'10px' }}><input type="checkbox" checked={enableAudible} onChange={(e) => setEnableAudible(e.target.checked)} disabled={isPlayingGen} /> Audible</label>
                        <label style={{ color: '#00d8ff' }}><input type="checkbox" checked={enableUltrasonic} onChange={(e) => setEnableUltrasonic(e.target.checked)} disabled={isPlayingGen} /> Ultrasonic</label>
                    </div>
                    {!isPlayingGen ?
                        <button onClick={startGenerator} style={{ width:'100%', padding: '6px', background: '#28a745', border: 'none', color: '#fff', fontWeight:'bold', cursor: 'pointer', borderRadius:'4px' }}>START</button> :
                        <button onClick={stopGenerator} style={{ width:'100%', padding: '6px', background: '#dc3545', border: 'none', color: '#fff', fontWeight:'bold', cursor: 'pointer', borderRadius:'4px' }}>STOP</button>
                    }
                </div>
                <div style={{ padding: '15px', background: '#333', borderRadius: '8px' }}>
                    <h4 style={{marginTop:0, marginBottom:'10px'}}>2. UI67 Recorder</h4>
                    {isPlayingGen && !isRecording && (
                        <button onClick={startRecording} style={{ width:'100%', padding: '6px', background: '#ffc107', border: 'none', color: '#000', fontWeight:'bold', cursor: 'pointer', borderRadius:'4px' }}>● RECORD .UI67</button>
                    )}
                    {isRecording && (
                        <button onClick={stopRecording} style={{ width:'100%', padding: '6px', background: '#fd7e14', border: 'none', color: '#fff', fontWeight:'bold', cursor: 'pointer', borderRadius:'4px' }}>■ STOP & SAVE</button>
                    )}
                </div>
            </div>

            <div style={{ position: 'relative', border: '1px solid #555', borderRadius: '4px', overflow: 'hidden', background: '#000', marginBottom: '20px' }}>
                <canvas ref={canvasRef} width="600" height="150" style={{ display: 'block', width: '100%' }} />
                <div style={{ position: 'absolute', top: 10, left: 10, fontSize: '12px', background: 'rgba(0,0,0,0.8)', padding: '4px 8px', borderRadius: '4px', border: '1px solid #444' }}>{status}</div>
                <div style={{ position: 'absolute', top: 10, right: 10, padding: '5px 10px', background: detected ? 'rgba(0, 216, 255, 0.9)' : 'rgba(30,30,30,0.9)', color: detected ? '#000' : '#888', fontWeight: 'bold', borderRadius: '20px', border: detected ? '2px solid #fff' : '1px solid #555'}}>
                    {detected ? '● DETECTED' : '○ NO SIGNAL'}
                </div>
            </div>

            <div style={{ padding: '15px', background: '#2a2a2a', border: '1px solid #444', borderRadius: '8px' }}>
                <h4 style={{marginTop:0, color: '#00d8ff', marginBottom: '10px'}}>3. UI67 Analyzer</h4>
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'inline-block', padding: '6px 12px', background: '#555', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9em', border: '1px solid #777' }}>
                        📁 Upload .UI67 / Media
                        <input type="file" accept=".ui67,audio/*,video/*" onChange={handleFileUpload} style={{ display: 'none' }} />
                    </label>
                    <span style={{ marginLeft: '10px', fontSize: '0.9em', color: '#aaa' }}>{fileName || "No file loaded"}</span>
                </div>
                {playbackUrl && (
                    <div>
                        <audio ref={audioPlayerRef} src={playbackUrl} controls onPlay={handlePlayFile} style={{ width: '100%', marginBottom: '10px' }} />
                        {fileName.endsWith(".ui67") && (
                            <div style={{textAlign: 'right'}}>
                                <a href={playbackUrl} download={fileName} style={{ color: '#00d8ff', textDecoration: 'none', fontSize: '0.9em' }}>⬇ Download Decoded WAV (Playable)</a>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default UltrasonicIn67;