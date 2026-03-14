import React from 'react';
import { Search, X, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Barcode icon component
const BarcodeIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
    <rect x="2" y="4" width="2" height="16" />
    <rect x="6" y="4" width="1" height="16" />
    <rect x="9" y="4" width="2" height="16" />
    <rect x="13" y="4" width="1" height="16" />
    <rect x="16" y="4" width="3" height="16" />
    <rect x="21" y="4" width="1" height="16" />
  </svg>
);

export default function FloatingButtons({ isSearchOpen, onSearchToggle, onBarcodePress, onAICameraPress, isHidden }) {
  if (isHidden) return null;
  const actionButtonClassName =
    'w-14 h-14 rounded-full bg-teal-500 text-white shadow-lg flex items-center justify-center transition-transform ' +
    'focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus:bg-teal-500 focus-visible:bg-teal-500 active:bg-teal-500';
  return (
    <div
      className="fixed left-1/2 z-50 flex -translate-x-1/2 flex-row gap-3"
      style={{ bottom: 'calc(var(--safe-area-bottom, 0px) + 1.5rem)' }}
    >
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onAICameraPress}
        className={actionButtonClassName}
      >
        <Camera className="w-6 h-6" />
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onBarcodePress}
        className={actionButtonClassName}
      >
        <BarcodeIcon />
      </motion.button>
      
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onSearchToggle}
        className={actionButtonClassName}
      >
        <AnimatePresence mode="wait">
          {isSearchOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <X className="w-6 h-6" />
            </motion.div>
          ) : (
            <motion.div
              key="search"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Search className="w-6 h-6" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
