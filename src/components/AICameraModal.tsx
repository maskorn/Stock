import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, RefreshCw, UploadCloud, AlertCircle, Sparkles, FileImage } from 'lucide-react';
import { compressImage } from '../utils/imageCompressor';

interface AICameraModalProps {
  onClose: () => void;
  onParsed: (data: any, originalImageBase64: string) => void;
}

export default function AICameraModal({ onClose, onParsed }: AICameraModalProps) {
  const [mode, setMode] = useState<'upload' | 'camera'>('upload');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaderStep, setLoaderStep] = useState(0);

  // References
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loaderMessages = [
    "正在分析您上传的票据图像...",
    "正在调用 Gemini 3.5 AI 预研模型...",
    "正在提取供应商名牌、日期和发票单号...",
    "正在通过智能OCR扫描商品表格、数量及金额...",
    "正在自动计算校对总金额，准备入库中..."
  ];

  // Rotate loading step messages for interactive feeling
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      interval = setInterval(() => {
        setLoaderStep((prev) => (prev + 1) % loaderMessages.length);
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [loading]);

  // Handle Camera switch
  useEffect(() => {
    if (mode === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [mode]);

  const startCamera = async () => {
    try {
      setError(null);
      const devices = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      setStream(devices);
      if (videoRef.current) {
        videoRef.current.srcObject = devices;
      }
    } catch (err: any) {
      console.error("Camera access failed:", err);
      setError("无法开启摄像头权限，请使用‘票据图片文件上传’模式。");
      setMode('upload');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  // Convert files to base64 helper
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Strip out metadata representation e.g. "data:image/png;base64,"
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handlePostToParse = async (base64String: string, mimeType: string) => {
    setLoading(true);
    setLoaderStep(0);
    setError(null);

    try {
      const res = await fetch('/api/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64String,
          mimeType: mimeType
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "提取单据失败，请重试或手动编辑。");
      }

      onParsed(json.data, `data:${mimeType};base64,${base64String}`);
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "请求服务器处理超时，请确认 API Key 配置正确。");
    } finally {
      setLoading(false);
    }
  };

  // Capture photo from stream
  const handleCapturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg');
      const base64 = dataUrl.split(',')[1];
      await handlePostToParse(base64, 'image/jpeg');
    }
  };

  // Handle uploaded files selection
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) {
      setError("仅支持扫描图片格式文件(PNG、JPG、JPEG等)");
      return;
    }

    try {
      const compressed = await compressImage(file);
      await handlePostToParse(compressed.base64, compressed.mimeType);
    } catch (err) {
      setError("读取并压缩文件内容失败。");
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="ai-scan-backdrop">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-indigo-50/20">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-600 text-white rounded-lg">
              <Sparkles size={16} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">AI 智能入库单识别</h3>
              <p className="text-xs text-gray-500 font-medium mt-0.5">支持通过拍照或图片极速解析入库物品</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-lg text-gray-400 hover:text-gray-500 hover:bg-gray-100 transition-colors"
            disabled={loading}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Box */}
        <div className="p-6 flex-1 flex flex-col items-center justify-center min-h-[280px]">
          {loading ? (
            /* Loader State */
            <div className="text-center py-6 px-4 space-y-4">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-indigo-100 animate-pulse"></div>
                <div className="absolute inset-0 rounded-full border-4 border-t-indigo-600 animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center text-indigo-600">
                  <Sparkles size={20} className="animate-bounce" />
                </div>
              </div>
              <div className="space-y-1.5 max-w-sm">
                <h4 className="text-sm font-bold text-gray-800">AI 正在深度阅件中</h4>
                <p className="text-xs text-gray-500 font-sans leading-relaxed min-h-[40px] px-2 text-indigo-700 font-medium">
                  {loaderMessages[loaderStep]}
                </p>
              </div>
            </div>
          ) : (
            /* Main Interaction Zone */
            <div className="w-full space-y-5">
              {error && (
                <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl flex items-start gap-2 text-rose-800 text-xs text-left">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Toggle modes tab */}
              <div className="flex bg-gray-100/80 p-0.5 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setMode('upload')}
                  className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
                    mode === 'upload' ? 'bg-white shadow-xs text-indigo-700' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  本地票据图片上传
                </button>
                <button
                  type="button"
                  onClick={() => setMode('camera')}
                  className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
                    mode === 'camera' ? 'bg-white shadow-xs text-indigo-700' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  摄像头拍照识别
                </button>
              </div>

              {/* Mode Views */}
              {mode === 'upload' ? (
                /* Upload View */
                <div 
                  onClick={triggerFileInput}
                  className="border-2 border-dashed border-gray-200 hover:border-indigo-400 bg-gray-50/50 hover:bg-indigo-50/10 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all group"
                  id="drag-upload-container"
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload}
                    className="hidden" 
                    accept="image/*"
                  />
                  <div className="p-4 bg-white rounded-full shadow-xs text-gray-400 group-hover:text-indigo-600 transition-colors border border-gray-100 mb-3">
                    <UploadCloud size={28} />
                  </div>
                  <p className="text-sm font-bold text-gray-800">拖拽票据到这里，或点击选择图片</p>
                  <p className="text-xs text-gray-400 mt-1 max-w-xs text-center leading-relaxed">
                    支持拍照存单、入库单、采购小票、收据等图片，AI 将精准转化为可编辑数据表格。
                  </p>
                </div>
              ) : (
                /* Camera View */
                <div className="relative bg-gray-900 rounded-2xl overflow-hidden aspect-video flex flex-col items-center justify-center border border-gray-850">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Invisible working canvas */}
                  <canvas ref={canvasRef} className="hidden" />

                  {/* Shutter Overlay Overlay Action */}
                  <div className="absolute bottom-4 inset-x-0 flex justify-center">
                    <button
                      type="button"
                      onClick={handleCapturePhoto}
                      className="p-3.5 bg-white text-indigo-600 hover:bg-indigo-50 rounded-full shadow-lg transition-transform hover:scale-105"
                      title="点击拍照"
                      id="ai-camera-shutter"
                    >
                      <Camera size={22} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer info text */}
        <div className="bg-gray-50/60 p-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
          <span>算法驱动: Gemini 3.5 Flash Model</span>
          <span className="flex items-center gap-1"><Sparkles size={11} className="text-amber-500" /> 支持智能明细比对</span>
        </div>
      </div>
    </div>
  );
}
