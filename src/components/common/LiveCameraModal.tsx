import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  X,
  RotateCw,
  RotateCcw,
  RefreshCw,
  Check,
  FlipHorizontal,
  SwitchCamera,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

interface LiveCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (base64Image: string) => void;
}

export const LiveCameraModal: React.FC<LiveCameraModalProps> = ({
  isOpen,
  onClose,
  onCapture,
}) => {
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [rotation, setRotation] = useState<number>(0); // 0, 90, 180, 270
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Start stream
  const startCamera = async () => {
    stopCamera();
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('مرورگر شما از دسترسی مستقیم به دوربین پشتیبانی نمی‌کند.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
        setIsStreaming(true);
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError('دسترسی به دوربین برقرار نشد. لطفاً دسترسی دوربین را در مرورگر مجاز نمایید.');
      setIsStreaming(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsStreaming(false);
  };

  useEffect(() => {
    if (isOpen && !capturedImage) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode, capturedImage]);

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const takeSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImage(dataUrl);
    setRotation(0);
    stopCamera();
  };

  const rotate = (delta: number) => {
    setRotation((prev) => (prev + delta + 360) % 360);
  };

  const applyRotationAndConfirm = () => {
    if (!capturedImage) return;

    if (rotation === 0) {
      onCapture(capturedImage);
      onClose();
      return;
    }

    // Draw to canvas with rotation applied so Gemini receives the upright image
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        onCapture(capturedImage);
        onClose();
        return;
      }

      if (rotation === 90 || rotation === 270) {
        canvas.width = img.height;
        canvas.height = img.width;
      } else {
        canvas.width = img.width;
        canvas.height = img.height;
      }

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();

      const rotatedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      onCapture(rotatedDataUrl);
      onClose();
    };
    img.src = capturedImage;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-950 text-white rounded-3xl border border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-bold">
              {capturedImage ? 'تنظیم جهت و چرخش سوال' : 'عکس‌برداری لحظه‌ای از سوال یا تست'}
            </h3>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder or Preview */}
        <div className="relative w-full aspect-4/3 bg-black flex items-center justify-center overflow-hidden">
          {!capturedImage ? (
            <>
              {cameraError ? (
                <div className="p-6 text-center space-y-3 max-w-sm">
                  <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
                  <p className="text-xs text-rose-300 leading-relaxed">{cameraError}</p>
                  <label className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl cursor-pointer">
                    انتخاب عکس از گالری دستگاه
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = () => {
                            setCapturedImage(reader.result as string);
                            setRotation(0);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    autoPlay
                    muted
                    className="w-full h-full object-cover"
                  />
                  {/* Framing Overlay */}
                  <div className="absolute inset-8 border-2 border-dashed border-blue-400/60 rounded-2xl pointer-events-none flex items-center justify-center">
                    <span className="text-[11px] font-bold bg-black/60 text-blue-200 px-3 py-1 rounded-full backdrop-blur-xs">
                      متن سوال را داخل کادر قرار دهید
                    </span>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="relative w-full h-full flex items-center justify-center p-3">
              <img
                src={capturedImage}
                alt="Captured"
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transition: 'transform 0.25s ease',
                  maxHeight: '100%',
                  maxWidth: '100%',
                }}
                className="object-contain rounded-xl shadow-lg"
              />
            </div>
          )}
        </div>

        {/* Controls Bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex flex-col gap-3">
          {!capturedImage ? (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={toggleFacingMode}
                className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer flex items-center gap-2 text-xs font-bold"
                title="تغییر دوربین جلو و عقب"
              >
                <SwitchCamera className="w-4 h-4" />
                <span>تغییر دوربین</span>
              </button>

              <button
                type="button"
                onClick={takeSnapshot}
                disabled={!isStreaming}
                className="px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
                <span>ثبت عکس سوال</span>
              </button>

              <label className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer text-xs font-bold">
                گالری
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = () => {
                        setCapturedImage(reader.result as string);
                        setRotation(0);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Rotation Toolbar */}
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => rotate(-90)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
                  <span>چرخش ۹۰- درجه</span>
                </button>

                <button
                  type="button"
                  onClick={() => rotate(90)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <RotateCw className="w-3.5 h-3.5 text-blue-400" />
                  <span>چرخش ۹۰+ درجه</span>
                </button>

                <button
                  type="button"
                  onClick={() => rotate(180)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                  <span>چرخش ۱۸۰ درجه</span>
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setCapturedImage(null);
                    setRotation(0);
                    startCamera();
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer transition-colors"
                >
                  عکس‌برداری مجدد
                </button>

                <button
                  type="button"
                  onClick={applyRotationAndConfirm}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-lg shadow-blue-500/25 flex items-center gap-2 cursor-pointer transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>تایید و ارسال برای تحلیل</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
