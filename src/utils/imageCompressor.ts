/**
 * Utility to compress images on the client side before uploading to the backend.
 * Resizes large camera/scanner photos using Canvas and recompresses them to JPEG
 * with 85% quality. Non-image files like PDFs are read with standard base64 reader.
 */
export function compressImage(
  file: File,
  maxWidth = 1600,
  maxHeight = 1600,
  quality = 0.85
): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      // If it is a non-image file (like PDF), do standard base64 reading
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64Data = result.split(',')[1];
        resolve({ base64: base64Data, mimeType: file.type });
      };
      reader.onerror = (error) => reject(error);
      return;
    }

    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    reader.onerror = (error) => reject(error);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions keeping the aspect ratio
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get 2D canvas context for compression.'));
        return;
      }

      // Draw image with scaling onto canvas
      ctx.drawImage(img, 0, 0, width, height);

      // Recompress as standard JPEG which is highly efficient
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const base64Data = dataUrl.split(',')[1];
      resolve({ base64: base64Data, mimeType: 'image/jpeg' });
    };

    img.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}
