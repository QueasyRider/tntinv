export interface SquareCategorySummary {
  id: string;
  name: string;
  categoryType?: string;
}

const normalizeCategoryName = (name: string): string => name
  .normalize("NFKC")
  .trim()
  .replace(/\s+/g, " ")
  .toLocaleLowerCase("en-US");

export function resolveExistingSquareCategory(
  categoryName: string,
  existingId: string | undefined,
  categories: SquareCategorySummary[],
): string {
  const normalizedName = normalizeCategoryName(categoryName);
  const matches = categories.filter((category) =>
    (!category.categoryType || category.categoryType === "REGULAR_CATEGORY")
    && normalizeCategoryName(category.name) === normalizedName,
  );

  const existingMatch = existingId && matches.find((category) => category.id === existingId);
  if (existingMatch) return existingMatch.id;
  if (matches.length === 1) return matches[0].id;
  if (!matches.length) {
    throw new Error(`No existing Square category named "${categoryName}" was found. Create or rename it in Square, then retry. No category was created.`);
  }
  throw new Error(`Multiple existing Square categories named "${categoryName}" were found. Enter the intended Square category ID, then retry. No category was created.`);
}
