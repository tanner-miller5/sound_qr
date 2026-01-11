import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import SoundQRDecoder from '../utils/soundQRDecoder';
import { AudioProcessor } from '../utils/audioUtils';
import FileUpload from './FileUpload';

const QRDecoder = () => {
    const [audioFile, setAudioFile] = useState(null);
    const [decoding, setDecoding] = useState(false);
    const [isListening, setIsListening] = useState(false); // Shazam mode state
    const [progress, setProgress] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [micStats, setMicStats] = useState(null); // Live frequency stats

    // Persist instances
    const decoder = useMemo(() => new SoundQRDecoder(), []);
    const audioProcessor = useMemo(() => new AudioProcessor(), []);

    // Live Listening Refs
    const audioContextRef = useRef(null);
    const streamRef = useRef(null);
    const processorRef = useRef(null);
    const sourceRef = useRef(null);
    const analyzerRef = useRef(null); // For frequency visual check
    const isListeningRef = useRef(false);

    // Rolling Buffer: Stores raw Float32 samples
    const rollingBufferRef = useRef(new Float32Array(0));
    const isProcessingRef = useRef(false);
    const analysisTimerRef = useRef(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            console.log('stopping')
            stopListening();
            if (audioContextRef.current) audioContextRef.current.close();
        };
    }, []);

    // --- SHAZAM / LIVE LISTEN FEATURE ---

    const startListening = async () => {
        try {
            setIsListening(true);
            isListeningRef.current = true;
            setError(null);

            // 1. Define Constraints (Try for "Perfect" first)
            const idealConstraints = {
                audio: {
                    sampleRate: { ideal: 96000 }, // removed 'min' to prevent crash
                    channelCount: 1,
                    echoCancellation: false,      // "please don't"
                    noiseSuppression: false,
                    autoGainControl: false,
                    googEchoCancellation: false,
                    googAutoGainControl: false,
                    googNoiseSuppression: false,
                    googHighpassFilter: false
                }
            };

            let stream;
            try {
                // Attempt 1: High Fidelity
                stream = await navigator.mediaDevices.getUserMedia(idealConstraints);
                console.log("✅ Microphone initialized with IDEAL settings");
            } catch (err) {
                // Attempt 2: Fallback (Standard settings) if Attempt 1 fails
                console.warn("⚠️ High-Res Audio failed, falling back to standard config.", err.name);

                // Basic constraints that every device supports
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false
                    }
                });
            }

            streamRef.current = stream;

            // --- LOG ACTUAL SETTINGS ---
            const track = stream.getAudioTracks()[0];
            const settings = track.getSettings();
            console.log("🎤 Final Mic Settings:", settings);

            // 2. Initialize Audio Context with the *Actual* Sample Rate
            // This fixes the pitch shift bug if the fallback runs at 48k
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: settings.sampleRate // Match the hardware
            });

            if (audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
            }

            // 3. Create Audio Nodes
            const source = audioContextRef.current.createMediaStreamSource(stream);
            const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);

            // 4. Handle Incoming Audio Data
            processor.onaudioprocess = (e) => {
                if (!isListeningRef.current) return;

                const inputData = e.inputBuffer.getChannelData(0);

                // Efficiently append new data to the rolling buffer
                const oldBuffer = rollingBufferRef.current;
                const newBuffer = new Float32Array(oldBuffer.length + inputData.length);

                newBuffer.set(oldBuffer);
                newBuffer.set(inputData, oldBuffer.length);

                rollingBufferRef.current = newBuffer;
            };

            // 5. Connect the Graph
            source.connect(processor);
            processor.connect(audioContextRef.current.destination); // Required for script processor to run

            // Store refs for cleanup
            sourceRef.current = source;
            processorRef.current = processor;

            // 6. Start the Analysis Loop
            // We check the buffer every 100ms to see if we have enough data to decode
            analysisTimerRef.current = setInterval(() => {
                if (!isProcessingRef.current) {
                    analyzeRollingBuffer();
                }
            }, 100);
        } catch (err) {
            console.error("Mic initialization failed completely:", err);
            setError("Could not access microphone. Please check permissions.");
            setIsListening(false);
        }
    };

    const stopListening = () => {
        isListeningRef.current = false;
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
        }
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current.onaudioprocess = null;
        }
        if (sourceRef.current) {
            sourceRef.current.disconnect();
        }
        if (analysisTimerRef.current) {
            clearInterval(analysisTimerRef.current);
        }
        setIsListening(false);
        isProcessingRef.current = false;
    };

    const analyzeRollingBuffer = async () => {
        // Prevent memory crash: Drop old data if buffer is > 10 seconds
        const MAX_SAMPLES = audioContextRef.current.sampleRate * 10;
        if (rollingBufferRef.current.length > MAX_SAMPLES) {
            // Keep only the last 5 seconds
            const keepAmount = audioContextRef.current.sampleRate * 5;
            rollingBufferRef.current = rollingBufferRef.current.slice(-keepAmount);
        }
        if (isProcessingRef.current || !audioContextRef.current) return;
        // Check buffer length (need at least ~5 seconds for V1 cycle)
        const minSamples = (audioContextRef.current.sampleRate || 48000) * 4;
        if (rollingBufferRef.current.length < minSamples) {
            setProgress(`Buffering... (${(rollingBufferRef.current.length / audioContextRef.current.sampleRate).toFixed(1)}s)`);
            return;
        }
        isProcessingRef.current = true;
        setProgress('Analyzing buffer window...');

        try {
            // Create an AudioBuffer from the raw floats
            const rawData = rollingBufferRef.current;
            const tempBuffer = audioContextRef.current.createBuffer(1, rawData.length, audioContextRef.current.sampleRate);
            tempBuffer.getChannelData(0).set(rawData);
            console.log(`📉 Buffer Mismatch Check: Recording at ${audioContextRef.current.sampleRate}Hz vs Hardcoded 96000Hz`);
            // Run Decoder
            const decodeResult = await decoder.decode(tempBuffer, {
                maxProcessingTime: 1500, // Fail fast to keep UI responsive
                isLive: true
            });

            if (decodeResult) {
                // SUCCESS!
                setResult({
                    version: decodeResult.version,
                    cyclesFound: decodeResult.cyclesFound,
                    data: decodeResult.data,
                    confidence: decodeResult.confidence
                });
                stopListening(); // Stop immediately on success
                setProgress('Code found!');
                // Play success sound?
            }

        } catch (err) {
            // Expected error: "No cycles found"
            // We just ignore it and keep listening

            // Update Mic Stats for debug
            if (err.maxFreqDetected) {
                setMicStats(`Max Freq Detected: ${Math.round(err.maxFreqDetected)}Hz (Needs >21000Hz)`);
            }
            setProgress('Scanning... (Hold device steady)');
        } finally {
            isProcessingRef.current = false;
        }
    };

    // --- FILE HANDLING ---
    const handleFileSelect = (file) => {
        setAudioFile(file);
        setError(null);
        setResult(null);
        setProgress('File loaded. Ready to decode.');
    };

    const decodeFile = async () => {
        if (!audioFile) return;
        setDecoding(true);
        setProgress('Analyzing file...');
        try {
            const buffer = await audioProcessor.loadAudioFile(audioFile);
            const res = await decoder.decode(buffer, { maxProcessingTime: 60000 });
            setResult(res);
            setProgress('Success!');
        } catch (err) {
            setError(err.message);
        } finally {
            setDecoding(false);
        }
    };

    return (
        <div className="qr-decoder-container" style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
            <h2 style={{borderBottom: '2px solid #333', paddingBottom: '10px'}}>Sound-QR Receiver</h2>

            {/* Mode Switcher / Input */}
            <div className="input-section" style={{marginBottom: '20px'}}>

                {/* SHAZAM BUTTON */}
                <button
                    onClick={isListening ? stopListening : startListening}
                    className={`record-button ${isListening ? 'pulse-animation' : ''}`}
                    disabled={decoding}
                    style={{
                        backgroundColor: isListening ? '#ff4757' : '#2ed573',
                        color: 'white',
                        border: 'none',
                        borderRadius: '50px',
                        width: '80px',
                        height: '80px',
                        fontSize: '24px',
                        display: 'block',
                        margin: '20px auto',
                        cursor: 'pointer',
                        boxShadow: isListening ? '0 0 15px #ff4757' : '0 4px 6px rgba(0,0,0,0.1)'
                    }}
                >
                    {isListening ? '■' : '🎤'}
                </button>
                <div style={{textAlign: 'center', marginBottom: '20px', color: '#aaa'}}>
                    {isListening ? 'Listening...' : 'Tap to Listen'}
                </div>

                <div className="divider" style={{textAlign: 'center', color: '#555', margin: '20px 0'}}>— OR —</div>

                <FileUpload
                    onFileSelect={handleFileSelect}
                    accept="audio/*,.ui67"
                    label={audioFile ? audioFile.name : "Select Audio File"}
                />

                <button
                    onClick={decodeFile}
                    disabled={!audioFile || decoding || isListening}
                    style={{
                        width: '100%',
                        padding: '10px',
                        marginTop: '10px',
                        background: '#3742fa',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        opacity: (!audioFile || decoding) ? 0.5 : 1
                    }}
                >
                    {decoding ? 'Processing...' : 'Decode File'}
                </button>
            </div>

            {/* STATUS DISPLAY */}
            <div className="status-display" style={{ minHeight: '60px' }}>
                {progress && <div style={{ color: '#eccc68', textAlign: 'center' }}>{progress}</div>}
                {micStats && isListening && (
                    <div style={{ fontSize: '0.8em', color: '#777', textAlign: 'center', marginTop: '5px' }}>
                        DEBUG: {micStats}
                    </div>
                )}
                {error && (
                    <div style={{ background: 'rgba(255,0,0,0.1)', color: '#ff6b6b', padding: '10px', borderRadius: '4px', marginTop: '10px' }}>
                        {error}
                    </div>
                )}
            </div>

            {/* RESULT CARD */}
            {result && (
                <div className="result-card" style={{ marginTop: '20px', padding: '20px', background: '#2f3542', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.3)' }}>
                    <h3 style={{ color: '#2ed573', marginTop: 0 }}>Decoded Successfully</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.9em', color: '#ccc' }}>
                        <div>Version: {result.version}</div>
                        <div>Confidence: {(result.confidence * 100).toFixed(0)}%</div>
                    </div>
                    <div style={{ background: '#000', padding: '15px', marginTop: '15px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '1.2em', wordBreak: 'break-all' }}>
                        {result.data}
                    </div>
                </div>
            )}

            <style>{`
        .pulse-animation {
            animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
            0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 71, 87, 0.7); }
            70% { transform: scale(1.1); box-shadow: 0 0 0 10px rgba(255, 71, 87, 0); }
            100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 71, 87, 0); }
        }
      `}</style>
        </div>
    );
};

export default QRDecoder;