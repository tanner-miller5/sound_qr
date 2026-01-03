import { AudioProcessor } from './audioUtils';
import { QRProcessor } from './qrUtils';

export class SoundQREncoder {
  constructor() {
    this.audioProcessor = new AudioProcessor();
    this.qrProcessor = new QRProcessor();
  }

  async encode(audioFile, qrText, options = {}) {
    const {
      version = 1,
      cycles = 3,
      // Remove amplitude parameter - calculate from audio peak
    } = options;

  try {
    // Load and process audio
    const audioBuffer = await this.audioProcessor.loadAudioFile(audioFile); // Fixed: use audioFile parameter
    
    // Calculate original audio peak for -20dB relative amplitude
    const channelData = audioBuffer.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < channelData.length; i++) {
      peak = Math.max(peak, Math.abs(channelData[i]));
    }
    
    // Calculate -20dB relative amplitude
    const embedAmplitude = peak * 0.1; // -20dB = 10^(-20/20) = 0.1
    
    // Generate QR code
    const qrData = await this.qrProcessor.generateQR(qrText, version);
    
    // Calculate timing requirements
    const timing = this.qrProcessor.getCycleTiming(version);
    const requiredDuration = timing.totalTime * cycles / 1000;
    
    if (audioBuffer.duration < requiredDuration) {
      throw new Error(`Audio too short. Requires ${requiredDuration.toFixed(1)}s, got ${audioBuffer.duration.toFixed(1)}s`);
    }

    // Encode QR data into audio with calculated amplitude
    const encodedSamples = await this.encodeQRIntoAudio(qrData, cycles, embedAmplitude);
    
    // Mix with original audio (no additional amplitude scaling)
    const mixedBuffer = this.audioProcessor.mixAudioBuffers(audioBuffer, encodedSamples, 1.0);
    
    return {
      audioBuffer: mixedBuffer,
      qrData,
      timing,
      cycles,
      duration: requiredDuration,
      embedAmplitude // For debugging
    };
    
  } catch (error) {
    throw new Error(`Encoding failed: ${error.message}`);
  }
}
  // In encodeQRIntoAudio method, add debugging to verify frequency generation:
async encodeQRIntoAudio(qrData, cycles, amplitude) {
    const { matrix, version } = qrData;
    const markers = this.audioProcessor.getBoundaryMarkers()[version];
    const frequencies = this.audioProcessor.getFrequencyGrid();
    const timing = this.qrProcessor.getCycleTiming(version);
    
    // DEBUG: Log frequency grid
    console.log('Frequency grid:', frequencies.slice(0, 5), '...', frequencies.slice(-5));
    console.log('Expected frequencies for first column:');
    console.log('  Chunk 0 (63):', frequencies[63]);
    console.log('  Chunk 1 (47):', frequencies[47]);  
    console.log('  Chunk 2 (15):', frequencies[15]);
    console.log('  Chunk 3 (56):', frequencies[56]);
    
    const totalSamples = Math.floor(this.audioProcessor.sampleRate * timing.totalTime * cycles / 1000);
    const encodedSamples = new Float32Array(totalSamples);
    
    let sampleOffset = 0;

    for (let cycle = 0; cycle < cycles; cycle++) {
      // Start marker
      const startMarker = this.audioProcessor.generateTone(markers.start, 0.1, amplitude);
      console.log(`Cycle ${cycle}: Start marker ${markers.start}Hz, ${startMarker.length} samples, amplitude ${amplitude}`);
      this.addSamples(encodedSamples, startMarker, sampleOffset);
      sampleOffset += startMarker.length;

      // Encode each column  
      for (let col = 0; col < matrix.length; col++) {
        const chunks = this.qrProcessor.processColumn(matrix, col, version);
        
        // DEBUG first column only
        if (col === 0 && cycle === 0) {
          console.log(`Encoding column ${col}, chunks:`, chunks);
          for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            const frequency = frequencies[chunks[chunkIndex]];
            console.log(`  Chunk ${chunkIndex}: value ${chunks[chunkIndex]} → ${frequency}Hz`);
          }
        }
        
        // Encode each chunk in column
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
          const frequency = frequencies[chunks[chunkIndex]];
          const chunkSamples = this.audioProcessor.generateTone(frequency, 0.01, amplitude);
          
          this.addSamples(encodedSamples, chunkSamples, sampleOffset);
          sampleOffset += chunkSamples.length;
        }
      }

      // End marker
      const endMarker = this.audioProcessor.generateTone(markers.end, 0.1, amplitude);
      this.addSamples(encodedSamples, endMarker, sampleOffset);
      sampleOffset += endMarker.length;

      // Gap (silence)
      sampleOffset += Math.floor(this.audioProcessor.sampleRate * 0.1); // 100ms gap
    }

    return encodedSamples;
}

  addSamples(targetBuffer, sourceBuffer, offset) {
    for (let i = 0; i < sourceBuffer.length && offset + i < targetBuffer.length; i++) {
      targetBuffer[offset + i] += sourceBuffer[i];
    }
  }
}