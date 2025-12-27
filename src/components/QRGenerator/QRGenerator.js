import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import './QRGenerator.css';

const QRGenerator = ({ onQRGenerated, qrData }) => {
  const [inputText, setInputText] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const canvasRef = useRef();

  const generateQR = async () => {
    if (!inputText.trim()) return;
    
    try {
      // Generate QR code as data URL
      const url = await QRCode.toDataURL(inputText, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 256
      });
      
      setQrCodeUrl(url);
      onQRGenerated(inputText);
    } catch (error) {
      console.error('Error generating QR code:', error);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    generateQR();
  };

  useEffect(() => {
    if (inputText) {
      generateQR();
    }
  }, [inputText]);

  return (
    <div className="qr-generator">
      <h2>Generate QR Code</h2>
      <form onSubmit={handleSubmit} className="qr-form">
        <div className="input-group">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Enter text to encode in QR code..."
            className="text-input"
            rows="4"
          />
          <button type="submit" className="generate-btn" disabled={!inputText.trim()}>
            Generate QR Code
          </button>
        </div>
      </form>
      
      {qrCodeUrl && (
        <div className="qr-result">
          <h3>Generated QR Code:</h3>
          <img src={qrCodeUrl} alt="Generated QR Code" className="qr-image" />
          <p className="qr-data">Data: {qrData}</p>
        </div>
      )}
    </div>
  );
};

export default QRGenerator;