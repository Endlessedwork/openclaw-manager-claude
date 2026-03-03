import React, { useEffect } from 'react';
import { X } from 'lucide-react';

const MEDIA_SERVER = 'https://files.winecore.work';

function ImageModal({ imagePath, onClose }) {
  useEffect(() => {
    if (!imagePath) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imagePath, onClose]);

  if (!imagePath) return null;

  const fileName = imagePath.split('/').pop();

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl max-h-screen flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 p-2 rounded-lg bg-black/50 hover:bg-black/70 text-white transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <img
          src={`${MEDIA_SERVER}${imagePath}`}
          alt={fileName}
          className="max-h-[90vh] w-auto object-contain"
        />

        <div className="text-center text-sm text-gray-300 mt-3">
          {fileName}
        </div>
      </div>
    </div>
  );
}

export default ImageModal;
