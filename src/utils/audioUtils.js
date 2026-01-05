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
        // FIX: Guard against invalid inputs
        if (!file || !(file instanceof Blob)) {
            throw new Error(`Invalid input: Expected File or Blob, got ${Object.prototype.toString.call(file)}`);
        }

        let arrayBuffer;

        // Robust way to get ArrayBuffer
        if (typeof file.arrayBuffer === 'function') {
            try {
                arrayBuffer = await file.arrayBuffer();
            } catch (e) {
                console.warn('file.arrayBuffer() failed, trying FileReader...', e);
                arrayBuffer = await this.readFileAsArrayBuffer(file);
            }
        } else {
            arrayBuffer = await this.readFileAsArrayBuffer(file);
        }

        await this.initAudioContext();

        try {
            return await this.audioContext.decodeAudioData(arrayBuffer);
        } catch (error) {
            throw new Error(`Failed to decode audio data: ${error.message}`);
        }
    }
    
    // Helper for reading files in older environments
    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                if (reader.result) resolve(reader.result);
                else reject(new Error('File read result was empty'));
            };
            reader.onerror = () => reject(new Error(`FileReader error: ${reader.error?.message}`));
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
            1: { start: 14000, end: 14100 },
            2: { start: 14200, end: 14300 },
            3: { start: 14400, end: 14500 },
            4: { start: 14600, end: 14700 },
            5: { start: 14800, end: 14900 }
        };
    }

    // Generate a pure sine wave tone
    generateTone(frequency, duration, amplitude = 0.1) {
        if (!this.sampleRate) this.sampleRate = 48000;

        const sampleCount = Math.floor(this.sampleRate * duration);
        const samples = new Float32Array(sampleCount);
        const omega = 2 * Math.PI * frequency / this.sampleRate; // Pre-calculate angular frequency

        for (let i = 0; i < sampleCount; i++) {
            // Apply a generic envelope to prevent clicking
            let envelope = 1.0;
            const attackRelease = Math.min(sampleCount * 0.1, 480); // 10% or ~10ms

            if (i < attackRelease) {
                envelope = i / attackRelease;
            } else if (i > sampleCount - attackRelease) {
                envelope = (sampleCount - i) / attackRelease;
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