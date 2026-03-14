import React, { useState, useEffect, useMemo } from 'react';
import { Menu, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { appClient } from '@/api/appClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import WaterFillCircle from '../components/home/WaterFillCircle';
import MacroDisplay from '../components/home/MacroDisplay';
import DaySelector from '../components/home/DaySelector';
import FoodListItem from '../components/home/FoodListItem';
import LongTermProgress from '../components/home/LongTermProgress';
import FloatingButtons from '../components/home/FloatingButtons';
import SearchPanel from '../components/search/SearchPanel';
import SettingsPanel from '../components/settings/SettingsPanel';
import OnboardingFlow from '../components/onboarding/OnboardingFlow';
import FoodDetailModal from '../components/search/FoodDetailModal';
import BarcodeScanner from '../components/scanner/BarcodeScanner';
import AIMealScanner from '../components/scanner/AIMealScanner';
import CombineFoodModal from '../components/home/CombineFoodModal';
import CalorieGraphModal from '../components/home/CalorieGraphModal';
import TutorialModal from '../components/home/TutorialModal';
import { useTranslation } from '../components/utils/translations';
import { ensureOffCacheBackgroundStarted } from '@/lib/offCacheService';

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isAIScannerOpen, setIsAIScannerOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [editingFood, setEditingFood] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedFoodIds, setSelectedFoodIds] = useState([]);
  const [showCombineModal, setShowCombineModal] = useState(false);
  const [showGraphModal, setShowGraphModal] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  
  const queryClient = useQueryClient();
  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  useEffect(() => {
    ensureOffCacheBackgroundStarted();
  }, []);
  
  // Load user profile first for language
  const {
    data: profiles = [],
    isLoading: profileLoading,
    isSuccess: profileLoadedSuccessfully,
    isError: profileLoadFailed,
    error: profileError,
    refetch: refetchProfile
  } = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => appClient.entities.UserProfile.list('-created_date', 1),
    retry: 1
  });

  const userProfile = profiles[0];
  const { t } = useTranslation(userProfile?.language || 'en');

  // Check if onboarding needed
  useEffect(() => {
    if (profileLoadedSuccessfully && !userProfile) {
      setShowOnboarding(true);
    } else if (profileLoadedSuccessfully && userProfile && !userProfile.tutorial_completed) {
      setShowTutorial(true);
    }
  }, [profileLoadedSuccessfully, userProfile]);

  // Load food logs for selected date
  const { data: foodLogs = [], refetch: refetchLogs } = useQuery({
    queryKey: ['foodLogs', dateStr],
    queryFn: () => appClient.entities.FoodLog.filter({ date: dateStr }, '-created_date'),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => appClient.entities.FoodLog.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foodLogs', dateStr] });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => appClient.entities.FoodLog.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foodLogs', dateStr] });
      setShowEditModal(false);
      setEditingFood(null);
    },
  });

  // Calculate daily totals
  const dailyTotals = useMemo(() => {
    return foodLogs.reduce((acc, log) => ({
      calories: acc.calories + (log.calories || 0),
      protein: acc.protein + (log.protein || 0),
      carbs: acc.carbs + (log.carbs || 0),
      fat: acc.fat + (log.fat || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  }, [foodLogs]);

  // Keep history for graph modal only
  const { data: allHistoricalLogs = [] } = useQuery({
    queryKey: ['historicalLogs'],
    queryFn: async () => {
      const logs = await appClient.entities.FoodLog.list('-created_date', 10000);
      return logs;
    },
  });

  // Calculate long-term progress strictly from explicitly booked cumulative progress.
  const longTermProgress = useMemo(() => {
    if (!userProfile?.total_calories_needed || !userProfile?.maintenance_calories) return 0;

    const cumulativeDifference = Number(userProfile.cumulative_calories || 0);
    const total = userProfile.total_calories_needed;
    const progress = (Math.abs(cumulativeDifference) / total) * 100;

    return Math.min(Math.max(progress, 0), 100);
  }, [userProfile]);

  const todayAlreadyAdded = useMemo(() => {
    if (!userProfile?.logged_dates) return false;
    const today = format(selectedDate, 'yyyy-MM-dd');
    return userProfile.logged_dates.includes(today);
  }, [userProfile, selectedDate]);

  const handleAddTodayProgress = async () => {
    if (!userProfile || todayAlreadyAdded) return;
    
    const today = format(selectedDate, 'yyyy-MM-dd');
    
    // Calculate today's total calories
    const todayCalories = dailyTotals.calories;
    
    // Calculate today's difference
    // For fat loss: maintenance - consumed (positive if deficit)
    // For bulking: only surplus above maintenance (positive if surplus)
    let todayDifference;
    if (userProfile.goal === 'muscle_gain') {
      const surplus = todayCalories - userProfile.maintenance_calories;
      todayDifference = surplus > 0 ? surplus : 0;
    } else {
      todayDifference = userProfile.maintenance_calories - todayCalories;
    }
    
    // Update cumulative
    const newCumulative = (userProfile.cumulative_calories || 0) + todayDifference;
    
    // Add today to logged_dates array
    const loggedDates = [...(userProfile.logged_dates || []), today];
    
    await appClient.entities.UserProfile.update(userProfile.id, {
      cumulative_calories: newCumulative,
      last_updated_date: today,
      logged_dates: loggedDates
    });
    
    queryClient.invalidateQueries({ queryKey: ['userProfile'] });
    queryClient.invalidateQueries({ queryKey: ['historicalLogs'] });
  };

  const handleRevertTodayProgress = async () => {
    if (!userProfile || !todayAlreadyAdded) return;
    
    const today = format(selectedDate, 'yyyy-MM-dd');
    
    // Calculate today's total calories
    const todayCalories = dailyTotals.calories;
    
    // Calculate today's difference that was added
    let todayDifference;
    if (userProfile.goal === 'muscle_gain') {
      const surplus = todayCalories - userProfile.maintenance_calories;
      todayDifference = surplus > 0 ? surplus : 0;
    } else {
      todayDifference = userProfile.maintenance_calories - todayCalories;
    }
    
    // Revert cumulative by subtracting today's difference
    const newCumulative = (userProfile.cumulative_calories || 0) - todayDifference;
    
    // Remove today from logged_dates array
    const loggedDates = (userProfile.logged_dates || []).filter(date => date !== today);
    
    await appClient.entities.UserProfile.update(userProfile.id, {
      cumulative_calories: newCumulative,
      last_updated_date: loggedDates.length > 0 ? loggedDates[loggedDates.length - 1] : null,
      logged_dates: loggedDates
    });
    
    queryClient.invalidateQueries({ queryKey: ['userProfile'] });
    queryClient.invalidateQueries({ queryKey: ['historicalLogs'] });
  };

  const getMotivationalMessage = () => {
    if (longTermProgress >= 75) return t('almostThere');
    if (longTermProgress >= 50) return t('halfwayThere');
    if (longTermProgress >= 25) return t('onTrack');
    return t('greatStart');
  };

  const handleDeleteFood = (food) => {
    deleteMutation.mutate(food.id);
  };
  
  const handleToggleSelect = (food) => {
    setSelectedFoodIds(prev => {
      if (prev.includes(food.id)) {
        return prev.filter(id => id !== food.id);
      } else {
        return [...prev, food.id];
      }
    });
  };
  
  const handleCreateCombined = async (name, totals) => {
    try {
      // Calculate per 100g values
      const calories_per_100g = (totals.calories / totals.weight) * 100;
      const protein_per_100g = (totals.protein / totals.weight) * 100;
      const carbs_per_100g = (totals.carbs / totals.weight) * 100;
      const fat_per_100g = (totals.fat / totals.weight) * 100;
      
      // Create the new food
      const newFood = await appClient.entities.Food.create({
        name,
        calories_per_100g: Math.round(calories_per_100g),
        protein_per_100g: Math.round(protein_per_100g * 10) / 10,
        carbs_per_100g: Math.round(carbs_per_100g * 10) / 10,
        fat_per_100g: Math.round(fat_per_100g * 10) / 10,
        is_custom: true
      });
      
      // Log the combined food for today
      await appClient.entities.FoodLog.create({
        food_id: newFood.id,
        food_name: name,
        date: dateStr,
        weight_grams: totals.weight,
        calories: totals.calories,
        protein: totals.protein,
        carbs: totals.carbs,
        fat: totals.fat
      });
      
      // Delete the selected individual food logs
      for (const foodId of selectedFoodIds) {
        await appClient.entities.FoodLog.delete(foodId);
      }
      
      // Reset selection and close modal
      setSelectedFoodIds([]);
      setShowCombineModal(false);
      queryClient.invalidateQueries({ queryKey: ['foodLogs', dateStr] });
    } catch (error) {
      console.error('Error creating combined food:', error);
    }
  };

  const handleEditFood = (food) => {
    setEditingFood({
      ...food,
      name: food.food_name,
      calories_per_100g: (food.calories / food.weight_grams) * 100,
      protein_per_100g: (food.protein / food.weight_grams) * 100,
      carbs_per_100g: (food.carbs / food.weight_grams) * 100,
      fat_per_100g: (food.fat / food.weight_grams) * 100,
    });
    setShowEditModal(true);
  };

  const handleUpdateFood = async (logData) => {
    // Check if this is an edit of existing log or a new log from scanner
    if (editingFood.food_id) {
      // Editing existing log
      updateMutation.mutate({
        id: editingFood.id,
        data: {
          weight_grams: logData.weight,
          calories: logData.calories,
          protein: logData.protein,
          carbs: logData.carbs,
          fat: logData.fat,
        }
      });
    } else {
      // New food from scanner - create a log entry
      try {
        let foodId = editingFood.id;
        let foodName = editingFood.name;

        if (!foodId) {
          const existingByBarcode = editingFood.barcode
            ? await appClient.entities.Food.filter({ barcode: editingFood.barcode }, '-created_date', 1)
            : [];

          if (existingByBarcode.length > 0) {
            const existingFood = existingByBarcode[0];
            foodId = existingFood.id;
            foodName = existingFood.name || editingFood.name;
            if (existingFood.source !== 'Preset Scan') {
              await appClient.entities.Food.update(existingFood.id, {
                source: 'Preset Scan',
                is_custom: false
              });
            }
          } else {
            const createdFood = await appClient.entities.Food.create({
              name: editingFood.name,
              barcode: editingFood.barcode,
              calories_per_100g: Number(editingFood.calories_per_100g || 0),
              protein_per_100g: Number(editingFood.protein_per_100g || 0),
              carbs_per_100g: Number(editingFood.carbs_per_100g || 0),
              fat_per_100g: Number(editingFood.fat_per_100g || 0),
              image_url: editingFood.image_url || '',
              brand: editingFood.brand || '',
              source: 'Preset Scan',
              is_custom: false
            });
            foodId = createdFood.id;
            foodName = createdFood.name;
          }
        }

        await appClient.entities.FoodLog.create({
          food_id: foodId,
          food_name: foodName,
          date: dateStr,
          weight_grams: logData.weight,
          calories: logData.calories,
          protein: logData.protein,
          carbs: logData.carbs,
          fat: logData.fat
        });
        queryClient.invalidateQueries({ queryKey: ['foodLogs', dateStr] });
        setShowEditModal(false);
        setEditingFood(null);
      } catch (error) {
        console.error('Error logging food:', error);
      }
    }
  };

  const handleFoodLogged = () => {
    refetchLogs();
    setIsSearchOpen(false);
  };

  const handleOnboardingComplete = async () => {
    setShowOnboarding(false);
    await queryClient.invalidateQueries({ queryKey: ['userProfile'] });
    const result = await refetchProfile();
    if (!result.data?.length) {
      setShowOnboarding(true);
      alert('Profil konnte nicht geladen werden. Bitte App neu starten und erneut versuchen.');
    }
    // Tutorial will auto-show after profile reloads
  };

  const handleTutorialClose = async () => {
    setShowTutorial(false);
    if (userProfile) {
      await appClient.entities.UserProfile.update(userProfile.id, {
        tutorial_completed: true
      });
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
    }
  };

  const handleBarcodePress = () => {
    setIsScannerOpen(true);
  };

  const handleAICameraPress = () => {
    setIsAIScannerOpen(true);
  };

  const handleBarcodeScan = (foodData) => {
    setIsScannerOpen(false);
    
    // foodData now contains the product info from Open Food Facts
    if (foodData && foodData.name) {
      // Open detail modal immediately to avoid delayed popup caused by DB lookup.
      setEditingFood({
        id: foodData.id || null,
        name: foodData.name,
        barcode: foodData.barcode,
        calories_per_100g: Number(foodData.calories_per_100g || 0),
        protein_per_100g: Number(foodData.protein_per_100g || 0),
        carbs_per_100g: Number(foodData.carbs_per_100g || 0),
        fat_per_100g: Number(foodData.fat_per_100g || 0),
        image_url: foodData.image_url || '',
        brand: foodData.brand || '',
        source: 'Preset Scan',
        is_custom: false
      });
      setShowEditModal(true);
    }
  };

  const handleTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const minSwipeDistance = 50;
    
    if (Math.abs(distance) < minSwipeDistance) return;
    
    if (distance > 0) {
      // Swiped left - next day
      const nextDay = new Date(selectedDate);
      nextDay.setDate(nextDay.getDate() + 1);
      setSelectedDate(nextDay);
    } else {
      // Swiped right - previous day
      const prevDay = new Date(selectedDate);
      prevDay.setDate(prevDay.getDate() - 1);
      setSelectedDate(prevDay);
    }
  };

  if (showOnboarding) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (profileLoadFailed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-red-100 rounded-2xl p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-red-700 mb-2">Profil konnte nicht geladen werden</h2>
          <p className="text-sm text-gray-600 mb-4">
            Die lokalen Profildaten konnten nicht geladen werden.
          </p>
          <p className="text-xs text-gray-500 mb-4">
            {profileError?.message || 'Unbekannter Fehler'}
          </p>
          <button
            onClick={() => refetchProfile()}
            className="px-4 py-2 rounded-lg bg-teal-500 text-white hover:bg-teal-600 transition-colors"
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-gray-50 pb-24" 
      style={{ touchAction: 'pan-y pinch-zoom' }}
    >
      <style>{`
        @media screen and (orientation: landscape) and (max-height: 600px) {
          body {
            transform: rotate(-90deg);
            transform-origin: left top;
            width: 100vh;
            height: 100vw;
            overflow-x: hidden;
            position: absolute;
            top: 100%;
            left: 0;
          }
        }
      `}</style>
      {/* Header */}
      <div
        className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-100 bg-white px-4 pb-3"
        style={{ paddingTop: 'calc(var(--safe-area-top, 0px) + 0.75rem)' }}
      >
        <h1 className="text-lg font-bold bg-gradient-to-r from-teal-500 to-teal-600 bg-clip-text text-transparent">Rico's Mealtracker</h1>
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="h-11 w-11 rounded-full hover:bg-gray-100 transition-colors flex items-center justify-center"
          aria-label="Settings"
        >
          <Menu className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Main Content */}
      <div className="px-4 py-4">
        {/* Long-term Progress */}
        {userProfile?.goal !== 'maintain' && (
          <div className="mb-4">
            <LongTermProgress
              progress={longTermProgress}
              message={getMotivationalMessage()}
              onAddTodayProgress={todayAlreadyAdded ? null : handleAddTodayProgress}
              onRevertTodayProgress={todayAlreadyAdded ? handleRevertTodayProgress : null}
              language={userProfile?.language || 'en'}
            />
          </div>
        )}

        {/* Today Section - Sticky */}
        <div
          className="sticky z-20 mb-4 rounded-2xl bg-white shadow-sm"
          style={{ top: 'calc(var(--safe-area-top, 0px) + 4.75rem)' }}
        >
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-gray-500 text-xs">{t('today')}</h2>
              <button
                onClick={() => setShowGraphModal(true)}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <TrendingUp className="w-4 h-4 text-teal-500" />
              </button>
            </div>
            
            {/* Calorie Circle - Compact */}
            <div className="flex justify-center mb-3">
              <WaterFillCircle
                current={dailyTotals.calories}
                target={userProfile?.daily_calories || 2000}
                size={140}
              />
            </div>

            {/* Macros - Compact */}
            <div className="flex gap-3">
              <MacroDisplay
                label={t('protein')}
                current={dailyTotals.protein}
                target={userProfile?.protein_target || 150}
                color="protein"
              />
              <MacroDisplay
                label={t('carbs')}
                current={dailyTotals.carbs}
                target={userProfile?.carbs_target || 200}
                color="carbs"
              />
              <MacroDisplay
                label={t('fat')}
                current={dailyTotals.fat}
                target={userProfile?.fat_target || 70}
                color="fat"
              />
            </div>
          </div>
        </div>

        {/* Day Selector */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <DaySelector
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            language={userProfile?.language || 'en'}
          />
        </div>

        {/* Food List Section */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ minHeight: '40vh' }}>
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-medium text-gray-800">{t('food')}</h3>
          </div>
          
          <div className="p-4 pb-24 overflow-auto" style={{ maxHeight: '50vh' }}>
            {foodLogs.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 text-sm">
                  {t('noFoodsLogged')}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {foodLogs.map((food) => (
                    <FoodListItem
                      key={food.id}
                      food={food}
                      onEdit={handleEditFood}
                      onDelete={handleDeleteFood}
                      isSelected={selectedFoodIds.includes(food.id)}
                      onToggleSelect={handleToggleSelect}
                      language={userProfile?.language || 'en'}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Action Buttons */}
      <FloatingButtons
        isSearchOpen={isSearchOpen}
        onSearchToggle={() => setIsSearchOpen(!isSearchOpen)}
        onBarcodePress={handleBarcodePress}
        onAICameraPress={handleAICameraPress}
        isHidden={selectedFoodIds.length > 1}
      />
      
      {/* Create Combined Food Button */}
      {selectedFoodIds.length > 1 && (
        <div
          className="fixed left-0 right-0 z-50 flex justify-center"
          style={{ bottom: 'calc(var(--safe-area-bottom, 0px) + 1.5rem)' }}
        >
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={() => setShowCombineModal(true)}
            className="px-8 py-4 bg-teal-500 hover:bg-teal-600 text-white rounded-xl font-semibold shadow-lg whitespace-nowrap"
          >
            Create ({selectedFoodIds.length} foods)
          </motion.button>
        </div>
      )}

      {/* Search Panel */}
      <AnimatePresence>
        {isSearchOpen && (
          <SearchPanel
            isOpen={isSearchOpen}
            onClose={() => setIsSearchOpen(false)}
            onFoodLogged={handleFoodLogged}
            selectedDate={selectedDate}
            language={userProfile?.language || 'en'}
          />
        )}
      </AnimatePresence>

      {/* Settings Panel */}
      <AnimatePresence>
        {isSettingsOpen && (
          <SettingsPanel
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            userProfile={userProfile}
            onProfileUpdate={() => queryClient.invalidateQueries({ queryKey: ['userProfile'] })}
          />
        )}
      </AnimatePresence>

      {/* Edit Food Modal */}
      <FoodDetailModal
        food={editingFood}
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingFood(null);
        }}
        onLog={handleUpdateFood}
        language={userProfile?.language || 'en'}
      />

      {/* Barcode Scanner */}
      <AnimatePresence>
        {isScannerOpen && (
          <BarcodeScanner
            isOpen={isScannerOpen}
            onClose={() => setIsScannerOpen(false)}
            onScan={handleBarcodeScan}
          />
        )}
      </AnimatePresence>

      {/* AI Meal Scanner */}
      <AnimatePresence>
        {isAIScannerOpen && (
          <AIMealScanner
            isOpen={isAIScannerOpen}
            onClose={() => setIsAIScannerOpen(false)}
            onMealDetected={handleFoodLogged}
            selectedDate={dateStr}
          />
        )}
      </AnimatePresence>
      
      {/* Combine Food Modal */}
      <AnimatePresence>
        {showCombineModal && (
          <CombineFoodModal
            isOpen={showCombineModal}
            onClose={() => {
              setShowCombineModal(false);
              setSelectedFoodIds([]);
            }}
            selectedFoods={foodLogs.filter(f => selectedFoodIds.includes(f.id))}
            onCreateCombined={handleCreateCombined}
            language={userProfile?.language || 'en'}
          />
        )}
      </AnimatePresence>
      
      {/* Calorie Graph Modal */}
      <AnimatePresence>
        {showGraphModal && (
          <CalorieGraphModal
            isOpen={showGraphModal}
            onClose={() => setShowGraphModal(false)}
            historicalLogs={allHistoricalLogs}
            userProfile={userProfile}
            language={userProfile?.language || 'en'}
          />
        )}
      </AnimatePresence>

      {/* Tutorial Modal */}
      <TutorialModal
        isOpen={showTutorial}
        onClose={handleTutorialClose}
      />
      </div>
      );
      }
