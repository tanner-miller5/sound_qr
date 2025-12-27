import React, { useState, useEffect, useRef } from 'react';
import { decodeUltrasonicToQR, debugAudioFile } from '../../services/steganographyService';
import './MicrophoneRecorder.css';

const MicrophoneRecorder = ({ audioContext, onDecoded }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingBuffer, setRecordingBuffer] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null);
  
  const mediaRecorderRef = useRef();
  const streamRef = useRef();
  const analyserRef = useRef();
  const processorRef = useRef();
  const audioChunksRef = useRef([]);

  const requestMicrophonePermission = async () => {
    try {
      // Request high-quality audio with specific constraints
      const constraints = {
        audio: {
          sampleRate: { ideal: 48000, min: 44100 },
          channelCount: { ideal: 2, min: 1 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          googEchoCancellation: false,
          googAutoGainControl: false,
          googNoiseSuppression: false,
          googHighpassFilter: false,
          googTypingNoiseDetection: false
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      // Get actual device capabilities
      const track = stream.getAudioTracks()[0];
      const settings = track.getSettings();
      const capabilities = track.getCapabilities();
      
      setDeviceInfo({
        sampleRate: settings.sampleRate,
        channelCount: settings.channelCount,
        maxSampleRate: capabilities.sampleRate?.max || 'Unknown',
        deviceId: settings.deviceId,
        echoCancellation: settings.echoCancellation
      });

      console.log('Microphone settings:', settings);
      console.log('Microphone capabilities:', capabilities);

      setHasPermission(true);
      setError(null);
      
      // Set up real-time audio processing
      setupAudioProcessing(stream);
      
    } catch (err) {
      setError(`Microphone access failed: ${err.message}`);
      console.error('Microphone error:', err);
    }
  };

  const setupAudioProcessing = (stream) => {
    if (!audioContext) return;

    try {
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      
      // Configure analyser for high-frequency detection
      analyser.fftSize = 8192; // Higher resolution for better frequency detection
      analyser.smoothingTimeConstant = 0; // No smoothing for real-time
      analyser.minDecibels = -100;
      analyser.maxDecibels = -10;
      
      source.connect(analyser);
      analyserRef.current = analyser;

      // Create a ScriptProcessorNode for continuous monitoring
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      let sampleBuffer = [];
      const targetSamples = audioContext.sampleRate * 15; // 15 seconds of audio
      
      processor.onaudioprocess = (e) => {
        const inputBuffer = e.inputBuffer.getChannelData(0);
        
        // Accumulate samples for processing
        sampleBuffer.push(...Array.from(inputBuffer));
        
        // Keep only the most recent samples
        if (sampleBuffer.length > targetSamples) {
          sampleBuffer = sampleBuffer.slice(-targetSamples);
        }
        
        // Try to decode every few seconds
        if (sampleBuffer.length > audioContext.sampleRate * 5) { // At least 5 seconds
          tryRealtimeDecoding(sampleBuffer, audioContext.sampleRate);
        }
      };
      
      processorRef.current = processor;
      
    } catch (err) {
      console.error('Audio processing setup failed:', err);
      setError('Failed to setup audio processing');
    }
  };

  const tryRealtimeDecoding = async (samples, sampleRate) => {
    if (isProcessing) return; // Don't overlap processing
    
    try {
      // Create a temporary audio buffer for decoding
      const buffer = audioContext.createBuffer(1, samples.length, sampleRate);
      buffer.copyToChannel(new Float32Array(samples), 0);
      
      console.log('Attempting real-time decode of', samples.length, 'samples');
      
      // Try quick decoding with relaxed parameters
      const result = await decodeUltrasonicToQR(buffer, audioContext, () => {});
      
      if (result && onDecoded) {
        console.log('Real-time decode successful:', result);
        onDecoded(result);
      }
      
    } catch (err) {
      // Silent fail for real-time processing
      console.log('Real-time decode attempt failed:', err.message);
    }
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    
    setIsRecording(true);
    setError(null);
    audioChunksRef.current = [];
    
    // Start MediaRecorder for full recording backup
    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 128000
    });
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      await processFullRecording();
    };
    
    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start(1000); // Collect data every second
    
    // Auto-stop after 30 seconds
    setTimeout(() => {
      if (isRecording) {
        stopRecording();
      }
    }, 30000);
  };

  const stopRecording = () => {
    setIsRecording(false);
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const processFullRecording = async () => {
    if (audioChunksRef.current.length === 0) return;
    
    setIsProcessing(true);
    
    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      console.log('Processing recorded audio blob:', audioBlob.size, 'bytes');
      
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      console.log('Recorded audio buffer:', {
        sampleRate: audioBuffer.sampleRate,
        duration: audioBuffer.duration,
        channels: audioBuffer.numberOfChannels
      });
      
      // Debug the recorded audio
      await debugAudioFile(audioBuffer);
      
      const decodedData = await decodeUltrasonicToQR(audioBuffer, audioContext, () => {});
      
      if (decodedData && onDecoded) {
        onDecoded(decodedData);
      } else {
        setError('No QR code detected in recording. Try recording closer to the audio source.');
      }
      
    } catch (err) {
      console.error('Recording processing error:', err);
      setError(`Processing failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const testMicrophone = async () => {
    if (!analyserRef.current) return;
    
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    analyser.getByteFrequencyData(dataArray);
    
    // Check for high-frequency content
    const nyquist = audioContext.sampleRate / 2;
    const targetFreqBin1 = Math.floor((21000 * bufferLength) / nyquist);
    const targetFreqBin2 = Math.floor((21500 * bufferLength) / nyquist);
    
    const highFreqPower1 = dataArray[targetFreqBin1] || 0;
    const highFreqPower2 = dataArray[targetFreqBin2] || 0;
    
    console.log('Microphone test:', {
      totalBins: bufferLength,
      nyquistFreq: nyquist,
      targetBins: [targetFreqBin1, targetFreqBin2],
      highFreqPowers: [highFreqPower1, highFreqPower2],
      canDetectUltrasonic: nyquist > 22000
    });
    
    setError(
      nyquist < 22000 
        ? `Warning: Sample rate too low (${audioContext.sampleRate}Hz). Cannot detect ultrasonic frequencies.`
        : `Microphone test OK. Can detect frequencies up to ${nyquist}Hz`
    );
  };

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
    }
  };

  useEffect(() => {
    return cleanup;
  }, []);

  return (
    <div className="microphone-recorder">
      <h3>Live QR Code Detection</h3>
      
      {deviceInfo && (
        <div className="device-info">
          <h4>Microphone Info:</h4>
          <p>Sample Rate: {deviceInfo.sampleRate}Hz (Max: {deviceInfo.maxSampleRate})</p>
          <p>Channels: {deviceInfo.channelCount}</p>
          <p>Echo Cancellation: {deviceInfo.echoCancellation ? 'On' : 'Off'}</p>
          <p>Ultrasonic Support: {deviceInfo.sampleRate >= 44100 ? '✅ Yes' : '❌ No'}</p>
        </div>
      )}
      
      {!hasPermission && (
        <div className="permission-request">
          <p>High-quality microphone access required for ultrasonic detection</p>
          <button onClick={requestMicrophonePermission} className="permission-btn">
            Enable Microphone
          </button>
        </div>
      )}
      
      {hasPermission && (
        <div className="recording-controls">
          <button onClick={testMicrophone} className="test-btn">
            Test Microphone
          </button>
          
          <button 
            onClick={isRecording ? stopRecording : startRecording}
            className={`record-btn ${isRecording ? 'recording' : ''}`}
            disabled={isProcessing}
          >
            {isRecording ? '⏸️ Stop Recording' : '🎤 Start Recording'}
          </button>
          
          {isRecording && (
            <div className="recording-indicator">
              <div className="pulse"></div>
              <span>Listening for ultrasonic QR codes...</span>
            </div>
          )}
          
          {isProcessing && (
            <div className="processing-indicator">
              <div className="spinner"></div>
              <span>Processing recording...</span>
            </div>
          )}
        </div>
      )}
      
      {error && (
        <div className={`message ${error.includes('Warning') ? 'warning' : 'error'}`}>
          <p>{error}</p>
        </div>
      )}
      
      <div className="instructions">
        <h4>For best results:</h4>
        <ul>
          <li>Use a high-quality external microphone if available</li>
          <li>Ensure your device supports >44kHz audio capture</li>
          <li>Record very close to the audio source (speakers)</li>
          <li>Minimize background noise</li>
          <li>Use the latest version of Chrome/Firefox</li>
          <li>Test with uncompressed WAV files first</li>
        </ul>
      </div>
    </div>
  );
};

export default MicrophoneRecorder;