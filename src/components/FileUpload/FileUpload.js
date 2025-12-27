import React, { useRef } from 'react';
import './FileUpload.css';

const FileUpload = ({ onFileSelected, accept = "*/*", label = "Select file" }) => {
  const fileInputRef = useRef();

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      onFileSelected(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      onFileSelected(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  return (
    <div className="file-upload">
      <div 
        className="upload-area"
        onClick={() => fileInputRef.current.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <div className="upload-icon">📁</div>
        <p className="upload-text">{label}</p>
        <p className="upload-hint">Click to browse or drag and drop</p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
    </div>
  );
};

export default FileUpload;