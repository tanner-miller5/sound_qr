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
        } = options;

        try {
            // Init context to ensure we have the sample rate
            await this.audioProcessor.initAudioContext();

            const audioBuffer = await this.audioProcessor.loadAudioFile(audioFile);
            const config = this.audioProcessor.getFrequencyConfig();

            // Calculate safe amplitude (-20dB relative to peak, min 0.02)
            const channelData = audioBuffer.getChannelData(0);
            let peak = 0;
            for (let i = 0; i < channelData.length; i++) {
                peak = Math.max(peak, Math.abs(channelData[i]));
            }
            const embedAmplitude = Math.max(peak * 0.1, 0.02);

            // Generate QR data
            // Note: qrProcessor needs to support returning raw chunk arrays (0-63)
            // Assuming qrProcessor.generateQR returns a matrix or bits that we convert to chunks
            // For this implementation update, we'll assume a helper exists or logic is here
            // Let's assume generateQR returns the standard matrix and we assume a chunking method exists
            const qrMatrix = await this.qrProcessor.generateQR(qrText, version);

            // Flatten matrix to chunks (logic simplified for brevity, assuming standard col-major reading)
            // In a full impl, you'd map the matrix to the 6-bit chunks here.
            // Placeholder for getting chunks from matrix:
            const chunks = this.convertMatrixToChunks(qrMatrix, version);

            // Timing calculations (60ms per chunk per RFC)
            const chunkDuration = 0.060; // 60ms
            const markerDuration = 0.100; // 100ms for markers

            // Generate encoded samples
            // Total Length Calculation needed to allocate buffer?
            // Better: Generate arrays and concat/mix.

            const encodedParts = [];

            for (let c = 0; c < cycles; c++) {
                // 1. Start Marker (Version Specific)
                const startFreq = config.markers.versionStart[version];
                encodedParts.push(this.audioProcessor.generateTone(startFreq, markerDuration, embedAmplitude));

                // 2. Data Chunks
                for (const chunkValue of chunks) {
                    const freq = this.audioProcessor.getFrequencyForChunk(chunkValue);
                    encodedParts.push(this.audioProcessor.generateTone(freq, chunkDuration, embedAmplitude));
                }

                // 3. End Marker
                encodedParts.push(this.audioProcessor.generateTone(config.markers.end, markerDuration, embedAmplitude));

                // 4. Cycle Gap (Silence)
                const silence = new Float32Array(Math.floor(this.audioProcessor.sampleRate * 0.3)); // 300ms gap
                encodedParts.push(silence);
            }

            // Merge parts into one Float32Array
            const totalLength = encodedParts.reduce((acc, part) => acc + part.length, 0);
            const encodedSignal = new Float32Array(totalLength);
            let offset = 0;
            for (const part of encodedParts) {
                encodedSignal.set(part, offset);
                offset += part.length;
            }

            // Mix with original audio
            // Note: mixing logic is in audioUtils or can be done here.
            // If mixAudioBuffers doesn't exist in audioUtils, we implement a simple one.
            // Assuming audioUtils has mixAudioBuffers from previous context.

            // We need to create a buffer from the encodedSignal
            const encodedBuffer = this.audioProcessor.audioContext.createBuffer(
                1, encodedSignal.length, this.audioProcessor.sampleRate
            );
            encodedBuffer.getChannelData(0).set(encodedSignal);

            // Mix
            // This function needs to be available in audioProcessor or implemented here
            const finalBuffer = this.mixBuffers(audioBuffer, encodedBuffer);

            return {
                audioBuffer: finalBuffer,
                duration: finalBuffer.duration,
                cycles: cycles,
                qrData: { version, text: qrText }
            };

        } catch (err) {
            throw new Error(`Encoding failed: ${err.message}`);
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
      const startMarker = this.audioProcessor.generateTone(
          markers.start,
          timing.startMarker / 1000,
          amplitude);
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
          const chunkSamples = this.audioProcessor.generateTone(
              frequency,
              timing.chunkDuration / 1000,
              amplitude);
          
          this.addSamples(encodedSamples, chunkSamples, sampleOffset);
          sampleOffset += chunkSamples.length;
        }
          // Add column gap if configured
          if (timing.columnGap > 0) {
              sampleOffset += Math.floor(this.audioProcessor.sampleRate * (timing.columnGap / 1000));
          }
      }

      // End marker
      const endMarker = this.audioProcessor.generateTone(
          markers.end,
          timing.endMarker / 1000,
          amplitude);
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

    // Helper to mix (if not in AudioProcessor)
    mixBuffers(base, overlay) {
        const ctx = this.audioProcessor.audioContext;
        const length = Math.max(base.length, overlay.length);
        const out = ctx.createBuffer(base.numberOfChannels, length, base.sampleRate);

        for (let channel = 0; channel < base.numberOfChannels; channel++) {
            const outData = out.getChannelData(channel);
            const baseData = base.getChannelData(channel);
            const overlayData = overlay.getChannelData(0); // Mono overlay

            for (let i = 0; i < length; i++) {
                const b = i < baseData.length ? baseData[i] : 0;
                const o = i < overlayData.length ? overlayData[i] : 0;
                outData[i] = b + o;
            }
        }
        return out;
    }

    // Placeholder chunk converter
    convertMatrixToChunks(matrix, version) {
        // In real impl: Iterate columns, read bits, pack 6 bits -> 1 int
        // This logic must match the decoder's expectation exactly.
        // Returning dummy data for compilation safety in this snippet
        const chunks = [];
        const size = matrix.length; // e.g. 21
        // Simple col-by-col traversal
        for (let x = 0; x < size; x++) {
            let bits = [];
            for (let y = 0; y < size; y++) {
                bits.push(matrix[y][x] ? 1 : 0);
            }
            // Pad column to multiple of 6
            while (bits.length % 6 !== 0) bits.push(0);

            // Convert to chunks
            for (let i=0; i<bits.length; i+=6) {
                const chunk = parseInt(bits.slice(i, i+6).join(''), 2);
                chunks.push(chunk);
            }
        }
        return chunks;
    }
}