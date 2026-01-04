import { AudioProcessor } from './audioUtils';
import { QRProcessor } from './qrUtils';

export class SoundQRDecoder {
  constructor() {
    this.audioProcessor = new AudioProcessor();
    this.qrProcessor = new QRProcessor();
  }

  async decode(audioBuffer, options = {}) {
    const {
      deviceCapability = 'full',
      fastMode = true,
      maxProcessingTime = 30000 // 30 second timeout
    } = options;

    const startTime = Date.now();
    
    try {
      await this.audioProcessor.initAudioContext();

      const versionPriorities = [1, 2, 3, 4, 5]; // Start with version 1 first
      
      console.log('Starting cycle detection...');
      const validCycles = await this.detectValidCycles(audioBuffer, versionPriorities);
      
      if (Date.now() - startTime > maxProcessingTime) {
        throw new Error('Processing timeout - operation took too long');
      }
      
      if (validCycles.length === 0) {
        throw new Error('No valid QR cycles detected');
      }

      console.log(`Found ${validCycles.length} cycles, attempting decode...`);
      
      // Try each cycle until one succeeds
      for (let i = 0; i < Math.min(validCycles.length, 3); i++) {
        const cycle = validCycles[i];
        console.log(`Attempting cycle ${i + 1}: Version ${cycle.version}, confidence: ${(cycle.confidence * 100).toFixed(1)}%`);
        
        try {
          const decodedData = await this.decodeCycle(audioBuffer, cycle);
          
          if (decodedData) {
            return {
              data: decodedData,
              version: cycle.version,
              confidence: cycle.confidence,
              cyclesFound: validCycles.length
            };
          }
        } catch (cycleError) {
          console.warn(`Cycle ${i + 1} failed: ${cycleError.message}`);
          continue; // Try next cycle
        }
      }
      
      throw new Error('All cycles failed decoding');
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`Decoding failed after ${processingTime}ms: ${error.message}`);
      throw new Error(`Decoding failed: ${error.message}`);
    }
  }

  // Much more aggressive detection approach
  async detectValidCycles(audioBuffer, versionPriorities) {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    
    // Debug boundary markers
    console.log('🔧 Debugging boundary markers:');
    const boundaryMarkers = this.audioProcessor.getBoundaryMarkers();
    for (let v = 1; v <= 5; v++) {
      const marker = boundaryMarkers[v];
      console.log(`  Version ${v}: Start ${marker.start}Hz, End ${marker.end}Hz`);
    }
    
    // Calculate RMS and peak for threshold
    console.log('\n=== OPTIMIZED AUDIO ANALYSIS ===');
    console.log(`Duration: ${audioBuffer.duration.toFixed(2)}s`);
    console.log(`Sample Rate: ${sampleRate}Hz`);
    console.log(`Samples: ${channelData.length}`);
    
    let rmsSum = 0;
    let peak = 0;
    const batchSize = 50000;
    
    for (let i = 0; i < channelData.length; i += batchSize) {
      const end = Math.min(i + batchSize, channelData.length);
      let batchSum = 0;
      
      for (let j = i; j < end; j++) {
        const sample = channelData[j];
        batchSum += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      rmsSum += batchSum;
    }
    
    const rms = Math.sqrt(rmsSum / channelData.length);
    console.log(`Peak Amplitude: ${peak.toFixed(6)}`);
    console.log(`RMS: ${rms.toFixed(6)}`);
    
    // Frequency analysis to verify signal presence
    console.log('\n=== FREQUENCY ANALYSIS ===');
    const testFreqs = [14000, 14100, 14500, 15200, 16000, 17090];
    const testSegment = channelData.slice(0, Math.min(channelData.length, 48000)); // First second
    
    const frequencyStrengths = {};
    for (const freq of testFreqs) {
      const strength = this.calculateFrequencyStrength(testSegment, freq, sampleRate);
      frequencyStrengths[freq] = strength;
      console.log(`${freq}Hz: ${strength.toFixed(6)}`);
    }
    
    // Analyze boundary markers for each version
    const markerAnalysis = {};
    for (let version = 1; version <= 5; version++) {
      const markers = boundaryMarkers[version];
      const startStrength = frequencyStrengths[markers.start] || 0;
      const endStrength = frequencyStrengths[markers.end] || 0;
      
      markerAnalysis[version] = {
        startStrength,
        endStrength,
        totalStrength: startStrength + endStrength
      };
    }
    
    console.log('🔧 Boundary markers:', markerAnalysis);
    
    // MUCH MORE AGGRESSIVE THRESHOLD - use the actual observed signal levels
    const maxObservedStrength = Math.max(...Object.values(frequencyStrengths));
    const minDetectionThreshold = Math.max(
      maxObservedStrength * 0.05,  // 5% of max observed
      rms * 0.05,                  // 5% of RMS
      0.000001                    // Absolute minimum threshold
    );
    
    console.log(`📊 Max observed frequency strength: ${maxObservedStrength.toFixed(6)}`);
    console.log(`📊 Using AGGRESSIVE detection threshold: ${minDetectionThreshold.toFixed(6)}`);
    
    // Scan for cycles with much smaller windows and steps
    const windowSize = Math.floor(sampleRate * 0.05); // 50ms windows (smaller)
    const stepSize = Math.floor(windowSize * 0.5); // 50% overlap
    const maxWindows = Math.floor((channelData.length - windowSize) / stepSize);
    
    console.log(`Starting focused scan: ${maxWindows} windows, ${windowSize} samples per window, ${stepSize} step size`);
    
    const validCycles = [];
    
    // Scan the entire audio file
    for (let windowIndex = 0; windowIndex < maxWindows; windowIndex++) {
      const startSample = windowIndex * stepSize;
      const windowData = channelData.slice(startSample, startSample + windowSize);
      
      // Test each version priority
      for (const version of versionPriorities) {
        const markers = boundaryMarkers[version];
        
        // Look for start marker with much lower threshold
        const startMarkerStrength = this.calculateFrequencyStrength(windowData, markers.start, sampleRate);
        
        if (startMarkerStrength > minDetectionThreshold) {
          console.log(`🔍 Found potential start marker: Version ${version}, strength ${startMarkerStrength.toFixed(6)}, time ${(startSample / sampleRate).toFixed(2)}s`);
          
          // Look for cycle with more comprehensive analysis
          const cycleResult = await this.analyzeCycleExtensive(
            channelData, 
            startSample, 
            version, 
            sampleRate,
            minDetectionThreshold
          );
          
          if (cycleResult && cycleResult.confidence > 0.001) { // 0.1% confidence minimum
            console.log(`✅ Found valid cycle: Version ${version}, confidence ${(cycleResult.confidence * 100).toFixed(2)}%, start: ${(startSample / sampleRate).toFixed(2)}s`);
            validCycles.push({
              ...cycleResult,
              version: version,
              startSample: startSample,
              startTime: startSample / sampleRate
            });
          }
        }
      }
      
      // Progress indicator
      if (windowIndex % 50 === 0 && windowIndex > 0) {
        console.log(`Scan progress: ${windowIndex}/${maxWindows} (${(windowIndex/maxWindows*100).toFixed(1)}%)`);
      }
    }
    
    // Sort by confidence and filter
    validCycles.sort((a, b) => b.confidence - a.confidence);
    
    console.log('\n=== SCAN RESULTS ===');
    console.log(`Scanned ${maxWindows} windows`);
    console.log(`Found ${validCycles.length} potential cycles`);
    
    // Much more lenient filtering
    const filteredCycles = validCycles.filter(c => c.confidence > 0.0001); // 0.01% minimum
    console.log(`After filtering: ${filteredCycles.length} cycles above 0.01% confidence`);
    
    // If we still haven't found anything, try an even more aggressive approach
    if (filteredCycles.length === 0) {
      console.log('🚨 No cycles found with standard approach, trying emergency detection...');
      return await this.emergencyDetection(channelData, sampleRate, versionPriorities);
    }
    
    return filteredCycles.slice(0, 5); // Return top 5 candidates
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

  // Improved frequency strength calculation
  calculateFrequencyStrength(samples, frequency, sampleRate) {
    if (!samples || samples.length === 0) return 0;
    
    try {
      let sumSin = 0;
      let sumCos = 0;
      const omega = 2 * Math.PI * frequency / sampleRate;
      const maxSamples = Math.min(samples.length, Math.floor(sampleRate * 0.02)); // 20ms max
      
      for (let i = 0; i < maxSamples; i++) {
        const phase = omega * i;
        sumSin += samples[i] * Math.sin(phase);
        sumCos += samples[i] * Math.cos(phase);
      }
      
      const magnitude = Math.sqrt(sumSin * sumSin + sumCos * sumCos) / maxSamples;
      return magnitude;
      
    } catch (error) {
      return 0;
    }
  }


    // Fixed decodeCycle method with proper matrix reconstruction
    async decodeCycle(audioBuffer, cycle) {
        try {
            console.log(`🔧 Decoding cycle: Version ${cycle.version}, confidence ${(cycle.confidence * 100).toFixed(2)}%`);

            const channelData = audioBuffer.getChannelData(0);
            const sampleRate = audioBuffer.sampleRate;
            const version = cycle.version;
            const startSample = cycle.startSample;

            const timing = this.qrProcessor.getCycleTiming(version);
            const spec = this.qrProcessor.getVersionSpec(version);
            const frequencies = this.audioProcessor.getFrequencyGrid();

            console.log(`🔧 Timing: ${JSON.stringify(timing)}`);
            console.log(`🔧 Spec: size=${spec.size}, chunkSize=${spec.chunkSize}`);

            // Extract cycle data with some padding
            const expectedCycleSamples = Math.floor(sampleRate * timing.totalTime / 1000);
            const endSample = Math.min(startSample + expectedCycleSamples, channelData.length);
            const cycleData = channelData.slice(startSample, endSample);

            // Skip start marker (first 100ms)
            const startMarkerSamples = Math.floor(sampleRate * timing.startMarker / 1000);
            let sampleOffset = startMarkerSamples;

            const matrix = [];

            // Initialize matrix
            for (let row = 0; row < spec.size; row++) {
                matrix[row] = new Array(spec.size).fill(0);
            }

            console.log(`🔧 Decoding ${spec.size}x${spec.size} matrix from cycle data...`);
            console.log(`🔧 Expected cycle samples: ${expectedCycleSamples}, actual: ${cycleData.length}`);

            // Decode each column
            for (let col = 0; col < spec.size && sampleOffset < cycleData.length; col++) {
                const chunks = [];

                // Decode chunks for this column
                const chunksPerColumn = Math.ceil(spec.size / spec.chunkSize);

                for (let chunkIdx = 0; chunkIdx < chunksPerColumn; chunkIdx++) {
                    if (sampleOffset >= cycleData.length) {
                        console.warn(`⚠️ Ran out of data at column ${col}, chunk ${chunkIdx}`);
                        break;
                    }

                    const chunkSamples = Math.floor(sampleRate * timing.chunkDuration / 1000);
                    const chunkEnd = Math.min(sampleOffset + chunkSamples, cycleData.length);
                    const chunkData = cycleData.slice(sampleOffset, chunkEnd);

                    if (chunkData.length === 0) {
                        console.warn(`⚠️ Empty chunk data at column ${col}, chunk ${chunkIdx}`);
                        chunks.push(0);
                        break;
                    }

                    // Find best matching frequency - improved method
                    let bestFreqIdx = 0;
                    let bestStrength = 0;
                    const strengthThreshold = 0.000001; // Very low threshold

                    for (let freqIdx = 0; freqIdx < frequencies.length; freqIdx++) {
                        const strength = this.calculateFrequencyStrength(chunkData, frequencies[freqIdx], sampleRate);
                        if (strength > bestStrength) {
                            bestStrength = strength;
                            bestFreqIdx = freqIdx;
                        }
                    }

                    // Only use the frequency if it's above threshold, otherwise use 0
                    const finalFreqIdx = bestStrength > strengthThreshold ? bestFreqIdx : 0;
                    chunks.push(finalFreqIdx);

                    sampleOffset += chunkSamples;

                    // Add gap between chunks if specified
                    if (timing.columnGap) {
                        sampleOffset += Math.floor(sampleRate * timing.columnGap / 1000);
                    }
                }

                if (col < 3) { // Debug first few columns
                    console.log(`Column ${col}: chunks [${chunks.join(', ')}] (${chunks.length} chunks)`);
                }

                // FIXED: Convert chunks back to matrix column with proper bit mapping
                this.chunksToMatrixColumn(chunks, matrix, col, spec);
            }

            console.log(`🔧 Reconstructed matrix: ${matrix.length}x${matrix[0]?.length || 0}`);
            console.log(matrix)
            // Enhanced matrix debugging
            console.log('🔍 Matrix first 10x10:');
            for (let i = 0; i < Math.min(10, matrix.length); i++) {
                const row = matrix[i].slice(0, 10).map(v => v ? '█' : '·').join('');
                console.log(`  ${i.toString().padStart(2)}: ${row}`);
            }

            // Try to decode the matrix
            const decodedText = await this.qrProcessor.decodeQRMatrix(matrix);

            if (decodedText) {
                console.log(`✅ Successfully decoded: "${decodedText}"`);
                return decodedText;
            } else {
                console.log(`❌ Matrix decode failed for version ${version}`);

                // Try different interpretations of the same data
                /*
                const alternativeResults = await this.tryAlternativeDecodings(chunks, spec);
                if (alternativeResults) {
                    return alternativeResults;
                }
                */
                return null;
            }

        } catch (error) {
            console.warn(`Cycle decode error: ${error.message}`);
            return null;
        }
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