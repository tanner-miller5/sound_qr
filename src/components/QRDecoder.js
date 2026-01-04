import React, { useState, useCallback } from 'react';
import { SoundQRDecoder } from '../utils/soundQRDecoder';
import { AudioProcessor } from '../utils/audioUtils';
import FileUpload from './FileUpload';

const QRDecoder = () => {
  const [audioFile, setAudioFile] = useState(null);
  const [decoding, setDecoding] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState(null);

  const decoder = new SoundQRDecoder();
  const audioProcessor = new AudioProcessor();

  // Audio file inspector
  const inspectAudioFile = useCallback(async () => {
  if (!audioFile) {
    setError('Please select an audio file first');
    return;
  }

  try {
    await audioProcessor.initAudioContext();
    const audioBuffer = await audioProcessor.loadAudioFile(audioFile);
    
    console.log('\n=== AUDIO FILE INSPECTION ===');
    console.log(`File: ${audioFile.name}`);
    console.log(`Size: ${audioFile.size} bytes`);
    console.log(`Type: ${audioFile.type}`);
    console.log(`Duration: ${audioBuffer.duration.toFixed(2)}s`);
    console.log(`Sample Rate: ${audioBuffer.sampleRate}Hz`);
    console.log(`Channels: ${audioBuffer.numberOfChannels}`);
    
    const channelData = audioBuffer.getChannelData(0);
    
    // Prevent stack overflow by processing in batches
    const batchSize = 48000; // 1 second at 48kHz
    let rmsSum = 0;
    let peak = 0;
    
    for (let i = 0; i < channelData.length; i += batchSize) {
      const end = Math.min(i + batchSize, channelData.length);
      const batch = channelData.slice(i, end);
      
      // Calculate RMS for this batch
      const batchRms = Math.sqrt(batch.reduce((sum, sample) => sum + sample * sample, 0) / batch.length);
      rmsSum += batchRms * batchRms * batch.length;
      
      // Find peak in this batch
      const batchPeak = Math.max(...batch.map(Math.abs));
      peak = Math.max(peak, batchPeak);
      
      // Yield control periodically to prevent blocking
      if (i % (batchSize * 5) === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
    
    const rms = Math.sqrt(rmsSum / channelData.length);
    
    console.log(`RMS Level: ${rms.toFixed(6)} (${(20 * Math.log10(rms)).toFixed(1)} dB)`);
    console.log(`Peak Level: ${peak.toFixed(6)} (${(20 * Math.log10(peak)).toFixed(1)} dB)`);
    
    // Simplified frequency analysis
    console.log('\nFrequency Analysis:');
    const expectedFreqs = [14000, 14100, 15200, 17090];
    const testSegment = channelData.slice(0, Math.min(channelData.length, 9600)); // Max 200ms at 48kHz
    
    for (const freq of expectedFreqs) {
      try {
        // Simple correlation without recursion
        let correlation = 0;
        const samples = Math.min(testSegment.length, 4800); // Max 100ms
        
        for (let i = 0; i < samples; i++) {
          const phase = 2 * Math.PI * freq * i / audioBuffer.sampleRate;
          correlation += testSegment[i] * Math.sin(phase);
        }
        
        correlation = Math.abs(correlation) / samples;
        console.log(`${freq}Hz: correlation = ${correlation.toFixed(6)}`);
        
      } catch (err) {
        console.log(`${freq}Hz: analysis failed - ${err.message}`);
      }
      
      // Small delay to prevent blocking
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    
    alert('Audio inspection complete. Check browser console for detailed analysis.');
    
  } catch (err) {
    console.error('Inspection failed:', err);
    setError(`Inspection failed: ${err.message}`);
  }
}, [audioFile]);

// Simplified generateFullTestQR method with fixed RMS calculation
const generateFullTestQR = useCallback(async () => {
  try {
    console.log('🚀 Starting test QR generation...');
    
    // Initialize audio context
    await audioProcessor.initAudioContext();
    const sampleRate = audioProcessor.sampleRate;
    
    // Create base audio buffer with quiet background noise
    const duration = 20; // 20 seconds for Version 1 QR
    const samples = new Float32Array(duration * sampleRate);
    
    // Add very quiet background noise to prevent complete silence
    for (let i = 0; i < samples.length; i++) {
      samples[i] = (Math.random() - 0.5) * 0.001; // Very quiet noise at -60dB
    }
    
    const baseAudioBuffer = audioProcessor.audioContext.createBuffer(1, samples.length, sampleRate);
    baseAudioBuffer.copyToChannel(samples, 0);
    
    console.log(`🔧 Created base audio: ${duration}s, ${sampleRate}Hz, ${samples.length} samples`);
    
    // Load encoder and set up mocking
    const { SoundQREncoder } = await import('../utils/soundQREncoder');
    const encoder = new SoundQREncoder();
    await encoder.audioProcessor.initAudioContext();
    
    // Mock the loadAudioFile method
    const originalLoad = encoder.audioProcessor.loadAudioFile;
    encoder.audioProcessor.loadAudioFile = async () => {
      console.log('🔧 Using mock audio buffer for encoding');
      return baseAudioBuffer;
    };
    
    console.log('🔧 Encoding "Hello World" as Version 1 QR...');
    
    const testFile = new File([new ArrayBuffer(1000)], 'test.wav', { type: 'audio/wav' });
    const result = await encoder.encode(testFile, "Hello World", { 
      version: 1, 
      cycles: 3,
      amplitude: 0.1
    });
    
    // Restore original method
    encoder.audioProcessor.loadAudioFile = originalLoad;
    
    console.log('✅ Encoding successful:', result);
    
    // FIXED: Verify the result has audio signal using batched processing
    const resultChannelData = result.audioBuffer.getChannelData(0);
    
    // Calculate RMS in batches to prevent stack overflow
    let rmsSum = 0;
    let peak = 0;
    const batchSize = 10000; // 10k samples per batch
    
    console.log(`🔧 Verifying result audio: ${resultChannelData.length} samples...`);
    
    for (let i = 0; i < resultChannelData.length; i += batchSize) {
      const endIdx = Math.min(i + batchSize, resultChannelData.length);
      
      // Process batch for RMS
      let batchSum = 0;
      for (let j = i; j < endIdx; j++) {
        const sample = resultChannelData[j];
        batchSum += sample * sample;
        const absSample = Math.abs(sample);
        if (absSample > peak) peak = absSample;
      }
      rmsSum += batchSum;
      
      // Yield occasionally
      if (i % (batchSize * 5) === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
    
    const resultRMS = Math.sqrt(rmsSum / resultChannelData.length);
    
    console.log(`🔍 Result verification - RMS: ${resultRMS.toFixed(6)}, Peak: ${peak.toFixed(6)}`);
    
    if (resultRMS === 0 || peak === 0) {
      throw new Error('Generated audio is silent - encoding failed');
    }
    
    // Convert to WAV with improved method
    console.log('🔧 Converting to downloadable WAV file...');
    const wav = await audioBufferToWav(result.audioBuffer);
    const blob = new Blob([wav], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    
    // Download the file
    const a = document.createElement('a');
    a.href = url;
    a.download = 'test-hello-world-sound-qr.wav';
    a.click();
    
    console.log('🎉 Test QR file generated successfully!');
    alert('✅ Test QR file generated and downloaded successfully!\n\n' +
          `File: test-hello-world-sound-qr.wav\n` +
          `Duration: ${result.audioBuffer.duration.toFixed(2)}s\n` +
          `QR Data: "Hello World"\n` +
          `Version: ${result.qrData.version}\n` +
          `Cycles: ${result.cycles}\n\n` +
          'Check your Downloads folder and try decoding this file!');
    
  } catch (err) {
    console.error('❌ Test generation failed:', err);
    setError(`Test generation failed: ${err.message}`);
    alert(`❌ Test generation failed: ${err.message}\n\nCheck the browser console for details.`);
  }
}, [audioProcessor]);

const audioBufferToWav = async (audioBuffer) => {
  try {
    console.log(`🔧 Converting audio buffer to WAV: ${audioBuffer.duration.toFixed(2)}s, ${audioBuffer.numberOfChannels} channels`);
    
    const numberOfChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length * numberOfChannels * 2;
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, audioBuffer.sampleRate, true);
    view.setUint32(28, audioBuffer.sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length, true);
    
    // FIXED: Process audio data in smaller batches to prevent stack overflow
    let offset = 44;
    const batchSize = 1000; // Process 1000 samples at a time
    
    console.log(`🔧 Processing ${audioBuffer.length} samples in batches of ${batchSize}...`);
    
    for (let i = 0; i < audioBuffer.length; i += batchSize) {
      const endIdx = Math.min(i + batchSize, audioBuffer.length);
      
      // Process this batch
      for (let sampleIdx = i; sampleIdx < endIdx; sampleIdx++) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
          const channelData = audioBuffer.getChannelData(channel);
          const sample = Math.max(-1, Math.min(1, channelData[sampleIdx]));
          view.setInt16(offset, sample * 0x7FFF, true);
          offset += 2;
        }
      }
      
      // Yield control every batch to prevent blocking
      if (i % (batchSize * 10) === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
        console.log(`🔧 WAV conversion progress: ${((i / audioBuffer.length) * 100).toFixed(1)}%`);
      }
    }
    
    console.log(`✅ WAV conversion complete: ${buffer.byteLength} bytes`);
    return buffer;
    
  } catch (error) {
    console.error(`❌ WAV conversion failed: ${error.message}`);
    throw new Error(`WAV conversion failed: ${error.message}`);
  }
};

  const handleDecode = useCallback(async () => {
    if (!audioFile) {
      setError('Please select an audio file');
      return;
    }

    setDecoding(true);
    setError(null);
    setResult(null);
    setDebugInfo(null);
    setProgress('Loading audio file...');

    try {
      const audioBuffer = await audioProcessor.loadAudioFile(audioFile);
      
      setProgress('Analyzing audio content...');
      console.log('\n=== STARTING DECODE PROCESS ===');
      
      const decodingResult = await decoder.decode(audioBuffer, { 
        fastMode: false,
        maxProcessingTime: 60000 // 60 second timeout for debugging
      });
      
      setResult(decodingResult);
      setProgress('');
      
    } catch (err) {
      console.error('Decoding error:', err);
      setError(err.message);
      setProgress('');
    } finally {
      setDecoding(false);
    }
  }, [audioFile]);

  return (
    <div className="qr-decoder">
      <h2>Decode QR from Audio</h2>
      
      <div className="form-group">
        <FileUpload 
          onFileSelect={setAudioFile}
          label={audioFile ? audioFile.name : "Select Audio File"}
        />
      </div>

      <div className="button-group" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button 
          onClick={handleDecode}
          disabled={decoding || !audioFile}
          className="decode-button"
        >
          {decoding ? 'Decoding...' : 'Decode QR from Audio'}
        </button>
        
        <button 
          onClick={inspectAudioFile}
          disabled={!audioFile}
          className="test-button"
          style={{ background: '#666' }}
        >
          Inspect Audio File
        </button>
        
        <button 
          onClick={generateFullTestQR}
          className="test-button"
          style={{ background: '#4a4' }}
        >
          Generate Test QR
        </button>
      </div>

      {progress && (
        <div className="progress-message">
          {progress}
        </div>
      )}

      {error && (
        <div className="error-message">
          <h4>Error: {error}</h4>
          <p>Check the browser console for detailed analysis logs.</p>
        </div>
      )}

      {result && (
        <div className="result-section">
          <h3>Decoding Complete!</h3>
          <div className="decoded-result">
            <p><strong>QR Version:</strong> {result.version}</p>
            <p><strong>Confidence:</strong> {(result.confidence * 100).toFixed(1)}%</p>
            <p><strong>Cycles Found:</strong> {result.cyclesFound}</p>
            <div className="decoded-data">
              <h4>Decoded Data:</h4>
              <pre>{result.data}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QRDecoder;