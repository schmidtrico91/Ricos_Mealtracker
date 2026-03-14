import React from 'react';
import { X, Camera, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from "@/components/ui/button";

const BarcodeIcon = () => (
  <svg viewBox="0 0 24 24" className="w-8 h-8" fill="currentColor">
    <rect x="2" y="4" width="2" height="16" />
    <rect x="6" y="4" width="1" height="16" />
    <rect x="9" y="4" width="2" height="16" />
    <rect x="13" y="4" width="1" height="16" />
    <rect x="16" y="4" width="3" height="16" />
    <rect x="21" y="4" width="1" height="16" />
  </svg>
);

export default function TutorialModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl p-6 max-w-md w-full"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">🎉 Los geht's!</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <p className="text-gray-600 mb-6">
            Hier sind deine drei Haupt-Tools zum Tracken deiner Mahlzeiten:
          </p>

          <div className="space-y-4 mb-8">
            {/* AI Camera */}
            <div className="flex items-start gap-4 p-4 bg-teal-50 rounded-xl">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-teal-500 text-white flex items-center justify-center">
                <Camera className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">AI Kamera</h3>
                <p className="text-sm text-gray-600">
                  Perfekt für Restaurant-Besuche und selbstgekochte Gerichte. Einfach fotografieren und die KI analysiert deine Mahlzeit.
                </p>
              </div>
            </div>

            {/* Barcode Scanner */}
            <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-xl">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-500 text-white flex items-center justify-center">
                <BarcodeIcon />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">Barcode Scanner</h3>
                <p className="text-sm text-gray-600">
                  Das schnellste Tool für verpackte Lebensmittel. Barcode scannen und fertig!
                </p>
              </div>
            </div>

            {/* Search */}
            <div className="flex items-start gap-4 p-4 bg-purple-50 rounded-xl">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-purple-500 text-white flex items-center justify-center">
                <Search className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">Suche</h3>
                <p className="text-sm text-gray-600">
                  Durchsuche die Online-Datenbank, greife auf deinen Verlauf zu und verwalte deine eigenen erstellten Lebensmittel.
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={onClose}
            className="w-full bg-teal-500 hover:bg-teal-600 text-white py-6 rounded-xl text-lg font-medium"
          >
            Verstanden, los geht's!
          </Button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}