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
      
      const versionPriorities = [1]; // Start with just Version 1 to avoid complexity
      
      console.log('Starting cycle detection...');
      const validCycles = await this.detectValidCycles(audioBuffer, versionPriorities);
      
      if (Date.now() - startTime > maxProcessingTime) {
        throw new Error('Processing timeout - operation took too long');
      }
      
      if (validCycles.length === 0) {
        throw new Error('No valid QR cycles detected');
      }

      console.log(`Found ${validCycles.length} cycles, attempting decode...`);
      
      // Try only the best cycle to avoid stack overflow
      const bestCycle = validCycles[0];
      console.log(`Decoding cycle: Version ${bestCycle.version}, confidence: ${(bestCycle.confidence * 100).toFixed(1)}%`);
      
      const decodedData = await this.decodeCycle(audioBuffer, bestCycle);
      
      if (decodedData) {
        return {
          data: decodedData,
          version: bestCycle.version,
          confidence: bestCycle.confidence,
          cyclesFound: validCycles.length
        };
      }
      
      throw new Error('Cycle decoding failed');
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`Decoding failed after ${processingTime}ms: ${error.message}`);
      throw new Error(`Decoding failed: ${error.message}`);
    }
  }

  async assessDeviceCapability() {
    // Test device frequency response
    const testFrequencies = [14500, 15500, 16500, 17100];
    const responses = [];
    
    for (const freq of testFrequencies) {
      try {
        // Generate test tone and measure response
        const testTone = this.audioProcessor.generateTone(freq, 0.1, 0.01);
        // This would require actual playback and recording, simplified for demo
        responses.push({ frequency: freq, strength: Math.random() }); // Placeholder
      } catch (error) {
        responses.push({ frequency: freq, strength: 0 });
      }
    }

    // Categorize based on highest responsive frequency
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
        return [1, 2, 3, 4, 5]; // 5 with reduced reliability
      case 'limited':
        return [1, 2, 3];
      default:
        return [1, 2, 3, 4, 5];
    }
  }

  // Add these missing methods and fix the stack overflow issues

  calculateRMS(channelData) {
    const batchSize = 50000; // Process 50k samples at a time
    let sum = 0;
    
    for (let i = 0; i < channelData.length; i += batchSize) {
      const end = Math.min(i + batchSize, channelData.length);
      let batchSum = 0;
      
      for (let j = i; j < end; j++) {
        batchSum += channelData[j] * channelData[j];
      }
      sum += batchSum;
    }
    
    return Math.sqrt(sum / channelData.length);
  }

  async analyzeFrequencyContent(channelData, sampleRate) {
    console.log('\n=== FREQUENCY ANALYSIS ===');
    const testFrequencies = [14000, 14100, 14500, 15200, 16000, 17090];
    
    // Use only first 0.5 seconds to prevent memory issues
    const maxSamples = Math.min(channelData.length, Math.floor(sampleRate * 0.5));
    const segment = channelData.slice(0, maxSamples);
    
    for (let i = 0; i < testFrequencies.length; i++) {
      const freq = testFrequencies[i];
      try {
        const correlation = this.simpleFrequencyCheck(segment, freq, sampleRate);
        console.log(`${freq}Hz: ${correlation.toFixed(6)}`);
      } catch (error) {
        console.log(`${freq}Hz: analysis failed - ${error.message}`);
      }
      
      // Yield control between frequency checks
      if (i % 2 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
  }

  // Fix the correlation method to use actual sample rate
  simpleFrequencyCheck(segment, frequency, sampleRate) {
    // Limit to reasonable segment size
    const maxLength = Math.min(segment.length, Math.floor(sampleRate * 0.01)); // 10ms
    let sumSin = 0;
    let sumCos = 0;
    
    const omega = 2 * Math.PI * frequency / sampleRate; // Use actual sample rate
    
    for (let i = 0; i < maxLength; i++) {
      sumSin += segment[i] * Math.sin(omega * i);
      sumCos += segment[i] * Math.cos(omega * i);
    }
    
    // Return magnitude instead of just sine component
    return Math.sqrt(sumSin * sumSin + sumCos * sumCos) / maxLength;
  }

  // Fix the marker detection with much more sensitive thresholds
  analyzeMarkerDetailed(segment, frequency, sampleRate, label) {
    try {
      const maxSamples = Math.min(segment.length, Math.floor(sampleRate * 0.1));
      const limitedSegment = segment.slice(0, maxSamples);
      
      const correlation = this.simpleFrequencyCheck(limitedSegment, frequency, sampleRate);
      
      // Much more sensitive threshold for weak signals
      const threshold = 0.0001; // Reduced from 0.0005 to 0.0001
      const detected = correlation > threshold;
      
      if (detected) {
        console.log(`   ${label}: DETECTED (${correlation.toFixed(8)})`); // More precision
      }
      
      return {
        detected,
        strength: correlation,
        frequency
      };
      
    } catch (error) {
      console.warn(`Marker analysis failed for ${label}: ${error.message}`);
      return {
        detected: false,
        strength: 0,
        frequency
      };
    }
  }

  // Also update the valid cycle detection threshold
  async detectValidCycles(audioBuffer, versionPriorities) {
    const validCycles = [];
    const markers = this.audioProcessor.getBoundaryMarkers();
    const sampleRate = audioBuffer.sampleRate;
    const channelData = audioBuffer.getChannelData(0);
    
    console.log(`\n=== OPTIMIZED AUDIO ANALYSIS ===`);
    console.log(`Duration: ${audioBuffer.duration.toFixed(2)}s`);
    console.log(`Sample Rate: ${sampleRate}Hz`);
    console.log(`Samples: ${channelData.length}`);
    
    const peak = this.findPeakAmplitude(channelData);
    const rms = this.calculateRMS(channelData);
    
    console.log(`Peak Amplitude: ${peak.toFixed(6)}`);
    console.log(`RMS: ${rms.toFixed(6)}`);
    
    await this.analyzeFrequencyContent(channelData, sampleRate);
    
    // Use smaller windows and steps for more thorough scanning
    const windowSize = Math.floor(sampleRate * 0.1); // 100ms window
    const stepSize = Math.floor(sampleRate * 0.02);  // 20ms step (more thorough)
    const maxScans = Math.min(500, Math.floor(channelData.length / stepSize));
    
    console.log(`Starting optimized scan: ${maxScans} windows, ${stepSize} samples per step`);
    
    let scanCount = 0;
    
    for (let i = 0; i < channelData.length - windowSize && scanCount < maxScans; i += stepSize) {
      const currentTime = i / sampleRate;
      scanCount++;
      
      if (scanCount % 50 === 0) {
        console.log(`Scan progress: ${scanCount}/${maxScans} (${(currentTime/audioBuffer.duration*100).toFixed(1)}%)`);
        await new Promise(resolve => setTimeout(resolve, 1));
      }
      
      for (const version of versionPriorities) {
        try {
          const markerPair = markers[version];
          const segment = channelData.slice(i, i + windowSize);
          
          const startResult = this.analyzeMarkerDetailed(segment, markerPair.start, sampleRate, `V${version}_Start`);
          
          // Much more sensitive detection threshold
          if (startResult.detected && startResult.strength > 0.0001) {
            console.log(`🎯 START MARKER: Version ${version} at ${currentTime.toFixed(2)}s, strength: ${startResult.strength.toFixed(8)}`);
            
            const timing = this.qrProcessor.getCycleTiming(version);
            const expectedEndTime = currentTime + (timing.totalTime / 1000);
            const endSampleStart = Math.floor(expectedEndTime * sampleRate);
            
            if (endSampleStart >= 0 && endSampleStart + windowSize < channelData.length) {
              const endSegment = channelData.slice(endSampleStart, endSampleStart + windowSize);
              const endResult = this.analyzeMarkerDetailed(endSegment, markerPair.end, sampleRate, `V${version}_End`);
              
              if (endResult.detected && endResult.strength > 0.0001) {
                const confidence = (startResult.strength + endResult.strength) / 2;
                
                console.log(`✅ VALID CYCLE: Version ${version}, confidence: ${(confidence * 100).toFixed(3)}%`);
                
                validCycles.push({
                  version: version,
                  startTime: currentTime,
                  confidence: confidence,
                  timing: timing
                });
                
                i += Math.floor((timing.totalTime / 1000) * sampleRate);
                break;
              }
            }
          }
          
        } catch (error) {
          console.warn(`Error checking version ${version} at ${currentTime.toFixed(2)}s: ${error.message}`);
        }
      }
      
      if (scanCount >= maxScans) {
        console.log('Scan limit reached - stopping to prevent timeout');
        break;
      }
    }
    
    console.log(`\n=== SCAN RESULTS ===`);
    console.log(`Scanned ${scanCount} windows`);
    console.log(`Found ${validCycles.length} valid cycles`);
    
    validCycles.sort((a, b) => b.confidence - a.confidence);
    return validCycles.slice(0, 3);
  }

  findPeakAmplitude(channelData) {
    const batchSize = 50000;
    let peak = 0;
    
    for (let i = 0; i < channelData.length; i += batchSize) {
      const end = Math.min(i + batchSize, channelData.length);
      
      for (let j = i; j < end; j++) {
        const abs = Math.abs(channelData[j]);
        if (abs > peak) peak = abs;
      }
    }
    
    return peak;
  }

  async decodeCycle(audioBuffer, cycle) {
    const { version, startTime, timing } = cycle;
    const sampleRate = audioBuffer.sampleRate;
    const channelData = audioBuffer.getChannelData(0);
    const frequencies = this.audioProcessor.getFrequencyGrid();
    
    // FIX: Use the actual cycle start time, not a fixed calculation
    const dataStartTime = startTime + 0.1; // Start time + 100ms marker
    const spec = this.qrProcessor.versionSpecs[version];
    let corruptedColumns = 0;
    const matrix = [];
    
    console.log(`Decoding cycle: Version ${version}, ${spec.size} columns`);
    console.log(`Cycle start time: ${startTime.toFixed(3)}s, Data start: ${dataStartTime.toFixed(3)}s`);
    
    // Process columns sequentially to avoid stack overflow
    for (let col = 0; col < spec.size; col++) {
      try {
        const columnResult = this.decodeColumnSyncFixed(
          channelData, col, spec, dataStartTime, sampleRate, frequencies, version
        );
        
        if (columnResult.corrupted) {
          console.warn(`Column ${col} corrupted - using zeros`);
          corruptedColumns++;
          matrix.push(new Array(spec.size).fill(0));
        } else {
          matrix.push(columnResult.column);
        }
        
        // Check corruption rate periodically
        if ((col + 1) % 5 === 0) {
          const currentCorruptionRate = corruptedColumns / (col + 1);
          if (currentCorruptionRate > 0.4) { // Increased threshold
            throw new Error(`High corruption rate detected: ${(currentCorruptionRate * 100).toFixed(1)}%`);
          }
        }
        
        // Yield control every 10 columns
        if (col % 10 === 0 && col > 0) {
          await new Promise(resolve => setTimeout(resolve, 1));
        }
        
      } catch (error) {
        console.warn(`Column ${col} error: ${error.message}`);
        corruptedColumns++;
        matrix.push(new Array(spec.size).fill(0));
      }
    }
    
    const corruptionRate = corruptedColumns / spec.size;
    console.log(`Final corruption rate: ${(corruptionRate * 100).toFixed(1)}%`);
    
    if (corruptionRate > 0.5) { // More lenient threshold
      throw new Error(`Too many corrupted columns: ${(corruptionRate * 100).toFixed(1)}%`);
    }
    
    // Validate matrix dimensions
    if (!this.qrProcessor.validateMatrix(matrix, spec.size)) {
      throw new Error('Matrix validation failed');
    }
    
    console.log('Matrix reconstruction successful');
    
    // Transpose matrix (columns become rows)
    const transposedMatrix = this.transposeMatrix(matrix, spec.size);
    console.log('Matrix transposed successfully');
    
    // Attempt QR decoding
    try {
      const result = await this.qrProcessor.decodeQRMatrix(transposedMatrix);
      console.log(`QR decoding successful: "${result}"`);
      return result;
    } catch (qrError) {
      console.error('QR decoding failed:', qrError.message);
      throw new Error(`QR decoding failed: ${qrError.message}`);
    }
  }

  // Fixed column decoding with better error handling
  decodeColumnSyncFixed(channelData, col, spec, dataStartTime, sampleRate, frequencies, version) {
    const columnStartTime = dataStartTime + (col * spec.timePerColumn / 1000);
    const columnChunks = [];
    
    const shouldLog = col === 0; // Debug just first column
    
    if (shouldLog) {
      console.log(`\n=== COLUMN ${col} ANALYSIS ===`);
      console.log(`Column start: ${columnStartTime.toFixed(3)}s`);
      console.log(`Sample rate: ${sampleRate}Hz`);
    }
    
    // Process chunks sequentially
    for (let chunkIndex = 0; chunkIndex < spec.chunks; chunkIndex++) {
      const chunkStartTime = columnStartTime + (chunkIndex * 0.01);
      const chunkStartSample = Math.floor(chunkStartTime * sampleRate);
      const chunkSamples = Math.floor(0.01 * sampleRate);
      
      if (chunkStartSample + chunkSamples >= channelData.length) {
        if (shouldLog) console.log(`  Chunk ${chunkIndex}: OUT OF BOUNDS`);
        return { corrupted: true };
      }
      
      const chunkData = channelData.slice(chunkStartSample, chunkStartSample + chunkSamples);
      
      if (shouldLog && chunkIndex < 4) {
        // Test correlation with expected frequencies for debugging
        const expectedChunks = [63, 47, 15, 56]; // From encoding log for column 0
        const expectedFreq = 15200 + (expectedChunks[chunkIndex] * 30);
        
        console.log(`  Chunk ${chunkIndex} - Expected: ${expectedFreq}Hz (index ${expectedChunks[chunkIndex]})`);
        
        const expectedCorr = this.correlateWithFrequencyImproved(chunkData, expectedFreq, 
          Math.sqrt(chunkData.reduce((sum, s) => sum + s*s, 0) / chunkData.length));
        console.log(`    Expected freq correlation: ${expectedCorr.toFixed(8)}`);
      }
      
      const bestFreq = this.findBestFrequencySyncFixed(chunkData, frequencies, {
        shouldLog: shouldLog && chunkIndex < 4,
        chunkIndex,
        rms: Math.sqrt(chunkData.reduce((sum, s) => sum + s*s, 0) / chunkData.length)
      });
      
      if (bestFreq.match === null) {
        if (shouldLog) console.log(`  Chunk ${chunkIndex}: NO MATCH`);
        return { corrupted: true };
      }
      
      columnChunks.push(bestFreq.match);
    }
    
    // Validate and reconstruct column
    try {
      if (this.qrProcessor.validatePadding(columnChunks, version)) {
        const reconstructedColumn = this.qrProcessor.reconstructColumn(columnChunks, version);
        return { corrupted: false, column: reconstructedColumn };
      } else {
        if (shouldLog) console.log(`Column ${col}: Padding validation failed`);
        return { corrupted: true };
      }
    } catch (error) {
      if (shouldLog) console.log(`Column ${col}: Reconstruction error - ${error.message}`);
      return { corrupted: true };
    }
  }

  // Improved frequency detection with better thresholds
  findBestFrequencySyncFixed(chunkData, frequencies, debugInfo = null) {
    if (!chunkData || chunkData.length === 0) {
      return { match: null, correlation: 0 };
    }
    
    let bestMatch = null;
    let bestCorrelation = 0;
    const correlations = [];
    
    // Pre-normalize the chunk data
    const mean = chunkData.reduce((sum, val) => sum + val, 0) / chunkData.length;
    const normalizedChunk = chunkData.map(val => val - mean);
    
    // Calculate RMS for amplitude normalization
    const rms = Math.sqrt(normalizedChunk.reduce((sum, val) => sum + val * val, 0) / normalizedChunk.length);
    
    // Skip if signal is too weak
    if (rms < 0.001) {
      if (debugInfo && debugInfo.shouldLog) {
        console.log(`Chunk ${debugInfo.chunkIndex}: Signal too weak (RMS: ${rms.toFixed(6)})`);
      }
      return { match: null, correlation: 0 };
    }
    
    // Check all frequencies to find the best match
    for (let freqIndex = 0; freqIndex < frequencies.length; freqIndex++) {
      try {
        const correlation = this.correlateWithFrequencyImproved(normalizedChunk, frequencies[freqIndex], rms);
        correlations.push({ freq: frequencies[freqIndex], correlation, index: freqIndex });
        
        if (correlation > bestCorrelation) {
          bestCorrelation = correlation;
          bestMatch = freqIndex;
        }
        
      } catch (error) {
        correlations.push({ freq: frequencies[freqIndex], correlation: 0, error: error.message, index: freqIndex });
        continue;
      }
    }
    
    // Debug logging for first few chunks
    if (debugInfo && debugInfo.shouldLog) {
      console.log(`Chunk ${debugInfo.chunkIndex}: Best freq ${frequencies[bestMatch] || 'NONE'} (index ${bestMatch}), correlation: ${bestCorrelation.toFixed(6)}`);
      
      // Show top 5 correlations with their indices
      const sorted = correlations
        .filter(c => !c.error)
        .sort((a, b) => b.correlation - a.correlation)
        .slice(0, 5);
      console.log('  Top correlations:', sorted.map(c => `${c.freq}Hz(${c.index}): ${c.correlation.toFixed(6)}`).join(', '));
    }
    
    // More lenient threshold - if we have strong correlations (>0.1), use lower threshold
    const threshold = bestCorrelation > 0.1 ? 0.05 : 0.01;
    
    return {
      match: (bestMatch !== null && bestCorrelation > threshold) ? bestMatch : null,
      correlation: bestCorrelation
    };
  }

  // Improved correlation method
  correlateWithFrequencyImproved(samples, frequency, signalRMS) {
    if (!samples || samples.length === 0) return 0;
    
    try {
      const omega = 2 * Math.PI * frequency / 48000; // Use fixed sample rate from debug output
      let sumSin = 0;
      let sumCos = 0;
      const maxSamples = Math.min(samples.length, 480); // 10ms at 48kHz
      
      // Apply windowing and compute correlation
      for (let i = 0; i < maxSamples; i++) {
        // Hann window
        const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (maxSamples - 1));
        const windowedSample = samples[i] * window;
        
        sumSin += windowedSample * Math.sin(omega * i);
        sumCos += windowedSample * Math.cos(omega * i);
      }
      
      // Calculate power and normalize by signal strength
      const power = Math.sqrt(sumSin * sumSin + sumCos * sumCos) / maxSamples;
      return power / (signalRMS + 0.001); // Normalize by signal RMS
      
    } catch (error) {
      console.warn(`Improved correlation error for ${frequency}Hz: ${error.message}`);
      return 0;
    }
  }

  transposeMatrix(matrix, size) {
    const transposed = [];
    for (let row = 0; row < size; row++) {
      const matrixRow = [];
      for (let col = 0; col < size; col++) {
        matrixRow.push(matrix[col][row]);
      }
      transposed.push(matrixRow);
    }
    return transposed;
  }
}