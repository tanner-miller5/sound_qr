# Sound-QR - Project Plan

## Project Overview

Sound-QR is a specialized web application that enables users to encode QR codes into **UI67** multimedia containers 
using true ultrasonic frequency encoding (>20 kHz), and decode them back from high-fidelity audio sources.

### Core Functionality

**Encoding:**
- Embeds QR code data into **UI67 compliant files** using ultrasonic frequencies (21.0-24.09 kHz range).
- **UI67 Integration**: Wraps audio data in the UI67 binary container to prevent "brick wall" filtering by standard codecs.
- **Steganography**: Hides data completely outside the human hearing range (>20 kHz).

**Decoding:**
- Parses **UI67** containers to extract uncompressed ultrasonic audio.
- Supports analysis of high-sample-rate audio streams (88.2 kHz or 96 kHz).
- **Hardware Requirement**: Requires audio hardware capable of 88.2 kHz sampling to capture frequencies up to 24.09 kHz.

### Technical Approach

**Encoding Method:**
1. **Time-based Column Mapping**: Each column of the QR code corresponds to specific time intervals in the audio
2. **Fixed 6-Bit Chunk Encoding**: Each column is divided into uniform 6-bit chunks with zero-padding
3. **Fixed Frequency Grid**: All QR versions use the same 64-frequency grid for consistent encoding
4. **Binary Chunking System**: 
   - Each QR column is padded to the nearest multiple of 6 bits using formula: `ceil(rows/6) * 6`
   - Each 6-bit chunk maps to one of 64 fixed frequencies (0-63)
   - All chunks use the full 64-frequency range consistently
5. **Boundary Markers**: Located outside data frequency range for version detection
6. **Repetition**: Multiple QR encoding cycles within extended time intervals
7. **UI67 Containerization**: Encoded audio is stored as `PCM` or `FLAC` within a UI67 chunk to preserve >20 kHz data.

**Boundary Marker System:**
- **Version 1 (21×21)**: Start 21,000 Hz / End 21,100 Hz
- **Version 2 (25×25)**: Start 21,200 Hz / End 21,300 Hz
- **Version 3 (29×29)**: Start 21,400 Hz / End 21,500 Hz
- **Version 4 (33×33)**: Start 21,600 Hz / End 21,700 Hz
- **Version 5 (37×37)**: Start 21,800 Hz / End 21,900 Hz

**Fixed Frequency Grid:**
- **Data Frequency Range**: 22,200 - 24,090 Hz (1,890 Hz total span, 64 discrete frequencies)
- **Number of Frequencies**: 64 frequencies (indexed 0-63)
- **Frequency Intervals**: 63 intervals between 64 frequencies
- **Frequency Step Size**: 30 Hz (1,890 Hz span ÷ 63 intervals = 30 Hz per step)
- **Frequency Grid**: f(n) = 22,200 + (n × 30) Hz, where n = 0 to 63
- **Frequency Range Clarification**: 
  - Lowest frequency (n=0): 22,200 Hz
  - Highest frequency (n=63): 22,200 + (63 × 30) = 24,090 Hz
  - Span between lowest and highest: 1,890 Hz
  - Each frequency represents a center frequency with ±10 Hz detection tolerance
  - Frequency separation provides ±15 Hz buffer between adjacent frequencies
- **All Versions**: Use identical 64-frequency grid for data encoding

**Chunk Structure with Zero-Padding:**
- **Version 1 (21 rows)**: Pad to 24 bits (add 3 zeros) → 4 chunks of 6 bits each → 240ms per column
- **Version 2 (25 rows)**: Pad to 30 bits (add 5 zeros) → 5 chunks of 6 bits each → 300ms per column
- **Version 3 (29 rows)**: Pad to 30 bits (add 1 zero) → 5 chunks of 6 bits each → 300ms per column
- **Version 4 (33 rows)**: Pad to 36 bits (add 3 zeros) → 6 chunks of 6 bits each → 360ms per column
- **Version 5 (37 rows)**: Pad to 42 bits (add 5 zeros) → 7 chunks of 6 bits each → 420ms per column

**Column Encoding Process:**
1. **Zero-Padding**: Pad each column to nearest multiple of 6 bits using `ceil(rows/6) * 6` (padding bits added at end = 0)
2. **Chunk Division**: Split padded column into 6-bit chunks from top to bottom
3. **Binary Conversion**: Convert each 6-bit chunk to decimal value (0-63)
4. **Frequency Mapping**: Map decimal value to corresponding frequency in the fixed grid
5. **Time Slot Assignment**: Each chunk gets 60ms time slot within the column's time period
6. **Frequency Generation**: Emit the mapped frequency at -20dB amplitude during the chunk's time slot

**Time Allocation per Data encoding:**
- **Version 1**: 21 columns × 240ms = 5,040ms per cycle
- **Version 2**: 25 columns × 300ms = 7,500ms per cycle
- **Version 3**: 29 columns × 300ms = 8,700ms per cycle
- **Version 4**: 33 columns × 360ms = 11,880ms per cycle
- **Version 5**: 37 columns × 420ms = 15,540ms per cycle

**Audio Duration Requirements:**
- **Cycle Overhead**: 300ms per cycle (100ms start marker + 100ms end marker + 100ms gap)
- **Complete Cycle Duration**: 100ms start marker + data encoding time + 100ms end marker + 100ms gap
- **Minimum requirement**: 3 complete cycles for redundancy
- **Version 1**: Complete cycle = 5,340ms; Minimum = 17 seconds (16.02s actual)
- **Version 2**: Complete cycle = 7,800ms; Minimum = 24 seconds (23.40s actual)
- **Version 3**: Complete cycle = 9,000ms; Minimum = 27 seconds (27.00s actual)
- **Version 4**: Complete cycle = 12,180ms; Minimum = 37 seconds (36.54s actual)
- **Version 5**: Complete cycle = 15,840ms; Minimum = 48 seconds (47.52s actual)
- **Recommended duration**:
  - **Optimal environments**: Use minimum duration requirements (16.02-47.52 seconds depending on QR version)


**Cycle Timing and Synchronization:**
- **Cycle structure**: [Start marker 100ms] → [Data encoding] → [End marker 100ms] → [100ms gap] → [Next cycle]
- **Start marker**: Identifies QR version and marks beginning of data
- **End marker**: Confirms QR version and marks end of data
- **Inter-cycle gap**: 100ms silence between cycles for clear separation
- **Marker validation**: Start and end markers must match the same version for cycle to be considered valid

**Audio Integration:**
- QR cycles repeat continuously throughout the audio duration
- Boundary marker pairs frame each complete QR data cycle
- Multiple complete cycles provide redundancy and error correction
- **Audio Format Requirements**: 
  - **Mono Input**: QR data embedded directly into the single channel; output remains mono
  - **Stereo Input**: QR data embedded into left channel only, right channel preserves original audio unchanged; output maintains stereo format
  - **Mono-to-Stereo Encoding**: If original audio is mono but stereo output desired, duplicate original audio to right channel and embed QR data in left channel only
  - Minimum 88.2 kHz sample rate required for proper frequency reproduction
  - 16-bit or higher bit depth recommended for adequate dynamic range
  - Embedded frequencies at -20dB relative to original audio peak level

**Technical Specifications:**
- **Full Operational Range**: 21,000 - 24,090 Hz (3,090 Hz total bandwidth)
- **Boundary Frequency Range**: 21,000 - 21,900 Hz (900 Hz total range)
- **Data Frequency Range**: 22,200 - 24,090 Hz (1,890 Hz span between min/max frequencies)
- **Boundary Marker Separation**: 100 Hz between start and end markers within same version, 100 Hz minimum between versions
- **Data-to-Boundary Gap**: 300 Hz minimum separation (21,900 Hz to 22,200 Hz) to prevent harmonic interference
- **Fixed Frequency Grid**: 64 center frequencies at 30 Hz intervals, each with ±10 Hz detection tolerance
- **Frequency Buffer**: ±15 Hz separation buffer between adjacent data frequencies
- **Chunk Size**: Fixed 6 bits (with zero-padding for shorter columns)
- **Time per Chunk**: 60ms
- **QR Version Detection**: Start and end marker pair must match for valid cycle
- **Frequency Detection Tolerance**: ±10 Hz (safe margin within 30 Hz spacing and 100+ Hz boundary separations)
- **Amplitude Level**: Embedded frequencies at -20dB relative to original audio peak
- **Compatible Sample Rates**: 96 kHz (standard for DVD-Audio/Blu-ray) and 88.2 kHz (professional audio standard)
- **Hardware Requirements**: 
  - **High-fidelity microphones and speakers capable of >24 kHz frequency response.**
- **Minimum Audio Duration**: Must exceed minimum encoding duration for target QR version

**Error Handling and Validation:**
- **Padding Bit Validation**: Decoded padding bits must be verified as zeros; if >20% of columns fail padding validation, discard entire cycle
- **Column Error Handling**: Corrupted columns are marked and handled by QR error correction; cycles with >20% corrupted columns are discarded
- **QR Error Correction Threshold**: Standard QR error correction can handle up to 30% data corruption, but audio-specific validation uses 20% threshold for earlier detection of severely corrupted cycles
- **Marker Pair Validation**: Start and end markers must match the same QR version for cycle to be considered valid
- **Orphaned Marker Handling**: If start marker found without matching end marker within expected timeframe, discard partial cycle
- **Silent Data Section**: If no frequencies detected in data section despite valid markers, mark cycle as corrupted
- **Timing Conflict Resolution**: If overlapping cycles detected, prioritize the cycle with strongest marker signals and discard conflicting cycles
- **Version Conflict Resolution**: If multiple valid marker pairs detected simultaneously, prioritize the pair with strongest combined signal strength
- **Frequency Detection**: Use ±10 Hz tolerance to account for audio system variations
- **Cycle Validation**: Incomplete or corrupted cycles are discarded, valid cycles are used for reconstruction
- **Standard QR Error Correction**: Applied after matrix reconstruction for final validation and recovery
- **Short Audio Handling**: If audio is shorter than minimum duration, encoding fails with descriptive error message specifying required duration
- **Stereo Channel Processing**: If stereo file detected during decoding, automatically process left channel only and ignore right channel
- **Partial Recovery**: Attempt reconstruction if at least 2 valid complete cycles are available
- **Harmonic Interference Detection**: Monitor for interference between boundary markers and data frequencies; adjust detection sensitivity if needed

**Decoding Process:**
1. Scan entire audio for start markers to identify potential QR cycles and versions, prioritizing by device capability
2. For each detected start marker, calculate expected data duration based on the marker's version
3. Process data for the calculated duration, then look for matching end marker to confirm valid cycle
4. If matching end marker found, mark cycle as valid; if not found or mismatched version, discard cycle
5. If no valid marker pairs found after full scan, attempt brute-force decoding:
   - Divide audio into overlapping time windows with minimum duration based on longest expected cycle:
     - Version 1-2: 7,800ms windows (allows for complete cycle + margin)
     - Version 3: 9,000ms windows
     - Version 4: 12,180ms windows  
     - Version 5: 15,840ms windows
   - For each window, try QR versions sequentially based on device capability priority
   - Use 100ms sliding window increments to find potential cycle start points
   - Test each window position for presence of complete cycle structure
6. For each valid cycle, determine number of 6-bit chunks per column based on confirmed version
7. Process data between start and end markers: extract chunks sequentially in 60ms time slots
8. For each chunk, detect dominant frequency (±10 Hz tolerance) and map back to decimal value (0-63)
9. Convert decimal values to 6-bit binary and concatenate chunks to reconstruct column
10. Remove zero-padding bits from end based on QR version and validate padding bits are zeros
11. If padding validation fails, flag column as corrupted but continue processing remaining columns
12. Repeat for all columns to rebuild the complete QR matrix
13. Apply standard QR error correction algorithms to validate and recover from detection errors
14. If current cycle fails reconstruction, try next valid cycle; succeed if any cycle produces valid QR code
15. If all cycles fail, report decoding failure with diagnostic information including:
    - Detected cycles and error types
    - Device capability assessment results (frequency response measurements)
    - Recommended QR version for current device
    - Audio quality analysis and improvement suggestions
