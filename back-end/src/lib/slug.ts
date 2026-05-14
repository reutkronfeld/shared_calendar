import {
  uniqueNamesGenerator,
  adjectives,
  animals,
} from 'unique-names-generator';

/**
 * Generate a friendly group code like "happy-tiger-42".
 * Caller is responsible for retrying on uniqueness collision.
 */
export function generateGroupCode(): string {
  const slug = uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    separator: '-',
    style: 'lowerCase',
    length: 2,
  });
  const suffix = Math.floor(10 + Math.random() * 90); // 10-99
  return `${slug}-${suffix}`;
}

export function normalizeGroupCode(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}
