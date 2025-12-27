import { generateQRMatrix } from './qrService';
import jsQR from 'jsqr';

// Constants
const ULTRASONIC_FREQ_START = 20000;
const ULTRASONIC_FREQ_END = 23000;
const CARRIER_FREQUENCY = 21500;
const BIT_DURATION = 0.01;
const AMPLITUDE = 0.01;
const REPETITION_INTERVAL = 15; // seconds between repetitions

// Main encoding function - updated to use repetition
export const encodeQRToUltrasonic = async (audioBuffer, qrData, audioContext, progressCallback) => {
  try {
    progressCallback(10);
    
    // Generate QR code matrix
    const qrMatrix = await generateQRMatrix(qrData);
    const bitString = matrixToBitString(qrMatrix);
    
    progressCallback(30);
    
    // Create new audio buffer with encoded data
    const sampleRate = audioBuffer.sampleRate;
    const numberOfChannels = audioBuffer.numberOfChannels;
    const originalLength = audioBuffer.length;
    
    // Calculate required length for encoding
    const bitsToEncode = bitString.length;
    const encodingDuration = bitsToEncode * BIT_DURATION;
    const encodingSamples = Math.floor(encodingDuration * sampleRate);
    
    // Create new buffer (original + padding if needed)
    const newLength = Math.max(originalLength, encodingSamples);
    const encodedBuffer = audioContext.createBuffer(numberOfChannels, newLength, sampleRate);
    
    progressCallback(50);
    
    // Copy original audio data
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const originalData = audioBuffer.getChannelData(channel);
      const encodedData = encodedBuffer.getChannelData(channel);
      
      // Copy original audio
      for (let i = 0; i < originalLength; i++) {
        encodedData[i] = originalData[i];
      }
    }
    
    progressCallback(70);
    
    // Encode QR data with repetition in ultrasonic frequencies
    await encodeUltrasonicDataWithRepetition(encodedBuffer, bitString, sampleRate, progressCallback);
    
    progressCallback(90);
    
    return encodedBuffer;
  } catch (error) {
    throw new Error(`Encoding failed: ${error.message}`);
  }
};

// Main decoding function - updated to use search
export const decodeUltrasonicToQR = async (audioBuffer, audioContext, progressCallback) => {
  try {
    progressCallback(10);
    console.log('Starting decoding process...');
    console.log('Audio buffer info:', {
      sampleRate: audioBuffer.sampleRate,
      duration: audioBuffer.duration,
      numberOfChannels: audioBuffer.numberOfChannels,
      length: audioBuffer.length
    });
    
    // Extract ultrasonic data with search
    const bitString = await extractUltrasonicDataWithSearch(audioBuffer, progressCallback);
    console.log('Extracted bit string:', {
      length: bitString?.length,
      first50: bitString?.substring(0, 50),
      last50: bitString?.substring(bitString?.length - 50)
    });
    
    progressCallback(70);
    
    if (!bitString || bitString.length < 72) {
      throw new Error(`No ultrasonic QR data found. Extracted ${bitString?.length || 0} bits, need at least 72`);
    }
    
    // Convert bit string back to QR matrix
    const qrMatrix = bitStringToMatrix(bitString);
    console.log('Reconstructed matrix:', {
      size: qrMatrix.length,
      totalCells: qrMatrix.length * qrMatrix.length,
      firstRow: qrMatrix[0]?.slice(0, 10)
    });
    
    progressCallback(85);
    
    // Decode QR matrix to text
    const decodedData = await decodeQRMatrix(qrMatrix);
    
    progressCallback(95);
    
    return decodedData;
  } catch (error) {
    console.error('Decoding error details:', error);
    throw new Error(`Decoding failed: ${error.message}`);
  }
};

// Enhanced encoding with repetition
const encodeUltrasonicDataWithRepetition = async (audioBuffer, bitString, sampleRate, progressCallback) => {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const samplesPerBit = Math.floor(BIT_DURATION * sampleRate);
  const channelIndex = numberOfChannels > 1 ? 1 : 0;
  const channelData = audioBuffer.getChannelData(channelIndex);
  
  // Calculate QR code duration
  const qrDurationSamples = bitString.length * samplesPerBit;
  const qrDurationSeconds = qrDurationSamples / sampleRate;
  
  console.log(`QR code duration: ${qrDurationSeconds.toFixed(2)} seconds`);
  console.log(`Audio duration: ${(channelData.length / sampleRate).toFixed(2)} seconds`);
  
  const repetitionSamples = REPETITION_INTERVAL * sampleRate;
  
  // For audio longer than 30 seconds, repeat QR code every 15 seconds
  if (channelData.length > repetitionSamples && qrDurationSeconds < REPETITION_INTERVAL) {
    const maxRepetitions = Math.floor(channelData.length / repetitionSamples);
    const actualRepetitions = Math.min(maxRepetitions, 10); // Limit to 10 repetitions max
    
    console.log(`Encoding QR code ${actualRepetitions} times for robustness`);
    
    for (let rep = 0; rep < actualRepetitions; rep++) {
      const startOffset = rep * repetitionSamples;
      
      console.log(`Encoding repetition ${rep + 1} at ${(startOffset/sampleRate).toFixed(1)}s`);
      
      // Encode QR code at this position
      encodeQRCodeAtPosition(channelData, bitString, startOffset, samplesPerBit, sampleRate);
      
      // Update progress
      if (progressCallback) {
        const progress = 70 + (rep / actualRepetitions) * 15;
        progressCallback(Math.round(progress));
      }
    }
  } else {
    // Single encoding for shorter files
    console.log('Single QR code encoding for shorter audio');
    encodeQRCodeAtPosition(channelData, bitString, 0, samplesPerBit, sampleRate);
  }
};

// Helper function to encode QR at specific position
const encodeQRCodeAtPosition = (channelData, bitString, startOffset, samplesPerBit, sampleRate) => {
  for (let bitIndex = 0; bitIndex < bitString.length; bitIndex++) {
    const bit = bitString[bitIndex];
    const startSample = startOffset + (bitIndex * samplesPerBit);
    
    // Skip if we exceed audio length
    if (startSample + samplesPerBit > channelData.length) {
      console.log(`Stopping encoding at bit ${bitIndex}, reached audio end`);
      break;
    }
    
    const frequency = bit === '1' ? CARRIER_FREQUENCY + 500 : CARRIER_FREQUENCY - 500;
    
    for (let sample = 0; sample < samplesPerBit; sample++) {
      const sampleIndex = startSample + sample;
      if (sampleIndex >= channelData.length) break;
      
      const time = sampleIndex / sampleRate;
      const ultrasonicSignal = Math.sin(2 * Math.PI * frequency * time) * AMPLITUDE;
      
      // Mix with existing audio (additive)
      channelData[sampleIndex] += ultrasonicSignal;
      
      // Apply windowing to avoid clicks
      if (sample < 10) {
        channelData[sampleIndex] *= sample / 10;
      } else if (sample > samplesPerBit - 10) {
        channelData[sampleIndex] *= (samplesPerBit - sample) / 10;
      }
    }
  }
};

// Enhanced decoding that searches the entire file
const extractUltrasonicDataWithSearch = async (audioBuffer, progressCallback) => {
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(audioBuffer.numberOfChannels > 1 ? 1 : 0);
  const samplesPerBit = Math.floor(BIT_DURATION * sampleRate);
  
  console.log('Searching entire audio file for QR codes...');
  
  // Try different starting positions
  const searchInterval = REPETITION_INTERVAL * sampleRate; // Every 15 seconds
  const maxSearchPositions = Math.min(10, Math.floor(channelData.length / searchInterval) + 1);
  
  console.log(`Will search ${maxSearchPositions} positions`);
  
  for (let searchPos = 0; searchPos < maxSearchPositions; searchPos++) {
    const startSample = searchPos * searchInterval;
    console.log(`Searching at position ${searchPos} (${(startSample/sampleRate).toFixed(1)}s)`);
    
    // Update progress
    if (progressCallback) {
      const progress = 10 + (searchPos / maxSearchPositions) * 50;
      progressCallback(Math.round(progress));
    }
    
    const bitString = await extractBitsFromPosition(channelData, startSample, samplesPerBit, sampleRate);
    
    if (bitString && bitString.length >= 72) {
      console.log(`Found QR data at position ${searchPos}: ${bitString.length} bits`);
      
      // Try to decode this bit string to validate it's a real QR code
      try {
        const qrMatrix = bitStringToMatrix(bitString);
        if (qrMatrix && qrMatrix.length >= 21) {
          console.log(`Valid QR matrix found at position ${searchPos}`);
          return bitString;
        }
      } catch (e) {
        console.log(`Invalid QR data at position ${searchPos}:`, e.message);
        continue;
      }
    }
  }
  
  console.log('No valid QR codes found in any search position');
  return '';
};

// Enhanced bit extraction with comprehensive debugging
const extractBitsFromPosition = async (channelData, startSample, samplesPerBit, sampleRate) => {
  const bitString = [];
  const maxBits = 2000;
  
  console.log(`=== EXTRACTING FROM POSITION ${(startSample/sampleRate).toFixed(1)}s ===`);
  console.log('Samples per bit:', samplesPerBit);
  
  // First, analyze the audio characteristics at this position
  const analysisLength = Math.min(samplesPerBit * 100, channelData.length - startSample);
  const analysisChunk = channelData.slice(startSample, startSample + analysisLength);
  
  const audioStats = analyzeAudioChunk(analysisChunk, sampleRate);
  console.log('Audio analysis at position:', audioStats);
  
  // If there's no significant energy, skip this position
  if (audioStats.maxAmplitude < 0.0001) {
    console.log('No significant audio energy at this position');
    return '';
  }
  
  let consecutiveNulls = 0;
  let detectionStats = {
    totalSegments: 0,
    validDetections: 0,
    nullDetections: 0,
    energyStats: { min: Infinity, max: 0, avg: 0 }
  };
  
  for (let bitIndex = 0; bitIndex < maxBits; bitIndex++) {
    const segmentStart = startSample + (bitIndex * samplesPerBit);
    
    if (segmentStart + samplesPerBit > channelData.length) {
      break;
    }
    
    const segment = channelData.slice(segmentStart, segmentStart + samplesPerBit);
    detectionStats.totalSegments++;
    
    // Calculate segment energy
    const energy = Math.sqrt(segment.reduce((sum, val) => sum + val * val, 0) / segment.length);
    detectionStats.energyStats.min = Math.min(detectionStats.energyStats.min, energy);
    detectionStats.energyStats.max = Math.max(detectionStats.energyStats.max, energy);
    detectionStats.energyStats.avg += energy;
    
    // Try multiple detection methods
    const bit = detectBitWithFallback(segment, sampleRate, bitIndex);
    
    if (bit !== null) {
      bitString.push(bit);
      detectionStats.validDetections++;
      consecutiveNulls = 0;
      
      // Log first few successful detections
      if (bitString.length <= 20) {
        console.log(`Bit ${bitString.length}: '${bit}' at segment ${bitIndex} (energy: ${energy.toFixed(6)})`);
      }
    } else {
      detectionStats.nullDetections++;
      consecutiveNulls++;
      
      // Early termination if no signal detected for a while
      if (bitString.length === 0 && consecutiveNulls > 100) {
        console.log('No signal detected in first 100 segments, terminating');
        break;
      }
      
      // Stop if we have some data but too many consecutive nulls
      if (bitString.length > 50 && consecutiveNulls > 50) {
        console.log('Too many consecutive null detections, stopping');
        break;
      }
    }
    
    // Stop early if we have enough bits for a reasonable QR code
    if (bitString.length > 500 && bitIndex > bitString.length * 2) {
      console.log('Found sufficient data, stopping early');
      break;
    }
  }
  
  // Finalize statistics
  if (detectionStats.totalSegments > 0) {
    detectionStats.energyStats.avg /= detectionStats.totalSegments;
  }
  
  console.log('Detection statistics:', {
    ...detectionStats,
    detectionRate: (detectionStats.validDetections / detectionStats.totalSegments * 100).toFixed(1) + '%'
  });
  
  return bitString.join('');
};

// Enhanced bit detection with multiple fallback methods
const detectBitWithFallback = (segment, sampleRate, segmentIndex) => {
  // Method 1: Original correlation method
  const bit1 = detectBitImproved(segment, sampleRate);
  
  // Method 2: Relaxed threshold correlation
  const bit2 = detectBitRelaxed(segment, sampleRate);
  
  // Method 3: Simple frequency domain analysis
  const bit3 = detectBitFrequencySimple(segment, sampleRate);
  
  // Method 4: Zero crossing rate analysis
  const bit4 = detectBitZeroCrossing(segment, sampleRate);
  
  // Debug the first few segments
  if (segmentIndex < 10) {
    console.log(`Segment ${segmentIndex} detection results: ${bit1}/${bit2}/${bit3}/${bit4}`);
  }
  
  // Vote on the results
  const votes = [bit1, bit2, bit3, bit4].filter(b => b !== null);
  if (votes.length === 0) return null;
  
  // Return most common result
  const voteCount = votes.reduce((acc, bit) => {
    acc[bit] = (acc[bit] || 0) + 1;
    return acc;
  }, {});
  
  const winner = Object.keys(voteCount).reduce((a, b) => 
    voteCount[a] > voteCount[b] ? a : b
  );
  
  return winner;
};

// More relaxed detection method
const detectBitRelaxed = (segment, sampleRate) => {
  const rms = Math.sqrt(segment.reduce((sum, val) => sum + val * val, 0) / segment.length);
  
  // Much more relaxed energy threshold
  if (rms < 0.00001) {
    return null;
  }
  
  const freq0 = CARRIER_FREQUENCY - 500;
  const freq1 = CARRIER_FREQUENCY + 500;
  
  const correlation0 = calculateFrequencyCorrelation(segment, freq0, sampleRate);
  const correlation1 = calculateFrequencyCorrelation(segment, freq1, sampleRate);
  
  // Very relaxed threshold and ratio
  const threshold = 0.001;
  const ratio = 1.05;
  
  if (correlation0 > threshold && correlation0 > correlation1 * ratio) {
    return '0';
  } else if (correlation1 > threshold && correlation1 > correlation0 * ratio) {
    return '1';
  }
  
  return null;
};

// Simple frequency domain detection
const detectBitFrequencySimple = (segment, sampleRate) => {
  const freq0 = CARRIER_FREQUENCY - 500;
  const freq1 = CARRIER_FREQUENCY + 500;
  
  // Calculate power at each frequency using DFT
  const power0 = calculateSimpleDFT(segment, freq0, sampleRate);
  const power1 = calculateSimpleDFT(segment, freq1, sampleRate);
  
  const threshold = 0.0001;
  
  if (power0 > threshold && power0 > power1 * 1.1) {
    return '0';
  } else if (power1 > threshold && power1 > power0 * 1.1) {
    return '1';
  }
  
  return null;
};

// Zero crossing detection
const detectBitZeroCrossing = (segment, sampleRate) => {
  const freq0 = CARRIER_FREQUENCY - 500;
  const freq1 = CARRIER_FREQUENCY + 500;
  
  const expectedCrossings0 = freq0 * 2 * (segment.length / sampleRate);
  const expectedCrossings1 = freq1 * 2 * (segment.length / sampleRate);
  
  let crossings = 0;
  for (let i = 1; i < segment.length; i++) {
    if ((segment[i] >= 0) !== (segment[i-1] >= 0)) {
      crossings++;
    }
  }
  
  const diff0 = Math.abs(crossings - expectedCrossings0);
  const diff1 = Math.abs(crossings - expectedCrossings1);
  
  // More tolerant threshold
  if (diff0 < diff1 * 0.9 && crossings > 10) {
    return '0';
  } else if (diff1 < diff0 * 0.9 && crossings > 10) {
    return '1';
  }
  
  return null;
};

// Simple DFT calculation
const calculateSimpleDFT = (segment, frequency, sampleRate) => {
  let real = 0;
  let imag = 0;
  
  for (let i = 0; i < segment.length; i++) {
    const phase = -2 * Math.PI * frequency * i / sampleRate;
    real += segment[i] * Math.cos(phase);
    imag += segment[i] * Math.sin(phase);
  }
  
  return Math.sqrt(real * real + imag * imag) / segment.length;
};

// Analyze audio chunk characteristics
const analyzeAudioChunk = (chunk, sampleRate) => {
  const maxAmplitude = Math.max(...chunk.map(Math.abs));
  const rms = Math.sqrt(chunk.reduce((sum, val) => sum + val * val, 0) / chunk.length);
  
  // Count zero crossings
  let zeroCrossings = 0;
  for (let i = 1; i < chunk.length; i++) {
    if ((chunk[i] >= 0) !== (chunk[i-1] >= 0)) {
      zeroCrossings++;
    }
  }
  
  // Estimate dominant frequency from zero crossings
  const estimatedFreq = (zeroCrossings / 2) / (chunk.length / sampleRate);
  
  // Check for energy at target frequencies
  const targetFreqs = [CARRIER_FREQUENCY - 500, CARRIER_FREQUENCY + 500];
  const targetPowers = targetFreqs.map(freq => calculateSimpleDFT(chunk, freq, sampleRate));
  
  return {
    maxAmplitude: maxAmplitude.toFixed(6),
    rms: rms.toFixed(6),
    zeroCrossings,
    estimatedFreq: estimatedFreq.toFixed(1) + 'Hz',
    targetPowers: targetPowers.map(p => p.toFixed(6)),
    hasTargetFreqs: targetPowers.some(p => p > 0.001)
  };
};

// Helper functions (keeping existing ones)
const matrixToBitString = (matrix) => {
  let bitString = '';
  for (let row of matrix) {
    for (let cell of row) {
      bitString += cell ? '1' : '0';
    }
  }
  
  // Add header with matrix size
  const size = matrix.length;
  const sizeHeader = size.toString(2).padStart(8, '0');
  
  return sizeHeader + bitString;
};

const bitStringToMatrix = (bitString) => {
  if (bitString.length < 8) {
    throw new Error('Bit string too short for size header');
  }
  
  // Extract size from header
  const sizeHeader = bitString.substring(0, 8);
  const size = parseInt(sizeHeader, 2);
  
  if (size < 21 || size > 177 || size % 4 !== 1) {
    throw new Error(`Invalid QR matrix size: ${size}`);
  }
  
  const matrixBits = bitString.substring(8);
  const expectedBits = size * size;
  
  if (matrixBits.length < expectedBits) {
    throw new Error(`Insufficient data: need ${expectedBits} bits, got ${matrixBits.length}`);
  }
  
  // Reconstruct matrix
  const matrix = [];
  for (let i = 0; i < size; i++) {
    const row = [];
    for (let j = 0; j < size; j++) {
      const bitIndex = i * size + j;
      row.push(matrixBits[bitIndex] === '1');
    }
    matrix.push(row);
  }
  
  return matrix;
};

// Keep all your existing helper functions (calculateFrequencyCorrelation, detectBitImproved, etc.)
const calculateFrequencyCorrelation = (segment, targetFreq, sampleRate) => {
  let correlation = 0;
  
  for (let i = 0; i < segment.length; i++) {
    const expectedPhase = (2 * Math.PI * targetFreq * i) / sampleRate;
    correlation += segment[i] * Math.sin(expectedPhase);
  }
  
  return Math.abs(correlation) / segment.length;
};

const detectBitImproved = (segment, sampleRate) => {
  const rms = Math.sqrt(segment.reduce((sum, val) => sum + val * val, 0) / segment.length);
  
  if (rms < 0.0001) {
    return null;
  }
  
  const freq0 = CARRIER_FREQUENCY - 500;
  const freq1 = CARRIER_FREQUENCY + 500;
  
  const correlation0 = calculateFrequencyCorrelation(segment, freq0, sampleRate);
  const correlation1 = calculateFrequencyCorrelation(segment, freq1, sampleRate);
  
  const threshold = 0.01;
  const ratio = 1.1;
  
  if (correlation0 > threshold && correlation0 > correlation1 * ratio) {
    return '0';
  } else if (correlation1 > threshold && correlation1 > correlation0 * ratio) {
    return '1';
  }
  
  return null;
};

const decodeQRMatrix = async (matrix) => {
  try {
    const size = matrix.length;
    console.log('Attempting to decode matrix of size:', size);
    
    // Create ImageData with proper scaling
    const scale = Math.max(1, Math.floor(200 / size));
    const scaledSize = size * scale;
    const imageData = new ImageData(scaledSize, scaledSize);
    
    // Convert matrix to ImageData with scaling
    for (let y = 0; y < scaledSize; y++) {
      for (let x = 0; x < scaledSize; x++) {
        const matrixY = Math.floor(y / scale);
        const matrixX = Math.floor(x / scale);
        const index = (y * scaledSize + x) * 4;
        
        const isDark = matrix[matrixY] && matrix[matrixY][matrixX];
        const color = isDark ? 0 : 255;
        
        imageData.data[index] = color;
        imageData.data[index + 1] = color;
        imageData.data[index + 2] = color;
        imageData.data[index + 3] = 255;
      }
    }
    
    // Use jsQR to decode
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    
    if (code) {
      console.log('Successfully decoded QR code:', code.data);
      return code.data;
    } else {
      throw new Error('No valid QR code pattern found in reconstructed matrix');
    }
  } catch (error) {
    throw new Error(`QR decoding failed: ${error.message}`);
  }
};

// Export test function
export const testForEncodedData = async (audioBuffer) => {
  const channelData = audioBuffer.getChannelData(audioBuffer.numberOfChannels > 1 ? 1 : 0);
  const sampleRate = audioBuffer.sampleRate;
  
  console.log('=== TESTING FOR ENCODED DATA ===');
  
  const testChunk = channelData.slice(0, Math.min(8192, channelData.length));
  let totalTargetPower = 0;
  
  const targetFreqs = [CARRIER_FREQUENCY - 500, CARRIER_FREQUENCY + 500];
  for (const freq of targetFreqs) {
    let power = 0;
    for (let i = 0; i < testChunk.length; i++) {
      const phase = 2 * Math.PI * freq * i / sampleRate;
      power += testChunk[i] * Math.sin(phase);
    }
    totalTargetPower += Math.abs(power) / testChunk.length;
  }
  
  return {
    hasUltrasonicContent: totalTargetPower > 0.001,
    totalTargetPower,
    recommendation: totalTargetPower > 0.001 ? 'Audio may contain encoded data' : 'No ultrasonic signals detected'
  };
};

// Add a comprehensive test function
export const debugAudioFile = async (audioBuffer) => {
  const channelData = audioBuffer.getChannelData(audioBuffer.numberOfChannels > 1 ? 1 : 0);
  const sampleRate = audioBuffer.sampleRate;
  
  console.log('=== COMPREHENSIVE AUDIO DEBUG ===');
  console.log('Sample rate:', sampleRate);
  console.log('Duration:', audioBuffer.duration.toFixed(2), 'seconds');
  console.log('Max frequency theoretically detectable:', sampleRate / 2, 'Hz');
  console.log('Target frequencies:', CARRIER_FREQUENCY - 500, 'Hz and', CARRIER_FREQUENCY + 500, 'Hz');
  
  // Test multiple positions in the file
  const testPositions = [0, 0.25, 0.5, 0.75, 1.0].map(p => 
    Math.floor(p * Math.min(channelData.length, sampleRate * 60)) // Max 1 minute
  );
  
  for (const pos of testPositions) {
    const timePos = pos / sampleRate;
    const chunkSize = Math.min(8192, channelData.length - pos);
    const chunk = channelData.slice(pos, pos + chunkSize);
    
    const analysis = analyzeAudioChunk(chunk, sampleRate);
    console.log(`Position ${timePos.toFixed(1)}s:`, analysis);
  }
  
  return 'Debug complete - check console for details';
};