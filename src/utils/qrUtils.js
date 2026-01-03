// QR code processing utilities for Sound QR
export class QRProcessor {
  constructor() {
    this.versionSpecs = {
      1: { size: 21, chunks: 4, paddedBits: 24, timePerColumn: 40 },
      2: { size: 25, chunks: 5, paddedBits: 30, timePerColumn: 50 },
      3: { size: 29, chunks: 5, paddedBits: 30, timePerColumn: 50 },
      4: { size: 33, chunks: 6, paddedBits: 36, timePerColumn: 60 },
      5: { size: 37, chunks: 7, paddedBits: 42, timePerColumn: 70 }
    };
  }

  getCycleTiming(version) {
    const spec = this.versionSpecs[version];
    if (!spec) throw new Error(`Unsupported QR version: ${version}`);
    
    const dataTime = spec.size * spec.timePerColumn; // ms
    const totalTime = dataTime + 300; // 100ms start + 100ms end + 100ms gap
    
    return {
      dataTime,
      totalTime,
      columns: spec.size,
      timePerColumn: spec.timePerColumn
    };
  }

  // Fix padding validation logic
  validatePadding(chunks, version) {
    const spec = this.versionSpecs[version];
    if (!spec) {
      console.log(`Padding validation failed: Invalid version ${version}`);
      return false;
    }

    // Check chunk count first
    if (chunks.length !== spec.chunks) {
      console.log(`Padding validation failed: Wrong chunk count. Expected ${spec.chunks}, got ${chunks.length}`);
      return false;
    }

    // Convert chunks back to binary to validate padding
    let binaryData = '';
    for (let i = 0; i < chunks.length; i++) {
      const chunkValue = chunks[i];
      
      // Validate chunk range
      if (chunkValue < 0 || chunkValue > 63) {
        console.log(`Padding validation failed: Invalid chunk value ${chunkValue} at index ${i}`);
        return false;
      }
      
      // Convert to 6-bit binary string
      const binaryChunk = chunkValue.toString(2).padStart(6, '0');
      binaryData += binaryChunk;
    }

    console.log(`Full binary data: ${binaryData}`);
    console.log(`Chunks: [${chunks.join(', ')}]`);

    // Calculate padding amount
    const actualRows = spec.size; // Use the QR matrix size for this version
    const paddingBits = spec.paddedBits - actualRows;
    
    if (paddingBits > 0) {
      // Check that the last paddingBits are all zeros
      const paddingSection = binaryData.slice(-paddingBits);
      const expectedPadding = '0'.repeat(paddingBits);
      
      if (paddingSection !== expectedPadding) {
        console.log(`Padding validation failed: Expected padding '${expectedPadding}', got '${paddingSection}'`);
        return false;
      }
    }

    return true;
  }

  // Fix column reconstruction
  reconstructColumn(chunks, version) {
    const spec = this.versionSpecs[version];
    if (!spec) {
      throw new Error(`Invalid version for reconstruction: ${version}`);
    }

    if (!this.validatePadding(chunks, version)) {
      throw new Error('Column failed padding validation');
    }

    // Convert chunks to binary data
    let binaryData = '';
    for (const chunk of chunks) {
      binaryData += chunk.toString(2).padStart(6, '0');
    }

    // Extract only the actual data bits (remove padding)
    const actualBits = binaryData.slice(0, spec.size);
    
    // Convert binary string to array of integers (0 or 1)
    const column = [];
    for (let i = 0; i < actualBits.length; i++) {
      column.push(parseInt(actualBits[i]));
    }

    return column;
  }

  // Add matrix transposition helper
  transposeMatrix(matrix) {
    const rows = matrix.length;
    const cols = matrix[0].length;
    const transposed = [];
    
    for (let col = 0; col < cols; col++) {
      const newRow = [];
      for (let row = 0; row < rows; row++) {
        newRow.push(matrix[row][col]);
      }
      transposed.push(newRow);
    }
    
    return transposed;
  }

  // Mock QR decoding for now - replace with actual QR library later
  async decodeQRMatrix(matrix) {
    console.log('Attempting to decode QR matrix...');
    console.log(`Matrix dimensions: ${matrix.length}x${matrix[0].length}`);
    
    // For debugging - log first few rows
    for (let i = 0; i < Math.min(5, matrix.length); i++) {
      console.log(`Row ${i}: [${matrix[i].slice(0, 10).join('')}...]`);
    }
    
    // Mock successful decoding for testing
    // In real implementation, this would use a QR library like jsqr or qrcode-reader
    const mockDecodedData = "Tanner Miller";
    
    console.log(`Mock decoded data: "${mockDecodedData}"`);
    return mockDecodedData;
  }

  // Add matrix validation
  validateMatrix(matrix, expectedSize) {
    if (!matrix || !Array.isArray(matrix)) {
      console.log('Matrix validation failed: Matrix is not an array');
      return false;
    }

    if (matrix.length !== expectedSize) {
      console.log(`Matrix validation failed: Expected ${expectedSize} rows, got ${matrix.length}`);
      return false;
    }

    for (let i = 0; i < matrix.length; i++) {
      if (!Array.isArray(matrix[i]) || matrix[i].length !== expectedSize) {
        console.log(`Matrix validation failed: Row ${i} has invalid length`);
        return false;
      }
      
      // Check that all values are 0 or 1
      for (let j = 0; j < matrix[i].length; j++) {
        if (matrix[i][j] !== 0 && matrix[i][j] !== 1) {
          console.log(`Matrix validation failed: Invalid value ${matrix[i][j]} at [${i}][${j}]`);
          return false;
        }
      }
    }

    return true;
  }
}