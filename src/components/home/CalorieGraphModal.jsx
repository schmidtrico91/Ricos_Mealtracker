import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Calendar as CalendarIcon } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useTranslation } from '../utils/translations';

export default function CalorieGraphModal({ isOpen, onClose, historicalLogs, userProfile, language = 'en' }) {
  const { t } = useTranslation(language);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);
  
  const chartData = useMemo(() => {
    if (!historicalLogs || historicalLogs.length === 0) return [];
    
    // Group logs by date and calculate daily totals
    const dailyTotals = {};
    historicalLogs.forEach(log => {
      if (!dailyTotals[log.date]) {
        dailyTotals[log.date] = 0;
      }
      dailyTotals[log.date] += log.calories || 0;
    });
    
    // Convert to array and sort by date
    const sortedData = Object.entries(dailyTotals)
      .map(([date, calories]) => ({
        date,
        calories: Math.round(calories),
        goal: userProfile?.daily_calories || 0,
        maintenance: userProfile?.maintenance_calories || 0
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Filter by date range if selected
    if (startDate && endDate) {
      const start = format(startDate, 'yyyy-MM-dd');
      const end = format(endDate, 'yyyy-MM-dd');
      return sortedData.filter(item => item.date >= start && item.date <= end);
    }
    
    return sortedData;
  }, [historicalLogs, userProfile, startDate, endDate]);
  
  if (!isOpen) return null;
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">{t('calorieTracking')}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        <div className="flex gap-2 mb-6 flex-wrap">
          <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start text-left font-normal text-sm">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, 'MMM d, yyyy') : t('startDate')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(date) => {
                  setStartDate(date);
                  setStartDateOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          
          <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start text-left font-normal text-sm">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, 'MMM d, yyyy') : t('endDate')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={(date) => {
                  setEndDate(date);
                  setEndDateOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          
          {(startDate || endDate) && (
            <Button 
              variant="ghost"
              size="sm"
              onClick={() => {
                setStartDate(null);
                setEndDate(null);
              }}
            >
              {t('clear')}
            </Button>
          )}
        </div>
        
        {chartData.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400">{t('noDataAvailable')}</p>
          </div>
        ) : (
          <div className="w-full h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(date) => format(new Date(date), 'MMM d')}
                  stroke="#9ca3af"
                  style={{ fontSize: '12px' }}
                />
                <YAxis 
                  stroke="#9ca3af"
                  style={{ fontSize: '12px' }}
                />
                <Tooltip 
                  labelFormatter={(date) => format(new Date(date), 'EEEE, MMM d')}
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="calories" 
                  stroke="#14b8a6" 
                  strokeWidth={3}
                  name={t('calories')}
                  dot={{ fill: '#14b8a6', r: 4 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="goal" 
                  stroke="#8b5cf6" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name={t('goal')}
                  dot={false}
                />
                <Line 
                  type="monotone" 
                  dataKey="maintenance" 
                  stroke="#94a3b8" 
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  name={t('maintenance')}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}