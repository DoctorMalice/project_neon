export interface RecipeIngredient {
  itemName: string;   // matches InventoryItem.itemType (display name)
  quantity: number;
}

export interface Recipe {
  id: string;
  name: string;
  inputs: RecipeIngredient[];
  outputs: RecipeIngredient[];
}

export const RECIPES: Record<string, Recipe> = {
  wood_knife: {
    id: 'wood_knife',
    name: 'Wood Knife',
    inputs: [
      { itemName: 'Wood Pieces', quantity: 5 },
      { itemName: 'Weapon Parts', quantity: 2 },
    ],
    outputs: [
      { itemName: 'Wood Knife', quantity: 1 },
    ],
  },
};

export function canCraft(
  recipe: Recipe,
  inventory: Map<string, number> | Array<{ itemType: string; quantity: number }>,
): boolean {
  const inv = Array.isArray(inventory)
    ? new Map(inventory.map(i => [i.itemType, i.quantity]))
    : inventory;
  return recipe.inputs.every(ing => (inv.get(ing.itemName) ?? 0) >= ing.quantity);
}
