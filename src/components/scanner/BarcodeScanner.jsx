import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { App } from '@capacitor/app';
import { onDeviceOffNameCacheStore } from '@/lib/onDeviceStore';

const parseNutritionNumber = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value !== 'string') {
    return 0;
  }
  const normalized = value.replace(',', '.').replace(/[^0-9.-]/g, '').trim();
  if (!normalized) {
    return 0;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const readEnergyKcal = (nutriments = {}) => {
  const kcal = parseNutritionNumber(nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal']);
  if (kcal > 0) {
    return kcal;
  }

  const kj = parseNutritionNumber(nutriments.energy_kj_100g ?? nutriments.energy_kj);
  if (kj > 0) {
    return kj / 4.184;
  }

  return 0;
};

const withTimeout = async (promise, timeoutMs, message = 'Request timed out') => {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  }
};

const normalizeBarcodeValue = (raw) => {
  const text = String(raw || '').trim();
  if (!text) return '';

  const digits = text.replace(/\D/g, '');
  if (digits.length >= 8) {
    return digits;
  }

  return text;
};

const buildBarcodeCandidates = (barcode) => {
  const normalized = normalizeBarcodeValue(barcode);
  if (!normalized) return [];

  const candidates = [normalized];
  const digitsOnly = normalized.replace(/\D/g, '');
  if (digitsOnly.length === 12) {
    candidates.push(`0${digitsOnly}`);
  } else if (digitsOnly.length === 13 && digitsOnly.startsWith('0')) {
    candidates.push(digitsOnly.slice(1));
  }

  return [...new Set(candidates)];
};

const productFields = 'code,product_name,product_name_de,product_name_en,generic_name,brands,nutriments,image_url,image_front_url';

const parseV2Product = (data) => {
  if (data?.product) return data.product;
  throw new Error('Product not found');
};

const parseV0Product = (data) => {
  if (data?.status === 1 && data?.product) return data.product;
  throw new Error('Product not found');
};

const fetchJsonDirect = async (url, { params, timeoutMs = 7000 } = {}) => {
  const target = new URL(url);
  if (params && typeof params === 'object') {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        target.searchParams.set(key, String(value));
      }
    });
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(target.toString(), {
      method: 'GET',
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export default function BarcodeScanner({ isOpen, onClose, onScan }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [hasCamera, setHasCamera] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const streamRef = useRef(null);
  const scanningRef = useRef(false);
  const lookupGenerationRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => stopCamera();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const listener = App.addListener('backButton', () => {
      stopCamera();
      onClose();
    });

    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [isOpen, onClose]);

  const startCamera = async () => {
    setHasCamera(true);
    setIsCameraStarting(true);
    setIsCameraReady(false);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        videoRef.current.autoplay = true;
        videoRef.current.play().catch(() => {});
      }
    } catch (error) {
      console.error('Camera access denied:', error);
      setHasCamera(false);
      setIsCameraStarting(false);
    }
  };

  const stopCamera = () => {
    lookupGenerationRef.current += 1;
    scanningRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScanning(false);
    setLoading(false);
    setIsCameraStarting(false);
    setIsCameraReady(false);
  };

  const lookupBarcode = async (barcode) => {
    const lookupGeneration = ++lookupGenerationRef.current;
    const isStaleLookup = () => lookupGeneration !== lookupGenerationRef.current;
    const barcodeCandidates = buildBarcodeCandidates(barcode);
    if (barcodeCandidates.length === 0) {
      setError('Ungueltiger Barcode');
      return;
    }
    const primaryBarcode = barcodeCandidates[0];

    setLoading(true);
    setError(null);
    
    try {
      if (navigator?.onLine === false) {
        throw new Error('Offline');
      }

      const fastEndpoints = [
        {
          buildUrl: (code) => `https://world.openfoodfacts.net/api/v2/product/${encodeURIComponent(code)}`,
          params: { fields: productFields },
          parse: parseV2Product
        },
        {
          buildUrl: (code) => `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}`,
          params: { fields: productFields },
          parse: parseV2Product
        },
        {
          buildUrl: (code) => `https://de.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}`,
          params: { fields: productFields },
          parse: parseV2Product
        },
      ];

      const fallbackEndpoints = [
        {
          buildUrl: (code) => `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`,
          params: undefined,
          parse: parseV0Product
        },
        {
          buildUrl: (code) => `https://de.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`,
          params: undefined,
          parse: parseV0Product
        }
      ];

      const fetchFromEndpoints = async (candidateCode, endpoints, timeoutMs, raceTimeoutMs) => {
        const requests = endpoints.map(async (endpoint) => {
          const url = endpoint.buildUrl(candidateCode);
          const data = await fetchJsonDirect(url, {
            params: endpoint.params,
            timeoutMs
          });
          return endpoint.parse(data);
        });

        return withTimeout(Promise.any(requests), raceTimeoutMs, 'Product lookup timed out');
      };

      let product = null;
      let resolvedBarcode = primaryBarcode;
      let lastLookupError = null;
      for (const candidateCode of barcodeCandidates) {
        if (isStaleLookup()) {
          return;
        }
        try {
          try {
            product = await fetchFromEndpoints(candidateCode, fastEndpoints, 5500, 6500);
          } catch {
            product = await withTimeout(
              fetchFromEndpoints(candidateCode, fallbackEndpoints, 9000, 11000),
              14000,
              'Product fallback timed out'
            );
          }

          if (product) {
            resolvedBarcode = candidateCode;
            break;
          }
        } catch (lookupError) {
          lastLookupError = lookupError;
          product = null;
        }
      }

      if (!product) {
        throw lastLookupError || new Error('Product not found');
      }

      if (isStaleLookup()) {
        return;
      }

      const nutriments = product.nutriments || {};

      const foodData = {
        name: product.product_name || product.product_name_de || product.product_name_en || product.generic_name || 'Unknown Product',
        barcode: resolvedBarcode,
        calories_per_100g: Math.round(readEnergyKcal(nutriments)),
        protein_per_100g: Math.round(parseNutritionNumber(nutriments.proteins_100g ?? nutriments.proteins) * 10) / 10,
        carbs_per_100g: Math.round(parseNutritionNumber(nutriments.carbohydrates_100g ?? nutriments.carbohydrates) * 10) / 10,
        fat_per_100g: Math.round(parseNutritionNumber(nutriments.fat_100g ?? nutriments.fat) * 10) / 10,
        image_url: product.image_url || product.image_front_url,
        brand: product.brands
      };

      if (isStaleLookup()) {
        return;
      }

      stopCamera();
      onScan(foodData);
    } catch (err) {
      if (isStaleLookup()) {
        return;
      }
      console.error('Error looking up barcode:', err);
      const shouldUseOfflineFallback = navigator?.onLine === false;
      if (shouldUseOfflineFallback) {
        try {
          let cached = null;
          for (const candidateCode of barcodeCandidates) {
            cached = await onDeviceOffNameCacheStore.getByBarcode(candidateCode);
            if (cached) break;
          }
          if (cached && !isStaleLookup()) {
            const offlineFoodData = {
              name: cached.product_name || 'Unbekanntes Produkt',
              barcode: cached.code || primaryBarcode,
              calories_per_100g: 0,
              protein_per_100g: 0,
              carbs_per_100g: 0,
              fat_per_100g: 0,
              image_url: '',
              brand: cached.brands || ''
            };
            stopCamera();
            onScan(offlineFoodData);
            return;
          }
        } catch (cacheError) {
          console.error('Barcode cache lookup failed:', cacheError);
        }
      }

      const errorMessage = String(err?.message || '').toLowerCase();
      if (
        err?.status === 404 ||
        errorMessage.includes('404') ||
        errorMessage.includes('product not found') ||
        errorMessage.includes('no product')
      ) {
        setError('Produkt nicht in Datenbank gefunden');
      } else if (errorMessage.includes('timed out') || errorMessage.includes('timeout')) {
        setError('Produktabfrage dauert zu lange. Bitte erneut versuchen.');
      } else {
        setError('Produktabfrage fehlgeschlagen. Bitte Internet pruefen.');
      }
      setLoading(false);
      setTimeout(() => {
        if (isStaleLookup()) {
          return;
        }
        setError(null);
        scanningRef.current = true;
      }, 2000);
    }
  };

  const detectBarcode = async () => {
    if (!('BarcodeDetector' in window)) return;
    
    const barcodeDetector = new window.BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39']
    });

    scanningRef.current = true;

    const detect = async () => {
      if (!videoRef.current || !scanningRef.current) return;
      
      try {
        const barcodes = await barcodeDetector.detect(videoRef.current);
        if (barcodes.length > 0 && scanningRef.current) {
          const barcode = barcodes[0].rawValue;
          scanningRef.current = false;
          await lookupBarcode(barcode);
          return;
        }
      } catch (error) {
        // Silently continue scanning
      }
      
      if (scanningRef.current) {
        setTimeout(() => requestAnimationFrame(detect), 100);
      }
    };

    detect();
  };

  // Manual input fallback for browsers without BarcodeDetector
  const handleManualInput = async () => {
    const barcode = prompt('Enter barcode number:');
    if (barcode) {
      await lookupBarcode(barcode);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black z-50 flex flex-col"
    >
      {/* Header */}
      <div
        className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-4 pb-4"
        style={{ paddingTop: 'calc(var(--safe-area-top, 0px) + 1rem)' }}
      >
        <button
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="p-3 rounded-full bg-black/50 text-white"
        >
          <X className="w-6 h-6" />
        </button>
        <span className="text-white font-medium">Scan Barcode</span>
        <div className="w-12" />
      </div>

      {/* Camera View */}
      <div className="flex-1 relative bg-black">
        {hasCamera ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-150 ${
                isCameraReady ? 'opacity-100' : 'opacity-0'
              }`}
              playsInline
              muted
              disablePictureInPicture
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  videoRef.current.play().catch(() => {});
                }
              }}
              onPlaying={() => {
                setScanning(true);
                setIsCameraStarting(false);
                setIsCameraReady(true);

                if ('BarcodeDetector' in window && !scanningRef.current) {
                  detectBarcode();
                }
              }}
            />

            {!isCameraReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black">
                <Loader2 className="w-12 h-12 text-teal-400 animate-spin" />
                <p className="text-white/80 text-sm">Kamera wird gestartet...</p>
              </div>
            )}
            
            {/* Scanning overlay */}
            <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${
              isCameraReady ? 'opacity-100' : 'opacity-0'
            }`}>
              <div className="relative w-64 h-40">
                {/* Corner markers */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-teal-400 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-teal-400 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-teal-400 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-teal-400 rounded-br-lg" />
                
                {/* Scanning line animation */}
                <motion.div
                  className="absolute left-2 right-2 h-0.5 bg-teal-400"
                  animate={{ top: ['10%', '90%', '10%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
              </div>
            </div>
            
            {/* Semi-transparent overlay */}
            <div className={`absolute inset-0 bg-black/40 transition-opacity ${
              isCameraReady ? 'opacity-100' : 'opacity-0'
            }`} style={{
              clipPath: 'polygon(0% 0%, 0% 100%, calc(50% - 128px) 100%, calc(50% - 128px) calc(50% - 80px), calc(50% + 128px) calc(50% - 80px), calc(50% + 128px) calc(50% + 80px), calc(50% - 128px) calc(50% + 80px), calc(50% - 128px) 100%, 100% 100%, 100% 0%)'
            }} />
            
            {/* Loading/Error overlay */}
            {(loading || error) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                {loading ? (
                  <div className="flex flex-col items-center">
                    <Loader2 className="w-12 h-12 text-teal-400 animate-spin mb-3" />
                    <p className="text-white">Produkt wird gesucht...</p>
                  </div>
                ) : error ? (
                  <div className="bg-red-500/90 px-6 py-4 rounded-xl">
                    <p className="text-white font-medium">{error}</p>
                  </div>
                ) : null}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-white p-8">
            <Camera className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-center mb-4">Camera access denied or not available</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="bg-black/80 p-6"
        style={{ paddingBottom: 'calc(var(--safe-area-bottom, 0px) + 1.5rem)' }}
      >
        <p className="text-white/70 text-center text-sm mb-4">
          Position the barcode within the frame
        </p>
        {!('BarcodeDetector' in window) && (
          <button
            onClick={handleManualInput}
            className="w-full py-3 bg-teal-500 text-white rounded-xl font-medium"
          >
            Enter barcode manually
          </button>
        )}
      </div>
    </motion.div>
  );
}
