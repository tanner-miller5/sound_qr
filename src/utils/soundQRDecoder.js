import { AudioProcessor } from './audioUtils';
import { QRProcessor } from './qrUtils';

class SoundQRDecoder {
  constructor() {
    this.audioProcessor = new AudioProcessor();
    this.qrProcessor = new QRProcessor();
  }

    async decode(audioBuffer, options = {}) {
        const { maxProcessingTime = 30000, isLive = false } = options;
        try {
            await this.audioProcessor.initAudioContext();
            const config = this.audioProcessor.getFrequencyConfig();

            // 1. Detect Cycles
            const detectionResult = await this.detectValidCycles(audioBuffer, config);

            let validCycles = [];
            let maxFreq = 0;

            if (Array.isArray(detectionResult)) {
                validCycles = detectionResult;
            } else if (detectionResult && Array.isArray(detectionResult.cycles)) {
                validCycles = detectionResult.cycles;
                maxFreq = detectionResult.maxFreq;
            }

            if (validCycles.length === 0) {
                const err = new Error('No valid Sound-QR cycles detected.');
                err.maxFreqDetected = maxFreq;
                throw err;
            }

            if (!isLive) console.log(`Found ${validCycles.length} potential cycles. Decoding...`);

            // 2. Decode Cycles
            for (const cycle of validCycles) {
                // Refine Alignment
                const preciseStartTime = this.refineCycleAlignment(audioBuffer, cycle, config);

                if (!isLive) {
                    console.log(`Processing Cycle: Version ${cycle.version} at ${cycle.startTime.toFixed(3)}s`);
                    console.log(`  -> Alignment: ${cycle.startTime.toFixed(4)}s => ${preciseStartTime.toFixed(4)}s`);
                }

                // Decode
                const result = await this.decodeCycle(audioBuffer, { ...cycle, startTime: preciseStartTime }, config);

                if (result) {
                    return {
                        ...result,
                        cyclesFound: validCycles.length
                    };
                }
            }

            throw new Error('Cycles found but decoding failed.');

        } catch (error) {
            if (!isLive) console.error(error);
            throw error;
        }
    }

    async detectValidCycles(audioBuffer, config) {
        const data = audioBuffer.getChannelData(0);
        const sr = audioBuffer.sampleRate;
        const cycles = [];
        const windowSize = Math.floor(sr * 0.1); // 100ms
        const step = Math.floor(windowSize / 2);

        let globalMaxEnergy = 0;
        let maxFreqFound = 0;

        // 1. Quick noise floor scan
        const scanStep = Math.floor(sr * 0.5);
        for (let i = 0; i < data.length - windowSize; i += scanStep) {
            const chunk = data.slice(i, i + windowSize);
            const e1 = this.calculateFrequencyStrength(chunk, config.markers.versionStart[1], sr);

            if (e1 > globalMaxEnergy) globalMaxEnergy = e1;
            if (e1 > 0.001) maxFreqFound = Math.max(maxFreqFound, config.markers.versionStart[1]);
        }

        //const threshold = Math.max(0.005, globalMaxEnergy * 0.3); // Lower threshold slightly
        const threshold = config?.isLive ? 0.002 : 0.005; // Use 0.002 for live mic
        // 2. Detailed Scan
        for (let i = 0; i < data.length - windowSize; i += step) {
            const windowData = data.slice(i, i + windowSize);

            for (let v = 1; v <= 5; v++) {
                const markerFreq = config.markers.versionStart[v];
                const energy = this.calculateFrequencyStrength(windowData, markerFreq, sr);

                if (energy > threshold) {
                    const time = i / sr;
                    if (!cycles.some(c => Math.abs(c.startTime - time) < 0.8)) {
                        cycles.push({
                            version: v,
                            startTime: time,
                            confidence: energy
                        });
                    }
                }
            }
        }

        return { cycles, maxFreq: maxFreqFound };
    }

    refineCycleAlignment(audioBuffer, cycle, config) {
        const sr = audioBuffer.sampleRate;
        const data = audioBuffer.getChannelData(0);

        // We initially found the start roughly. The marker is 100ms long.
        // We want to center our read head such that we are in the middle of that 100ms block.
        // Scan a wider range: -100ms to +100ms
        const centerSample = Math.floor(cycle.startTime * sr);
        const searchRange = Math.floor(sr * 0.1);
        const startIdx = Math.max(0, centerSample - searchRange);
        const endIdx = Math.min(data.length, centerSample + searchRange);

        const markerFreq = config.markers.versionStart[cycle.version];
        const windowLen = Math.floor(sr * 0.1); // 100ms window

        let maxEnergy = -1;
        let bestSampleIndex = centerSample;

        // Coarse scan first
        const coarseStep = Math.floor(sr * 0.005); // 5ms
        for (let i = startIdx; i < endIdx - windowLen; i += coarseStep) {
            const chunk = data.slice(i, i + windowLen);
            const energy = this.calculateFrequencyStrength(chunk, markerFreq, sr);
            if (energy > maxEnergy) {
                maxEnergy = energy;
                bestSampleIndex = i;
            }
        }

        // Fine scan around best coarse spot (+/- 10ms)
        const fineRange = Math.floor(sr * 0.01);
        const fineStart = Math.max(0, bestSampleIndex - fineRange);
        const fineEnd = Math.min(data.length, bestSampleIndex + fineRange);

        for (let i = fineStart; i < fineEnd; i += Math.floor(sr*0.001)) { // 1ms
            const chunk = data.slice(i, i + windowLen);
            const energy = this.calculateFrequencyStrength(chunk, markerFreq, sr);
            if (energy > maxEnergy) {
                maxEnergy = energy;
                bestSampleIndex = i;
            }
        }

        return bestSampleIndex / sr;
    }

  // Emergency detection for very weak signals
  async emergencyDetection(channelData, sampleRate, versionPriorities) {
    console.log('🚨 EMERGENCY DETECTION MODE');
    
    const boundaryMarkers = this.audioProcessor.getBoundaryMarkers();
    const validCycles = [];
    
    // Try every possible position with tiny windows
    const windowSize = Math.floor(sampleRate * 0.02); // 20ms windows
    const stepSize = Math.floor(sampleRate * 0.01); // 10ms steps
    const maxWindows = Math.floor((channelData.length - windowSize) / stepSize);
    
    // Use absolute minimum threshold
    const emergencyThreshold = 0.000001;
    
    console.log(`Emergency scan: ${maxWindows} windows, threshold: ${emergencyThreshold.toFixed(8)}`);
    
    for (let windowIndex = 0; windowIndex < Math.min(maxWindows, 100); windowIndex++) { // Limit for performance
      const startSample = windowIndex * stepSize;
      const windowData = channelData.slice(startSample, startSample + windowSize);
      
      // Test version 1 specifically (since that's what we're encoding)
      const version = 1;
      const markers = boundaryMarkers[version];
      
      const startMarkerStrength = this.calculateFrequencyStrength(windowData, markers.start, sampleRate);
      
      if (startMarkerStrength > emergencyThreshold) {
        console.log(`🚨 Emergency detection found signal: ${startMarkerStrength.toFixed(8)} at ${(startSample / sampleRate).toFixed(2)}s`);
        
        // Create a basic cycle result
        validCycles.push({
          version: version,
          startSample: startSample,
          startTime: startSample / sampleRate,
          confidence: startMarkerStrength * 10, // Boost confidence
          startMarkerStrength: startMarkerStrength,
          endMarkerStrength: 0,
          dataFrequencyCount: 1,
          cycleLength: Math.floor(sampleRate * 2.805 / 1000) // Expected cycle length
        });
      }
    }
    
    console.log(`🚨 Emergency detection found ${validCycles.length} candidates`);
    return validCycles.slice(0, 3);
  }

  // More comprehensive cycle analysis
  async analyzeCycleExtensive(channelData, startSample, version, sampleRate, threshold) {
    try {
      const markers = this.audioProcessor.getBoundaryMarkers()[version];
      const timing = this.qrProcessor.getCycleTiming(version);
      
      // Calculate expected cycle length in samples
      const expectedCycleSamples = Math.floor(sampleRate * timing.totalTime / 1000);
      const endSample = startSample + expectedCycleSamples;


        // FIX: Require at least 95% of the cycle to be present
        // If the cycle runs off the end of the file, ignore it
        if (endSample > channelData.length) {
            // Allow a tiny margin of error, but not 20%
            if (channelData.length - startSample < expectedCycleSamples * 0.95) {
                return null;
            }
        }

      if (endSample - startSample < expectedCycleSamples * 0.5) {
        return null; // Not enough data for even half a cycle
      }
      
      const cycleData = channelData.slice(startSample, endSample);
      
      // Look for start marker (first 100ms)
      const startMarkerSamples = Math.floor(sampleRate * 0.1);
      const startMarkerData = cycleData.slice(0, Math.min(startMarkerSamples, cycleData.length));
      const startMarkerStrength = this.calculateFrequencyStrength(startMarkerData, markers.start, sampleRate);
      
      // Look for end marker (if we have enough data)
      let endMarkerStrength = 0;
      if (cycleData.length > expectedCycleSamples * 0.7) {
        const endMarkerStart = Math.max(0, cycleData.length - startMarkerSamples);
        const endMarkerData = cycleData.slice(endMarkerStart);
        endMarkerStrength = this.calculateFrequencyStrength(endMarkerData, markers.end, sampleRate);
      }
      
      // Look for data frequencies throughout the cycle
      const frequencies = this.audioProcessor.getFrequencyGrid();
      let dataFreqCount = 0;
      let totalDataStrength = 0;
      
      // Sample multiple points throughout the cycle for data frequencies
      const numSamples = Math.min(10, frequencies.length);
      const sampleStep = Math.floor(cycleData.length / 10);
      
      for (let i = 0; i < numSamples && i * sampleStep < cycleData.length; i++) {
        const sampleStart = i * sampleStep;
        const sampleEnd = Math.min(sampleStart + Math.floor(sampleRate * 0.01), cycleData.length); // 10ms sample
        const sampleData = cycleData.slice(sampleStart, sampleEnd);
        
        for (let j = 0; j < Math.min(5, frequencies.length); j++) {
          const freq = frequencies[j];
          const strength = this.calculateFrequencyStrength(sampleData, freq, sampleRate);
          
          if (strength > threshold * 0.1) { // Very low threshold for data
            dataFreqCount++;
            totalDataStrength += strength;
          }
        }
      }
      
      // Calculate confidence with multiple factors
      let confidence = 0;
      
      // Start marker contribution (40%)
      if (startMarkerStrength > threshold) {
        confidence += (startMarkerStrength / threshold) * 0.4;
      }
      
      // End marker contribution (20%)
      if (endMarkerStrength > threshold) {
        confidence += (endMarkerStrength / threshold) * 0.2;
      }
      
      // Data frequencies contribution (30%)
      if (dataFreqCount > 0) {
        const dataScore = Math.min(dataFreqCount / 20, 1.0); // Normalize to max 20 detections
        confidence += dataScore * 0.3;
      }
      
      // Length bonus (10%)
      if (cycleData.length >= expectedCycleSamples * 0.8) {
        confidence += 0.1;
      }
      
      if (confidence > 0.001) {
        console.log(`📊 Cycle analysis: start=${startMarkerStrength.toFixed(6)}, end=${endMarkerStrength.toFixed(6)}, data=${dataFreqCount}, confidence=${confidence.toFixed(4)}`);
        return {
          confidence: confidence,
          startMarkerStrength: startMarkerStrength,
          endMarkerStrength: endMarkerStrength,
          dataFrequencyCount: dataFreqCount,
          cycleLength: cycleData.length,
          totalDataStrength: totalDataStrength
        };
      }
      
      return null;
      
    } catch (error) {
      console.warn(`Extensive cycle analysis failed: ${error.message}`);
      return null;
    }
  }

    calculateFrequencyStrength(samples, frequency, sampleRate) {
        const k = 0.5 + ((samples.length * frequency) / sampleRate);
        const omega = (2.0 * Math.PI * k) / samples.length;
        const cosine = Math.cos(omega);
        const coeff = 2.0 * cosine;
        let q0 = 0, q1 = 0, q2 = 0;

        // Unrolled loop for slight perf boost if needed, but V8 handles this well
        for (let i = 0; i < samples.length; i++) {
            q0 = (coeff * q1) - q2 + samples[i];
            q2 = q1;
            q1 = q0;
        }

        // Standard Goertzel magnitude
        const magnitude = Math.sqrt(q1 * q1 + q2 * q2 - q1 * q2 * coeff) / samples.length;
        // --- DEBUG LOGS START ---
// Only log if we see *any* significant energy to avoid spamming console
        if (magnitude > 0.0001) {
            console.log(`🔍 Freq: ${frequency}Hz | Mag: ${magnitude.toFixed(5)}`);
        }
// --- DEBUG LOGS END ---
        return magnitude
    }

    async decodeCycle(audioBuffer, cycle, config) {
        const version = cycle.version;
        const matrixSize = 21 + (version - 1) * 4;
        const rows = matrixSize;
        const cols = matrixSize;
        const chunksPerCol = Math.ceil(rows / 6);
        const chunkDuration = 0.060;
        const markerDuration = 0.100;

        let decodedMatrix = Array(rows).fill().map(() => Array(cols).fill(0));

        // Offset: Move past the start marker
        // We add a tiny buffer (5ms) to ensure we are fully inside the data block
        let currentTime = cycle.startTime + markerDuration + 0.005;

        const sampleRate = audioBuffer.sampleRate;
        const data = audioBuffer.getChannelData(0);

        const totalDurationNeeded = (cols * chunksPerCol * chunkDuration);
        if (currentTime + totalDurationNeeded > audioBuffer.duration) return null;

        for (let col = 0; col < cols; col++) {
            let colBits = "";
            for (let ch = 0; ch < chunksPerCol; ch++) {
                // Read center 40ms of the 60ms chunk
                const bufferSafety = 0.010;
                const startSample = Math.floor((currentTime + bufferSafety) * sampleRate);
                const endSample = Math.floor((currentTime + chunkDuration - bufferSafety) * sampleRate);
                const chunkData = data.slice(startSample, endSample);

                const detectedVal = this.detectChunkValue(chunkData, sampleRate, config);
                const bin = detectedVal.toString(2).padStart(6, '0');
                colBits += bin;
                currentTime += chunkDuration;
            }

            for (let r = 0; r < rows; r++) {
                // Protect against overflow if calculation is slightly off
                if (r < colBits.length) {
                    decodedMatrix[r][col] = parseInt(colBits[r], 10);
                }
            }
        }

        // VISUAL DEBUG: Print matrix to console
        /*
        const visual = decodedMatrix.map(row => row.map(b => b ? '██' : '  ').join('')).join('\n');
        console.log(`\nReconstructed Matrix V${version}:\n` + visual);
        */

        return await this.qrProcessor.decodeMatrix(decodedMatrix, version);
    }

    detectChunkValue(samples, sampleRate, config) {
        let maxEnergy = -1;
        let bestValue = 0;

        // Optimization: Check only the 64 bins
        for (let val = 0; val < 64; val++) {
            const targetFreq = config.dataStart + (val * config.step);
            const energy = this.calculateFrequencyStrength(samples, targetFreq, sampleRate);

            if (energy > maxEnergy) {
                maxEnergy = energy;
                bestValue = val;
            }
        }

        // Noise Gate: If the strongest signal is still incredibly weak, it's probably 0 (or noise)
        // But 0 is a valid value. In a real system we'd check SNR.
        // For now, simple max winner takes all is the most robust strategy for low SNR.
        return bestValue;
    }

    // FIXED: Proper chunk to matrix conversion
    chunksToMatrixColumn(chunks, matrix, col, spec) {
        for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
            const chunkValue = chunks[chunkIdx];
            const startRow = chunkIdx * spec.chunkSize;

            // Convert chunk value to binary and populate matrix
            for (let bit = 0; bit < spec.chunkSize && startRow + bit < spec.size; bit++) {
                const row = startRow + bit;
                if (row < matrix.length && col < matrix[row].length) {
                    // Extract bit from chunk value (LSB first)
                    matrix[row][col] = (chunkValue >> bit) & 1;
                }
            }
        }
    }

    // Try alternative decoding methods
    async tryAlternativeDecodings(originalChunks, spec) {
        console.log('🔄 Trying alternative decodings...');

        // Alternative 1: Different bit ordering
        const matrix1 = this.createMatrixFromChunks(originalChunks, spec, 'msb-first');
        let result = await this.qrProcessor.decodeQRMatrix(matrix1);
        if (result) {
            console.log('✅ MSB-first ordering worked!');
            return result;
        }

        // Alternative 2: Frequency index interpretation
        const matrix2 = this.createMatrixFromChunks(originalChunks, spec, 'freq-direct');
        result = await this.qrProcessor.decodeQRMatrix(matrix2);
        if (result) {
            console.log('✅ Direct frequency mapping worked!');
            return result;
        }

        // Alternative 3: Inverted bits
        const matrix3 = this.createMatrixFromChunks(originalChunks, spec, 'inverted');
        result = await this.qrProcessor.decodeQRMatrix(matrix3);
        if (result) {
            console.log('✅ Inverted bits worked!');
            return result;
        }

        return null;
    }

    createMatrixFromChunks(chunks, spec, method = 'lsb-first') {
        const matrix = [];

        // Initialize matrix
        for (let row = 0; row < spec.size; row++) {
            matrix[row] = new Array(spec.size).fill(0);
        }

        let chunkIndex = 0;
        const chunksPerColumn = Math.ceil(spec.size / spec.chunkSize);

        for (let col = 0; col < spec.size; col++) {
            for (let chunkInCol = 0; chunkInCol < chunksPerColumn; chunkInCol++) {
                if (chunkIndex >= chunks.length) break;

                const chunkValue = chunks[chunkIndex];
                const startRow = chunkInCol * spec.chunkSize;

                for (let bit = 0; bit < spec.chunkSize && startRow + bit < spec.size; bit++) {
                    const row = startRow + bit;
                    let bitValue;

                    switch (method) {
                        case 'msb-first':
                            // Most significant bit first
                            bitValue = (chunkValue >> (spec.chunkSize - 1 - bit)) & 1;
                            break;
                        case 'freq-direct':
                            // Use frequency index directly as binary pattern
                            bitValue = (chunkValue > (64 / 2)) ? 1 : 0;
                            break;
                        case 'inverted':
                            // Inverted LSB first
                            bitValue = 1 - ((chunkValue >> bit) & 1);
                            break;
                        default: // 'lsb-first'
                            bitValue = (chunkValue >> bit) & 1;
                            break;
                    }

                    if (row < matrix.length && col < matrix[row].length) {
                        matrix[row][col] = bitValue;
                    }
                }
                chunkIndex++;
            }
        }

        return matrix;
    }

  // Other utility methods...
  async assessDeviceCapability() {
    const testFrequencies = [14500, 15500, 16500, 17100];
    const responses = [];
    
    for (const freq of testFrequencies) {
      try {
        const testTone = this.audioProcessor.generateTone(freq, 0.1, 0.01);
        responses.push({ frequency: freq, strength: Math.random() });
      } catch (error) {
        responses.push({ frequency: freq, strength: 0 });
      }
    }

    const maxFreq = responses.reduce((max, r) => r.strength > 0.1 ? Math.max(max, r.frequency) : max, 0);
    
    if (maxFreq >= 17100) return 'full';
    if (maxFreq >= 16000) return 'standard';
    return 'limited';
  }

  getVersionPriorities(capability) {
    switch (capability) {
      case 'full':
        return [1, 2, 3, 4, 5];
      case 'standard':
        return [1, 2, 3, 4, 5];
      case 'limited':
        return [1, 2, 3];
      default:
        return [1, 2, 3, 4, 5];
    }
  }


}

export default SoundQRDecoder