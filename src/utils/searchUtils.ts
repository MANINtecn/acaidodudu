/**
 * Normalizes a string for search:
 * - Converts to lowercase
 * - Removes accents (diacritics)
 * - Removes common separators like hyphens/white spaces to allow "x-tudo" to match "xtudo" or "x tudo"
 */
export const normalizeString = (str: string): string => {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD') // Decompose combined characters into base + accent
        .replace(/[\u0300-\u036f]/g, '') // Remove accent marks
        .replace(/[\s\-_–—]/g, ''); // Remove spaces, hyphens, underscores, en-dash, em-dash
};
