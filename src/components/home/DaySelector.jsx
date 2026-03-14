import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addDays, subDays, isToday } from 'date-fns';
import { de } from 'date-fns/locale';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from '../utils/translations';

export default function DaySelector({ selectedDate, onDateChange, language = 'en' }) {
  const { t } = useTranslation(language);
  const [calendarOpen, setCalendarOpen] = useState(false);
  
  const handlePrevDay = () => {
    onDateChange(subDays(selectedDate, 1));
  };
  
  const handleNextDay = () => {
    onDateChange(addDays(selectedDate, 1));
  };
  
  const dayLabel = isToday(selectedDate) 
    ? t('today')
    : format(selectedDate, 'EEEE', { locale: language === 'de' ? de : undefined });
  
  return (
    <div className="flex items-center justify-center gap-4 py-4">
      <button
        onClick={handlePrevDay}
        className="p-2 rounded-full hover:bg-gray-100 transition-colors"
      >
        <ChevronLeft className="w-5 h-5 text-gray-600" />
      </button>
      
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
            <span className="text-gray-600">&lt;</span>
            <span className="font-medium text-gray-800">{dayLabel}</span>
            <span className="text-gray-400">•</span>
            <span className="text-gray-600">{format(selectedDate, 'd. MMM', { locale: language === 'de' ? de : undefined })}</span>
            <span className="text-gray-600">&gt;</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="center">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              if (date) {
                onDateChange(date);
                setCalendarOpen(false);
              }
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      
      <button
        onClick={handleNextDay}
        className="p-2 rounded-full hover:bg-gray-100 transition-colors"
      >
        <ChevronRight className="w-5 h-5 text-gray-600" />
      </button>
    </div>
  );
}