export class QRProcessor {
  // Add the missing getVersionSpec method
    getVersionSpec(version) {
        const specs = {
            1: { size: 21, capacity: 25, chunkSize: 6 },
            2: { size: 25, capacity: 47, chunkSize: 6 },
            3: { size: 29, capacity: 77, chunkSize: 6 },
            4: { size: 33, capacity: 114, chunkSize: 6 },
            5: { size: 37, capacity: 154, chunkSize: 6 }
        };

        if (!specs[version]) {
            throw new Error(`Unsupported QR version: ${version}`);
        }

        return specs[version];
    }

  async generateQR(text, version = 1) {
    const spec = this.getVersionSpec(version);
    console.log(`Generating QR for "${text}" (Version ${version})`);
    

        // Import QRCode library
        const QRCode = (await import('qrcode')).default;
        
        // Generate QR code with specific options
        const qrOptions = {
            version: version,
            errorCorrectionLevel: 'M',
            type: 'array',
            width: spec.size,
            margin: 0
        };
        
        console.log(`🔧 QR options:`, qrOptions);
        
        // Generate the QR code matrix
        const qrArray = await QRCode.toDataURL(text, qrOptions);
        
        // Since toDataURL doesn't give us the raw matrix, use create instead
        const qrSegments = QRCode.create(text, qrOptions);
        
        // Extract the matrix from the QR segments
        const matrix = [];
        const modules = qrSegments.modules;
        const size = modules.size;
        
        console.log(`🔧 QR modules size: ${size}`);
        
        // Convert modules to 2D array
        for (let row = 0; row < size; row++) {
            matrix[row] = [];
            for (let col = 0; col < size; col++) {
                matrix[row][col] = modules.get(row, col) ? 1 : 0;
            }
        }
        
        // Validate matrix
        if (matrix.length !== spec.size || !matrix[0] || matrix[0].length !== spec.size) {
            console.warn(`Matrix size mismatch: expected ${spec.size}x${spec.size}, got ${matrix.length}x${matrix[0]?.length}`);
            throw new Error(`Invalid matrix size: expected ${spec.size}x${spec.size}, got ${matrix.length}x${matrix[0]?.length}`);
        }
        
        console.log(`✅ Generated QR matrix: ${matrix.length}x${matrix[0].length}`);

        console.log(matrix)

        return {
            matrix: matrix,
            version: version,
            text: text
        };
  }

  createFallbackTestMatrix(size, text) {
    // Create a basic pattern matrix for testing
    const matrix = [];
    
    for (let row = 0; row < size; row++) {
        matrix[row] = [];
        for (let col = 0; col < size; col++) {
            // Create a simple pattern based on text and position
            let value = 0;
            
            // Add finder patterns (corners)
            if ((row < 7 && col < 7) || 
                (row < 7 && col >= size - 7) || 
                (row >= size - 7 && col < 7)) {
                // Simple finder pattern simulation
                const inBorder = (row === 0 || row === 6 || col === 0 || col === 6);
                const inCenter = (row >= 2 && row <= 4 && col >= 2 && col <= 4);
                value = (inBorder || inCenter) ? 1 : 0;
            } else {
                // Data area - use text hash and position
                const textHash = text.split('').reduce((hash, char) => hash + char.charCodeAt(0), 0);
                value = ((row + col + textHash) % 3) === 0 ? 1 : 0;
            }
            
            matrix[row][col] = value;
        }
    }
    
    return matrix;
  }

    // Updated getCycleTiming method with more accurate values
    getCycleTiming(version) {
        const spec = this.getVersionSpec(version);

        // Based on the encoder logs, we know:
        // - Start marker: 100ms (0.1s)
        // - Each chunk: 10ms (0.01s)
        // - End marker: 100ms (0.1s)
        // - Gap between columns: 0ms (no gap shown in logs)

        const startMarker = 100;      // 100ms start marker
        const endMarker = 100;        // 100ms end marker
        const chunkDuration = 60;     // 60ms per chunk
        const columnGap = 0;          // No gap between columns

        // Calculate total chunks needed
        const chunksPerColumn = Math.ceil(spec.size / spec.chunkSize);
        const totalChunks = spec.size * chunksPerColumn;

        const dataTime = totalChunks * chunkDuration; // Total data encoding time
        const totalTime = startMarker + dataTime + endMarker;

        return {
            startMarker,        // 100ms
            chunkDuration,      // 10ms per chunk
            endMarker,          // 100ms
            columnGap,          // 0ms gap between columns
            dataTime,           // Total data time
            totalTime,          // Total cycle time
            chunksPerColumn,    // Chunks per column
            totalChunks         // Total chunks
        };
    }

    processColumn(matrix, col, version) {
        const spec = this.getVersionSpec(version);
        const chunks = [];
        const numChunks = Math.ceil(spec.size / spec.chunkSize);

        for (let i = 0; i < numChunks; i++) {
            let value = 0;
            const startRow = i * spec.chunkSize;

            for (let bit = 0; bit < spec.chunkSize; bit++) {
                const row = startRow + bit;
                // Safety check + LSB packing
                if (row < spec.size && matrix[row][col] === 1) {
                    value |= (1 << bit);
                }
            }
            chunks.push(value);
        }
        return chunks;
    }

  // Add the decoding methods as well
    async decodeQRMatrix(matrix) {
        if (!matrix || matrix.length === 0) return null;

        console.log('Attempting to decode QR matrix...');

        // Import jsQR (fallback handled)
        let jsQR;
        try {
            jsQR = (await import('jsqr')).default || window.jsQR;
        } catch (e) {
            jsQR = window.jsQR;
        }

        if (!jsQR) {
            console.error('jsQR library not found!');
            return null;
        }

        const size = matrix.length;

        // FIX: Upscale the image
        // 1 module = 10x10 pixels. This helps jsQR detect ratios correctly.
        const scale = 10;
        const quietZone = 4; // 4 modules of white padding
        const finalSize = (size + (quietZone * 2)) * scale;

        const data = new Uint8ClampedArray(finalSize * finalSize * 4);
        data.fill(255); // Fill entire background with White

        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                // Only draw black modules (default is white)
                if (matrix[row][col] === 1) {

                    // Calculate start position for this 10x10 block
                    const startY = (row + quietZone) * scale;
                    const startX = (col + quietZone) * scale;

                    // Fill the 10x10 block with Black pixels
                    for (let y = 0; y < scale; y++) {
                        for (let x = 0; x < scale; x++) {
                            const pixelIndex = ((startY + y) * finalSize + (startX + x)) * 4;

                            data[pixelIndex + 0] = 0;   // R
                            data[pixelIndex + 1] = 0;   // G
                            data[pixelIndex + 2] = 0;   // B
                            data[pixelIndex + 3] = 255; // A
                        }
                    }
                }
            }
        }

        console.log(`Created upscaled image for detection: ${finalSize}x${finalSize}`);

        // Attempt decode on the large image
        const code = jsQR(data, finalSize, finalSize, {
            inversionAttempts: "attemptBoth"
        });

        if (code) {
            console.log(`✅ SUCCESS: "${code.data}"`);
            return code.data;
        } else {
            console.log('❌ jsQR failed');
            return null;
        }
    }
}