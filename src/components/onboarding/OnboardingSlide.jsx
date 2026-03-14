import React from 'react';
import { motion } from 'framer-motion';

export default function OnboardingSlide({ children, title, subtitle }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center min-h-screen p-6"
    >
      {title && (
        <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">
          {title}
        </h1>
      )}
      {subtitle && (
        <p className="text-gray-500 text-center mb-8 max-w-xs">
          {subtitle}
        </p>
      )}
      {children}
    </motion.div>
  );
}