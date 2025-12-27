# Sound QR - Project Plan

## Project Overview

Sound QR is a mobile-first web application for encoding QR codes into inaudible sound frequencies and embedding them into existing audio files. The application uses ultrasonic frequencies (above 20kHz) and advanced steganographic techniques to hide QR data without affecting the audible content. The application can also decode QR codes from sound files and use the microphone to record sound and decode QR codes from it in real-time.

## Core Features

### 1. QR Code to Inaudible Sound Encoding
- Generate QR codes from text input
- Convert QR code data into ultrasonic frequency patterns (20kHz-24kHz)
- Embed encoded sound into existing audio files using steganographic techniques
- Advanced spectral masking to ensure inaudibility
- Support multiple audio formats (MP3, WAV, FLAC, etc.)
- Adjustable encoding parameters (frequency range, bit depth, psychoacoustic masking)
- Real-time preview to verify inaudibility

### 2. Inaudible Sound to QR Code Decoding
- Upload audio files for hidden QR code extraction
- Real-time microphone recording and decoding from ultrasonic frequencies
- Advanced signal processing with noise reduction and frequency isolation
- Spectral analysis tools for detecting embedded data
- Visual feedback showing detected QR codes and signal strength
- Export decoded data as text or files

### 3. Audio Steganography Features
- Psychoacoustic masking algorithms
- Spread spectrum techniques for robustness
- Error correction coding for data integrity
- Multiple embedding methods (LSB, DCT, DWT)
- Capacity estimation for host audio files
- Quality assessment tools

### 4. User Interface
- Mobile-responsive design optimized for touch interactions
- Drag-and-drop file upload interface
- Real-time frequency spectrum visualization
- Inaudibility verification tools
- Settings panel for encoding/decoding parameters
- History of encoded/decoded QR codes with audio previews

## Technical Architecture

### Frontend Framework
- **React 19.2.3** - Main UI framework
- **React DOM 19.2.3** - DOM manipulation
- **Create React App** - Development and build tooling

### Core Technologies
- **Web Audio API** - Advanced audio processing and frequency manipulation
- **AudioContext** - Real-time audio processing pipeline
- **MediaDevices API** - High-quality microphone access
- **Canvas API** - QR code generation and spectrum visualization
- **File API** - Audio file upload/download handling
- **Web Workers** - Heavy audio processing without blocking UI

### Audio Processing Techniques
- **Ultrasonic Frequency Encoding** (20kHz-24kHz range)
- **Psychoacoustic Masking** - Hide data below human hearing threshold
- **Spread Spectrum** - Distribute data across frequency bands
- **Error Correction** - Reed-Solomon or BCH codes for data integrity
- **Dynamic Range Compression** - Maintain audio quality
- **Spectral Subtraction** - Noise reduction for decoding

### Key Libraries (To Be Added)
- QR code generation library (`qrcode`, `qrcode-generator`)
- Advanced audio processing (`web-audio-api-rs`, `audioworklet-polyfill`)
- Digital signal processing (`dsp.js`, `ml-matrix`)
- Audio format conversion (`ffmpeg.js`, `audio-encoder`)
- Psychoacoustic modeling library
- Error correction coding library

## Development Phases

### Phase 1: Foundation & Research (Weeks 1-3)
- [x] Project setup with Create React App
- [ ] Research psychoacoustic masking techniques
- [ ] Implement basic ultrasonic frequency generation
- [ ] Basic UI layout and navigation
- [ ] File upload/download functionality
- [ ] QR code generation from text input
- [ ] Frequency spectrum analyzer component

### Phase 2: Steganographic Encoding (Weeks 4-6)
- [ ] Implement ultrasonic QR encoding algorithms
- [ ] Psychoacoustic masking implementation
- [ ] Audio embedding with minimal quality loss
- [ ] Inaudibility verification system
- [ ] Real-time encoding preview
- [ ] Multiple embedding strength levels

### Phase 3: Advanced Decoding (Weeks 7-9)
- [ ] Ultrasonic frequency isolation and filtering
- [ ] Robust QR detection algorithms
- [ ] Real-time microphone processing for high frequencies
- [ ] Noise reduction and signal enhancement
- [ ] Error correction and data validation
- [ ] Performance optimization for mobile devices

### Phase 4: Quality Assurance & Refinement (Weeks 10-12)
- [ ] A/B testing for inaudibility
- [ ] Cross-device compatibility for ultrasonic frequencies
- [ ] Audio quality metrics and validation
- [ ] Advanced error handling
- [ ] User settings for different use cases
- [ ] Comprehensive logging and diagnostics

### Phase 5: Testing & Deployment (Weeks 13-14)
- [ ] Extensive audio quality testing
- [ ] Human hearing tests for inaudibility verification
- [ ] Performance benchmarking across devices
- [ ] Cross-browser ultrasonic frequency support testing
- [ ] User acceptance testing
- [ ] Production deployment with CDN for audio processing

## File Structure