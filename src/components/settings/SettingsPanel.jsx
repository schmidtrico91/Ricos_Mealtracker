import React, { useState, useEffect } from 'react';
import { X, User, Target, Utensils, ChevronRight, Globe, RefreshCw, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { appClient } from '@/api/appClient';
import { useTranslation } from '../utils/translations';
import {
  getOffCacheStatus,
  startOffCacheSync,
  stopOffCacheSync,
  subscribeOffCacheStatus
} from '@/lib/offCacheService';

export default function SettingsPanel({ isOpen, onClose, userProfile, onProfileUpdate }) {
  const [editMode, setEditMode] = useState(null);
  const [editData, setEditData] = useState({});
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [pendingGoal, setPendingGoal] = useState(null);
  const [goalWeightChange, setGoalWeightChange] = useState(5);
  const [showResetWarning, setShowResetWarning] = useState(false);
  const [offCacheStatus, setOffCacheStatus] = useState(() => getOffCacheStatus());
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [availableUpdate, setAvailableUpdate] = useState(null);
  const { t } = useTranslation(userProfile?.language || 'en');

  const currentAppVersion = String(import.meta.env.VITE_APP_VERSION || '0.0.0');
  const updateManifestUrl = String(import.meta.env.VITE_UPDATE_MANIFEST_URL || '/app-update-manifest.json').trim();

  const normalizeVersion = (value) =>
    String(value || '')
      .trim()
      .replace(/^v/i, '');

  const compareVersions = (left, right) => {
    const a = normalizeVersion(left).split('.').map((part) => Number(part) || 0);
    const b = normalizeVersion(right).split('.').map((part) => Number(part) || 0);
    const maxLen = Math.max(a.length, b.length);
    for (let index = 0; index < maxLen; index += 1) {
      const av = a[index] || 0;
      const bv = b[index] || 0;
      if (av > bv) return 1;
      if (av < bv) return -1;
    }
    return 0;
  };

  const handleCheckForUpdates = async () => {
    if (!updateManifestUrl) {
      setUpdateMessage('Update-URL nicht konfiguriert (VITE_UPDATE_MANIFEST_URL).');
      setAvailableUpdate(null);
      return;
    }

    setIsCheckingUpdate(true);
    setUpdateMessage('');
    setAvailableUpdate(null);
    try {
      const response = await fetch(updateManifestUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Update-Server antwortet mit ${response.status}`);
      }

      const payload = await response.json();
      const latestVersion = normalizeVersion(payload?.version);
      const apkUrl = String(payload?.apk_url || payload?.url || '').trim();

      if (!latestVersion || !apkUrl) {
        throw new Error('Manifest unvollständig (version/apk_url fehlt).');
      }

      if (compareVersions(latestVersion, currentAppVersion) > 0) {
        setAvailableUpdate({
          version: latestVersion,
          apkUrl,
          notes: String(payload?.notes || '')
        });
        setUpdateMessage(`Neue Version verfügbar: ${latestVersion} (aktuell: ${currentAppVersion})`);
      } else {
        setUpdateMessage(`App ist aktuell (${currentAppVersion}).`);
      }
    } catch (error) {
      setUpdateMessage(error?.message || 'Update-Prüfung fehlgeschlagen.');
      setAvailableUpdate(null);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleDownloadUpdate = () => {
    if (!availableUpdate?.apkUrl) {
      return;
    }

    window.open(availableUpdate.apkUrl, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    if (userProfile) {
      setEditData({
        age: userProfile.age || 25,
        height: userProfile.height || 170,
        weight: userProfile.weight || 70,
        gender: userProfile.gender || 'male',
        activity_level: userProfile.activity_level || 'moderately_active',
        daily_calories: userProfile.daily_calories || 2000,
        maintenance_calories: userProfile.maintenance_calories || 2000,
        protein_target: userProfile.protein_target || 150,
        carbs_target: userProfile.carbs_target || 200,
        fat_target: userProfile.fat_target || 70,
        goal: userProfile.goal || 'fat_loss',
        language: userProfile.language || 'en'
        });
    }
  }, [userProfile]);

  useEffect(() => {
    const unsubscribe = subscribeOffCacheStatus((status) => {
      setOffCacheStatus(status);
    });
    return () => unsubscribe();
  }, []);

  const handleOffCacheToggle = () => {
    if (offCacheStatus?.running) {
      stopOffCacheSync();
      return;
    }
    void startOffCacheSync();
  };
  const showOffCacheInitBanner = !offCacheStatus?.completed && (offCacheStatus?.progressPercent || 0) < 100;

  const calculateBMR = (weight, height, age, gender) => {
    if (gender === 'male') {
      return (10 * weight) + (6.25 * height) - (5 * age) + 5;
    } else {
      return (10 * weight) + (6.25 * height) - (5 * age) - 161;
    }
  };

  const getActivityMultiplier = (activityLevel) => {
    const multipliers = {
      sedentary: 1.2,
      lightly_active: 1.375,
      moderately_active: 1.55,
      very_active: 1.725,
      super_active: 1.9
    };
    return multipliers[activityLevel] || 1.55;
  };

  const calculateMaintenance = () => {
    const bmr = calculateBMR(editData.weight, editData.height, editData.age, editData.gender);
    return Math.round(bmr * getActivityMultiplier(editData.activity_level));
  };

  const handleSave = async () => {
    try {
      const updatedData = { ...editData };
      
      // If body data changed, recalculate everything
      if (editMode === 'height' || editMode === 'weight') {
        const maintenance = calculateMaintenance();
        updatedData.maintenance_calories = maintenance;
        
        // Recalculate daily calories based on goal
        if (editData.goal === 'fat_loss') {
          updatedData.daily_calories = maintenance - 500;
        } else if (editData.goal === 'muscle_gain') {
          updatedData.daily_calories = maintenance + 300;
        } else if (editData.goal === 'maintain') {
          updatedData.daily_calories = maintenance;
        }
        
        // Recalculate macros
        updatedData.protein_target = Math.round(editData.weight * 2);
        updatedData.fat_target = Math.round((updatedData.daily_calories * 0.25) / 9);
        updatedData.carbs_target = Math.round((updatedData.daily_calories - updatedData.protein_target * 4 - updatedData.fat_target * 9) / 4);
      }
      
      await appClient.entities.UserProfile.update(userProfile.id, updatedData);
      setEditData(updatedData);
      onProfileUpdate();
      setEditMode(null);
    } catch (error) {
      console.error('Error updating profile:', error);
    }
  };

  const handleGoalConfirm = async () => {
    try {
      const maintenance = calculateMaintenance();
      const totalCaloriesNeeded = Math.round(goalWeightChange * 9300);
      
      const updatedData = { 
        ...editData, 
        goal: pendingGoal,
        maintenance_calories: maintenance,
        goal_weight_change: goalWeightChange,
        total_calories_needed: totalCaloriesNeeded,
        cumulative_calories: 0,
        logged_dates: [],
        goal_start_date: new Date().toISOString().split('T')[0],
        goal_end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      };
      
      if (pendingGoal === 'fat_loss') {
        updatedData.daily_calories = maintenance - 500;
        updatedData.target_weight = editData.weight - goalWeightChange;
      } else {
        updatedData.daily_calories = maintenance + 300;
        updatedData.target_weight = editData.weight + goalWeightChange;
      }
      
      // Recalculate macros
      updatedData.protein_target = Math.round(editData.weight * 2);
      updatedData.fat_target = Math.round((updatedData.daily_calories * 0.25) / 9);
      updatedData.carbs_target = Math.round((updatedData.daily_calories - updatedData.protein_target * 4 - updatedData.fat_target * 9) / 4);
      
      await appClient.entities.UserProfile.update(userProfile.id, updatedData);
      setEditData(updatedData);
      onProfileUpdate();
      setShowGoalModal(false);
      setPendingGoal(null);
      setEditMode(null);
    } catch (error) {
      console.error('Error updating goal:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl flex flex-col"
      >
        <div
          className="flex items-center justify-between border-b px-4 pb-4"
          style={{ paddingTop: 'calc(var(--safe-area-top, 0px) + 0.75rem)' }}
        >
          <h2 className="text-xl font-semibold text-gray-900">{t('settings')}</h2>
          <button
            onClick={onClose}
            className="h-11 w-11 rounded-full bg-gray-100/70 hover:bg-gray-200/80 transition-colors flex items-center justify-center"
            aria-label="Close settings"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <div
          className="flex-1 overflow-auto p-4 space-y-4"
          style={{ paddingBottom: 'calc(var(--safe-area-bottom, 0px) + 1.5rem)' }}
        >
          {showOffCacheInitBanner ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] text-gray-500">
                Wir initialisieren die Online-Bibliothek fuer dich, kleinen Moment bitte.
                {offCacheStatus?.running ? ' · läuft' : ' · pausiert'}
                {offCacheStatus?.currentChunk ? ` (${offCacheStatus.currentChunk})` : ''}
                {typeof offCacheStatus?.cachedProducts === 'number' ? ` · ${offCacheStatus.cachedProducts} Produkte` : ''}
                {typeof offCacheStatus?.processedChunks === 'number' && typeof offCacheStatus?.totalChunks === 'number'
                  ? ` · Chunks ${offCacheStatus.processedChunks}/${offCacheStatus.totalChunks}`
                  : ''}
                {typeof offCacheStatus?.failedChunks === 'number' ? ` · Fehlerchunks ${offCacheStatus.failedChunks}` : ''}
              </p>
              <button
                onClick={handleOffCacheToggle}
                className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                  offCacheStatus?.running
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-teal-100 text-teal-700 hover:bg-teal-200'
                }`}
              >
                {offCacheStatus?.running ? 'Caching stoppen' : 'Caching starten'}
              </button>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-teal-500 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, offCacheStatus?.progressPercent || 0))}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-gray-500">
              {Math.max(0, Math.min(100, offCacheStatus?.progressPercent || 0))}% geladen
            </p>
            {offCacheStatus?.error ? (
              <p className="mt-1 text-[10px] text-red-600">{offCacheStatus.error}</p>
            ) : null}
          </div>
          ) : null}

          {/* Body Data */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <User className="w-5 h-5 text-teal-500" />
              {t('bodyData')}
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">{t('height')}</span>
                {editMode === 'height' ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={editData.height}
                      onChange={(e) => setEditData(prev => ({ ...prev, height: Number(e.target.value) }))}
                      className="w-20 text-center"
                    />
                    <span className="text-gray-500">cm</span>
                    <Button size="sm" onClick={handleSave}>Save</Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditMode('height')}
                    className="flex items-center gap-1 text-gray-900 hover:text-teal-600"
                  >
                    {editData.height} cm
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-600">{t('weight')}</span>
                {editMode === 'weight' ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={editData.weight}
                      onChange={(e) => setEditData(prev => ({ ...prev, weight: Number(e.target.value) }))}
                      className="w-20 text-center"
                    />
                    <span className="text-gray-500">kg</span>
                    <Button size="sm" onClick={handleSave}>Save</Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditMode('weight')}
                    className="flex items-center gap-1 text-gray-900 hover:text-teal-600"
                  >
                    {editData.weight} kg
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Activity Level */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <Target className="w-5 h-5 text-teal-500" />
              Aktivitätslevel
            </h3>
            
            <Select
              value={editData.activity_level}
              onValueChange={async (value) => {
                const updatedActivityData = { ...editData, activity_level: value };
                setEditData(updatedActivityData);
                const bmr = calculateBMR(editData.weight, editData.height, editData.age, editData.gender);
                const multipliers = {
                  sedentary: 1.2,
                  lightly_active: 1.375,
                  moderately_active: 1.55,
                  very_active: 1.725,
                  super_active: 1.9
                };
                const newMaintenance = Math.round(bmr * multipliers[value]);
                
                let newDailyCalories = newMaintenance;
                if (editData.goal === 'fat_loss') {
                  newDailyCalories = newMaintenance - 500;
                } else if (editData.goal === 'muscle_gain') {
                  newDailyCalories = newMaintenance + 300;
                }
                
                const newProtein = Math.round(editData.weight * 2);
                const newFat = Math.round((newDailyCalories * 0.25) / 9);
                const newCarbs = Math.round((newDailyCalories - newProtein * 4 - newFat * 9) / 4);
                
                await appClient.entities.UserProfile.update(userProfile.id, { 
                  activity_level: value,
                  maintenance_calories: newMaintenance,
                  daily_calories: newDailyCalories,
                  protein_target: newProtein,
                  carbs_target: newCarbs,
                  fat_target: newFat
                });
                onProfileUpdate();
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Wähle dein Aktivitätslevel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sedentary">Wenig aktiv - Wenig bis keine Bewegung</SelectItem>
                <SelectItem value="lightly_active">Leicht aktiv - Leichte Bewegung 1-3 Tage/Woche</SelectItem>
                <SelectItem value="moderately_active">Moderat aktiv - Moderate Bewegung 3-5 Tage/Woche</SelectItem>
                <SelectItem value="very_active">Sehr aktiv - Intensive Bewegung 6-7 Tage/Woche</SelectItem>
                <SelectItem value="super_active">Extrem aktiv - Sehr intensive Bewegung & körperlicher Beruf</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Goals */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <Target className="w-5 h-5 text-teal-500" />
              {t('goals')}
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">{t('goalType')}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setPendingGoal('fat_loss');
                      setGoalWeightChange(userProfile?.goal_weight_change || 5);
                      setShowGoalModal(true);
                    }}
                    className={`px-3 py-1 rounded-full text-sm ${
                      editData.goal === 'fat_loss'
                        ? 'bg-teal-500 text-white'
                        : 'bg-gray-200 text-gray-600'
                        }`}
                        >
                        {t('cut')}
                        </button>
                  <button
                    onClick={() => {
                      setPendingGoal('muscle_gain');
                      setGoalWeightChange(userProfile?.goal_weight_change || 5);
                      setShowGoalModal(true);
                    }}
                    className={`px-3 py-1 rounded-full text-sm ${
                      editData.goal === 'muscle_gain'
                        ? 'bg-teal-500 text-white'
                        : 'bg-gray-200 text-gray-600'
                        }`}
                        >
                        {t('bulk')}
                        </button>
                  <button
                    onClick={async () => {
                      const maintenance = calculateMaintenance();
                      const protein = Math.round(editData.weight * 2);
                      const fat = Math.round((maintenance * 0.25) / 9);
                      const carbs = Math.round((maintenance - protein * 4 - fat * 9) / 4);
                      
                      const updatedData = { 
                        ...editData, 
                        goal: 'maintain', 
                        daily_calories: maintenance, 
                        maintenance_calories: maintenance,
                        target_weight: editData.weight,
                        protein_target: protein,
                        carbs_target: carbs,
                        fat_target: fat
                      };
                      await appClient.entities.UserProfile.update(userProfile.id, updatedData);
                      setEditData(updatedData);
                      onProfileUpdate();
                    }}
                    className={`px-3 py-1 rounded-full text-sm ${
                      editData.goal === 'maintain'
                        ? 'bg-teal-500 text-white'
                        : 'bg-gray-200 text-gray-600'
                        }`}
                        >
                        {t('maintain')}
                        </button>
                </div>
              </div>

            </div>
          </div>

          {/* Nutrition Targets */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <Utensils className="w-5 h-5 text-teal-500" />
              {t('dailyTargets')}
            </h3>
            
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600">{t('calories')}</span>
                  <span className="font-medium">{editData.daily_calories} {t('kcal')}</span>
                </div>
                {editMode === 'calories' ? (
                  <>
                    <Slider
                      value={[editData.daily_calories]}
                      onValueChange={([value]) => setEditData(prev => ({ ...prev, daily_calories: value }))}
                      min={1200}
                      max={4000}
                      step={1}
                    />
                    <Button onClick={handleSave} className="w-full mt-2">Save</Button>
                  </>
                ) : (
                  <button
                    onClick={() => setEditMode('calories')}
                    className="text-sm text-teal-600 hover:text-teal-700"
                  >
                    {t('edit')}
                  </button>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600">{t('protein')}</span>
                  <div className="text-right">
                    <div className="font-medium">{editData.protein_target}g</div>
                    <div className="text-xs text-gray-500">{Math.round((editData.protein_target * 4 / editData.daily_calories) * 100)}%</div>
                  </div>
                </div>
                {editMode === 'protein' ? (
                  <>
                    <Slider
                      value={[editData.protein_target]}
                      onValueChange={([value]) => {
                        const newProtein = value;
                        const newCalories = (newProtein * 4) + (editData.carbs_target * 4) + (editData.fat_target * 9);
                        setEditData(prev => ({ ...prev, protein_target: newProtein, daily_calories: Math.round(newCalories) }));
                      }}
                      min={50}
                      max={300}
                      step={1}
                    />
                    <Button onClick={handleSave} className="w-full mt-2">Save</Button>
                  </>
                ) : (
                  <button
                    onClick={() => setEditMode('protein')}
                    className="text-sm text-teal-600 hover:text-teal-700"
                  >
                    Edit
                  </button>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600">{t('carbs')}</span>
                  <div className="text-right">
                    <div className="font-medium">{editData.carbs_target}g</div>
                    <div className="text-xs text-gray-500">{Math.round((editData.carbs_target * 4 / editData.daily_calories) * 100)}%</div>
                  </div>
                </div>
                {editMode === 'carbs' ? (
                  <>
                    <Slider
                      value={[editData.carbs_target]}
                      onValueChange={([value]) => {
                        const newCarbs = value;
                        const newCalories = (editData.protein_target * 4) + (newCarbs * 4) + (editData.fat_target * 9);
                        setEditData(prev => ({ ...prev, carbs_target: newCarbs, daily_calories: Math.round(newCalories) }));
                      }}
                      min={50}
                      max={400}
                      step={1}
                    />
                    <Button onClick={handleSave} className="w-full mt-2">Save</Button>
                  </>
                ) : (
                  <button
                    onClick={() => setEditMode('carbs')}
                    className="text-sm text-teal-600 hover:text-teal-700"
                  >
                    Edit
                  </button>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-600">{t('fat')}</span>
                  <div className="text-right">
                    <div className="font-medium">{editData.fat_target}g</div>
                    <div className="text-xs text-gray-500">{Math.round((editData.fat_target * 9 / editData.daily_calories) * 100)}%</div>
                  </div>
                </div>
                {editMode === 'fat' ? (
                  <>
                    <Slider
                      value={[editData.fat_target]}
                      onValueChange={([value]) => {
                        const newFat = value;
                        const newCalories = (editData.protein_target * 4) + (editData.carbs_target * 4) + (newFat * 9);
                        setEditData(prev => ({ ...prev, fat_target: newFat, daily_calories: Math.round(newCalories) }));
                      }}
                      min={20}
                      max={150}
                      step={1}
                    />
                    <Button onClick={handleSave} className="w-full mt-2">Save</Button>
                  </>
                ) : (
                  <button
                    onClick={() => setEditMode('fat')}
                    className="text-sm text-teal-600 hover:text-teal-700"
                  >
                    Edit
                  </button>
                )}
                </div>
                </div>
                </div>

                {/* Language */}
                <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <Globe className="w-5 h-5 text-teal-500" />
                {t('language')}
                </h3>

                <div className="flex items-center justify-between">
                  <span className="text-gray-600">{t('language')}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        const newData = { ...editData, language: 'en' };
                        setEditData(newData);
                        await appClient.entities.UserProfile.update(userProfile.id, { language: 'en' });
                        onProfileUpdate();
                      }}
                      className={`px-3 py-1 rounded-full text-sm ${
                        editData.language === 'en'
                          ? 'bg-teal-500 text-white'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {t('english')}
                    </button>
                    <button
                      onClick={async () => {
                        const newData = { ...editData, language: 'de' };
                        setEditData(newData);
                        await appClient.entities.UserProfile.update(userProfile.id, { language: 'de' });
                        onProfileUpdate();
                      }}
                      className={`px-3 py-1 rounded-full text-sm ${
                        editData.language === 'de'
                          ? 'bg-teal-500 text-white'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {t('german')}
                    </button>
                  </div>
                </div>
                </div>

                {/* App Update */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-teal-500" />
                    App-Update
                  </h3>

                  <div className="space-y-3">
                    <p className="text-sm text-gray-600">Installierte Version: {currentAppVersion}</p>
                    <button
                      onClick={handleCheckForUpdates}
                      disabled={isCheckingUpdate}
                      className={`w-full rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        isCheckingUpdate
                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                          : 'bg-teal-500 text-white hover:bg-teal-600'
                      }`}
                    >
                      {isCheckingUpdate ? 'Prüfe auf Updates...' : 'Nach Updates prüfen'}
                    </button>

                    {updateMessage ? (
                      <p className="text-xs text-gray-600">{updateMessage}</p>
                    ) : null}

                    {availableUpdate?.apkUrl ? (
                      <button
                        onClick={handleDownloadUpdate}
                        className="w-full rounded-lg px-4 py-2 text-sm font-medium bg-gray-900 text-white hover:bg-black transition-colors inline-flex items-center justify-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Update herunterladen ({availableUpdate.version})
                      </button>
                    ) : null}
                  </div>
                </div>
                </div>
                </motion.div>

        {/* Goal Weight Modal */}
        <AnimatePresence>
          {showGoalModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
              onClick={() => setShowGoalModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl p-6 max-w-sm w-full"
              >
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {pendingGoal === 'fat_loss' ? 'Wie viel Gewicht möchtest du verlieren?' : 'Wie viel Gewicht möchtest du zunehmen?'}
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                  {pendingGoal === 'fat_loss' ? 'Dein Abnehmziel in Kilogramm' : 'Dein Muskelaufbauziel in Kilogramm'}
                </p>
                
                <div className="text-center mb-6">
                  <span className="text-5xl font-bold text-gray-900">{goalWeightChange}</span>
                  <span className="text-xl text-gray-500 ml-2">kg</span>
                </div>
                
                <Slider
                  value={[goalWeightChange]}
                  onValueChange={([value]) => setGoalWeightChange(value)}
                  min={1}
                  max={30}
                  step={0.5}
                  className="mb-6"
                />
                
                <div className="flex justify-between text-sm text-gray-400 mb-6">
                  <span>1 kg</span>
                  <span>30 kg</span>
                </div>
                
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowGoalModal(false)}
                    className="flex-1"
                  >
                    Abbrechen
                  </Button>
                  <Button
                    onClick={() => {
                      setShowGoalModal(false);
                      setShowResetWarning(true);
                    }}
                    className="flex-1 bg-teal-500 hover:bg-teal-600"
                  >
                    Bestätigen
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reset Warning Modal */}
        <AnimatePresence>
          {showResetWarning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4"
              onClick={() => setShowResetWarning(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl p-6 max-w-sm w-full"
              >
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  ⚠️ Fortschritt zurücksetzen?
                </h3>
                <p className="text-sm text-gray-600 mb-6">
                  Wenn du dein Ziel änderst, wird dein gesamter bisheriger getackter Fortschritt zurückgesetzt. Möchtest du wirklich fortfahren?
                </p>
                
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowResetWarning(false);
                      setPendingGoal(null);
                    }}
                    className="flex-1"
                  >
                    Abbrechen
                  </Button>
                  <Button
                    onClick={() => {
                      handleGoalConfirm();
                      setShowResetWarning(false);
                    }}
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                  >
                    Fortfahren
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
                </motion.div>
                );
                }
