// Audio processing utilities for Sound QR
export class AudioProcessor {
    constructor() {
        this.audioContext = null;
        this.sampleRate = 44100; // Default, will be updated on init
        this.MIN_REQUIRED_RATE = 88200; // RFC-676767 Requirement
    }

    async initAudioContext() {
        if (!this.audioContext || this.audioContext.state === 'closed') {
            const AudioContext = window.AudioContext || window.webkitAudioContext;

            // Request high sample rate for ultrasonic support (RFC-UI67)
            const options = {
                sampleRate: 96000 // Preferred per RFC-UI67
            };

            try {
                this.audioContext = new AudioContext(options);
            } catch (e) {
                console.warn("Could not set 96kHz sample rate, falling back to system default.");
                this.audioContext = new AudioContext();
            }

            // Resume context if suspended
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            this.sampleRate = this.audioContext.sampleRate;
            console.log(`Audio context initialized: ${this.sampleRate}Hz`);

            // RFC-676767 Validation
            if (this.sampleRate < this.MIN_REQUIRED_RATE) {
                console.warn(`⚠️ Sample rate ${this.sampleRate}Hz is below the RFC-676767 requirement (88.2kHz). Ultrasonic decoding may fail.`);
            }
        }
        return this.audioContext;
    }

    /**
     * RFC-676767 Frequency Specification
     * Range: 21,000 Hz - 24,090 Hz
     */
    getFrequencyConfig() {
        return {
            // Data Grid: 22,200 Hz to 24,090 Hz
            dataStart: 22200,
            step: 30, // 30 Hz spacing
            bins: 64, // 6-bit encoding

            // Boundary Markers: 21,000 Hz - 21,900 Hz
            markers: {
                // Version Identifiers (Start Markers)
                versionStart: {
                    1: 21000,
                    2: 21200,
                    3: 21400,
                    4: 21600,
                    5: 21800
                },
                // Universal End Marker
                end: {
                    1: 21100,
                    2: 21300,
                    3: 21500,
                    4: 21700,
                    5: 21900
                }
            }
        };
    }

    // Helper: Calculate frequency for a 6-bit chunk value (0-63)
    getFrequencyForChunk(value) {
        const config = this.getFrequencyConfig();
        if (value < 0 || value >= config.bins) {
            throw new Error(`Chunk value ${value} out of range (0-63)`);
        }
        return config.dataStart + (value * config.step);
    }

    async loadAudioFile(file) {
        if (!file || !(file instanceof Blob)) {
            throw new Error(`Invalid input: Expected File or Blob, got ${Object.prototype.toString.call(file)}`);
        }

        let arrayBuffer;
        if (typeof file.arrayBuffer === 'function') {
            try {
                arrayBuffer = await file.arrayBuffer();
            } catch (e) {
                arrayBuffer = await this.readFileAsArrayBuffer(file);
            }
        } else {
            arrayBuffer = await this.readFileAsArrayBuffer(file);
        }

        await this.initAudioContext();
        return await this.audioContext.decodeAudioData(arrayBuffer);
    }

    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
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
            1: { start: 21000, end: 21100 },
            2: { start: 21200, end: 21300 },
            3: { start: 21400, end: 21500 },
            4: { start: 21600, end: 21700 },
            5: { start: 21800, end: 21900 }
        };
    }

    generateTone(frequency, duration, amplitude = 0.1) {
        const sampleRate = this.sampleRate;
        const length = Math.floor(duration * sampleRate);
        const samples = new Float32Array(length);
        const omega = 2 * Math.PI * frequency / sampleRate;

        // Apply envelope to prevent clicking
        const attackRelease = Math.min(length * 0.1, 500); // Short fade in/out

        for (let i = 0; i < length; i++) {
            let envelope = 1;
            if (i < attackRelease) {
                envelope = i / attackRelease;
            } else if (i > length - attackRelease) {
                envelope = (length - i) / attackRelease;
            }
            samples[i] = amplitude * envelope * Math.sin(omega * i);
        }
        return samples;
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

}