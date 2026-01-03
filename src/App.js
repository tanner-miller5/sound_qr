import React, { useState } from 'react';
import './App.css';
import QREncoder from './components/QREncoder';
import QRDecoder from './components/QRDecoder';

function App() {
  const [activeTab, setActiveTab] = useState('encode');

  return (
    <div className="App">
      <header className="App-header">
        <h1>Sound QR</h1>
        <p>Encode and decode QR codes in audio files</p>
      </header>

      <main className="App-main">
        <div className="tab-navigation">
          <button 
            className={`tab-button ${activeTab === 'encode' ? 'active' : ''}`}
            onClick={() => setActiveTab('encode')}
          >
            Encode
          </button>
          <button 
            className={`tab-button ${activeTab === 'decode' ? 'active' : ''}`}
            onClick={() => setActiveTab('decode')}
          >
            Decode
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'encode' && <QREncoder />}
          {activeTab === 'decode' && <QRDecoder />}
        </div>
      </main>
    </div>
  );
}

export default App;
