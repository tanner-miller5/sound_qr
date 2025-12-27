import React, { useState, useEffect } from 'react';
import {
    encodeQRToUltrasonic,
    decodeUltrasonicToQR,
    testForEncodedData,
    debugAudioFile
} from '../../services/steganographyService';
import './AudioProcessor.css';

const AudioProcessor = ({ qrData, audioFile, mode, audioContext, onDecoded }) => {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (audioFile) {
      processAudio();
    }
  }, [audioFile, qrData, mode]);

  const processAudio = async () => {
    setProcessing(true);
    setProgress(0);
    setError(null);
    
    try {
      const arrayBuffer = await audioFile.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      if (mode === 'encode') {
        setProgress(25);
        const encodedBuffer = await encodeQRToUltrasonic(audioBuffer, qrData, audioContext, setProgress);
        setProgress(100);
        setResult(encodedBuffer);
      } else if (mode === 'decode') {
          // Debug the audio file first
          console.log('=== STARTING COMPREHENSIVE DEBUG ===');
          await debugAudioFile(audioBuffer);

          // Test for encoded data
          const testResult = await testForEncodedData(audioBuffer);
          console.log('Encoded data test:', testResult);


        if (!testResult.hasUltrasonicContent) {
            throw new Error(`No ultrasonic signals detected in audio file. ${testResult.recommendation}`);
        }

        setProgress(25);
        const decodedData = await decodeUltrasonicToQR(audioBuffer, audioContext, setProgress);
        setProgress(100);
        setResult(decodedData);
        if (onDecoded) onDecoded(decodedData);
      }
    } catch (err) {
      console.error('Audio processing error:', err);
      setError(`Processing failed: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const downloadResult = () => {
    if (result && mode === 'encode') {
      // Convert AudioBuffer to WAV and download
      const wavBlob = audioBufferToWav(result);
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `encoded_${audioFile.name.replace(/\.[^/.]+$/, '')}.wav`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const audioBufferToWav = (buffer) => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    
    const bufferLength = buffer.length;
    const dataLength = bufferLength * blockAlign;
    
    const arrayBuffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);
    
    // Convert audio data
    let offset = 44;
    for (let i = 0; i < bufferLength; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  };

  return (
    <div className="audio-processor">
      <h3>{mode === 'encode' ? 'Encoding QR to Audio' : 'Decoding QR from Audio'}</h3>
      
      {audioFile && (
        <div className="file-info">
          <p><strong>File:</strong> {audioFile.name}</p>
          <p><strong>Size:</strong> {(audioFile.size / 1024 / 1024).toFixed(2)} MB</p>
          <p><strong>Type:</strong> {audioFile.type}</p>
        </div>
      )}
      
      {processing && (
        <div className="processing">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p>Processing... {progress}%</p>
        </div>
      )}
      
      {error && (
        <div className="error">
          <p>❌ {error}</p>
        </div>
      )}
      
      {result && mode === 'encode' && (
        <div className="result">
          <p>✅ QR code successfully embedded in ultrasonic frequencies!</p>
          <button onClick={downloadResult} className="download-btn">
            Download Encoded Audio
          </button>
        </div>
      )}
      
      {result && mode === 'decode' && (
        <div className="result">
          <p>✅ QR code decoded successfully!</p>
          <div className="decoded-data">
            <strong>Decoded Data:</strong> {result}
          </div>
        </div>
      )}
    </div>
  );
};

export default AudioProcessor;