import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Search, Sparkles, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Input } from "@/components/ui/input";
import { appClient } from '@/api/appClient';
import { PRESET_FOODS } from '@/lib/presetFoods';
import SearchTabs from './SearchTabs';
import FoodSearchItem from './FoodSearchItem';
import FoodDetailModal from './FoodDetailModal';
import CreateFoodWizard from './CreateFoodWizard';

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

export default function SearchPanel({ isOpen, onClose, onFoodLogged, selectedDate, language = 'en' }) {
  const FAST_FOOD_PRESET_PREFIXES = ['preset-mcd-', 'preset-bk-', 'preset-kfc-', 'preset-subway-'];
  const [activeTab, setActiveTab] = useState('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [userFoods, setUserFoods] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [loggedFoods, setLoggedFoods] = useState([]);
  const [selectedFood, setSelectedFood] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [createFoodName, setCreateFoodName] = useState('');
  const [selectedFoodInitialWeight, setSelectedFoodInitialWeight] = useState(100);
  const [onlineResults, setOnlineResults] = useState([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [isLoadingSelectedFoodDetails, setIsLoadingSelectedFoodDetails] = useState(false);
  const [onlineSearchError, setOnlineSearchError] = useState('');
  const [lastSearchedQuery, setLastSearchedQuery] = useState('');
  const searchInputRef = useRef(null);
  const searchRequestIdRef = useRef(0);
  const searchDebounceRef = useRef(null);

  useEffect(() => {
    if (isOpen && activeTab === 'search') {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    loadUserFoods();
    loadRecentSearches();
    loadLoggedFoods();
  }, []);

  useEffect(() => {
    if (activeTab !== 'search') {
      return;
    }

    const query = searchQuery.trim();
    if (query.length < 2) {
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
      setOnlineResults([]);
      setOnlineSearchError('');
      setIsSearchingOnline(false);
      setLastSearchedQuery('');
      return;
    }

    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = window.setTimeout(() => {
      void searchOnlineFoods(query);
    }, 180);

    return () => {
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
    };
  }, [activeTab, searchQuery, language]);

  const loadUserFoods = async () => {
    try {
      const foods = await appClient.entities.Food.list('name');
      setUserFoods(foods);
    } catch (error) {
      console.error('Error loading foods:', error);
    }
  };

  const loadRecentSearches = async () => {
    try {
      const searches = await appClient.entities.SearchHistory.list('-created_date', 10);
      setRecentSearches(searches);
    } catch (error) {
      console.error('Error loading search history:', error);
    }
  };

  const loadLoggedFoods = async () => {
    try {
      const logs = await appClient.entities.FoodLog.list('-created_date', 1000);
      const uniqueFoods = [];
      const seenNames = new Set();

      for (const log of logs) {
        if (seenNames.has(log.food_name)) {
          continue;
        }

        seenNames.add(log.food_name);
        uniqueFoods.push({
          id: log.food_id,
          name: log.food_name,
          calories_per_100g: (log.calories / log.weight_grams) * 100,
          protein_per_100g: (log.protein / log.weight_grams) * 100,
          carbs_per_100g: (log.carbs / log.weight_grams) * 100,
          fat_per_100g: (log.fat / log.weight_grams) * 100
        });
      }

      setLoggedFoods(uniqueFoods);
    } catch (error) {
      console.error('Error loading logged foods:', error);
    }
  };

  const handleFoodSelect = async (food) => {
    if (food.source === 'Open Food Facts' && searchQuery.trim()) {
      void saveSearchHistoryEntry(searchQuery);
    }

    let resolvedFood = food;
    const shouldLoadDetails = Boolean(food?.barcode) && (food?.source === 'Open Food Facts' || food?.source === 'Online');
    if (shouldLoadDetails) {
      setIsLoadingSelectedFoodDetails(true);
      try {
        const detailResponse = await appClient.search.openFoodFactsProduct(food.barcode);
        if (detailResponse?.product) {
          resolvedFood = normalizeOnlineProduct(detailResponse.product, detailResponse?.source);
        }
      } catch (error) {
        console.error('Error loading product details:', error);
      } finally {
        setIsLoadingSelectedFoodDetails(false);
      }
    }

    setSelectedFood(resolvedFood);
    setSelectedFoodInitialWeight(food.estimated_weight_grams || 100);
    setShowDetail(true);
  };

  const normalizeOnlineProduct = (product, responseSource) => {
    const nutriments = product?.nutriments || {};
    const nutritionSource = 'Open Food Facts';
    const sourceLabel = responseSource === 'open-food-facts' ? 'Open Food Facts' : 'Online';
    const kcal = readEnergyKcal(nutriments);
    const protein = parseNutritionNumber(nutriments.proteins_100g ?? nutriments.proteins);
    const carbs = parseNutritionNumber(nutriments.carbohydrates_100g ?? nutriments.carbohydrates);
    const fat = parseNutritionNumber(nutriments.fat_100g ?? nutriments.fat);

    return {
      id: `off-${product?.code || product?.product_name || product?.generic_name || Date.now()}`,
      source: sourceLabel,
      nutrition_source: nutritionSource,
      brand: product?.brands || '',
      barcode: product?.code || '',
      name: product?.product_name || product?.product_name_de || product?.product_name_en || product?.generic_name || 'Unbekanntes Produkt',
      calories_per_100g: Math.round(kcal),
      protein_per_100g: Math.round(protein * 10) / 10,
      carbs_per_100g: Math.round(carbs * 10) / 10,
      fat_per_100g: Math.round(fat * 10) / 10,
      image_url: product?.image_url || product?.image_front_url || ''
    };
  };

  const saveSearchHistoryEntry = async (term) => {
    const trimmedTerm = term.trim();
    if (!trimmedTerm) {
      return;
    }

    try {
      await appClient.entities.SearchHistory.create({
        term: trimmedTerm,
        source: 'online'
      });
      loadRecentSearches();
    } catch (error) {
      console.error('Error saving search history:', error);
    }
  };

  const searchOnlineFoods = async (query) => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setOnlineResults([]);
      setOnlineSearchError('');
      setLastSearchedQuery('');
      return;
    }

    const requestId = ++searchRequestIdRef.current;
    setIsSearchingOnline(true);
    setOnlineSearchError('');
    setLastSearchedQuery(trimmedQuery);

    try {
      const response = await appClient.search.openFoodFacts(trimmedQuery, 10, { locale: language });
      const products = Array.isArray(response?.products) ? response.products : [];

      if (requestId !== searchRequestIdRef.current) {
        return;
      }
      setOnlineResults(products.map((product) => normalizeOnlineProduct(product, response?.source)));
    } catch (error) {
      if (requestId !== searchRequestIdRef.current) {
        return;
      }
      console.error('Error searching foods:', error);
      setOnlineResults([]);
      setOnlineSearchError(error?.message || 'Online-Suche derzeit nicht erreichbar.');
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setIsSearchingOnline(false);
      }
    }
  };

  const handleLogFood = async (logData) => {
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      let food = logData.food;
      const isPresetFood = String(food?.id || '').startsWith('preset-');
      const presetExistsLocally = isPresetFood && userFoods.some((entry) => entry.id === food.id);

      if (!food.id || String(food.id).startsWith('off-') || (isPresetFood && !presetExistsLocally)) {
        const shouldStoreAsPresetScan = Boolean(food?.barcode) && (food?.source === 'Open Food Facts' || food?.source === 'Online');
        food = await appClient.entities.Food.create({
          id: isPresetFood ? food.id : undefined,
          name: food.name,
          barcode: food.barcode,
          calories_per_100g: food.calories_per_100g,
          protein_per_100g: food.protein_per_100g,
          carbs_per_100g: food.carbs_per_100g,
          fat_per_100g: food.fat_per_100g,
          image_url: food.image_url,
          brand: food.brand,
          source: shouldStoreAsPresetScan ? 'Preset Scan' : (food.source || 'Open Food Facts'),
          is_custom: false
        });
      }

      await appClient.entities.FoodLog.create({
        food_id: food.id,
        food_name: food.name,
        date: dateStr,
        weight_grams: logData.weight,
        calories: logData.calories,
        protein: logData.protein,
        carbs: logData.carbs,
        fat: logData.fat
      });

      setShowDetail(false);
      setSelectedFood(null);
      loadLoggedFoods();
      onFoodLogged();
    } catch (error) {
      console.error('Error logging food:', error);
    }
  };

  const handleCreateFood = async (foodData) => {
    try {
      const newFood = await appClient.entities.Food.create({
        name: foodData.name,
        calories_per_100g: foodData.calories_per_100g,
        protein_per_100g: foodData.protein_per_100g,
        carbs_per_100g: foodData.carbs_per_100g,
        fat_per_100g: foodData.fat_per_100g,
        is_custom: true
      });

      setSelectedFood(newFood);
      setSelectedFoodInitialWeight(foodData.weight);
      setShowDetail(true);
      setShowCreateWizard(false);
      setCreateFoodName('');
    } catch (error) {
      console.error('Error creating food:', error);
    }
  };

  const handleDeleteCustomFood = async (foodId) => {
    try {
      await appClient.entities.Food.delete(foodId);
      loadUserFoods();
    } catch (error) {
      console.error('Error deleting food:', error);
    }
  };

  const filteredHistory = loggedFoods.filter((food) =>
    searchQuery ? food.name.toLowerCase().includes(searchQuery.toLowerCase()) : true
  );
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const localPresetMatches = normalizedQuery.length < 2
    ? []
    : userFoods
      .filter((food) => !food.is_custom)
      .filter((food) => food.name?.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        const aName = String(a?.name || '').toLowerCase();
        const bName = String(b?.name || '').toLowerCase();
        const aStarts = aName.startsWith(normalizedQuery) ? 1 : 0;
        const bStarts = bName.startsWith(normalizedQuery) ? 1 : 0;
        if (aStarts !== bStarts) return bStarts - aStarts;
        return aName.localeCompare(bName);
      })
      .map((food) => ({
        ...food,
        source: food.source || 'Preset Lokal'
      }));
  const staticPresetMatches = normalizedQuery.length < 2
    ? []
    : PRESET_FOODS
      .filter((preset) => !FAST_FOOD_PRESET_PREFIXES.some((prefix) => preset.id.startsWith(prefix)))
      .filter((preset) => String(preset.name || '').toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        const aName = String(a?.name || '').toLowerCase();
        const bName = String(b?.name || '').toLowerCase();
        const aStarts = aName.startsWith(normalizedQuery) ? 1 : 0;
        const bStarts = bName.startsWith(normalizedQuery) ? 1 : 0;
        if (aStarts !== bStarts) return bStarts - aStarts;
        return aName.localeCompare(bName);
      })
      .map((preset) => ({
        ...preset,
        source: 'Preset Lokal'
      }));
  const mergedPresetMap = new Map();
  [...localPresetMatches, ...staticPresetMatches].forEach((food) => {
    if (!mergedPresetMap.has(food.id)) {
      mergedPresetMap.set(food.id, food);
    }
  });
  const mergedPresetMatches = Array.from(mergedPresetMap.values()).slice(0, 20);

  if (!isOpen) return null;

  return (
    <>
      <motion.button
        type="button"
        aria-label="Suche schliessen"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="fixed inset-0 z-30 bg-black/35"
      />

      <motion.div
        initial={{ opacity: 0, y: '100%' }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 bg-gray-50 z-40 flex flex-col rounded-t-3xl"
        style={{ height: '80vh' }}
      >
        {showCreateWizard ? (
          <CreateFoodWizard
            initialName={createFoodName}
            onComplete={handleCreateFood}
            onCancel={() => {
              setShowCreateWizard(false);
              setCreateFoodName('');
            }}
          />
        ) : (
          <>
            <SearchTabs activeTab={activeTab} onTabChange={setActiveTab} />

            <div className="flex-1 overflow-auto px-4 pb-24">
              {activeTab === 'search' && (
                <>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Essen suchen..."
                    className="pl-10 py-6 text-lg bg-white border-gray-200 rounded-xl focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-gray-200"
                  />
                </div>

                {!searchQuery && recentSearches.length > 0 && (
                  <div className="mb-6">
                    <p className="text-sm text-gray-500 mb-2">Letzte Suchen</p>
                    <div className="flex flex-wrap gap-2">
                      {recentSearches.map((search) => (
                        <button
                          key={search.id}
                          onClick={() => {
                            setSearchQuery(search.term);
                          }}
                          className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-600 hover:bg-gray-50"
                        >
                          {search.term}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {mergedPresetMatches.length > 0 && (
                  <div className="space-y-3 mb-4">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Sparkles className="h-4 w-4 text-teal-600" />
                      Lokale Basis-Lebensmittel
                    </div>
                    {mergedPresetMatches.map((food) => (
                      <FoodSearchItem
                        key={`preset-${food.id}`}
                        food={food}
                        onSelect={handleFoodSelect}
                      />
                    ))}
                  </div>
                )}

                {isSearchingOnline ? (
                  <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                    Suche in Online-Datenbank...
                  </div>
                ) : isLoadingSelectedFoodDetails ? (
                  <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                    Lade Nährwerte...
                  </div>
                ) : onlineSearchError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {onlineSearchError}
                  </div>
                ) : searchQuery.trim().length < 2 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-white p-4 text-sm text-gray-500">
                    Gib mindestens 2 Zeichen ein.
                  </div>
                ) : onlineResults.length === 0 ? (
                  <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
                    {mergedPresetMatches.length > 0
                      ? `Keine Online-Treffer gefunden${lastSearchedQuery ? ` für "${lastSearchedQuery}"` : ''}. Es werden nur lokale Presets angezeigt.`
                      : `Keine Treffer gefunden${lastSearchedQuery ? ` für "${lastSearchedQuery}"` : ''}.`}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Sparkles className="h-4 w-4 text-teal-600" />
                      Online-Datenbank
                    </div>
                    {onlineResults.map((food) => (
                      <FoodSearchItem
                        key={`${food.source}-${food.id}`}
                        food={food}
                        onSelect={handleFoodSelect}
                        showNutrition={false}
                      />
                    ))}
                  </div>
                )}
                </>
              )}

              {activeTab === 'history' && (
                <>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Verlauf durchsuchen..."
                    className="pl-10 py-6 text-lg bg-white border-gray-200 rounded-xl focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-gray-200"
                  />
                </div>

                <div className="space-y-3">
                  {filteredHistory.length === 0 ? (
                    <p className="text-center text-gray-400 py-8">
                      Noch keine Eintraege im Verlauf
                    </p>
                  ) : (
                    filteredHistory.map((food) => (
                      <FoodSearchItem
                        key={food.id}
                        food={food}
                        onSelect={handleFoodSelect}
                      />
                    ))
                  )}
                </div>
                </>
              )}

              {activeTab === 'create' && (
                <div className="space-y-4">
                <Input
                  value={createFoodName}
                  onChange={(event) => setCreateFoodName(event.target.value)}
                  placeholder="Name des Essens"
                  className="py-6 text-lg bg-white border-gray-200 rounded-xl"
                />
                <button
                  onClick={() => {
                    if (createFoodName.trim()) {
                      setShowCreateWizard(true);
                    }
                  }}
                  disabled={!createFoodName.trim()}
                  className="w-full py-4 bg-teal-500 text-white rounded-xl font-medium hover:bg-teal-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Jetzt erstellen
                </button>

                {userFoods.length > 0 && (
                  <div className="mt-8">
                    <p className="text-sm text-gray-500 mb-3">Deine eigenen Eintraege</p>
                    <div className="space-y-3">
                      {userFoods.filter((food) => food.is_custom).map((food) => (
                        <div
                          key={food.id}
                          className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors"
                        >
                          <div
                            onClick={() => handleFoodSelect(food)}
                            className="flex-1 cursor-pointer"
                          >
                            <h4 className="font-medium text-gray-800">{food.name}</h4>
                            <p className="text-sm text-gray-500">
                              {food.calories_per_100g} kcal / {food.protein_per_100g}g P / {food.carbs_per_100g}g C / {food.fat_per_100g}g F
                            </p>
                          </div>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteCustomFood(food.id);
                            }}
                            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                </div>
              )}
            </div>
          </>
        )}

        <FoodDetailModal
          food={selectedFood}
          isOpen={showDetail}
          onClose={() => setShowDetail(false)}
          onLog={handleLogFood}
          language={language}
          initialWeight={selectedFoodInitialWeight}
        />
      </motion.div>
    </>
  );
}
