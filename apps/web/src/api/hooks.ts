import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { localDate, type DayLogDto, type FoodDto, type FoodSearchResponse, type LogEntryDto, type Meal, type MeDto, type RecipeDto } from '@mea/shared';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export const keys = {
  me: ['me'] as const,
  log: (date: string) => ['log', date] as const,
  search: (q: string) => ['search', q] as const,
  myFoods: ['myFoods'] as const,
  recipes: ['recipes'] as const,
  recipe: (id: number) => ['recipe', id] as const,
  food: (id: number) => ['food', id] as const,
};

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api.get<MeDto>('/auth/me'), retry: false, staleTime: 60_000 });
}

/** Today's date in my timezone, re-evaluated every minute so it rolls over at midnight. */
export function useToday(): string | undefined {
  const { data } = useMe();
  const tz = data?.settings.timezone;
  const [today, setToday] = useState<string>();
  useEffect(() => {
    if (!tz) return;
    const update = () => setToday(localDate(new Date(), tz));
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, [tz]);
  return today;
}

export function useDayLog(date: string | undefined) {
  return useQuery({ queryKey: keys.log(date ?? ''), queryFn: () => api.get<DayLogDto>(`/log?date=${date}`), enabled: !!date });
}

export function useFoodSearch(q: string) {
  return useQuery({
    queryKey: keys.search(q),
    queryFn: () => api.get<FoodSearchResponse>(`/foods/search?q=${encodeURIComponent(q)}`),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useMyFoods() {
  return useQuery({ queryKey: keys.myFoods, queryFn: () => api.get<FoodDto[]>('/foods/mine') });
}

export function useFood(id: number | undefined) {
  return useQuery({ queryKey: keys.food(id ?? 0), queryFn: () => api.get<FoodDto>(`/foods/${id}`), enabled: !!id });
}

export function useRecipes() {
  return useQuery({ queryKey: keys.recipes, queryFn: () => api.get<RecipeDto[]>('/recipes') });
}

export function useRecipe(id: number | undefined) {
  return useQuery({ queryKey: keys.recipe(id ?? 0), queryFn: () => api.get<RecipeDto>(`/recipes/${id}`), enabled: !!id });
}

/** Refresh everything that depends on the log or foods after a change. */
export function useInvalidate() {
  const qc = useQueryClient();
  return {
    log: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['log'] }),
        qc.invalidateQueries({ queryKey: ['search'] }),
        qc.invalidateQueries({ queryKey: ['suggestions'] }),
      ]),
    foods: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['search'] }),
        qc.invalidateQueries({ queryKey: keys.myFoods }),
        qc.invalidateQueries({ queryKey: ['food'] }),
        qc.invalidateQueries({ queryKey: keys.recipes }),
        qc.invalidateQueries({ queryKey: ['recipe'] }),
      ]),
  };
}

export interface LogFoodInput {
  date: string;
  meal: Meal;
  foodId: number;
  grams?: number;
  servingId?: number;
  servingQty?: number;
}

export function useLogFood() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (body: LogFoodInput) => api.post<LogEntryDto>('/log', body), onSuccess: inv.log });
}

export function useUpdateEntry() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: number } & Record<string, unknown>) => api.patch<LogEntryDto>(`/log/${id}`, patch),
    onSuccess: inv.log,
  });
}

export function useDeleteEntry() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (id: number) => api.del(`/log/${id}`), onSuccess: inv.log });
}
