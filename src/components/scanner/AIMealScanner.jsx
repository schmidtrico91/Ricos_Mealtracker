import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, Upload, Loader2, RefreshCcw, Check } from 'lucide-react';
import { App } from '@capacitor/app';
import { appClient, getStoredGeminiApiKey, setStoredGeminiApiKey } from '@/api/appClient';

export default function AIMealScanner({ isOpen, onClose, onMealDetected, selectedDate }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSavingDetectedFoods, setIsSavingDetectedFoods] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState('');
  const [detectedFoods, setDetectedFoods] = useState([]);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [analysisError, setAnalysisError] = useState('');
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState('');
  const [geminiApiKeyError, setGeminiApiKeyError] = useState('');
  const [hasGeminiApiKey, setHasGeminiApiKey] = useState(Boolean(getStoredGeminiApiKey()));
  const [stream, setStream] = useState(null);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);

  const resetDetectionState = () => {
    if (capturedPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(capturedPreviewUrl);
    }

    setCapturedImage(null);
    setCapturedPreviewUrl('');
    setDetectedFoods([]);
    setAnalysisError('');
    setIsSavingDetectedFoods(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    setIsCameraStarting(true);
    setIsCameraReady(false);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        videoRef.current.autoplay = true;

        try {
          await videoRef.current.play();
        } catch {
          // Android WebView may finish playback after metadata arrives.
        }
      }

      setStream(mediaStream);
    } catch (error) {
      console.error('Camera access error:', error);
      setCameraError('Kamerazugriff nicht verfügbar. Bitte Kameraberechtigung prüfen.');
      setIsCameraStarting(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsCameraStarting(false);
    setIsCameraReady(false);
  };

  const capturePhoto = () => {
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) {
        setAnalysisError('Das Foto konnte nicht erfasst werden.');
        return;
      }

      stopCamera();
      void (async () => {
        try {
          const compressed = await compressImageFile(blob);
          setCapturedImage(compressed.file);
          setCapturedPreviewUrl(compressed.previewUrl);
          await analyzeImage(compressed.file);
        } catch (error) {
          console.error('Image preparation error:', error);
          setAnalysisError(error?.message || 'Bild konnte nicht verarbeitet werden.');
        }
      })();
    }, 'image/jpeg', 0.95);
  };

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    stopCamera();
    void (async () => {
      try {
        const compressed = await compressImageFile(file);
        setCapturedImage(compressed.file);
        setCapturedPreviewUrl(compressed.previewUrl);
        await analyzeImage(compressed.file);
      } catch (error) {
        console.error('Image preparation error:', error);
        setAnalysisError(error?.message || 'Bild konnte nicht verarbeitet werden.');
      }
    })();
  };

  const normalizeDetectedFood = (foodData) => ({
    name: foodData.name,
    estimated_weight_grams: Math.round(foodData.estimated_weight_grams || 100),
    calories_per_100g: Math.round(foodData.calories_per_100g || 0),
    protein_per_100g: Math.round((foodData.protein_per_100g || 0) * 10) / 10,
    carbs_per_100g: Math.round((foodData.carbs_per_100g || 0) * 10) / 10,
    fat_per_100g: Math.round((foodData.fat_per_100g || 0) * 10) / 10
  });

  const blobToDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Failed to read image'));
      reader.readAsDataURL(blob);
    });

  const loadImage = (src) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load image'));
      image.src = src;
    });

  const compressImageFile = async (fileOrBlob) => {
    const sourceUrl = await blobToDataUrl(fileOrBlob);
    const image = await loadImage(sourceUrl);
    const maxDimension = 1280;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, width, height);

    const compressedBlob = await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.82);
    });

    if (!compressedBlob) {
      throw new Error('Image compression failed');
    }

    return {
      file: new File([compressedBlob], 'meal.jpg', { type: 'image/jpeg' }),
      previewUrl: canvas.toDataURL('image/jpeg', 0.82)
    };
  };

  const analyzeImage = async (imageBlob) => {
    setIsAnalyzing(true);
    setAnalysisError('');
    setDetectedFoods([]);

    try {
      const imageFile = imageBlob instanceof File
        ? imageBlob
        : new File([imageBlob], 'meal.jpg', { type: 'image/jpeg' });

      const { file_url } = await appClient.integrations.Core.UploadFile({
        file: imageFile
      });

      const result = await appClient.integrations.Core.InvokeLLM({
        prompt: `Du bist ein Ernährungsexperte. Analysiere dieses Foto eines Essens und gib detaillierte Nährwertinformationen zurück.

Identifiziere alle sichtbaren Lebensmittel, schätze deren Portionsgrößen in Gramm und berechne die Nährwerte pro 100g für jedes Lebensmittel.

Sei so genau wie möglich bei der Schätzung der Portionsgrößen. Wenn du dir nicht sicher bist, gib eine realistische Schätzung ab.`,
        file_urls: [file_url],
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            foods: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  estimated_weight_grams: { type: 'number' },
                  calories_per_100g: { type: 'number' },
                  protein_per_100g: { type: 'number' },
                  carbs_per_100g: { type: 'number' },
                  fat_per_100g: { type: 'number' }
                },
                required: ['name', 'estimated_weight_grams', 'calories_per_100g', 'protein_per_100g', 'carbs_per_100g', 'fat_per_100g']
              }
            }
          },
          required: ['foods']
        }
      });

      if (result?.foods?.length) {
        setDetectedFoods(result.foods.map(normalizeDetectedFood));
      } else {
        setAnalysisError('Keine Lebensmittel im Bild erkannt. Bitte versuche es mit einem anderen Foto.');
      }
    } catch (error) {
      console.error('AI analysis error:', error);
      setAnalysisError(error?.message || 'Die Bildanalyse ist fehlgeschlagen.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const saveDetectedFoods = async () => {
    setIsSavingDetectedFoods(true);

    try {
      for (const foodData of detectedFoods) {
        const food = await appClient.entities.Food.create({
          name: foodData.name,
          calories_per_100g: foodData.calories_per_100g,
          protein_per_100g: foodData.protein_per_100g,
          carbs_per_100g: foodData.carbs_per_100g,
          fat_per_100g: foodData.fat_per_100g,
          is_custom: true,
          source: 'ai-camera'
        });

        const weight = foodData.estimated_weight_grams || 100;

        await appClient.entities.FoodLog.create({
          food_id: food.id,
          food_name: food.name,
          date: selectedDate,
          weight_grams: weight,
          calories: Math.round((foodData.calories_per_100g * weight) / 100),
          protein: Math.round(((foodData.protein_per_100g * weight) / 100) * 10) / 10,
          carbs: Math.round(((foodData.carbs_per_100g * weight) / 100) * 10) / 10,
          fat: Math.round(((foodData.fat_per_100g * weight) / 100) * 10) / 10
        });
      }

      onMealDetected();
      handleClose();
    } catch (error) {
      console.error('Error saving detected foods:', error);
      setAnalysisError(error?.message || 'Erkannte Lebensmittel konnten nicht gespeichert werden.');
    } finally {
      setIsSavingDetectedFoods(false);
    }
  };

  const handleRetry = () => {
    resetDetectionState();
    if (isOpen) {
      void startCamera();
    }
  };

  const handleClose = () => {
    stopCamera();
    resetDetectionState();
    setIsAnalyzing(false);
    onClose();
  };

  const handleSaveApiKey = () => {
    const normalized = setStoredGeminiApiKey(geminiApiKeyInput);
    if (!normalized) {
      setGeminiApiKeyError('Bitte einen gültigen Gemini API Key eingeben.');
      return;
    }

    setGeminiApiKeyError('');
    setGeminiApiKeyInput('');
    setHasGeminiApiKey(true);
  };

  useEffect(() => {
    if (isOpen && !hasGeminiApiKey && !capturedImage && !isAnalyzing && detectedFoods.length === 0) {
      setGeminiApiKeyInput(getStoredGeminiApiKey());
      setGeminiApiKeyError('');
    }
  }, [isOpen, hasGeminiApiKey, capturedImage, isAnalyzing, detectedFoods.length]);

  useEffect(() => {
    if (isOpen && hasGeminiApiKey && !capturedImage && !isAnalyzing && detectedFoods.length === 0) {
      void startCamera();
    }

    return () => stopCamera();
  }, [isOpen, hasGeminiApiKey]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const listener = App.addListener('backButton', () => {
      handleClose();
    });

    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [isOpen, onClose, capturedImage, isAnalyzing, detectedFoods.length]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex flex-col bg-black"
      >
        <div
          className="absolute left-0 right-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-4 pb-4"
          style={{ paddingTop: 'calc(var(--safe-area-top, 0px) + 1rem)' }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">AI Meal Scanner</h2>
            <button
              onClick={handleClose}
              disabled={isAnalyzing || isSavingDetectedFoods}
              className="rounded-full bg-white/20 p-2 transition-colors hover:bg-white/30 disabled:opacity-50"
            >
              <X className="h-6 w-6 text-white" />
            </button>
          </div>
        </div>

        <div className="relative flex flex-1 items-center justify-center bg-black">
          {!hasGeminiApiKey ? (
            <div className="mx-5 w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-gray-900">Gemini API Key</h3>
              <p className="mt-2 text-sm text-gray-600">
                Bitte beim ersten Start deinen persönlichen Gemini API Key eintragen. Der Key wird lokal auf diesem Gerät gespeichert.
              </p>
              <input
                type="password"
                value={geminiApiKeyInput}
                onChange={(event) => {
                  setGeminiApiKeyInput(event.target.value);
                  setGeminiApiKeyError('');
                }}
                placeholder="AIza..."
                className="mt-4 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none ring-teal-500 focus:ring-2"
              />
              {geminiApiKeyError ? (
                <p className="mt-2 text-sm text-red-600">{geminiApiKeyError}</p>
              ) : null}
              <button
                onClick={handleSaveApiKey}
                className="mt-4 w-full rounded-xl bg-teal-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-400"
              >
                API Key speichern
              </button>
            </div>
          ) : isAnalyzing ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-16 w-16 animate-spin text-white" />
              <p className="text-lg text-white">Mahlzeit wird analysiert...</p>
            </div>
          ) : detectedFoods.length > 0 || analysisError ? (
            <div className="h-full w-full overflow-auto bg-neutral-950 px-5 py-24">
              {capturedPreviewUrl ? (
                <img
                  src={capturedPreviewUrl}
                  alt="Meal preview"
                  className="mx-auto mb-5 h-48 w-full max-w-sm rounded-3xl object-cover shadow-lg"
                />
              ) : null}

              <div className="mx-auto max-w-sm space-y-4">
                <div className="rounded-3xl bg-white p-5 shadow-xl">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {detectedFoods.length > 0 ? 'Erkannte Lebensmittel' : 'Analyse fehlgeschlagen'}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {detectedFoods.length > 0
                      ? 'Prüfe die erkannten Einträge und speichere sie anschließend direkt im Tagebuch.'
                      : analysisError}
                  </p>
                </div>

                {detectedFoods.map((food) => (
                  <div key={`${food.name}-${food.estimated_weight_grams}`} className="rounded-3xl bg-white p-5 shadow-xl">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="font-semibold text-gray-900">{food.name}</h4>
                        <p className="text-sm text-gray-500">{food.estimated_weight_grams} g Portion</p>
                      </div>
                      <div className="rounded-2xl bg-teal-50 px-3 py-2 text-right">
                        <p className="text-lg font-semibold text-teal-700">
                          {Math.round((food.calories_per_100g * food.estimated_weight_grams) / 100)} kcal
                        </p>
                        <p className="text-xs text-teal-600">geschätzt</p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-2xl bg-slate-50 px-2 py-3">
                        <p className="text-slate-400">Protein</p>
                        <p className="mt-1 font-medium text-slate-700">{food.protein_per_100g} g</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-2 py-3">
                        <p className="text-slate-400">Carbs</p>
                        <p className="mt-1 font-medium text-slate-700">{food.carbs_per_100g} g</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-2 py-3">
                        <p className="text-slate-400">Fett</p>
                        <p className="mt-1 font-medium text-slate-700">{food.fat_per_100g} g</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : cameraError ? (
            <div className="flex flex-col items-center gap-4 px-6 text-center">
              <Camera className="h-16 w-16 text-white/50" />
              <p className="text-lg text-white">{cameraError}</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                disablePictureInPicture
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    videoRef.current.play().catch(() => {});
                  }
                }}
                onPlaying={() => {
                  setIsCameraStarting(false);
                  setIsCameraReady(true);
                }}
                className={`h-full w-full object-cover transition-opacity duration-150 ${isCameraReady ? 'opacity-100' : 'opacity-0'}`}
              />

              {!isCameraReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black">
                  <Loader2 className="h-12 w-12 animate-spin text-white" />
                  <p className="text-sm text-white/80">Kamera wird gestartet...</p>
                </div>
              )}
            </>
          )}
        </div>

        {hasGeminiApiKey && !isAnalyzing && !capturedImage && !cameraError && detectedFoods.length === 0 && !analysisError && (
          <div
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-6"
            style={{ paddingBottom: 'calc(var(--safe-area-bottom, 0px) + 1.5rem)' }}
          >
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full bg-white/20 p-4 transition-colors hover:bg-white/30"
              >
                <Upload className="h-6 w-6 text-white" />
              </button>

              <button
                onClick={capturePhoto}
                disabled={!isCameraReady || isCameraStarting}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-white transition-colors hover:bg-gray-200 disabled:opacity-50"
              >
                <Camera className="h-8 w-8 text-gray-800" />
              </button>

              <div className="w-16" />
            </div>

            <p className="mt-4 text-center text-sm text-white">
              Foto aufnehmen oder aus der Galerie wählen
            </p>
          </div>
        )}

        {hasGeminiApiKey && !isAnalyzing && (detectedFoods.length > 0 || analysisError) && (
          <div
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/95 to-transparent p-6"
            style={{ paddingBottom: 'calc(var(--safe-area-bottom, 0px) + 1.5rem)' }}
          >
            <div className="mx-auto flex max-w-sm gap-3">
              <button
                onClick={handleRetry}
                disabled={isSavingDetectedFoods}
                className="flex-1 rounded-2xl border border-white/15 bg-white/10 px-4 py-4 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/15 disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-2">
                  <RefreshCcw className="h-4 w-4" />
                  Neu versuchen
                </span>
              </button>

              <button
                onClick={() => void saveDetectedFoods()}
                disabled={detectedFoods.length === 0 || isSavingDetectedFoods}
                className="flex-1 rounded-2xl bg-teal-500 px-4 py-4 text-sm font-semibold text-white transition-colors hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-2">
                  {isSavingDetectedFoods ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Speichern
                </span>
              </button>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />
      </motion.div>
    </AnimatePresence>
  );
}
