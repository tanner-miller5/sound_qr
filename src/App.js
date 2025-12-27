import React, { useState } from 'react';
import './App.css';
import QRGenerator from './components/QRGenerator/QRGenerator';
import AudioProcessor from './components/AudioProcessor/AudioProcessor';
import FileUpload from './components/FileUpload/FileUpload';
import MicrophoneRecorder from './components/MicrophoneRecorder/MicrophoneRecorder';
import AudioVisualizer from './components/AudioVisualizer/AudioVisualizer';
import Navigation from './components/Navigation/Navigation';

function App() {
  const [activeTab, setActiveTab] = useState('encode');
  const [qrData, setQrData] = useState('');
  const [audioFile, setAudioFile] = useState(null);
  const [audioContext, setAudioContext] = useState(null);
  const [decodedData, setDecodedData] = useState('');

  const initializeAudioContext = () => {
    if (!audioContext) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      setAudioContext(ctx);
      return ctx;
    }
    return audioContext;
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Sound QR</h1>
        <p>Inaudible QR Code Audio Embedding</p>
      </header>
      
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
      
      <main className="App-main">
        {activeTab === 'encode' && (
          <div className="encode-section">
            <QRGenerator 
              onQRGenerated={setQrData}
              qrData={qrData}
            />
            {qrData && (
              <>
                <FileUpload 
                  onFileSelected={setAudioFile}
                  accept="audio/*"
                  label="Select audio file to embed QR code"
                />
                {audioFile && (
                  <AudioProcessor
                    qrData={qrData}
                    audioFile={audioFile}
                    mode="encode"
                    audioContext={initializeAudioContext()}
                  />
                )}
              </>
            )}
          </div>
        )}
        
        {activeTab === 'decode' && (
          <div className="decode-section">
            <FileUpload 
              onFileSelected={setAudioFile}
              accept="audio/*"
              label="Select audio file to decode QR code"
            />
            {audioFile && (
              <AudioProcessor
                audioFile={audioFile}
                mode="decode"
                audioContext={initializeAudioContext()}
                onDecoded={setDecodedData}
              />
            )}
            {decodedData && (
              <div className="decoded-result">
                <h3>Decoded QR Data:</h3>
                <p>{decodedData}</p>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'live' && (
          <div className="live-section">
            <MicrophoneRecorder
              audioContext={initializeAudioContext()}
              onDecoded={setDecodedData}
            />
            <AudioVisualizer audioContext={audioContext} />
            {decodedData && (
              <div className="decoded-result">
                <h3>Live Decoded QR Data:</h3>
                <p>{decodedData}</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
