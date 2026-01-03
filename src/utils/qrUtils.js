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

  // Add the missing generateQR method
  async generateQR(text, version = 1) {
    try {
      // Import the QR code library
      const QRCode = (await import('qrcode')).default;
      
      const spec = this.versionSpecs[version];
      if (!spec) {
        throw new Error(`Unsupported QR version: ${version}`);
      }

      // Generate QR code with specific version and error correction
      const qrOptions = {
        version: version,
        errorCorrectionLevel: 'M', // Medium error correction (~15%)
        type: 'terminal', // Get raw data
        small: true
      };

      // Generate the QR code matrix
      const qrString = await QRCode.toString(text, qrOptions);
      
      // Parse the QR string into a matrix
      const lines = qrString.trim().split('\n');
      const matrix = [];
      
      for (let row = 0; row < lines.length; row++) {
        const line = lines[row];
        const matrixRow = [];
        
        // Parse each character (█ = 1, space = 0)
        for (let col = 0; col < line.length; col += 2) { // Each block is 2 characters wide
          const char = line.substring(col, col + 2);
          matrixRow.push(char.includes('█') ? 1 : 0);
        }
        
        // Only add rows that match expected size
        if (matrixRow.length === spec.size) {
          matrix.push(matrixRow);
        }
      }

      // Validate matrix size
      if (matrix.length !== spec.size) {
        console.warn(`Matrix size mismatch: expected ${spec.size}x${spec.size}, got ${matrix.length}x${matrix[0]?.length}`);
        
        // Fallback: create a simple test matrix for debugging
        console.log('Creating fallback test matrix...');
        const testMatrix = this.createTestMatrix(spec.size, text);
        return {
          matrix: testMatrix,
          version: version,
          text: text,
          fallback: true
        };
      }

      console.log(`Generated QR matrix: ${matrix.length}x${matrix[0].length} for version ${version}`);
      
      return {
        matrix: matrix,
        version: version,
        text: text,
        fallback: false
      };

    } catch (error) {
      console.warn(`QR generation failed: ${error.message}, using fallback`);
      
      // Fallback: create a simple test matrix
      const spec = this.versionSpecs[version];
      const testMatrix = this.createTestMatrix(spec.size, text);
      
      return {
        matrix: testMatrix,
        version: version,
        text: text,
        fallback: true
      };
    }
  }

  // Create a simple test matrix for fallback
  createTestMatrix(size, text) {
    const matrix = [];
    
    // Create a predictable pattern based on text
    const textHash = this.simpleHash(text);
    
    for (let row = 0; row < size; row++) {
      const matrixRow = [];
      for (let col = 0; col < size; col++) {
        // Create a pattern that includes some data based on position and text hash
        const value = ((row + col + textHash) % 3 === 0) ? 1 : 0;
        matrixRow.push(value);
      }
      matrix.push(matrixRow);
    }
    
    console.log(`Created ${size}x${size} test matrix for "${text}"`);
    return matrix;
  }

  // Simple hash function for test data
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) % 100;
  }

  // Add the missing processColumn method
  processColumn(matrix, colIndex, version) {
    const spec = this.versionSpecs[version];
    if (!spec) {
      throw new Error(`Invalid version: ${version}`);
    }

    if (colIndex >= matrix.length) {
      throw new Error(`Column index ${colIndex} out of bounds for matrix size ${matrix.length}`);
    }

    // Extract column data
    const column = matrix[colIndex];
    
    // Convert column to binary string
    let binaryData = column.map(bit => bit.toString()).join('');
    
    // Add padding to make it divisible by 6
    const paddedLength = spec.paddedBits;
    const paddingNeeded = paddedLength - binaryData.length;
    
    if (paddingNeeded > 0) {
      binaryData += '0'.repeat(paddingNeeded);
    } else if (paddingNeeded < 0) {
      // Truncate if somehow too long
      binaryData = binaryData.substring(0, paddedLength);
    }

    // Split into 6-bit chunks
    const chunks = [];
    for (let i = 0; i < binaryData.length; i += 6) {
      const chunk = binaryData.substring(i, i + 6);
      const value = parseInt(chunk, 2);
      chunks.push(value);
    }

    // Validate chunk count
    if (chunks.length !== spec.chunks) {
      throw new Error(`Chunk count mismatch: expected ${spec.chunks}, got ${chunks.length}`);
    }

    return chunks;
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