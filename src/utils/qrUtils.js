import jsQR from 'jsqr';

export class QRProcessor {

    getVersionSpec(version) {
        const specs = {
            1: { size: 21, capacity: 25, chunkSize: 6 },
            2: { size: 25, capacity: 47, chunkSize: 6 },
            3: { size: 29, capacity: 77, chunkSize: 6 },
            4: { size: 33, capacity: 114, chunkSize: 6 },
            5: { size: 37, capacity: 154, chunkSize: 6 }
        };
        if (!specs[version]) throw new Error(`Unsupported QR version: ${version}`);
        return specs[version];
    }

    async generateQR(text, version = 1) {
        const spec = this.getVersionSpec(version);
        const QRCode = (await import('qrcode')).default;
        const qrOptions = {
            version: version,
            errorCorrectionLevel: 'M',
            type: 'array',
            width: spec.size,
            margin: 0
        };

        // Use create() to get the raw object, then extract modules
        const qrRaw = QRCode.create(text, qrOptions);
        const modules = qrRaw.modules.data; // Uint8Array of 0s and 1s
        const size = qrRaw.modules.size;

        // Convert flat array to 2D matrix
        const matrix = [];
        for (let i = 0; i < size; i++) {
            const row = [];
            for (let j = 0; j < size; j++) {
                row.push(modules[i * size + j]);
            }
            matrix.push(row);
        }
        return matrix;
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

    getCycleTiming(version) {
        const cols = 21 + (version - 1) * 4;
        const chunksPerCol = Math.ceil(cols / 6);
        const dataTime = cols * chunksPerCol * 60;
        const overhead = 100 + 100 + 300;
        return { chunkDuration: 60, totalTime: dataTime + overhead };
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

    /**
     * Decodes a raw binary matrix (2D array of 0s and 1s) into text.
     */
    async decodeMatrix(matrix, version) {
        try {
            const size = matrix.length;
            const scale = 8; // Smaller scale is usually sufficient and faster
            const canvasSize = size * scale;
            const totalPixels = canvasSize * canvasSize;

            // Create a buffer for pixel data manually (RGBA)
            // This avoids Canvas API entirely if we just need to feed jsQR
            // jsQR expects: Uint8ClampedArray (r,g,b,a, r,g,b,a...)

            const data = new Uint8ClampedArray(totalPixels * 4);

            // Fill data
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    const isDark = matrix[r][c] === 1;
                    const val = isDark ? 0 : 255; // Black or White

                    // Fill the scaled block
                    for (let y = 0; y < scale; y++) {
                        for (let x = 0; x < scale; x++) {
                            const pixelIndex = ((r * scale + y) * canvasSize + (c * scale + x)) * 4;
                            data[pixelIndex + 0] = val; // R
                            data[pixelIndex + 1] = val; // G
                            data[pixelIndex + 2] = val; // B
                            data[pixelIndex + 3] = 255; // Alpha
                        }
                    }
                }
            }

            // Load jsQR
            let jsQR;
            if (typeof window.jsQR !== 'undefined') {
                jsQR = window.jsQR;
            } else {
                try {
                    const module = await import('jsqr');
                    jsQR = module.default || module;
                } catch(e) {
                    console.error("jsQR library not found");
                    return null;
                }
            }

            // Attempt Decode
            const code = jsQR(data, canvasSize, canvasSize, {
                inversionAttempts: "attemptBoth",
            });

            if (code) {
                console.log("✅ Matrix Decoded Successfully:", code.data);
                return {
                    version: version,
                    data: code.data,
                    confidence: 1.0
                };
            } else {
                console.warn("❌ jsQR could not decode the reconstructed matrix.");
                // Debug: Print matrix snippet to console
                // console.log(matrix.map(row => row.join('')).join('\n'));
                return null;
            }

        } catch (e) {
            console.error("Matrix decoding error:", e);
            return null;
        }
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