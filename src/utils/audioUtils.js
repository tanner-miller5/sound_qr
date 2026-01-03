// Audio processing utilities for Sound QR
export class AudioProcessor {
  constructor() {
    this.audioContext = null;
    this.sampleRate = 44100;
  }

  async initAudioContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Resume context if it's suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      this.sampleRate = this.audioContext.sampleRate;
      console.log(`Audio context initialized: ${this.sampleRate}Hz`);
    }
    return this.audioContext;
  }

  async loadAudioFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    await this.initAudioContext();
    return await this.audioContext.decodeAudioData(arrayBuffer);
  }

  // Generate frequency grid (15,200 - 17,090 Hz, 30 Hz steps)
  getFrequencyGrid() {
    const frequencies = [];
    const baseFreq = 15200;
    const stepSize = 30;
    
    for (let i = 0; i < 64; i++) {
      frequencies.push(baseFreq + (i * stepSize));
    }
    return frequencies;
  }

  // Get boundary marker frequencies for QR versions
  getBoundaryMarkers() {
    return {
      1: { start: 14000, end: 14100 },
      2: { start: 14200, end: 14300 },
      3: { start: 14400, end: 14500 },
      4: { start: 14600, end: 14700 },
      5: { start: 14800, end: 14900 }
    };
  }

  // Generate sine wave at specific frequency
  generateTone(frequency, duration, amplitude = 0.1) {
    const sampleCount = Math.floor(this.sampleRate * duration);
    const samples = new Float32Array(sampleCount);
    
    for (let i = 0; i < sampleCount; i++) {
      const t = i / this.sampleRate;
      samples[i] = amplitude * Math.sin(2 * Math.PI * frequency * t);
    }
    
    return samples;
  }

  // Detect frequency in audio buffer using FFT
  async detectFrequency(audioBuffer, startTime, duration, targetFrequency, tolerance = 10) {
    const startSample = Math.floor(startTime * this.sampleRate);
    const sampleCount = Math.floor(duration * this.sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    
    // Extract segment
    const segment = channelData.slice(startSample, startSample + sampleCount);
    
    // Simple frequency detection using correlation
    const frequencies = this.getFrequencyGrid();
    let maxCorrelation = 0;
    let detectedFreq = null;
    
    for (const freq of frequencies) {
      if (Math.abs(freq - targetFrequency) <= tolerance) {
        const correlation = this.correlateWithFrequency(segment, freq);
        if (correlation > maxCorrelation) {
          maxCorrelation = correlation;
          detectedFreq = freq;
        }
      }
    }
    
    return { frequency: detectedFreq, strength: maxCorrelation };
  }

  correlateWithFrequency(samples, frequency) {
    if (!samples || samples.length === 0) return 0;
    
    try {
      // Use both sine and cosine components for better detection
      let sumSin = 0;
      let sumCos = 0;
      const omega = 2 * Math.PI * frequency / this.sampleRate;
      const maxSamples = Math.min(samples.length, Math.floor(this.sampleRate * 0.01)); // 10ms max
      
      // Apply windowing to reduce noise
      for (let i = 0; i < maxSamples; i++) {
        const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (maxSamples - 1)); // Hann window
        const windowedSample = samples[i] * window;
        
        sumSin += windowedSample * Math.sin(omega * i);
        sumCos += windowedSample * Math.cos(omega * i);
      }
      
      // Calculate magnitude (power) instead of just sine component
      const magnitude = Math.sqrt(sumSin * sumSin + sumCos * sumCos) / maxSamples;
      return magnitude;
      
    } catch (error) {
      console.warn(`Correlation error for ${frequency}Hz: ${error.message}`);
      return 0;
    }
  }

// Fix AudioBuffer creation for browser compatibility
    mixAudioBuffers(originalBuffer, encodedSamples, amplitude = 0.1) {
        // Ensure audio context is available
        if (!this.audioContext) {
            throw new Error('Audio context not initialized. Call initAudioContext() first.');
        }

        // Create new buffer with same properties as original
        const mixed = this.audioContext.createBuffer(
            originalBuffer.numberOfChannels,
            Math.max(originalBuffer.length, encodedSamples.length),
            originalBuffer.sampleRate
        );

        // Copy original audio and add encoded data
        for (let channel = 0; channel < originalBuffer.numberOfChannels; channel++) {
            const originalData = originalBuffer.getChannelData(channel);
            const mixedData = mixed.getChannelData(channel);

            // Copy original audio
            for (let i = 0; i < originalData.length; i++) {
                mixedData[i] = originalData[i];
            }

            // Add encoded data to left channel (or mono channel)
            if (channel === 0) {
                for (let i = 0; i < encodedSamples.length && i < mixedData.length; i++) {
                    mixedData[i] += encodedSamples[i] * amplitude;
                }
            }
        }

        return mixed;
    }

// Improved frequency detection using FFT-based approach
    async detectFrequencyFFT(audioBuffer, startTime, duration, targetFrequency, tolerance = 10) {
        const startSample = Math.floor(startTime * this.sampleRate);
        const sampleCount = Math.floor(duration * this.sampleRate);
        const channelData = audioBuffer.getChannelData(0);

        // Extract segment
        const segment = channelData.slice(startSample, startSample + sampleCount);

        // Apply windowing to reduce spectral leakage
        const windowedSegment = this.applyHammingWindow(segment);

        // Compute FFT
        const fftSize = this.nextPowerOfTwo(sampleCount);
        const fft = this.computeFFT(windowedSegment, fftSize);

        // Find frequency bin corresponding to target frequency
        const binSize = this.sampleRate / fftSize;
        const targetBin = Math.round(targetFrequency / binSize);

        // Check magnitude in target frequency range
        let maxMagnitude = 0;
        const binTolerance = Math.ceil(tolerance / binSize);

        for (let bin = targetBin - binTolerance; bin <= targetBin + binTolerance; bin++) {
            if (bin >= 0 && bin < fft.length / 2) {
                const magnitude = Math.sqrt(fft[bin * 2] ** 2 + fft[bin * 2 + 1] ** 2);
                maxMagnitude = Math.max(maxMagnitude, magnitude);
            }
        }

        return { frequency: targetFrequency, strength: maxMagnitude };
    }

    applyHammingWindow(samples) {
        const windowed = new Float32Array(samples.length);
        for (let i = 0; i < samples.length; i++) {
            const window = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (samples.length - 1));
            windowed[i] = samples[i] * window;
        }
        return windowed;
    }

    nextPowerOfTwo(n) {
        return Math.pow(2, Math.ceil(Math.log2(n)));
    }

// Simple FFT implementation (for better results, consider using a library like FFT.js)
    computeFFT(samples, fftSize) {
        // Pad with zeros if necessary
        const paddedSamples = new Float32Array(fftSize);
        for (let i = 0; i < Math.min(samples.length, fftSize); i++) {
            paddedSamples[i] = samples[i];
        }

        // Simple DFT implementation (replace with proper FFT for better performance)
        const result = new Float32Array(fftSize * 2);

        for (let k = 0; k < fftSize / 2; k++) {
            let real = 0, imag = 0;
            for (let n = 0; n < fftSize; n++) {
                const angle = -2 * Math.PI * k * n / fftSize;
                real += paddedSamples[n] * Math.cos(angle);
                imag += paddedSamples[n] * Math.sin(angle);
            }
            result[k * 2] = real;
            result[k * 2 + 1] = imag;
        }

        return result;
    }


// Fast frequency detection using Web Audio API's built-in FFT
    async detectFrequencyFast(audioBuffer, startTime, duration, targetFrequency, tolerance = 10) {
        if (!this.analyser) {
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.freqData = new Float32Array(this.analyser.frequencyBinCount);
        }

        const startSample = Math.floor(startTime * audioBuffer.sampleRate);
        const sampleCount = Math.floor(duration * audioBuffer.sampleRate);
        const segment = audioBuffer.getChannelData(0).slice(startSample, startSample + sampleCount);

        // Create temporary buffer source for analysis
        const tempBuffer = this.audioContext.createBuffer(1, segment.length, audioBuffer.sampleRate);
        tempBuffer.copyToChannel(segment, 0);

        const source = this.audioContext.createBufferSource();
        source.buffer = tempBuffer;
        source.connect(this.analyser);

        // Get frequency data
        this.analyser.getFloatFrequencyData(this.freqData);

        // Calculate target frequency bin
        const binSize = audioBuffer.sampleRate / this.analyser.fftSize;
        const targetBin = Math.round(targetFrequency / binSize);
        const binTolerance = Math.ceil(tolerance / binSize);

        let maxMagnitude = -Infinity;
        for (let i = Math.max(0, targetBin - binTolerance);
             i <= Math.min(this.freqData.length - 1, targetBin + binTolerance); i++) {
            maxMagnitude = Math.max(maxMagnitude, this.freqData[i]);
        }

        source.disconnect();
        return { frequency: targetFrequency, strength: Math.pow(10, maxMagnitude / 20) };
    }

// Simplified correlation for basic detection
    correlateWithFrequencyFast(samples, frequency) {
  if (!samples || samples.length === 0) return 0;
  
  try {
    const omega = 2 * Math.PI * frequency / this.sampleRate;
    let sumSin = 0, sumCos = 0;
    const step = Math.max(1, Math.floor(samples.length / 100)); // Reduce computation
    let sampleCount = 0;
    
    for (let i = 0; i < samples.length; i += step) {
      const sinVal = Math.sin(omega * i);
      const cosVal = Math.cos(omega * i);
      sumSin += samples[i] * sinVal;
      sumCos += samples[i] * cosVal;
      sampleCount++;
    }
    
    const magnitude = Math.sqrt(sumSin * sumSin + sumCos * sumCos) / sampleCount;
    return magnitude;
  } catch (error) {
    console.warn(`Fast correlation error for ${frequency}Hz: ${error.message}`);
    return 0;
  }
}
// Add the missing correlateWithFrequency method
correlateWithFrequency(samples, targetFrequency) {
    if (!samples || samples.length === 0) return 0;
    
    const sampleRate = this.sampleRate || 48000;
    let correlation = 0;
    const length = Math.min(samples.length, Math.floor(sampleRate * 0.01)); // Max 10ms
    
    // Simple correlation with sine wave
    for (let i = 0; i < length; i++) {
        const phase = 2 * Math.PI * targetFrequency * i / sampleRate;
        correlation += samples[i] * Math.sin(phase);
    }
    
    return Math.abs(correlation) / length;
}

// Also ensure the frequency grid method exists
getFrequencyGrid() {
    // Should generate: 15200, 15230, 15260, ..., 17090
    const frequencies = Array.from({length: 64}, (_, i) => 15200 + (i * 30));
    
    return frequencies;
}

// Ensure boundary markers method exists
getBoundaryMarkers() {
    return {
        1: { start: 14000, end: 14100 },
        2: { start: 14200, end: 14300 },
        3: { start: 14400, end: 14500 },
        4: { start: 14600, end: 14700 },
        5: { start: 14800, end: 14900 }
    };
}
}