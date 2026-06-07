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
  peopleCount: number;      // 几人吃饭（影响份量）
  fullness: number;         // 吃几分饱（1-10，影响总量）
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
  prep_date: string;        // YYYY-MM-DD（需要动手处理的那天）
  prep_time?: string;       // HH:MM 建议开始处理的时间，用于排序
  item: string;
  kind: 'defrost' | 'prep';
  done: boolean;
}

export interface User {
  username: string;
  display_name: string;
}

// 用户独立的健康/口味偏好（存 users 表）
export const DEFAULT_PREFS: Prefs = {
  cuisine: '广式',
  spicy: false,
  avoid: ['菌菇'],
  health: '高血脂，需要清淡健康饮食，低盐低糖低脂',
  redMeatMaxMeals: 2,
  redMeatMaxGrams: 100,
  peopleCount: 2,
  fullness: 8,
};

export interface Meal {
  id: string;
  owner: string;            // 归属账号 username
  date: string;             // YYYY-MM-DD
  meal_type: MealType;
  title: string;
  recipe: string;
  health_note: string;      // AI 给的健康说明（结合健康状况）
  health_conflict?: boolean; // 这道菜是否与健康状况相背离（用警示色提醒）
  author: string;
  ingredients?: Ingredient[];
  preps?: Prep[];
}
