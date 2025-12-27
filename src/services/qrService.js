import QRCode from 'qrcode';

export const generateQRMatrix = async (data) => {
  try {
    // Generate QR code and get the modules (matrix)
    const qr = QRCode.create(data, { errorCorrectionLevel: 'H' });
    const modules = qr.modules;
    
    // Convert to 2D array
    const size = modules.size;
    const matrix = [];
    
    for (let row = 0; row < size; row++) {
      const rowArray = [];
      for (let col = 0; col < size; col++) {
        rowArray.push(modules.get(row, col));
      }
      matrix.push(rowArray);
    }
    
    return matrix;
  } catch (error) {
    throw new Error(`QR generation failed: ${error.message}`);
  }
};

export const generateQRCode = async (data, options = {}) => {
  const defaultOptions = {
    errorCorrectionLevel: 'H',
    type: 'image/png',
    quality: 0.92,
    margin: 1,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    },
    width: 256,
    ...options
  };
  
  return await QRCode.toDataURL(data, defaultOptions);
};