import { MONTHS } from '../constants';

export function sfx(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) {return 'th';}
  switch (n % 10) { case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th'; }
}

export function fmtDate(gdt: { day: number; month: number; year: number }): string {
  return `${gdt.day} ${MONTHS[gdt.month - 1]} ${gdt.year}`;
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString();
}
