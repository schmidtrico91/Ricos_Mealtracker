import React from 'react';
import { motion } from 'framer-motion';

export default function WaterFillCircle({ current, target, size = 200 }) {
  const percentage = Math.min((current / target) * 100, 100);
  const fillHeight = percentage;
  
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Background circle */}
      <svg className="absolute inset-0" viewBox="0 0 200 200">
        <circle
          cx="100"
          cy="100"
          r="90"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="4"
        />
      </svg>
      
      {/* Water fill container */}
      <div className="absolute inset-0 overflow-hidden rounded-full" style={{ margin: '5%' }}>
        <motion.div
          className="absolute bottom-0 left-0 right-0 bg-teal-400"
          initial={{ height: 0 }}
          animate={{ height: `${fillHeight}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          style={{ borderRadius: '0 0 50% 50%' }}
        >
          {/* Wave effect */}
          <svg
            className="absolute -top-3 left-0 w-full"
            viewBox="0 0 200 20"
            preserveAspectRatio="none"
          >
            <motion.path
              d="M0,10 Q25,0 50,10 T100,10 T150,10 T200,10 L200,20 L0,20 Z"
              fill="currentColor"
              className="text-teal-400"
              animate={{
                d: [
                  "M0,10 Q25,0 50,10 T100,10 T150,10 T200,10 L200,20 L0,20 Z",
                  "M0,10 Q25,20 50,10 T100,10 T150,10 T200,10 L200,20 L0,20 Z",
                  "M0,10 Q25,0 50,10 T100,10 T150,10 T200,10 L200,20 L0,20 Z"
                ]
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
          </svg>
        </motion.div>
      </div>
      
      {/* Text overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-gray-800">
          {current.toLocaleString()}
        </span>
        <span className="text-sm text-gray-500">
          / {target.toLocaleString()} kcal
        </span>
      </div>
    </div>
  );
}