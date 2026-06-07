// 共用类型定义

export type MealType = 'breakfast' | 'lunch' | 'dinner';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
};

export interface Prefs {
  cuisine: string;          // 菜系偏好，如「广式」
  spicy: boolean;           // 是否吃辣
  avoid: string[];          // 忌口，如 ["菌菇"]
  health: string;           // 健康描述
  redMeatMaxMeals: number;  // 每周红肉最多几顿
  redMeatMaxGrams: number;  // 每周红肉最多多少克
}

export interface Settings {
  id: number;
  ai_api_key: string;
  ai_base_url: string;
  ai_model: string;
  prefs: Prefs;
  updated_at?: string;
}

export interface Ingredient {
  id: string;
  meal_id: string;
  name: string;
  amount: string;
  bought: boolean;
}

export interface Prep {
  id: string;
  meal_id: string | null;
  prep_date: string;        // YYYY-MM-DD
  item: string;
  kind: 'defrost' | 'prep';
  done: boolean;
}

export interface User {
  username: string;
  display_name: string;
}

export interface Meal {
  id: string;
  date: string;             // YYYY-MM-DD
  meal_type: MealType;
  title: string;
  recipe: string;
  health_note: string;      // AI 给的健康说明（结合健康状况）
  author: string;
  ingredients?: Ingredient[];
  preps?: Prep[];
}
