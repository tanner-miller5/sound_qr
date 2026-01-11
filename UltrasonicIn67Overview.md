# Ultrasonic-in-67: Technical Overview & Format Specification
---

### **Executive Summary**

**Ultrasonic-in-67** is a specialized audio-visual software tool designed to handle MP4 files with a unique capability: **preserving high-frequency audio data** that standard encoders typically discard.

Most standard MP4 creation tools use "lossy" compression (like AAC or MP3) which aggressively deletes sounds above the limit of human hearing (~20 kHz) to save file size. **Ultrasonic-in-67** is engineered to bypass these psychoacoustic filters, allowing it to encode (write) and decode (read) ultrasonic frequencies within the MP4 container.

---

### **Technical Breakdown**

To understand why this application is significant, we must expand on the specific technical hurdles it overcomes:

#### **1. The Problem: The "Brick Wall" Filter**

Standard MP4 encoders (using the Advanced Audio Coding, or AAC, standard) are designed for the human ear.

* **Psychoacoustic Modeling:** To compress a file, encoders analyze audio and delete "irrelevant" data.
* **The Cutoff:** Most default encoders apply a **Low-Pass Filter (LPF)** at approximately **16 kHz to 18 kHz**. Any frequency above this "brick wall" is wiped out completely to lower the bitrate.
* **Result:** If you tried to hide an ultrasonic signal (e.g., at 21 kHz) in a standard MP4, the encoder would erase it instantly.

#### **2. The Solution: Ultrasonic-in-67’s Engine**

**Ultrasonic-in-67** modifies the encoding pipeline to retain these frequencies. It likely operates using the following mechanisms:

* **High Sample Rate Preservation:** According to the *Nyquist-Shannon sampling theorem*, to capture a frequency of ****, you need a sample rate of at least ****.
* *Standard MP4:* 44.1 kHz sample rate (Max frequency: ~22.05 kHz).
* *Ultrasonic-in-67:* Likely supports or forces **48 kHz, 96 kHz, or 192 kHz** sample rates to allow for frequencies well into the ultrasonic range (24 kHz–96 kHz).


* **Filter Bypassing:** It disables the standard Low-Pass Filter during the compression phase, forcing the codec to allocate bits to high-frequency sounds even if humans cannot hear them.

---

### **Comparative Analysis: Standard MP4 vs. Ultrasonic-in-67**

| Feature | Standard MP4 Encoder | Ultrasonic-in-67 |
| --- | --- | --- |
| **Audio Codec** | Standard AAC (Optimized for size) | Modified AAC or Lossless (ALAC/FLAC) |
| **Frequency Cutoff** | ~17 kHz - 20 kHz | No artificial cutoff (Hardware limited) |
| **Primary Goal** | Smallest file size; "Perceptual" quality | Data integrity; Full spectrum retention |
| **Ultrasonic Data** | **Erased** (viewed as "waste") | **Preserved** (viewed as signal) |

---

### **Use Cases & Implications**

Why would a user require an application like **Ultrasonic-in-67**? The preservation of ultrasonic frequencies opens the door to several "silent" functionalities:

#### **1. Data Transmission (Audio Steganography)**

This is the most common use case for ultrasonic retention. Devices can communicate "over the air" without the user hearing it.

* **Cross-Device Tracking:** Advertisers use ultrasonic beacons (like SilverPush) embedded in TV commercials. Your phone picks up the inaudible beep to link your TV habits to your mobile profile.
* **Near-Field Communication:** Transmitting data (tokens, URLs) between phones in a room without pairing (Bluetooth/Wi-Fi).

#### **2. High-Fidelity Archival**

Audiophiles and researchers may use this to preserve the "air" or harmonics of a recording that exist above 20 kHz. While inaudible, some argue these frequencies affect the "feel" of the sound through intermodulation distortion.

#### **3. Covert Communication**

Users can embed secret audio messages or data streams into a seemingly normal video file.

* *Example:* A video of a cat playing could contain a hidden ultrasonic track carrying an encrypted text file. Standard players play the cat sounds; **Ultrasonic-in-67** decodes the hidden message.

---

### **Summary of "Ultrasonic-in-67"**

> **Ultrasonic-in-67** is a utility that treats the MP4 container not just as a storage medium for human-perceptible media, but as a broad-spectrum data carrier. It specifically targets the **encoding stage** to prevent the automatic deletion of frequencies above 20,000 Hz, enabling the storage of silent signals, tracking beacons, or high-fidelity audio data that standard software would destroy.

---

# UI67 Format Specification (Proposal)

A new media format that is compressed while supporting ultrasonic sound (frequencies >20kHz). We need to design something that handles both video and audio efficiently. Ultrasonic audio requires high sample rates (e.g., 96kHz or higher) to capture and reproduce frequencies up to ~48kHz without aliasing. Standard lossy codecs like AAC or MP3 often filter or degrade these highs, so we'll use lossless compression for the audio to preserve them.

I'll propose a simple new format called **UI67 (Ultrasonic In 67 Format)** as a custom container. It's inspired by existing containers like MP4 or MKV but simplified for this purpose—binary structure with compressed video and audio streams. It's "new" in that it's not a standard format, requiring custom tools to read/write/play it.

### **Design Principles**

* **Compression:** Use **H.264** (lossy) for video to keep file sizes small. For audio, use **FLAC** (lossless) at high sample rates to compress without losing ultrasonics—FLAC achieves ~40-50% compression on typical audio while preserving all frequencies.
* **Ultrasonic Support:** Audio stream at **96kHz/24-bit PCM** base, including ultrasonics. FLAC ensures no high-frequency loss.
* **Container:** A binary file with a header, followed by interleaved or separate chunks of video and audio data for efficient streaming/seeking.
* **Why New?:** Avoids limitations of MP4 (e.g., potential high-sample-rate incompatibilities on some players) and allows custom extensions like ultrasonic-specific metadata (e.g., frequency ranges for beacons, watermarks, or QR codes).
* **File Extension:** `.ui67`
* **Pros:** Compressed (smaller than raw), preserves ultrasonics, extensible.
* **Cons:** Requires custom player/decoder; not compatible with standard media players.

### **UI67 File Structure (Binary Layout)**

The format is chunk-based, similar to RIFF/WAV or MP4 atoms, for easy parsing.

#### **File Header (fixed 40 bytes)**

* **Magic bytes:** `UI67` (4 bytes, ASCII)
* **Version:** `uint16` (2 bytes, e.g., 1)
* **Total file length:** `uint64` (8 bytes)
* **Video codec:** 4-byte string (4 bytes, e.g., `H264`)
* **Audio codec:** 4-byte string (4 bytes, e.g., `FLAC`)
* **Sample rate:** `uint32` (4 bytes, e.g., 96000 for ultrasonics)
* **Channels:** `uint8` (1 byte, e.g., 2 for stereo)
* **Bit depth:** `uint8` (1 byte, e.g., 24)
* **Duration:** `uint64` (8 bytes, milliseconds)
* **Reserved:** 4 bytes (for future use, e.g., ultrasonic metadata like target freq)

#### **Video Stream Chunk**

* **Chunk ID:** `VIDO` (4 bytes)
* **Chunk length:** `uint64` (bytes of data)
* **Data:** Compressed H.264 video stream (raw NAL units, no container overhead)

#### **Audio Stream Chunk**

* **Chunk ID:** `AUDO` (4 bytes)
* **Chunk length:** `uint64` (bytes of data)
* **Data:** FLAC-encoded audio (high-sample-rate PCM compressed lossless)

#### **End Chunk (optional for integrity)**

* **Chunk ID:** `END ` (4 bytes)
* **Chunk length:** 0

Chunks can be interleaved (e.g., small video/audio segments alternating) for better seeking, but for simplicity, we'll keep them as single large chunks. Total file size is reduced via compression: Video ~70-90% smaller than raw; audio ~40-50% via FLAC.