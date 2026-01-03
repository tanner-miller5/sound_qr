import React, { useState, useCallback } from 'react';
import { SoundQREncoder } from '../utils/soundQREncoder';
import FileUpload from './FileUpload';

const QREncoder = () => {
  const [audioFile, setAudioFile] = useState(null);
  const [qrText, setQrText] = useState('');
  const [version, setVersion] = useState(1);
  const [encoding, setEncoding] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const encoder = new SoundQREncoder();

  const handleEncode = useCallback(async () => {
    if (!audioFile || !qrText.trim()) {
      setError('Please select an audio file and enter QR text');
      return;
    }

    setEncoding(true);
    setError(null);
    setResult(null);

    try {
      const encodingResult = await encoder.encode(audioFile, qrText, { version });
      
      // Convert AudioBuffer to downloadable format
      const wav = await audioBufferToWav(encodingResult.audioBuffer);
      const blob = new Blob([wav], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      
      setResult({
        audioUrl: url,
        filename: `encoded_${audioFile.name.replace(/\.[^/.]+$/, '')}.wav`,
        qrData: encodingResult.qrData,
        duration: encodingResult.duration,
        cycles: encodingResult.cycles
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setEncoding(false);
    }
  }, [audioFile, qrText, version]);

  // Simple WAV export function
  const audioBufferToWav = async (audioBuffer) => {
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
    
    // PCM data
    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return buffer;
  };

  return (
    <div className="qr-encoder">
      <h2>Encode QR into Audio</h2>
      
      <div className="form-group">
        <FileUpload 
          onFileSelect={setAudioFile}
          label={audioFile ? audioFile.name : "Select Audio File"}
        />
      </div>

      <div className="form-group">
        <label htmlFor="qr-text">QR Code Text:</label>
        <textarea
          id="qr-text"
          value={qrText}
          onChange={(e) => setQrText(e.target.value)}
          placeholder="Enter text to encode as QR code..."
          rows={3}
        />
      </div>

      <div className="form-group">
        <label htmlFor="version">QR Version:</label>
        <select
          id="version"
          value={version}
          onChange={(e) => setVersion(parseInt(e.target.value))}
        >
          {[1, 2, 3, 4, 5].map(v => (
            <option key={v} value={v}>Version {v} ({21 + (v-1)*4}×{21 + (v-1)*4})</option>
          ))}
        </select>
      </div>

      <button 
        onClick={handleEncode}
        disabled={encoding || !audioFile || !qrText.trim()}
        className="encode-button"
      >
        {encoding ? 'Encoding...' : 'Encode QR into Audio'}
      </button>

      {error && (
        <div className="error-message">
          Error: {error}
        </div>
      )}

      {result && (
        <div className="result-section">
          <h3>Encoding Complete!</h3>
          <p>QR Version: {result.qrData.version}</p>
          <p>Duration: {result.duration.toFixed(1)}s</p>
          <p>Cycles: {result.cycles}</p>
          
          <div className="audio-controls">
            <audio controls src={result.audioUrl} />
            <a 
              href={result.audioUrl} 
              download={result.filename}
              className="download-button"
            >
              Download Encoded Audio
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default QREncoder;