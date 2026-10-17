/**
 * Fast client-side image compressor for high-resolution camera photos
 * Converts massive 10MB-20MB phone photos into optimized 150KB-250KB JPEGs
 * with crisp readability for OCR, vision models, and instant uploads.
 */

export async function compressImage(
  source: string | File | Blob,
  maxDimension: number = 1280,
  quality: number = 0.75
): Promise<string> {
  return new Promise((resolve, reject) => {
    const handleDataUrl = (dataUrl: string) => {
      const img = new Image();
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width <= 0 || height <= 0) {
          resolve(dataUrl);
          return;
        }

        // Scale down if exceeds maxDimension
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        // Clean white background for transparent PNG/canvas
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };

      img.onerror = () => {
        resolve(dataUrl);
      };

      img.src = dataUrl;
    };

    if (typeof source === 'string') {
      handleDataUrl(source);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          handleDataUrl(reader.result);
        } else {
          reject(new Error('خطا در تبدیل فایل به تصویر'));
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(source);
    }
  });
}
