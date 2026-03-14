import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../utils/translations';

export default function LongTermProgress({ progress, message, onAddTodayProgress, onRevertTodayProgress, language = 'en' }) {
  const { t } = useTranslation(language);
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{t('longTermProgress')}</span>
        <span className="text-sm text-gray-500">{Math.round(progress)}% {t('achieved')}</span>
      </div>
      
      <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-teal-400 to-teal-600 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(progress, 100)}%` }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        />
      </div>
      
      <div className="mt-2">
        {message && (
          <p className="text-sm text-teal-600 font-medium mb-2">{message}</p>
        )}
        <div className="flex items-center justify-end gap-2">
          {onRevertTodayProgress && (
            <button
              onClick={onRevertTodayProgress}
              className="px-3 py-1 bg-red-300 hover:bg-red-400 text-white rounded-lg text-xs font-medium transition-colors"
            >
              {t('revertProgress')}
            </button>
          )}
          {onAddTodayProgress && (
            <button
              onClick={onAddTodayProgress}
              className="px-3 py-1 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-xs font-medium transition-colors"
            >
              {t('addProgress')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}