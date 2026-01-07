# Sound QR - Project Plan

## Project Overview

Sound QR is a mobile-first web application that enables users to encode QR codes into audio files using high-frequency 
sound encoding, and decode them back from audio sources.

### Core Functionality

**Encoding:**
- Embeds QR code data into existing audio files using mobile-compatible high frequencies (14.0-17.1 kHz range)
- Uses advanced steganographic techniques to hide data with minimal impact on audible content
- Balances original audio preservation with reliable data encoding
- **Mobile Compatibility**: Optimized for typical mobile device frequency response (14-17.1 kHz)

**Decoding:**
- Extracts QR codes from audio files
- Supports real-time QR code detection through microphone input
- Processes recorded sound to decode embedded QR data
- **Adaptive Detection**: Automatically adjusts to available device frequency response

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

**Boundary Marker System:**
- **Version 1 (21×21)**: Start marker at 14,000 Hz, End marker at 14,100 Hz
- **Version 2 (25×25)**: Start marker at 14,200 Hz, End marker at 14,300 Hz  
- **Version 3 (29×29)**: Start marker at 14,400 Hz, End marker at 14,500 Hz
- **Version 4 (33×33)**: Start marker at 14,600 Hz, End marker at 14,700 Hz
- **Version 5 (37×37)**: Start marker at 14,800 Hz, End marker at 14,900 Hz

**Fixed Frequency Grid:**
- **Data Frequency Range**: 15,200 - 17,090 Hz (1,890 Hz total span, 64 discrete frequencies)
- **Number of Frequencies**: 64 frequencies (indexed 0-63)
- **Frequency Intervals**: 63 intervals between 64 frequencies
- **Frequency Step Size**: 30 Hz (1,890 Hz span ÷ 63 intervals = 30 Hz per step)
- **Frequency Grid**: f(n) = 15,200 + (n × 30) Hz, where n = 0 to 63
- **Frequency Range Clarification**: 
  - Lowest frequency (n=0): 15,200 Hz
  - Highest frequency (n=63): 15,200 + (63 × 30) = 17,090 Hz
  - Span between lowest and highest: 1,890 Hz
  - Each frequency represents a center frequency with ±10 Hz detection tolerance
  - Frequency separation provides ±15 Hz buffer between adjacent frequencies
- **All Versions**: Use identical 64-frequency grid for data encoding

**Chunk Structure with Zero-Padding:**
- **Version 1 (21 rows)**: Pad to 24 bits (add 3 zeros) → 4 chunks of 6 bits each → 40ms per column
- **Version 2 (25 rows)**: Pad to 30 bits (add 5 zeros) → 5 chunks of 6 bits each → 50ms per column
- **Version 3 (29 rows)**: Pad to 30 bits (add 1 zero) → 5 chunks of 6 bits each → 50ms per column
- **Version 4 (33 rows)**: Pad to 36 bits (add 3 zeros) → 6 chunks of 6 bits each → 60ms per column
- **Version 5 (37 rows)**: Pad to 42 bits (add 5 zeros) → 7 chunks of 6 bits each → 70ms per column

**Column Encoding Process:**
1. **Zero-Padding**: Pad each column to nearest multiple of 6 bits using `ceil(rows/6) * 6` (padding bits added at end = 0)
2. **Chunk Division**: Split padded column into 6-bit chunks from top to bottom
3. **Binary Conversion**: Convert each 6-bit chunk to decimal value (0-63)
4. **Frequency Mapping**: Map decimal value to corresponding frequency in the fixed grid
5. **Time Slot Assignment**: Each chunk gets 60ms time slot within the column's time period
6. **Frequency Generation**: Emit the mapped frequency at -20dB amplitude during the chunk's time slot

**Time Allocation per Complete QR Cycle:**
- **Version 1**: 21 columns × 40ms = 840ms per cycle
- **Version 2**: 25 columns × 50ms = 1,250ms per cycle
- **Version 3**: 29 columns × 50ms = 1,450ms per cycle
- **Version 4**: 33 columns × 60ms = 1,980ms per cycle
- **Version 5**: 37 columns × 70ms = 2,590ms per cycle

**Audio Duration Requirements:**
- **Cycle Overhead**: 300ms per cycle (100ms start marker + 100ms end marker + 100ms gap)
- **Complete Cycle Duration**: 100ms start marker + data encoding time + 100ms end marker + 100ms gap
- **Minimum requirement**: 3 complete cycles for redundancy
- **Version 1**: Complete cycle = 1,140ms; Minimum = 4 seconds (3.42s actual)
- **Version 2**: Complete cycle = 1,550ms; Minimum = 5 seconds (4.65s actual)
- **Version 3**: Complete cycle = 1,750ms; Minimum = 6 seconds (5.25s actual)
- **Version 4**: Complete cycle = 2,280ms; Minimum = 7 seconds (6.84s actual)
- **Version 5**: Complete cycle = 2,890ms; Minimum = 9 seconds (8.67s actual)
- **Recommended duration**:
  - **Optimal environments**: Use minimum duration requirements (4-9 seconds depending on QR version)
  - **Noisy environments**: 15+ seconds recommended for maximum reliability and redundancy
  - **Real-time applications**: Minimum 2 complete cycles (2.3-5.8 seconds) for basic functionality


**Cycle Timing and Synchronization:**
- **Cycle structure**: [Start marker 100ms] → [Data encoding] → [End marker 100ms] → [100ms gap] → [Next cycle]
- **Start marker**: Identifies QR version and marks beginning of data
- **End marker**: Confirms QR version and marks end of data
- **Inter-cycle gap**: 100ms silence between cycles for clear separation
- **Marker validation**: Start and end markers must match the same version for cycle to be considered valid

**Audio Integration:**
- QR cycles repeat continuously throughout the audio duration
- Boundary marker pairs frame each complete QR data cycle
- Mobile-optimized frequency range (14.0-17.1 kHz) ensures compatibility with typical consumer devices
- Multiple complete cycles provide redundancy and error correction
- **Audio Format Requirements**: 
  - **Mono Input**: QR data embedded directly into the single channel; output remains mono
  - **Stereo Input**: QR data embedded into left channel only, right channel preserves original audio unchanged; output maintains stereo format
  - **Mono-to-Stereo Encoding**: If original audio is mono but stereo output desired, duplicate original audio to right channel and embed QR data in left channel only
  - Minimum 44.1 kHz sample rate required for proper frequency reproduction
  - 16-bit or higher bit depth recommended for adequate dynamic range
  - Embedded frequencies at -20dB relative to original audio peak level

**Technical Specifications:**
- **Full Operational Range**: 14,000 - 17,090 Hz (3,090 Hz total bandwidth)
- **Boundary Frequency Range**: 14,000 - 14,900 Hz (900 Hz total range)
- **Data Frequency Range**: 15,200 - 17,090 Hz (1,890 Hz span between min/max frequencies)
- **Boundary Marker Separation**: 100 Hz between start and end markers within same version, 100 Hz minimum between versions
- **Data-to-Boundary Gap**: 300 Hz minimum separation (14,900 Hz to 15,200 Hz) to prevent harmonic interference
- **Fixed Frequency Grid**: 64 center frequencies at 30 Hz intervals, each with ±10 Hz detection tolerance
- **Frequency Buffer**: ±15 Hz separation buffer between adjacent data frequencies
- **Chunk Size**: Fixed 6 bits (with zero-padding for shorter columns)
- **Time per Chunk**: 60ms
- **QR Version Detection**: Start and end marker pair must match for valid cycle
- **Frequency Detection Tolerance**: ±10 Hz (safe margin within 30 Hz spacing and 100+ Hz boundary separations)
- **Amplitude Level**: Embedded frequencies at -20dB relative to original audio peak
- **Compatible Sample Rates**: 44.1 kHz (CD quality) and 48 kHz (digital standard)
- **Hardware Requirements**: 
  - **Mobile Devices**: Audio equipment with frequency response 14.0-17.1 kHz (supports all versions with full reliability)
  - **Consumer Equipment**: Audio equipment with frequency response 14.0-17.1 kHz (supports all versions with full reliability)
  - **Legacy Devices**: Audio equipment with frequency response 14.0-15.5 kHz (supports versions 1-3 only)
  - **Professional Equipment**: Audio equipment with frequency response 14.0-20.0+ kHz (supports all versions with enhanced fidelity)
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
- **Mobile Device Adaptation**: Automatically detect device frequency response limitations and adjust version priority accordingly

**Decoding Process:**
1. **Device Capability Assessment**: 
   - Test device frequency response using swept sine wave from 14.0-17.1 kHz at -30dB
   - Measure response strength at key frequencies: 14.5, 15.5, 16.5, 17.1 kHz
   - Categorize device capabilities:
     - **Full (17.1+ kHz response)**: All QR versions supported
     - **Standard (16.0-17.0 kHz response)**: Versions 1-4 supported, Version 5 may have reduced reliability
     - **Limited (15.5-15.9 kHz response)**: Versions 1-3 supported, Versions 4-5 not recommended
   - Set version priority based on capability:
     - **Full**: Try versions 1,2,3,4,5 (all supported)
     - **Standard**: Try versions 1,2,3,4 first, then 5 (reduced reliability warning)
     - **Limited**: Try versions 1,2,3 only (4,5 skipped due to insufficient frequency response)
2. Scan entire audio for start markers to identify potential QR cycles and versions, prioritizing by device capability
3. For each detected start marker, calculate expected data duration based on the marker's version
4. Process data for the calculated duration, then look for matching end marker to confirm valid cycle
5. If matching end marker found, mark cycle as valid; if not found or mismatched version, discard cycle
6. If no valid marker pairs found after full scan, attempt brute-force decoding:
   - Divide audio into overlapping time windows with minimum duration based on longest expected cycle:
     - Version 1-2: 1,600ms windows (allows for complete cycle + margin)
     - Version 3: 1,800ms windows
     - Version 4: 2,400ms windows  
     - Version 5: 3,000ms windows
   - For each window, try QR versions sequentially based on device capability priority
   - Use 100ms sliding window increments to find potential cycle start points
   - Test each window position for presence of complete cycle structure
7. For each valid cycle, determine number of 6-bit chunks per column based on confirmed version
8. Process data between start and end markers: extract chunks sequentially in 60ms time slots
9. For each chunk, detect dominant frequency (±10 Hz tolerance) and map back to decimal value (0-63)
10. Convert decimal values to 6-bit binary and concatenate chunks to reconstruct column
11. Remove zero-padding bits from end based on QR version and validate padding bits are zeros
12. If padding validation fails, flag column as corrupted but continue processing remaining columns
13. Repeat for all columns to rebuild the complete QR matrix
14. Apply standard QR error correction algorithms to validate and recover from detection errors
15. If current cycle fails reconstruction, try next valid cycle; succeed if any cycle produces valid QR code
16. If all cycles fail, report decoding failure with diagnostic information including:
    - Detected cycles and error types
    - Device capability assessment results (frequency response measurements)
    - Recommended QR version for current device
    - Audio quality analysis and improvement suggestions

## Project Implementation Plan

### Phase 1: Core Audio Processing Foundation (Weeks 1-3)

**1.1 Audio Processing Infrastructure**
- Implement Web Audio API integration for frequency analysis and synthesis
- Create audio file loading and format validation (WAV, MP3, M4A support)
- Develop frequency grid generator (15,200-17,090 Hz, 30 Hz steps)
- Build time-domain audio manipulation utilities
- Create audio visualization components for debugging

**1.2 QR Code Integration**
- Integrate QR code generation library (`qrcode` package)
- Implement QR code reading functionality (`qrcode-reader`, `jsqr` packages)
- Create QR version detection and matrix size calculation
- Develop binary data manipulation utilities (padding, chunking)
- Build QR code visualization components

**Deliverables:**
- Audio processing utility classes
- QR code generation/reading modules  
- Basic frequency analysis tools
- Unit tests for core functions

### Phase 2: Encoding Engine (Weeks 4-6)

**2.1 Frequency Encoding System**
- Implement 6-bit chunk to frequency mapping
- Create boundary marker generation for all QR versions
- Develop column-wise encoding with zero-padding
- Build cycle timing and synchronization logic
- Implement amplitude control (-20dB embedding)

**2.2 Audio Integration**
- Create stereo/mono channel processing
- Implement original audio preservation
- Develop cycle repetition and redundancy logic
- Build audio duration validation
- Create encoding progress tracking

**2.3 User Interface - Encoding**
- Design file upload interface with drag-and-drop
- Create QR data input forms (text, URL, contact)
- Build encoding parameter controls (version selection, duration)
- Implement real-time encoding progress display
- Add audio preview and download functionality

**Deliverables:**
- Complete encoding engine
- Encoding UI components
- Audio file processing pipeline
- Integration tests for encoding workflow

### Phase 3: Decoding Engine (Weeks 7-9)

**3.1 Device Capability Assessment**
- Implement frequency response testing (14.0-17.1 kHz sweep)
- Create device categorization logic (Full/Standard/Limited)
- Build version priority assignment based on capabilities
- Develop adaptive decoding strategies
- Create capability testing UI components

**3.2 Signal Detection and Processing**
- Implement boundary marker detection algorithms
- Create cycle validation and timing verification
- Build frequency detection with ±10 Hz tolerance
- Develop chunk reconstruction and padding validation
- Implement multi-cycle redundancy processing

**3.3 Error Handling and Recovery**
- Create cycle corruption detection (20% threshold)
- Implement orphaned marker handling
- Build fallback brute-force decoding
- Develop QR error correction integration
- Create comprehensive error reporting

**Deliverables:**
- Complete decoding engine
- Device capability testing system
- Error handling framework
- Decoding accuracy test suite

### Phase 4: User Interface and Experience (Weeks 10-12)

**4.1 Decoding Interface**
- Create file upload interface for decoding
- Build real-time microphone decoding interface
- Implement decoding progress and status display
- Create decoded QR content display and actions
- Add decoding history and management

**4.2 Live Capture Interface**
- Implement microphone access and permission handling
- Create real-time audio visualization
- Build live frequency analysis display
- Implement continuous scanning mode
- Add audio recording for offline analysis

**4.3 Mobile Optimization**
- Implement responsive design for mobile devices
- Create touch-friendly interface elements
- Optimize audio processing for mobile performance
- Add Progressive Web App (PWA) features
- Implement offline functionality where possible

**Deliverables:**
- Complete user interface
- Mobile-optimized experience
- Real-time audio processing
- PWA implementation

### Phase 5: Testing and Validation (Weeks 13-15)

**5.1 Comprehensive Testing**
- Create automated test suite for encoding/decoding accuracy
- Implement cross-device compatibility testing
- Build performance benchmarking tools
- Create noise resilience testing framework
- Develop audio quality preservation validation

**5.2 User Acceptance Testing**
- Conduct testing across multiple device types
- Validate frequency response on various audio hardware
- Test encoding/decoding with different QR data types
- Evaluate user interface usability
- Performance testing on mobile devices

**5.3 Documentation and Optimization**
- Complete API documentation
- Create user guides and tutorials
- Optimize performance bottlenecks
- Implement final bug fixes
- Prepare production deployment

**Deliverables:**
- Comprehensive test coverage
- Performance optimization
- User documentation
- Production-ready application

### Phase 6: Deployment and Monitoring (Weeks 16-17)

**6.1 Production Deployment**
- Configure production build optimization
- Set up CI/CD pipeline
- Deploy to production hosting (Netlify, Vercel, or AWS)
- Configure domain and SSL certificates
- Implement analytics and error monitoring

**6.2 Launch Preparation**
- Create demo content and examples
- Prepare marketing materials
- Set up user feedback collection
- Implement usage analytics
- Create support documentation

**Deliverables:**
- Production deployment
- Monitoring and analytics
- Launch-ready application
- Support infrastructure

### Technical Architecture

**Frontend Stack:**
- React 19.2.3 with functional components and hooks
- Web Audio API for audio processing
- HTML5 Canvas for audio visualization
- Service Workers for PWA functionality
- CSS Grid/Flexbox for responsive layout

**Audio Processing Libraries:**
- Native Web Audio API for frequency analysis
- Custom DSP utilities for Sound QR protocol
- MediaRecorder API for audio capture
- AudioContext for real-time processing

**QR Code Libraries:**
- `qrcode` (1.5.4) for QR generation
- `qrcode-reader` (1.0.4) and `jsqr` (1.4.0) for reading
- Custom validation for Sound QR integration

**Testing Framework:**
- Jest and React Testing Library for unit tests
- Custom audio processing test utilities
- Cross-device compatibility testing tools
- Performance benchmarking suite

### Development Milestones

**Week 3:** Core audio and QR processing functional
**Week 6:** Complete encoding pipeline working
**Week 9:** Complete decoding pipeline working  
**Week 12:** Full user interface implemented
**Week 15:** Testing and optimization complete
**Week 17:** Production deployment live

### Risk Mitigation

**Technical Risks:**
- Browser audio API limitations → Implement fallbacks and progressive enhancement
- Device frequency response variations → Extensive testing and adaptive algorithms
- Performance on lower-end devices → Optimization and selective feature enabling

**Project Risks:**
- Complex audio processing requirements → Iterative development with early prototyping
- Cross-platform compatibility issues → Continuous testing across target devices
- User experience complexity → Regular usability testing and iterative design

### Success Metrics

**Technical Metrics:**
- 95%+ encoding accuracy across supported QR versions
- 90%+ decoding success rate in optimal conditions
- <500ms encoding time for Version 1 QR codes
- <2 seconds decoding time for standard audio files
- Support for 10+ device types with different frequency responses

**User Experience Metrics:**
- Intuitive interface requiring <30 seconds for first successful encode/decode
- Mobile-first responsive design working on screens 320px+
- PWA functionality enabling offline basic operations
- <3 second app load time on average mobile connections

### Resource Requirements

**Development Team:**
- 1 Frontend Developer (React/JavaScript specialist)
- 1 Audio Processing Specialist (DSP/Web Audio API)
- 1 UI/UX Designer (Mobile-first design)
- 1 QA Engineer (Cross-device testing)

**Infrastructure:**
- Development environment setup
- Testing devices (various smartphones, tablets, laptops)
- Audio testing equipment for frequency response validation
- Cloud hosting for production deployment
- Analytics and monitoring services
