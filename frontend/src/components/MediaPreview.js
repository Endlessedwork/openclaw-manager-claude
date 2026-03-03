import React from 'react';
import { FileIcon } from 'lucide-react';

const MEDIA_SERVER = 'https://files.winecore.work';

function MediaPreview({ media, onImageClick }) {
  if (!media) return null;

  const { images = [], files = [] } = media;
  const totalOthers = images.length + files.length - (images.length > 0 ? 1 : 0);

  return (
    <div className="flex flex-col gap-2 mb-2">
      {/* First image thumbnail */}
      {images.length > 0 && (
        <div className="relative inline-block">
          <button
            onClick={() => onImageClick(images[0].path)}
            className="relative group overflow-hidden rounded-md focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <img
              src={`${MEDIA_SERVER}${images[0].path}`}
              alt="Media"
              className="h-40 w-auto object-cover bg-zinc-900"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          </button>

          {/* Count badge */}
          {totalOthers > 0 && (
            <div className="absolute bottom-2 right-2 bg-orange-500 text-white text-xs font-medium px-2 py-1 rounded-md">
              +{totalOthers} more
            </div>
          )}
        </div>
      )}

      {/* Non-image files */}
      {files.length > 0 && (
        <div className="flex flex-col gap-1">
          {files.map((file, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs text-zinc-400">
              <FileIcon className="w-3.5 h-3.5" />
              <span className="truncate">{file.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MediaPreview;
