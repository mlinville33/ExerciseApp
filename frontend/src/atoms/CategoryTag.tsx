import { categoryStyle } from '../utils/categories';

/** A category name as a coloured dot plus label. */
export function CategoryTag({ category }: { category?: string | null }) {
  if (!category) return null;
  return (
    <span className="cat-tag" style={categoryStyle(category)}>
      <i className="cat-dot" />
      {category}
    </span>
  );
}
