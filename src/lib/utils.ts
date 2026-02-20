import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// School timezone — all date comparisons use IST
const SCHOOL_TZ = 'Asia/Kolkata';

/** Get today's date string (YYYY-MM-DD) in school timezone */
export function getTodayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: SCHOOL_TZ });
}

/** Check if a due date (YYYY-MM-DD) is before today in school timezone */
export function isOverdue(dueDate: string): boolean {
  return dueDate < getTodayIST();
}
