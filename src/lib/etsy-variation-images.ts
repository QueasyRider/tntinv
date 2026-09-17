export interface EtsyPropertyValueRef {
  property_id?: number;
  value_ids?: number[];
}

export interface EtsyListingImageRef {
  listing_image_id?: number;
  url_fullxfull?: string;
  url_570xN?: string;
}

export interface EtsyVariationImageRef {
  property_id: number;
  value_id: number;
  image_id: number;
}

const variationKey = (propertyId: number, valueId: number): string => `${propertyId}:${valueId}`;

export function buildVariationImageLookup(
  variationImages: EtsyVariationImageRef[],
  listingImages: EtsyListingImageRef[],
): Map<string, string> {
  const imageUrls = new Map(
    listingImages
      .map((image) => [image.listing_image_id, image.url_fullxfull || image.url_570xN] as const)
      .filter((entry): entry is readonly [number, string] => entry[0] !== undefined && Boolean(entry[1])),
  );
  const lookup = new Map<string, string>();
  for (const variationImage of variationImages) {
    const imageUrl = imageUrls.get(variationImage.image_id);
    if (imageUrl) lookup.set(variationKey(variationImage.property_id, variationImage.value_id), imageUrl);
  }
  return lookup;
}

export function findVariationImage(
  propertyValues: EtsyPropertyValueRef[] | undefined,
  lookup: Map<string, string>,
): string | undefined {
  for (const property of propertyValues || []) {
    if (property.property_id === undefined) continue;
    for (const valueId of property.value_ids || []) {
      const image = lookup.get(variationKey(property.property_id, valueId));
      if (image) return image;
    }
  }
  return undefined;
}
