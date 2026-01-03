import React, { useCallback } from 'react';

const FileUpload = ({ onFileSelect, accept = "audio/*", label = "Select Audio File" }) => {
  const handleFileChange = useCallback((event) => {
    const file = event.target.files[0];
    if (file) {
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const handleDrop = useCallback((event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
  }, []);

  return (
    <div 
      className="file-upload"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <input
        type="file"
        accept={accept}
        onChange={handleFileChange}
        id="file-input"
        style={{ display: 'none' }}
      />
      <label htmlFor="file-input" className="file-upload-label">
        {label}
      </label>
    </div>
  );
};

export default FileUpload;